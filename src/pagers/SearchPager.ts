/**
 * SearchPager — stub, not yet implemented.
 */
export class SearchPager extends VideoPager {
  results: PlatformVideo[];
  hasMore: boolean;

  constructor() {
    super([], false);
    this.results = [];
    this.hasMore = false;
  }

  override hasMorePagers(): boolean {
    return this.hasMore;
  }

  override nextPage(): SearchPager {
    return this;
  }
}
