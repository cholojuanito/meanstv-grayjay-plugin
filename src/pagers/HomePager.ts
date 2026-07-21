import { getCatalogPage } from "../api";
import { videoFromCatalogItem } from "../utilities/factories";

export class HomePager extends VideoPager {
  private page: number;

  constructor() {
    super([], true);
    this.page = 1;
    this.nextPage();
  }

  override hasMorePagers(): boolean {
    return this.hasMore;
  }

  override nextPage(): HomePager {
    if (!this.hasMore) return this;

    const catalog = getCatalogPage(this.page);
    this.page += 1;
    this.results = catalog.categories.flatMap((category) =>
      category.items.filter((item) => item.contentType === "video").map(videoFromCatalogItem),
    );
    this.hasMore = catalog.hasMore;
    return this;
  }
}
