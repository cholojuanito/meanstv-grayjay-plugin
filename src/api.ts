import {
  DOMAIN,
  URLS,
  urlAuthor,
  urlAuthorSearch,
  urlComments,
  urlContentSearch,
  urlContents,
  urlPlaylist,
  urlProgramContent,
  urlProgramRelated,
  urlReplies,
} from "./constants";
import { callJson, callUrl, postJson, tryCallUrls } from "./http";
import { parseAuthorProfile } from "./parsers/author";
import { parseContentCardPage } from "./parsers/cards";
import { parseCatalog } from "./parsers/catalog";
import { parseCommentPage } from "./parsers/comments";
import { isPreviewStreamHtml, parseContentJson, parseStreamDetails, type StreamDetails } from "./parsers/content";
import { parsePlaylistDetails, parsePlaylistList } from "./parsers/playlists";
import { parseRelatedVideos } from "./parsers/related";
import type {
  AuthorChannel,
  CatalogItem,
  CatalogPage,
  CommentPage,
  Content,
  ContentCardPage,
  PlaybackStats,
  Session,
  UserPlaylistDetails,
  UserPlaylistSummary,
} from "./types";

const AUTHOR_TURBO_HEADERS = {
  Accept: "text/vnd.turbo-stream.html, text/html, */*",
  Origin: DOMAIN.MAIN,
} as const;

const AUTHOR_CACHE_STATE_VERSION = 1;

const authorThumbnailByPermalink = new Map<string, string>();
const authorByPermalink = new Map<string, AuthorChannel | null>();

function authorApiUrl(permalink: string): string {
  return `${DOMAIN.API_CDN}/authors/${encodeURIComponent(permalink)}.turbo_stream`;
}

function cacheAuthor(permalink: string, author: AuthorChannel | null): void {
  authorByPermalink.set(permalink, author);
  authorThumbnailByPermalink.set(permalink, author?.thumbnailUrl ?? "");
}

function getCachedAuthor(permalink: string): AuthorChannel | null {
  const cached = authorByPermalink.get(permalink);
  if (cached !== undefined) return cached;

  const author = parseAuthorProfile(callUrl(authorApiUrl(permalink)), permalink);
  cacheAuthor(permalink, author);
  return author;
}

function getKnownAuthorThumbnail(permalink: string): string {
  return authorThumbnailByPermalink.get(permalink) ?? "";
}

function prefetchAuthorThumbnails(items: readonly CatalogItem[]): void {
  const missing = Array.from(
    new Set(
      items
        .map((item) => item.authorPermalink)
        .filter((permalink) => permalink && !authorThumbnailByPermalink.has(permalink)),
    ),
  );
  if (missing.length === 0) return;

  const bodies = tryCallUrls(missing.map(authorApiUrl));
  for (let index = 0; index < missing.length; index += 1) {
    const permalink = missing[index];
    if (!permalink) continue;

    const body = bodies[index];
    if (body == null) continue;
    cacheAuthor(permalink, parseAuthorProfile(body, permalink));
  }
}

function attachAuthorThumbnails(items: readonly CatalogItem[]): void {
  prefetchAuthorThumbnails(items);
  for (const item of items) {
    item.authorThumbnailUrl = getKnownAuthorThumbnail(item.authorPermalink);
  }
}

export function clearAuthorThumbnailCache(): void {
  authorByPermalink.clear();
  authorThumbnailByPermalink.clear();
}

export function loadAuthorThumbnailCache(savedState: string | null | undefined): void {
  clearAuthorThumbnailCache();
  if (!savedState) return;

  try {
    const parsed = JSON.parse(savedState) as unknown;
    if (!parsed || typeof parsed !== "object") return;
    const state = parsed as Record<string, unknown>;
    if (state["version"] !== AUTHOR_CACHE_STATE_VERSION) return;

    const thumbnails = state["thumbnails"];
    if (!thumbnails || typeof thumbnails !== "object") return;

    for (const [permalink, thumbnailUrl] of Object.entries(thumbnails)) {
      if (typeof thumbnailUrl === "string") authorThumbnailByPermalink.set(permalink, thumbnailUrl);
    }
  } catch {
    clearAuthorThumbnailCache();
  }
}

export function serializeAuthorThumbnailCache(): string {
  return JSON.stringify({
    version: AUTHOR_CACHE_STATE_VERSION,
    thumbnails: Object.fromEntries(authorThumbnailByPermalink),
  });
}

function isSafeAuthorContinuation(url: string, slug: string): boolean {
  return url.startsWith(`${DOMAIN.API_CDN}/authors/${encodeURIComponent(slug)}/search?`);
}

function isSafeCommentContinuation(
  url: string,
  path: string,
  requiredName: "collection_id" | "content_id" | "thread_id",
  requiredValue: string | number,
): boolean {
  const expectedPrefix = `${DOMAIN.MAIN}${path}?`;
  if (!url.startsWith(expectedPrefix)) return false;

  try {
    return url
      .slice(expectedPrefix.length)
      .split("&")
      .some((entry) => {
        const [key = "", value = ""] = entry.split("=", 2);
        return decodeURIComponent(key) === requiredName && decodeURIComponent(value) === String(requiredValue);
      });
  } catch {
    return false;
  }
}

export function getContent(slug: string): Content {
  return parseContentJson(callJson<Record<string, unknown>>(urlContents(slug)));
}

