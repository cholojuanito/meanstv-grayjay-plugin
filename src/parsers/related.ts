// Parser for terminal related-video Turbo fragments.

import { withDocument } from "../utilities/dom";
import { parseCatalogCards, type AuthorThumbnailResolver } from "./cards";
import type { CatalogItem } from "../types";

/** Parses and deduplicates only the captured `#program_related` card region. */
export function parseRelatedVideos(html: string, resolveAuthorThumbnail: AuthorThumbnailResolver | null = null): CatalogItem[] {
  return withDocument(html, (root) => {
    const frame = root.querySelector("turbo-frame#program_related") ?? root.querySelector("#program_related");
    if (!frame) return [];
    const related = frame.querySelector(".cbt-related") ?? frame;
    return parseCatalogCards(related, resolveAuthorThumbnail).filter((item) => item.contentType === "video");
  });
}