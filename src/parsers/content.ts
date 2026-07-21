// Parsers for the JSON + HTML shapes returned for a single piece of content.
//
// `/api/contents/{slug}` returns JSON (normalized here into a plain `Content`);
// `/programs/{slug}/program_content` returns a turbo-stream HTML fragment
// carrying the signed Mux manifest. No Grayjay `Platform*` objects and no
// network here — this stays directly testable.

import { parseDuration } from "../utilities/duration";
import { withDocument } from "../utilities/dom";
import { isRecord } from "../utilities/guards";
import { absoluteImageUrl } from "../utilities/url";
import type { Content, ContentAuthor, ContentChild, PlaybackStats, UscreenContentType } from "../types";

function str(value: unknown): string {
  if (typeof value === "string") return value;
  return value == null ? "" : String(value);
}


function parseAuthor(raw: unknown): ContentAuthor | null {
  if (!isRecord(raw)) return null;
  const a = raw;
  return {
    id: Number(a["id"]) || 0,
    title: str(a["title"]),
    permalink: typeof a["permalink"] === "string" ? a["permalink"] : null,
    avatarUrl: typeof a["avatar_url"] === "string" ? a["avatar_url"] : null,
    url: typeof a["url"] === "string" ? a["url"] : null,
    description: str(a["description"]),
  };
}

function parseChildren(raw: unknown): ContentChild[] {
  if (!Array.isArray(raw)) return [];
  const out: ContentChild[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const c = entry;
    const permalink = str(c["permalink"]);
    if (permalink) out.push({ id: Number(c["id"]) || 0, permalink });
  }
  return out;
}

/**
 * Normalizes a `/api/contents/{slug}` JSON body (object or raw string) into a
 * {@link Content}. Missing/renamed fields default rather than throw — the CDN
 * API omits `free`, `release_stage` and any publish timestamp entirely.
 */
export function parseContentJson(raw: string | Record<string, unknown>): Content {
  const parsed: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
  const j = isRecord(parsed) ? parsed : {};

  const ct = j["content_type"];
  const contentType: UscreenContentType = ct === "collection" || ct === "live_event" ? ct : "video";
  const rawDuration = j["duration"];
  const durationSeconds =
    typeof j["duration_in_seconds"] === "number"
      ? Math.floor(j["duration_in_seconds"])
      : parseDuration(typeof rawDuration === "string" || typeof rawDuration === "number" ? rawDuration : null);

  const tagsRaw = j["tags"];
  const catsRaw = j["categories"];

  return {
    id: Number(j["id"]) || 0,
    title: str(j["title"]),
    description: str(j["description"]),
    shortDescription: str(j["short_description"]),
    permalink: str(j["permalink"]),
    contentType,
    mainPoster: absoluteImageUrl(str(j["main_poster"])),
    url: str(j["url"]),
    videoCount: Number(j["video_count"]) || 0,
    durationSeconds,
    children: parseChildren(j["children_videos"]),
    tags: Array.isArray(tagsRaw) ? tagsRaw.map(str) : [],
    categories: Array.isArray(catsRaw) ? catsRaw.map(Number).filter(Number.isFinite) : [],
    author: parseAuthor(j["author"]),
  };
}

export function isPreviewStreamHtml(html: string): boolean {
  return (
    html.includes("program-video-free-preview") ||
    html.includes('data-test="free-preview-video"') ||
    html.includes("&quot;content_type&quot;:&quot;free_preview&quot;") ||
    html.includes('"content_type":"free_preview"') ||
    html.includes("Subscribe to watch")
  );
}

/** The entitled stream and optional activity metadata from program content. */
export interface StreamDetails {
  hlsUrl: string | null;
  playbackStats: PlaybackStats | null;
}

function parsePlaybackStats(raw: string): PlaybackStats | null {
  try {
    const parsed: unknown = JSON.parse(raw.replaceAll("&quot;", "\"").replaceAll("&amp;", "&"));
    if (!isRecord(parsed)) return null;

    const videoId = Math.abs(Number(parsed["video_id"]));
    const storeId = str(parsed["store_id"]);
    const contentId = str(parsed["content_id"]);
    const contentType = str(parsed["content_type"]);
    const environmentId = str(parsed["environment_id"]);
    const userId = str(parsed["user_id"]);
    if (!Number.isSafeInteger(videoId) || videoId <= 0 || !storeId || !contentId || !contentType || !environmentId || !userId) {
      return null;
    }
    return { storeId, videoId, contentId, contentType, environmentId, userId };
  } catch {
    return null;
  }
}

/** Parses HLS and activity metadata once without making tracking mandatory for playback. */
export function parseStreamDetails(html: string): StreamDetails {
  const fromDom = withDocument(html, (root) => ({
    hlsUrl: root.querySelector('[src*="m3u8"]')?.getAttribute("src") ?? "",
    statsRaw: root.querySelector("video-player[data-program-video-stats-value]")?.getAttribute("data-program-video-stats-value") ?? "",
  }));
  const hlsUrl =
    fromDom.hlsUrl ||
    html.match(/https?:\/\/[^"'<>\s]+\.m3u8[^"'<>\s]*/)?.[0]?.replaceAll("&amp;", "&") ||
    null;
  const statsRaw = fromDom.statsRaw || html.match(/data-program-video-stats-value="([^"]+)"/)?.[1] || "";
  return { hlsUrl, playbackStats: statsRaw ? parsePlaybackStats(statsRaw) : null };
}

/** Compatibility accessor for callers that only need the signed HLS URL. */
export function parseStreamUrl(html: string): string | null {
  return parseStreamDetails(html).hlsUrl;
}
