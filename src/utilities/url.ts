// Pure URL/slug helpers. No Grayjay globals — safe to unit-test directly.

import { DOMAIN, REGEX_AUTHOR_URL, REGEX_CONTENTS_URL, REGEX_PLAYLIST_URL } from "../constants";

/** Prefixes CDN-relative image paths with the image CDN origin. */
export function absoluteImageUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return `${DOMAIN.IMAGE_CDN}${url.startsWith("/") ? "" : "/"}${url}`;
}

/** Resolves a site-relative path against the main means.tv origin. */
export function absoluteMainUrl(path: string | null | undefined): string {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${DOMAIN.MAIN}${path.startsWith("/") ? "" : "/"}${path}`;
}

/** Resolves a relative Turbo frame URL against the Uscreen API origin. */
export function absoluteApiUrl(path: string | null | undefined): string {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return `${DOMAIN.API_CDN}${path.startsWith("/") ? "" : "/"}${path}`;
}

/** Drops the query string / fragment from a URL or path. */
export function stripQuery(url: string): string {
  const end = url.search(/[?#]/);
  return end === -1 ? url : url.slice(0, end);
}

/**
 * Extracts the program/content slug from a means.tv URL or path.
 * Handles `/programs/{slug}` and `/contents/{slug}`, with or without an origin
 * and with or without a query string. Returns null when no slug is present.
 */
export function extractSlug(urlOrPath: string): string | null {
  const m = urlOrPath.match(/\/(?:programs|contents)\/([^/?#]+)/);
  return m?.[1] ?? null;
}

/** Extracts a creator slug only from a canonical MeansTV author URL. */
export function extractAuthorSlug(url: string): string | null {
  return REGEX_AUTHOR_URL.exec(url)?.[1] ?? null;
}

/** Extracts a numeric playlist ID only from a canonical MeansTV playlist URL. */
export function extractPlaylistId(url: string): string | null {
  return REGEX_PLAYLIST_URL.exec(url)?.[1] ?? null;
}

/** Extracts a program/content slug only from a canonical MeansTV URL. */
export function extractCanonicalContentSlug(url: string): string | null {
  return REGEX_CONTENTS_URL.exec(url)?.[1] ?? null;
}
