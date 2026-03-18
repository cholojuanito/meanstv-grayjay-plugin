import { URLS } from "../constants";
import { callUrl } from "../http";
import { parseVideosFromHtml } from "../parsers/catalog";

export class HomePager extends VideoPager {
  // These shadow the runtime properties set by the VideoPager base constructor.
  // plugin.d.ts declares `declare class VideoPager` without property declarations,
  // so we redeclare them here so TypeScript knows they exist.
  results: PlatformVideo[];
  hasMore: boolean;

  context: { page: number };

  constructor(_context: { next: string | null }) {
    super([], true);
    this.context = { page: 1 };
    this.hasMore = true;
    this.results = [];
    this.nextPage();
  }

  override hasMorePagers(): boolean {
    return this.hasMore;
  }

  override nextPage(): HomePager {
    log("Getting next home page, page: " + this.context.page);
    const url =
      this.context.page === 1
        ? URLS.CATALOG_INITIAL
        : `${URLS.CATALOG_MORE}?page=${this.context.page}`;
    const html = callUrl(url, false);
    this.results = parseVideosFromHtml(html);
    this.hasMore = false;
    return this;
  }
}
