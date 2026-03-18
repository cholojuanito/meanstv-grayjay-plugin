import { callUrl } from "../http";

interface SearchChannelsContext {
  next: string;
}

/**
 * Converts a raw channel API object to a PlatformChannel.
 * Stub — not yet implemented.
 */
function searchChannelToPlatformChannel(_raw: unknown): PlatformChannel {
  throw new ScriptException("ScriptException", "searchChannelToPlatformChannel: not implemented");
}

/**
 * SearchChannelsPager — fetches channel search results page by page.
 * Stub with callUrl wired up; full parsing deferred.
 */
export class SearchChannelsPager extends ChannelPager {
  results: PlatformChannel[];
  hasMore: boolean;

  context: SearchChannelsContext;

  constructor(context: SearchChannelsContext) {
    super([], true);
    this.context = context;
    this.results = [];
    this.hasMore = true;
    this.nextPage();
  }

  override hasMorePagers(): boolean {
    return this.hasMore;
  }

  override nextPage(): SearchChannelsPager {
    const raw = callUrl(this.context.next);
    // TODO: parse `raw` into PlatformChannel[] once parsing is implemented.
    void raw;
    void searchChannelToPlatformChannel;
    this.results = [];
    this.hasMore = false;
    return this;
  }
}
