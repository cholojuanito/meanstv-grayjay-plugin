// Parser for the `/catalog/*` HTML fragments (home feed).
//
// The response is a turbo-frame of `category-group` rows, each holding a
// `ds-swiper` of `<swiper-slide>` cards. We parse it with Grayjay's jsoup-backed
// DOMParser (via `utilities/dom`), which lets us group cards by their real DOM
// structure (`.category-group` → `.category-title` + nested `swiper-slide`s)
// instead of scraping category names out of onclick strings. Returns plain data.

import { parseCatalogCard, type AuthorThumbnailResolver } from "./cards";
import { withDocument } from "../utilities/dom";
import type { CatalogCategory, CatalogItem, CatalogPage } from "../types";



/**
 * Parses a catalog HTML fragment into ordered categories of cards.
 * Empty category-groups (e.g. lazy-loaded skeleton rows) are dropped.
 * `hasMore` is true whenever the fragment yielded at least one category — the
 * pagination endpoint returns an empty frame once the feed is exhausted.
 */
export function parseCatalog(html: string, resolveAuthorThumbnail: AuthorThumbnailResolver | null = null): CatalogPage {
  return withDocument(html, (root) => {
    const categories: CatalogCategory[] = [];
    for (const group of root.querySelectorAll(".category-group")) {
      const items: CatalogItem[] = [];
      for (const cardNode of group.querySelectorAll("[data-card]")) {
        const item = parseCatalogCard(cardNode, resolveAuthorThumbnail);
        if (item) items.push(item);
      }
      if (items.length === 0) continue;
      const title = group.querySelector(".category-title")?.text?.trim() || "MeansTV";
      categories.push({ title, items });
    }
    return { categories, hasMore: categories.length > 0 };
  });
}
