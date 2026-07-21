// Parser for MeansTV author-profile Turbo fragments.

import { withDocument } from "../utilities/dom";
import { absoluteImageUrl } from "../utilities/url";
import type { AuthorChannel } from "../types";

/** Parses a profile fragment using the canonical URL slug supplied by the caller. */
export function parseAuthorProfile(html: string, slug: string): AuthorChannel | null {
  return withDocument(html, (root) => {
    const profile = root.querySelector("turbo-stream[target=author_show]") ?? root;
    const name = profile.querySelector(".s-title")?.text?.trim() ?? "";
    if (!name) return null;

    return {
      slug,
      name,
      thumbnailUrl: absoluteImageUrl(profile.querySelector(".ui-avatar img")?.getAttribute("src") ?? ""),
      description: profile.querySelector(".s-desc")?.text?.trim() ?? "",
    };
  });
}