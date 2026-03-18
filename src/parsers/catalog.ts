import { unescapeHtml } from "../http";

/**
 * Parses videos from a catalog HTML response.
 * Currently a stub — logs the HTML for inspection and returns an empty array.
 */
export function parseVideosFromHtml(html: string): PlatformVideo[] {
  html = unescapeHtml(html);
  log(html);
  return [];
}
