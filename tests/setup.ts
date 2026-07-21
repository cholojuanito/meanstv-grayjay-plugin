import { DOMParser as LinkedomDOMParser } from "linkedom";

export type HttpCall = {
  readonly method: "GET" | "POST";
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly useAuth: boolean;
};

type HttpRoute = {
  readonly body: string;
  readonly code: number;
  readonly headers: Readonly<Record<string, string[]>>;
  readonly isOk: boolean;
};

type RouteInit = {
  readonly code?: number;
  readonly headers?: Readonly<Record<string, string[]>>;
  readonly isOk?: boolean;
};

const routes = new Map<string, HttpRoute>();
const calls: HttpCall[] = [];
const logLines: string[] = [];
let loggedIn = false;

export function resetHttpMocks(): void {
  routes.clear();
  calls.length = 0;
  logLines.length = 0;
  loggedIn = false;
}

export function setLoggedIn(value: boolean): void {
  loggedIn = value;
}

export function setHttpRoute(url: string, body: string, init: RouteInit = {}): void {
  const code = init.code ?? 200;
  routes.set(url, {
    body,
    code,
    headers: init.headers ?? {},
    isOk: init.isOk ?? (code >= 200 && code < 300),
  });
}

export function httpCalls(): readonly HttpCall[] {
  return calls.slice();
}

export function capturedLogs(): readonly string[] {
  return logLines.slice();
}

class DomNodeAdapter {
  readonly node: Element | Document;

  constructor(node: Element | Document) {
    this.node = node;
  }

  querySelector(selectors: string): DomNodeAdapter | undefined {
    const found = this.node.querySelector(selectors);
    return found ? new DomNodeAdapter(found) : undefined;
  }

  querySelectorAll(selectors: string): DomNodeAdapter[] {
    return Array.from(this.node.querySelectorAll(selectors), (node) => new DomNodeAdapter(node));
  }

  getElementById(elementId: string): DomNodeAdapter | undefined {
    const found = "getElementById" in this.node ? this.node.getElementById(elementId) : this.node.querySelector(`#${elementId}`);
    return found ? new DomNodeAdapter(found) : undefined;
  }

  getElementsByClassName(className: string): DomNodeAdapter[] {
    return Array.from(this.node.getElementsByClassName(className), (node) => new DomNodeAdapter(node));
  }

  getElementsByName(elementName: string): DomNodeAdapter[] {
    return Array.from(this.node.querySelectorAll(`[name="${elementName}"]`), (node) => new DomNodeAdapter(node));
  }

  getAttribute(qualifiedName: string): string | null {
    return "getAttribute" in this.node ? this.node.getAttribute(qualifiedName) : null;
  }

  get firstChild(): DomNodeAdapter | undefined {
    const found = this.node.firstElementChild;
    return found ? new DomNodeAdapter(found) : undefined;
  }

  get text(): string {
    if ("body" in this.node && this.node.body?.textContent) return this.node.body.textContent;
    const ownText = this.node.textContent ?? "";
    if (ownText) return ownText;
    return Array.from(this.node.querySelectorAll("*"), (element) => element.textContent ?? "").join(" ");
  }

  dispose(): void {
    // Grayjay's native DOM nodes require disposal. linkedom nodes are ordinary JS objects.
  }
}

class PlatformIDMock {
  readonly platform: string;
  readonly pluginId: string;
  readonly plugin_id: string;
  readonly value: string;
  readonly claimType: number;
  readonly claimFieldType: number;

  constructor(platform: string, id: string, pluginId: string, claimType = 0, claimFieldType = 0) {
    this.platform = platform;
    this.pluginId = pluginId;
    this.plugin_id = pluginId;
    this.value = id;
    this.claimType = claimType;
    this.claimFieldType = claimFieldType;
  }
}

class ThumbnailMock {
  readonly url: string;
  readonly quality: number;

  constructor(url: string, quality: number) {
    this.url = url;
    this.quality = quality;
  }
}

class ThumbnailsMock {
  readonly sources: readonly ThumbnailMock[];

  constructor(thumbnails: readonly ThumbnailMock[]) {
    this.sources = thumbnails;
  }
}

class PlatformAuthorLinkMock {
  readonly id: PlatformIDMock;
  readonly name: string;
  readonly url: string;
  readonly thumbnail?: string;
  readonly subscribers?: number;
  readonly membershipUrl?: string;

  constructor(id: PlatformIDMock, name: string, url: string, thumbnail?: string, subscribers?: number, membershipUrl?: string) {
    this.id = id;
    this.name = name;
    this.url = url;
    if (thumbnail !== undefined) this.thumbnail = thumbnail;
    if (subscribers !== undefined) this.subscribers = subscribers;
    if (membershipUrl !== undefined) this.membershipUrl = membershipUrl;
  }
}

class ObjectBackedMock {
  constructor(obj: Readonly<Record<string, unknown>>) {
    Object.assign(this, obj);
  }
}

class PlatformVideoMock extends ObjectBackedMock {
  readonly plugin_type = "PlatformVideo";
}

class PlatformVideoDetailsMock extends PlatformVideoMock {
  override readonly plugin_type = "PlatformVideoDetails";
}

class PlatformChannelMock extends ObjectBackedMock {
  readonly plugin_type = "PlatformChannel";
}

class HLSSourceMock extends ObjectBackedMock {
  readonly plugin_type = "HLSSource";
}

class VideoSourceDescriptorMock {
  readonly plugin_type = "MuxVideoSourceDescriptor";
  readonly videoSources: readonly unknown[];

