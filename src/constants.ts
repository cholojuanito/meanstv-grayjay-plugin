export const PLATFORM = "MeansTV";

export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36";

export const DOMAIN = {
  MAIN: "https://means.tv",
  API_CDN: "https://api.uscreencdn.com",
  IMAGE_CDN: "https://alpha.uscreencdn.com",
  ASSETS_CDN: "https://assets-gke.uscreencdn.com",
  CABLE: "https://cable.uscreen.at",
  STREAM: "https://stream.mux.com",
  MUX_IMAGE: "https://image.mux.com",
  MUX_MANIFEST: "https://manifest-gcp-us-east4-vop1.edgemv.mux.com",
  MUX_CHUNKS: "https://chunk-gcp-us-east4-vop1.fastly.mux.com",
} as const;

export const URLS = {
  SIGN_IN: `${DOMAIN.MAIN}/sign_in`,
  SYNC_TOKEN: `${DOMAIN.MAIN}/api/_sync-token`,
  SESSIONS: `${DOMAIN.MAIN}/api/sessions`,
  CATALOG: `${DOMAIN.MAIN}/catalog`,
  CATALOG_CONTINUE: `${DOMAIN.MAIN}/catalog/continue_watching`,
  CATALOG_FEATURED: `${DOMAIN.API_CDN}/catalog/featured_categories`,
  CATALOG_FILTERS: `${DOMAIN.API_CDN}/catalog/filters`,
  CATALOG_INITIAL: `${DOMAIN.API_CDN}/catalog/initial_categories?continue_watching=false&featured_category_id=27951&my_library=false&preview=false&user=false`,
  CATALOG_MORE: `${DOMAIN.API_CDN}/catalog/more_categories`,
  PROGRAMS: `${DOMAIN.MAIN}/programs`,
  CONTENTS: `${DOMAIN.API_CDN}/api/contents`,
  STATS_PLAY: `${DOMAIN.MAIN}/stats/play`,
  SYNC_STATE: `${DOMAIN.MAIN}/api/_sync-state`,
  SYNC_PRODUCTS: `${DOMAIN.MAIN}/api/_sync-products`,
} as const;

export function urlContents(slug: string): string {
  return `${URLS.CONTENTS}/${slug}?x_fastly_origin=meansmediatv`;
}

export function urlProgram(slug: string): string {
  return `${URLS.PROGRAMS}/${slug}`;
}

export function urlProgramContent(
  programSlug: string,
  videoId: string | number,
  videoPermalink: string
): string {
  return `${URLS.PROGRAMS}/${programSlug}/program_content?cid=${videoId}&permalink=${videoPermalink}`;
}

export function urlProgramRelated(slug: string): string {
  return `${URLS.PROGRAMS}/${slug}/related`;
}

export function urlComments(
  videoId: string | number,
  collectionId?: string | number | null
): string {
  const base = `${DOMAIN.MAIN}/contents/${videoId}/comments`;
  return collectionId != null ? `${base}?collection_id=${collectionId}` : base;
}

export function urlSubtitles(videoId: string | number, token: string): string {
  return `${DOMAIN.IMAGE_CDN}/sub/${videoId}/${token}.vtt`;
}

export const REGEX_CONTENTS_URL = new RegExp(
  `^${DOMAIN.MAIN.replace(".", "\\.")}/(programs|contents)/([^/\\?#]+)/?(?:\\?[^\\s]*)?$`
);

export const REGEX_CATALOG_URL = new RegExp(
  `^${DOMAIN.MAIN.replace(".", "\\.")}(?:/catalog)?/?$`
);

// Module-level mutable state shared across source.ts and pagers.
// These are declared as `let` so source.ts can reassign them on enable/setSettings.

export const EMPTY_AUTHOR = new PlatformAuthorLink(
  new PlatformID(PLATFORM, "", plugin.config.id),
  "Anonymous",
  "",
  "https://plugins.grayjay.app/Odysee/OdyseeIcon.png",
  0,
  ""
);

export let config: Record<string, unknown> = {};
export let _settings: Record<string, unknown> = {};
export let _clientContext: Record<string, unknown> = {};
export let token: string | undefined;

export const features: string[] = bridge.supportedFeatures ?? [];
log(JSON.stringify(features));
