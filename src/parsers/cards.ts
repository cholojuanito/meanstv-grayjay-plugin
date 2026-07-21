// Parser for the common Uscreen card markup used in catalog, author-search,
// related-video, and search fragments.

import { withDocument } from "../utilities/dom";
import { parseDuration } from "../utilities/duration";
import { absoluteApiUrl, absoluteImageUrl, absoluteMainUrl, extractSlug, stripQuery } from "../utilities/url";
import type { CatalogItem, ContentCardPage, UscreenContentType } from "../types";

export type AuthorThumbnailResolver = (authorPermalink: string) => string;

function attr(node: DOMNode | undefined, name: string): string {
  return node?.getAttribute(name) ?? "";
}

/** Parses a `data-card` container regardless of whether it is a swiper slide. */
export function parseCatalogCard(
  cardNode: DOMNode,
  resolveAuthorThumbnail: AuthorThumbnailResolver | null = null,
): CatalogItem | null {
  const cardValue = attr(cardNode, "data-card");
  const separator = cardValue.indexOf("_");
  if (separator < 1) return null;

  const id = cardValue.slice(separator + 1);
  if (!id) return null;

  const kind = cardValue.slice(0, separator);
  const contentType: UscreenContentType =
    kind === "collection" || kind === "live_event" ? kind : "video";
  const titleLink = cardNode.querySelector("a.card-title");
  const title = (attr(titleLink, "title") || titleLink?.text || "").trim();
  const href = attr(titleLink, "href") || attr(cardNode.querySelector("a[href]"), "href");
  const slug = extractSlug(href);
  if (!title || !slug) return null;


  const authorPermalink = attr(cardNode, "data-author-permalink-0").trim();
  const fallbackThumbnailUrl = absoluteImageUrl(attr(cardNode.querySelector("img"), "src"));
  return {
    id,
    contentType,
    title,
    slug,
    url: absoluteMainUrl(stripQuery(href)),
    thumbnailUrl: fallbackThumbnailUrl,
    authorThumbnailUrl: authorPermalink ? absoluteImageUrl(resolveAuthorThumbnail?.(authorPermalink)) : "",
    shortDescription: attr(cardNode, "data-short-description").trim(),
    authorTitle: attr(cardNode, "data-author-title-0").trim(),
    authorPermalink,
    durationSeconds: parseDuration(cardNode.querySelector(".badge-item")?.text?.trim() ?? null),
  };
}

/** Parses and deduplicates card containers by stable Uscreen ID and program slug. */
export function parseCatalogCards(root: DOMNode, resolveAuthorThumbnail: AuthorThumbnailResolver | null = null): CatalogItem[] {
  const seen = new Set<string>();
  const items: CatalogItem[] = [];

  for (const node of root.querySelectorAll("[data-card]")) {
    const item = parseCatalogCard(node, resolveAuthorThumbnail);
    if (!item) continue;
    const key = `${item.id}:${item.slug}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
  }

  return items;
}

/** Parses cards and the only observed Turbo-frame continuation control. */
export function parseContentCardPage(html: string, resolveAuthorThumbnail: AuthorThumbnailResolver | null = null): ContentCardPage {
  return withDocument(html, (root) => {
    const next = root.querySelector("turbo-frame[src]")?.getAttribute("src") ?? "";
    return {
      items: parseCatalogCards(root, resolveAuthorThumbnail),
      nextUrl: next ? absoluteApiUrl(next) : null,
    };
  });
}