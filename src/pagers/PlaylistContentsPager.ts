import { getContentSearch } from "../api";
import { videoFromCatalogItem } from "../utilities/factories";
import type { UserPlaylistItem } from "../types";

const PAGE_SIZE = 24;

/** Resolves a fixed local window to canonical videos only when IDs match exactly. */
export class PlaylistContentsPager extends VideoPager {
  private readonly items: readonly UserPlaylistItem[];
  private offset: number;

  constructor(items: readonly UserPlaylistItem[]) {
    super([], items.length > 0);
    this.items = items;
    this.offset = 0;
    this.nextPage();
  }

  override hasMorePagers(): boolean {
    return this.hasMore;
  }

  override nextPage(): PlaylistContentsPager {
    if (!this.hasMore) return this;

    const pageItems = this.items.slice(this.offset, this.offset + PAGE_SIZE);
    const results: PlatformVideo[] = [];
    for (const item of pageItems) {
      try {
        const match = getContentSearch(item.title).find((candidate) => candidate.id === item.contentId);
        if (match) results.push(videoFromCatalogItem(match));
        else log("Skipping a playlist item without an exact MeansTV content match");
      } catch {
        log("Skipping a playlist item whose MeansTV search request failed");
      }
    }

    this.results = results;
    this.offset += pageItems.length;
    this.hasMore = this.offset < this.items.length;
    return this;
  }
}