  constructor(videoSources: readonly unknown[]) {
    this.videoSources = videoSources;
  }
}

class RatingLikesMock {
  readonly type = 1;
  readonly likes: number;

  constructor(likes: number) {
    this.likes = likes;
  }
}

class PlatformCommentMock extends ObjectBackedMock {
  readonly plugin_type = "Comment";
}

class PlatformPlaylistMock extends ObjectBackedMock {
  readonly plugin_type = "PlatformPlaylist";
}

class PlatformPlaylistDetailsMock extends ObjectBackedMock {
  readonly plugin_type = "PlatformPlaylistDetails";
}

class PlaybackTrackerMock {
  constructor(_interval: number) {}

  onInit(_seconds: number): void {}

  onProgress(_seconds: number, _isPlaying: boolean): void {}

  onConcluded(): void {}
}

class PagerMock<T> {
  results: T[];
  hasMore: boolean;

  constructor(results: T[], hasMore: boolean) {
    this.results = results;
    this.hasMore = hasMore;
  }

  hasMorePagers(): boolean {
    return this.hasMore;
  }

  nextPage(): this {
    return this;
  }
}

class ResultCapabilitiesMock<TType, TOrder> {
  readonly types: readonly TType[];
  readonly sorts: readonly TOrder[];
  readonly filters: readonly unknown[];

  constructor(types: readonly TType[], sorts: readonly TOrder[], filters: readonly unknown[]) {
    this.types = types;
    this.sorts = sorts;
    this.filters = filters;
  }
}

class ScriptExceptionMock extends Error {}
class LoginRequiredExceptionMock extends Error {}
class UnavailableExceptionMock extends Error {}

const TypeMock = {
  Source: { Dash: "DASH", HLS: "HLS", STATIC: "Static" },
  Feed: { Videos: "VIDEOS", Live: "LIVE", Mixed: "MIXED" },
  Order: { Chronological: "CHRONOLOGICAL", Views: "VIEWS", Favorites: "FAVORITES", Oldest: "OLDEST" },
  Text: { RAW: 0, HTML: 1, MARKUP: 2 },
  Chapter: { NORMAL: 0, SKIPPABLE: 5, SKIP: 6, SKIPONCE: 7 },
} as const;

const LanguageMock = { UNKNOWN: "Unknown" } as const;

Object.assign(globalThis, {
  IS_TESTING: true,
  plugin: { config: { id: "test-plugin-id" }, settings: {} },
  bridge: { isLoggedIn: () => loggedIn },
  source: {},
  log: (message: string) => {
    logLines.push(message);
  },
  http: {
    GET: (url: string, headers: Readonly<Record<string, string>> = {}, useAuth = true) => {
      calls.push({ method: "GET", url, headers: { ...headers }, useAuth });
      const route = routes.get(url);
      if (!route) throw new Error(`No mocked GET route for ${url}`);
      return { ...route, url };
    },
    POST: (url: string, body: string, headers: Readonly<Record<string, string>> = {}, useAuth = true) => {
      calls.push({ method: "POST", url, body, headers: { ...headers }, useAuth });
      const route = routes.get(url);
      if (!route) throw new Error(`No mocked POST route for ${url}`);
      return { ...route, url };
    },
    batch: () => {
      type BatchRequest = {
        readonly method: "GET" | "POST";
        readonly url: string;
        readonly body?: string;
        readonly headers: Readonly<Record<string, string>>;
        readonly useAuth: boolean;
      };
      const requests: BatchRequest[] = [];
      const builder = {
        GET: (url: string, headers: Readonly<Record<string, string>> = {}, useAuth = true) => {
          requests.push({ method: "GET", url, headers: { ...headers }, useAuth });
          return builder;
        },
        POST: (url: string, body: string, headers: Readonly<Record<string, string>> = {}, useAuth = true) => {
          requests.push({ method: "POST", url, body, headers: { ...headers }, useAuth });
          return builder;
        },
        execute: () =>
          requests.map((request) => {
            calls.push(request);
            const route = routes.get(request.url);
            if (!route) throw new Error(`No mocked ${request.method} route for ${request.url}`);
            return { ...route, url: request.url };
          }),
      };
      return builder;
    },
  },
  domParser: {
    parseFromString: (html: string) => new DomNodeAdapter(new LinkedomDOMParser().parseFromString(html, "text/html")),
  },
  PlatformID: PlatformIDMock,
  Thumbnail: ThumbnailMock,
  Thumbnails: ThumbnailsMock,
  PlatformAuthorLink: PlatformAuthorLinkMock,
  PlatformVideo: PlatformVideoMock,
  PlatformVideoDetails: PlatformVideoDetailsMock,
  PlatformChannel: PlatformChannelMock,
  HLSSource: HLSSourceMock,
  VideoSourceDescriptor: VideoSourceDescriptorMock,
  RatingLikes: RatingLikesMock,
  ContentPager: PagerMock,
  ChannelPager: PagerMock,
  VideoPager: PagerMock,
  CommentPager: PagerMock,
  PlatformComment: PlatformCommentMock,
  PlatformPlaylist: PlatformPlaylistMock,
  PlatformPlaylistDetails: PlatformPlaylistDetailsMock,
  PlaybackTracker: PlaybackTrackerMock,
  ResultCapabilities: ResultCapabilitiesMock,
  ScriptException: ScriptExceptionMock,
  LoginRequiredException: LoginRequiredExceptionMock,
  UnavailableException: UnavailableExceptionMock,
  Type: TypeMock,
  Language: LanguageMock,
});

resetHttpMocks();
