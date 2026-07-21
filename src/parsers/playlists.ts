// Parsers for the authenticated, read-only MeansTV playlist pages.

import { urlPlaylist } from "../constants";
import { parseDuration } from "../utilities/duration";
import { withDocument } from "../utilities/dom";
import { absoluteImageUrl } from "../utilities/url";
import type { UserPlaylistDetails, UserPlaylistItem, UserPlaylistSummary } from "../types";

function playlistIdFrom(node: DOMNode): string | null {
  const explicit = node.getAttribute("data-playlist-id") ?? "";
  if (/^\d+$/.test(explicit)) return explicit;

  const href = node.getAttribute("href") ?? node.querySelector("a[href]")?.getAttribute("href") ?? "";
  return href.match(/\/playlists\/(\d+)(?:[/?#]|$)/)?.[1] ?? null;
}

function countFrom(value: string): number {
  const digits = value.match(/\d[\d,]*/)?.[0];
  return digits ? Number(digits.replaceAll(",", "")) || 0 : 0;
}

function summaryFrom(node: DOMNode): UserPlaylistSummary | null {
  const id = playlistIdFrom(node);
  if (!id) return null;

  const title =
    node.querySelector(".playlist-title, .card-title, .s-title")?.text?.trim() ??
    node.getAttribute("data-playlist-title") ??
    "";
  if (!title) return null;

  return {
    id,
    title,
    url: urlPlaylist(id),
    thumbnailUrl: absoluteImageUrl(node.querySelector("img")?.getAttribute("src") ?? ""),
    itemCount: countFrom(node.querySelector(".playlist-item-count, .video-count, [data-video-count]")?.text ?? ""),
  };
}

/** Parses and deduplicates canonical numeric playlist links. */
export function parsePlaylistList(html: string): UserPlaylistSummary[] {
  return withDocument(html, (root) => {
    const container = root.querySelector("#playlists_container");
    if (!container) return [];

    const summaries: UserPlaylistSummary[] = [];
    const seen = new Set<string>();
    for (const node of container.querySelectorAll("[data-playlist-id], a[href*='/playlists/']")) {
      const summary = summaryFrom(node);
      if (!summary || seen.has(summary.id)) continue;
      seen.add(summary.id);
      summaries.push(summary);
    }
    return summaries;
  });
}

function itemFrom(node: DOMNode): UserPlaylistItem | null {
  const contentId = node.getAttribute("data-content-id") ?? "";
  if (!contentId) return null;

  const title = node.querySelector(".playlist-item-title, .card-title, a.card-title")?.text?.trim() ?? "";
  if (!title) return null;

  const durationText = node.querySelector(".playlist-item-duration, .badge-item")?.text?.trim() ?? "";
  return {
    contentId,
    title,
    thumbnailUrl: absoluteImageUrl(node.querySelector("img")?.getAttribute("src") ?? ""),
    durationSeconds: durationText ? parseDuration(durationText) : null,
  };
}

/** Parses a detail page while retaining only stable card references. */
export function parsePlaylistDetails(html: string, playlistId: string): UserPlaylistDetails | null {
  return withDocument(html, (root) => {
    const title = root.querySelector(".playlist-title, .s-title, h1")?.text?.trim() ?? "";
    if (!title) return null;

    const items: UserPlaylistItem[] = [];
    const seen = new Set<string>();
    for (const node of root.querySelectorAll("[data-content-id]")) {
      const item = itemFrom(node);
      if (!item || seen.has(item.contentId)) continue;
      seen.add(item.contentId);
      items.push(item);
    }

    return {
      summary: {
        id: playlistId,
        title,
        url: urlPlaylist(playlistId),
        thumbnailUrl: absoluteImageUrl(root.querySelector("img")?.getAttribute("src") ?? ""),
        itemCount: items.length,
      },
      items,
    };
  });
}