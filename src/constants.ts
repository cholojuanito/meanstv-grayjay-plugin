export const PLATFORM = "MeansTV";

export const USER_AGENT =
  "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36";

export const DOMAIN = {
  MAIN: "https://means.tv",
  API_CDN: "https://api.uscreencdn.com",
  IMAGE_CDN: "https://alpha.uscreencdn.com",
  STREAM: "https://stream.mux.com",
} as const;

export const URLS = {
  SESSIONS: `${DOMAIN.MAIN}/api/sessions`,
  CATALOG_INITIAL: `${DOMAIN.API_CDN}/catalog/initial_categories?continue_watching=false&featured_category_id=27951&my_library=false&preview=false&user=false`,
  CATALOG_MORE: `${DOMAIN.API_CDN}/catalog/more_categories`,
  PROGRAMS: `${DOMAIN.MAIN}/programs`,
  AUTHORS: `${DOMAIN.MAIN}/authors`,
  PLAYLISTS: `${DOMAIN.MAIN}/playlists`,
  CONTENTS: `${DOMAIN.API_CDN}/api/contents`,
  SYNC_TOKEN: `${DOMAIN.MAIN}/api/_sync-token`,
  SYNC_STATE: `${DOMAIN.MAIN}/api/_sync-state`,
} as const;

const MAIN_ORIGIN_PATTERN = DOMAIN.MAIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const REGEX_CONTENTS_URL = new RegExp(
  `^${MAIN_ORIGIN_PATTERN}/(?:programs|contents)/([^/\\?#]+)/?(?:\\?[^#\\s]*)?(?:#[^\\s]*)?$`,
);

export const REGEX_AUTHOR_URL = new RegExp(
  `^${MAIN_ORIGIN_PATTERN}/authors/([^/\\?#]+)/?(?:\\?[^#\\s]*)?(?:#[^\\s]*)?$`,
);

export const REGEX_PLAYLIST_URL = new RegExp(
  `^${MAIN_ORIGIN_PATTERN}/playlists/(\\d+)/?(?:\\?[^#\\s]*)?(?:#[^\\s]*)?$`,
);

export const REGEX_CATALOG_URL = new RegExp(
  `^${MAIN_ORIGIN_PATTERN}(?:/catalog)?/?(?:\\?[^#\\s]*)?(?:#[^\\s]*)?$`,
);

export function urlContents(slug: string): string {
  return `${URLS.CONTENTS}/${encodeURIComponent(slug)}?x_fastly_origin=meansmediatv`;
}

export function urlContentSearch(query: string): string {
  return `${URLS.CONTENTS}/search?search=${encodeURIComponent(query)}`;
}

export function urlProgram(slug: string): string {
  return `${URLS.PROGRAMS}/${encodeURIComponent(slug)}`;
}

export function urlAuthor(slug: string): string {
  return `${URLS.AUTHORS}/${encodeURIComponent(slug)}`;
}

export function urlAuthorSearch(slug: string, query = ""): string {
  const params = [
    "action=show",
    "controller=storefront%2Fauthors",
    "format=turbo_stream",
    `id=${encodeURIComponent(slug)}`,
  ];
  if (query) params.push(`search=${encodeURIComponent(query)}`);
  return `${DOMAIN.API_CDN}/authors/${encodeURIComponent(slug)}/search?${params.join("&")}`;
}

export function urlProgramContent(
  programSlug: string,
  videoId?: string | number | null,
  videoPermalink?: string | null,
): string {
  const context =
    videoId != null && videoPermalink
      ? `cid=${encodeURIComponent(String(videoId))}&permalink=${encodeURIComponent(videoPermalink)}&`
      : "";
  return `${urlProgram(programSlug)}/program_content?${context}playlist_position=sidebar&preview=false`;
}

export function urlProgramRelated(slug: string): string {
  return `${urlProgram(slug)}/related?vertical=true`;
}

export function urlComments(contentId: string | number, collectionId: string | number | null = null): string {
  const key = collectionId == null ? "content_id" : "collection_id";
  const value = collectionId == null ? contentId : collectionId;
  return `${DOMAIN.MAIN}/contents/${encodeURIComponent(String(contentId))}/comments?${key}=${encodeURIComponent(String(value))}`;
}

export function urlReplies(contentId: string | number, threadId: string | number): string {
  return `${DOMAIN.MAIN}/contents/${encodeURIComponent(String(contentId))}/replies?thread_id=${encodeURIComponent(String(threadId))}`;
}

export function urlPlaylist(id: string | number): string {
  return `${URLS.PLAYLISTS}/${encodeURIComponent(String(id))}`;
}

export function urlSubtitles(videoId: string | number, token: string): string {
  return `${DOMAIN.IMAGE_CDN}/sub/${encodeURIComponent(String(videoId))}/${encodeURIComponent(token)}.vtt`;
}
