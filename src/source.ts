// Source hook wiring. Parsers, API functions, factories, and pagers keep the
// protocol implementation out of this Grayjay-facing boundary.

import {
  getAuthor,
  getComments,
  getContent,
  getContentSearch,
  getRelatedVideos,
  getReplies,
  getSession,
  getStreamDetails,
  getSyncToken,
  getUserPlaylistDetails,
  getUserPlaylistSummaries,
  refreshAuthSession,
  loadAuthorThumbnailCache,
  serializeAuthorThumbnailCache,
} from "./api";
import { REGEX_AUTHOR_URL, REGEX_CONTENTS_URL, REGEX_PLAYLIST_URL, urlProgram } from "./constants";
import { ChannelContentsPager } from "./pagers/ChannelContentsPager";
import { CommentsPager } from "./pagers/CommentsPager";
import { HomePager } from "./pagers/HomePager";
import { PlaylistContentsPager } from "./pagers/PlaylistContentsPager";
import { MeansPlaybackTracker } from "./playback/MeansPlaybackTracker";
import {
  channelFromAuthor,
  playlistDetailsFromRecord,
  videoDetailsFromContent,
  videoFromCatalogItem,
} from "./utilities/factories";
import { isRecord } from "./utilities/guards";
import { extractAuthorSlug, extractCanonicalContentSlug, extractPlaylistId } from "./utilities/url";
import type { PlaybackStats } from "./types";

const src = source as unknown as Record<string, unknown>;
const playbackStatsByUrl = new Map<string, PlaybackStats>();
let meansTvActivity = false;

function settingEnabled(settings: unknown): boolean {
  if (!settings || typeof settings !== "object") return false;
  const value = (settings as Record<string, unknown>)["meansTvActivity"];
  return value === true || value === "true";
}

function clearPlaybackStats(): void {
  playbackStatsByUrl.clear();
}

function queryParam(url: string, name: string): string | null {
  const query = url.split("?", 2)[1]?.split("#", 1)[0];
  if (!query) return null;
  for (const entry of query.split("&")) {
    const [key = "", value = ""] = entry.split("=", 2);
    if (decodeURIComponent(key) === name) return decodeURIComponent(value);
  }
  return null;
}