export function getStreamDetails(
  programSlug: string,
  videoId?: string | number | null,
  permalink?: string | null,
): StreamDetails {
  const html = callUrl(urlProgramContent(programSlug, videoId, permalink));
  if (isPreviewStreamHtml(html)) {
    throw new LoginRequiredException("MeansTV returned a preview stream. Sign in again to load the full video.");
  }

  const details = parseStreamDetails(html);
  if (!details.hlsUrl) {
    throw new UnavailableException("MeansTV returned program content without an HLS stream.");
  }
  if (!details.hlsUrl.startsWith(`${DOMAIN.STREAM}/`)) {
    throw new UnavailableException("MeansTV returned an HLS stream from an unexpected host.");
  }
  return details;
}

/** Compatibility accessor for callers that only need the signed HLS URL. */
export function getStreamUrl(
  programSlug: string,
  videoId?: string | number | null,
  permalink?: string | null,
): string {
  const details = getStreamDetails(programSlug, videoId, permalink);
  if (!details.hlsUrl) throw new UnavailableException("MeansTV returned program content without an HLS stream.");
  return details.hlsUrl;
}

export function getCatalogPage(page: number): CatalogPage {
  const url = page <= 1 ? URLS.CATALOG_INITIAL : `${URLS.CATALOG_MORE}?page=${page}`;
  const catalog = parseCatalog(callUrl(url));
  attachAuthorThumbnails(catalog.categories.flatMap((category) => category.items));
  return catalog;
}

export function refreshAuthSession(): void {
  callUrl(DOMAIN.MAIN);
}

export function getSession(): Session {
  const raw = callJson<Record<string, unknown>>(URLS.SESSIONS);
  return {
    logged: raw["logged"] === true,
    id: typeof raw["id"] === "string" ? raw["id"] : null,
    email: typeof raw["email"] === "string" ? raw["email"] : null,
    name: typeof raw["name"] === "string" ? raw["name"] : null,
    role: typeof raw["role"] === "string" ? raw["role"] : null,
    country: typeof raw["country"] === "string" ? raw["country"] : null,
  };
}

export function getAuthor(slug: string): AuthorChannel | null {
  return getCachedAuthor(slug);
}

export function getAuthorCards(slug: string, query = "", nextUrl: string | null = null): ContentCardPage {
  if (nextUrl && !isSafeAuthorContinuation(nextUrl, slug)) {
    throw new UnavailableException("MeansTV returned an invalid author pagination URL.");
  }
  const url = nextUrl ?? urlAuthorSearch(slug, query);
  const page = parseContentCardPage(
    callUrl(url, false, {
      ...AUTHOR_TURBO_HEADERS,
      Referer: urlAuthor(slug),
      "Turbo-Frame": "author_content",
    }),
  );
  attachAuthorThumbnails(page.items);
  return page;
}

/** General search returns terminal cards; it intentionally does not advertise authors. */
export function getContentSearch(query: string): CatalogItem[] {
  const page = parseContentCardPage(callUrl(urlContentSearch(query)));
  attachAuthorThumbnails(page.items);
  return page.items.filter((item) => item.contentType === "video");
}

export function getRelatedVideos(slug: string): CatalogItem[] {
  const videos = parseRelatedVideos(callUrl(urlProgramRelated(slug))).filter((item) => item.contentType === "video");
  attachAuthorThumbnails(videos);
  return videos;
}

export function getComments(
  contentId: string | number,
  collectionId: string | number | null = null,
  nextUrl: string | null = null,
): CommentPage {
  const requiredName = collectionId == null ? "content_id" : "collection_id";
  const requiredValue = collectionId == null ? contentId : collectionId;
  if (
    nextUrl &&
    !isSafeCommentContinuation(
      nextUrl,
      `/contents/${encodeURIComponent(String(contentId))}/comments`,
      requiredName,
      requiredValue,
    )
  ) {
    throw new UnavailableException("MeansTV returned an invalid comments pagination URL.");
  }

  const headers = {
    Accept: "text/html, application/xhtml+xml",
    Referer: `${DOMAIN.MAIN}/`,
    "turbo-frame": `video_${contentId}_comments_section`,
  };
  return parseCommentPage(callUrl(nextUrl ?? urlComments(contentId, collectionId), true, headers), String(contentId));
}

export function getReplies(
  contentId: string | number,
  threadId: string | number,
  nextUrl: string | null = null,
  referer = `${DOMAIN.MAIN}/`,
): CommentPage {
  if (
    nextUrl &&
    !isSafeCommentContinuation(
      nextUrl,
      `/contents/${encodeURIComponent(String(contentId))}/replies`,
      "thread_id",
      threadId,
    )
  ) {
    throw new UnavailableException("MeansTV returned an invalid replies pagination URL.");
  }

  const headers = {
    Accept: "text/vnd.turbo-stream.html, text/html, application/xhtml+xml",
    Referer: referer,
  };
  return parseCommentPage(
    callUrl(nextUrl ?? urlReplies(contentId, threadId), true, headers),
    String(contentId),
    new Date(),
    String(threadId),
  );
}

export function getUserPlaylistSummaries(): UserPlaylistSummary[] {
  return parsePlaylistList(callUrl(URLS.PLAYLISTS));
}

export function getUserPlaylistDetails(id: string): UserPlaylistDetails | null {
  return parsePlaylistDetails(callUrl(urlPlaylist(id)), id);
}

/** Returns the transient sync token only when the response has the observed string shape. */
export function getSyncToken(stats: PlaybackStats): string | null {
  const response = callJson<unknown>(URLS.SYNC_TOKEN, true, {
    "X-Store-Id": stats.storeId,
    "X-User-Id": stats.userId,
  });
  return typeof response === "string" && response ? response : null;
}

export function syncPlayback(body: unknown, referer: string): void {
  postJson(URLS.SYNC_STATE, body, { Referer: referer });
}
