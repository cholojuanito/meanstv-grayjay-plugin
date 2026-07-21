import { commentFromRecord } from "../utilities/factories";
import type { CommentPage } from "../types";

type CommentPageLoader = (nextUrl: string) => CommentPage;

/** A page-local comment pager driven only by an observed reply continuation. */
export class CommentsPager extends CommentPager<Record<string, string>> {
  private readonly permalink: string;
  private readonly loadNext: CommentPageLoader;
  private nextUrl: string | null;

  constructor(page: CommentPage, permalink: string, loadNext: CommentPageLoader) {
    super(page.comments.map((comment) => commentFromRecord(comment, permalink)), page.nextUrl !== null);
    this.permalink = permalink;
    this.loadNext = loadNext;
    this.nextUrl = page.nextUrl;
  }

  override hasMorePagers(): boolean {
    return this.hasMore;
  }

  override nextPage(): CommentsPager {
    if (!this.nextUrl) return this;

    const page = this.loadNext(this.nextUrl);
    this.results = page.comments.map((comment) => commentFromRecord(comment, this.permalink));
    this.nextUrl = page.nextUrl;
    this.hasMore = this.nextUrl !== null;
    return this;
  }
}