function bridgeRecord(value: unknown): Record<string, unknown> | null {
  if (isRecord(value)) return value;
  if (typeof value !== "string") return null;

  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function recommendations(url: string): ContentPager {
  const slug = extractCanonicalContentSlug(url);
  if (!slug) return new ContentPager([], false);
  return new ContentPager(getRelatedVideos(slug).map(videoFromCatalogItem), false);
}

src["isChannelUrl"] = function (url: string): boolean {
  return REGEX_AUTHOR_URL.test(url);
};

src["isContentDetailsUrl"] = function (url: string): boolean {
  return REGEX_CONTENTS_URL.test(url);
};

src["isPlaylistUrl"] = function (url: string): boolean {
  return REGEX_PLAYLIST_URL.test(url);
};

src["setSettings"] = function (settings: unknown): void {
  meansTvActivity = settingEnabled(settings);
  clearPlaybackStats();
};

src["enable"] = function (_config: SourceConfig, settings: unknown, savedState?: string | null): void {
  void _config;
  loadAuthorThumbnailCache(savedState);
  meansTvActivity = settingEnabled(settings);
  clearPlaybackStats();

  if (!bridge.isLoggedIn()) {
    log("MeansTV source is not signed in");
    return;
  }

  try {
    refreshAuthSession();
    log(getSession().logged ? "MeansTV session verified" : "MeansTV session is not authenticated");
  } catch {
    log("Could not verify the captured MeansTV session");
  }
};

src["saveState"] = function (): string {
  return serializeAuthorThumbnailCache();
};

src["disable"] = function (): void {
  clearPlaybackStats();
};

src["getHome"] = function (): HomePager {
  return new HomePager();
};

src["getSearchCapabilities"] = function (): ResultCapabilities<string, FeedType> {
  return new ResultCapabilities([Type.Feed.Videos], [Type.Order.Chronological], []);
};

src["search"] = function (
  query: string,
  _type: FeedType | null,
  _order: Order | null,
  _filters: FilterQuery<string> | null,
): ContentPager {
  void _type;
  void _order;
  void _filters;
  if (!query.trim()) return new ContentPager([], false);
  return new ContentPager(getContentSearch(query).map(videoFromCatalogItem), false);
};

src["getChannel"] = function (url: string): PlatformChannel | null {
  const slug = extractAuthorSlug(url);
  if (!slug) return null;

  try {
    const author = getAuthor(slug);
    if (!author) return null;
    return channelFromAuthor(author);
  } catch {
    log("Could not load the MeansTV creator channel");
    return null;
  }
};

src["getChannelContents"] = function (
  url: string,
  _type: FeedType | null,
  _order: Order | null,
  _filters: FilterQuery<string> | null,
): VideoPager | null {
  void _type;
  void _order;
  void _filters;
  const slug = extractAuthorSlug(url);
  if (!slug) return null;

  try {
    return new ChannelContentsPager(slug);
  } catch {
    log("Could not load MeansTV creator videos");
    return null;
  }
};

src["getChannelCapabilities"] = function (): ResultCapabilities<string, FeedType> {
  return new ResultCapabilities([Type.Feed.Videos], [Type.Order.Chronological], []);
};

src["searchChannelContents"] = function (
  url: string,
  query: string,
  _type: FeedType | null,
  _order: Order | null,
  _filters: FilterQuery<string> | null,
): VideoPager | null {
  void _type;
  void _order;
  void _filters;
  const slug = extractAuthorSlug(url);
  if (!slug) return null;

  try {
    return new ChannelContentsPager(slug, query);
  } catch {
    log("Could not search MeansTV creator videos");
    return null;
  }
};

src["getSearchChannelContentsCapabilities"] = function (): ResultCapabilities<string, FeedType> {
  return new ResultCapabilities([Type.Feed.Videos], [Type.Order.Chronological], []);
};

src["getContentRecommendations"] = function (url: string): ContentPager {
  return recommendations(url);
};

src["getContentDetails"] = function (url: string): PlatformVideoDetails | null {
  const slug = extractCanonicalContentSlug(url);
  if (!slug) return null;

  const content = getContent(slug);
  if (content.contentType !== "video") return null;

  const collectionSlug = queryParam(url, "collection");
  const childId = queryParam(url, "cid");
  let stream;
  try {
    stream = collectionSlug && childId
      ? getStreamDetails(collectionSlug, childId, content.permalink)
      : getStreamDetails(slug);
  } catch (error) {
    if (error instanceof LoginRequiredException) {
      try {
        if (getSession().logged) {
          throw new UnavailableException(
            "MeansTV only returned a preview for this video. Your account may not have access to it.",
          );
        }
      } catch (sessionError) {
        if (sessionError instanceof UnavailableException) throw sessionError;
      }
      throw new LoginRequiredException(
        "MeansTV did not receive an authenticated session. Sign out of the MeansTV source, sign in again, and retry playback.",
      );
    }
    if (error instanceof UnavailableException) throw error;
    log("Could not obtain a MeansTV playback manifest");
    throw new UnavailableException("MeansTV did not return a playable stream for this video.");
  }

  if (!stream.hlsUrl) throw new UnavailableException("MeansTV did not return a playable stream for this video.");
  const canonicalUrl = urlProgram(content.permalink);
  if (stream.playbackStats) playbackStatsByUrl.set(canonicalUrl, stream.playbackStats);
  else playbackStatsByUrl.delete(canonicalUrl);
  return videoDetailsFromContent(content, stream.hlsUrl, () => recommendations(canonicalUrl));
};

src["getComments"] = function (url: string): CommentPager<Record<string, string>> {
  const parentSlug = extractCanonicalContentSlug(url);
  if (!parentSlug) return new CommentPager([], false);

  const childSlug = queryParam(url, "permalink");
  const parent = getContent(parentSlug);
  const content = childSlug && childSlug !== parentSlug ? getContent(childSlug) : parent;
  if (content.contentType !== "video") return new CommentPager([], false);

  const collectionId =
    childSlug && childSlug !== parentSlug && parent.contentType === "collection" ? String(parent.id) : null;
  const page = getComments(content.id, collectionId);
  const replyCount = page.comments.reduce((total, comment) => total + comment.replyCount, 0);
  log(`MeansTV loaded ${page.comments.length} comments with ${replyCount} replies`);
  return new CommentsPager(page, content.permalink, (nextUrl) =>
    getComments(content.id, collectionId, nextUrl),
  );
};

src["getSubComments"] = function (comment: unknown): CommentPager<Record<string, string>> {
  const bridgeComment = bridgeRecord(comment);
  const context = bridgeComment?.["context"];
  const contextUrl = typeof bridgeComment?.["contextUrl"] === "string" ? bridgeComment["contextUrl"] : "";
  const permalink = extractCanonicalContentSlug(contextUrl);
  if (
    !permalink ||
    !isRecord(context) ||
    typeof context["contentId"] !== "string" ||
    typeof context["commentId"] !== "string" ||
    typeof context["threadId"] !== "string" ||
    !context["contentId"] ||
    !context["commentId"] ||
    !context["threadId"]
  ) {
    log("MeansTV comment has no valid reply context");
    return new CommentPager([], false);
  }

  const contentId = context["contentId"];
  const threadId = context["threadId"];
  log(`MeansTV loading replies for thread ${threadId}`);
  const page = getReplies(contentId, threadId, null, contextUrl);
  log(`MeansTV loaded ${page.comments.length} replies for thread ${threadId}`);
  return new CommentsPager(page, permalink, (nextUrl) =>
    getReplies(contentId, threadId, nextUrl, contextUrl),
  );
};

src["getUserPlaylists"] = function (): string[] {
  if (!getSession().logged) {
    throw new LoginRequiredException("Sign in to MeansTV before importing playlists.");
  }
  return getUserPlaylistSummaries().map((playlist) => playlist.url);
};

src["getPlaylist"] = function (url: string): PlatformPlaylistDetails | null {
  const id = extractPlaylistId(url);
  if (!id) return null;
  if (!getSession().logged) {
    throw new LoginRequiredException("Sign in to MeansTV before importing playlists.");
  }

  const playlist = getUserPlaylistDetails(id);
  return playlist ? playlistDetailsFromRecord(playlist, new PlaylistContentsPager(playlist.items)) : null;
};

src["getPlaybackTracker"] = function (url: string): PlaybackTracker | null {
  if (!meansTvActivity) return null;

  const canonicalUrl = extractCanonicalContentSlug(url);
  if (!canonicalUrl) return null;
  const stats = playbackStatsByUrl.get(urlProgram(canonicalUrl));
  if (!stats) return null;

  try {
    if (!getSession().logged) {
      clearPlaybackStats();
      return null;
    }
    const token = getSyncToken(stats);
    return token ? new MeansPlaybackTracker(stats, token, urlProgram(canonicalUrl)) : null;
  } catch {
    log("Could not initialize MeansTV playback activity");
    return null;
  }
};
