import { getAuthorCards } from "../api";
import { videoFromCatalogItem } from "../utilities/factories";

/** Pages the observed author-search Turbo frame without inventing an offset. */
export class ChannelContentsPager extends VideoPager {
  private readonly slug: string;
  private readonly query: string;
  private nextUrl: string | null;

  constructor(slug: string, query = "") {
    super([], false);
    this.slug = slug;
    this.query = query;

    const page = getAuthorCards(slug, query);
    this.results = page.items.filter((item) => item.contentType === "video").map(videoFromCatalogItem);
    this.nextUrl = page.nextUrl;
    this.hasMore = this.nextUrl !== null;
  }

  override hasMorePagers(): boolean {
    return this.hasMore;
  }

  override nextPage(): ChannelContentsPager {
    if (!this.nextUrl) return this;

    const page = getAuthorCards(this.slug, this.query, this.nextUrl);
    this.results = page.items.filter((item) => item.contentType === "video").map(videoFromCatalogItem);
    this.nextUrl = page.nextUrl;
    this.hasMore = this.nextUrl !== null;
    return this;
  }
}
