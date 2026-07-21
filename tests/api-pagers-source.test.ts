import { beforeEach, describe, expect, test } from "bun:test";
import {
  clearAuthorThumbnailCache,
  getCatalogPage,
  getContent,
  getReplies,
  getSession,
  getStreamUrl,
} from "../src/api";
import {
  DOMAIN,
  URLS,
  USER_AGENT,
  urlAuthorSearch,
  urlComments,
  urlContentSearch,
  urlContents,
  urlPlaylist,
  urlProgramContent,
  urlProgramRelated,
  urlReplies,
} from "../src/constants";
import { ChannelContentsPager } from "../src/pagers/ChannelContentsPager";
import { HomePager } from "../src/pagers/HomePager";
import { capturedLogs, httpCalls, resetHttpMocks, setHttpRoute, setLoggedIn } from "./setup";
import { parseJsonRecord, readFixture, requireArray, requireRecord } from "./helpers";
import "../src/source";

const catalogInitialHtml = await readFixture("catalog-initial.html");
const catalogEmptyHtml = await readFixture("catalog-empty.html");
const videoFixture = await readFixture("content-video.json");
const streamHtml = await readFixture("program-content-stream.html");
const sessionsFixture = await readFixture("sessions.json");
const loggedInSessionFixture = JSON.stringify({
  country: "US",
  email: "viewer@example.test",
  errors: {},
  id: "user-1",
  logged: true,
  name: "Viewer",
  role: "member",
});

const authorProfileHtml = `
  <turbo-stream target="author_show"><div>
    <h1 class="s-title">Second Thought</h1>
    <div class="ui-avatar"><img src="/images/authors/secondthought.jpg" /></div>
    <p class="s-desc">A creator profile.</p>
  </div></turbo-stream>`;
const authorCardsPageOne = `
  <turbo-frame id="author_content">
    <article data-card="video_4092231" data-author-title-0="Sam Sacks" data-author-permalink-0="sam-sacks">
      <a class="card-title" href="/programs/mmn-daily_031326" title="MMN Daily">MMN Daily</a>
      <img src="/images/programs/4092231.jpg" /><span class="badge-item">26:12</span>
    </article>
    <article data-card="video_4092231"><a class="card-title" href="/programs/mmn-daily_031326" title="MMN Daily">MMN Daily</a></article>
    <turbo-frame src="/authors/secondthought/search?action=show&amp;controller=storefront%2Fauthors&amp;format=turbo_stream&amp;id=secondthought&amp;page=2"></turbo-frame>
  </turbo-frame>`;
const authorCardsPageTwo = `
  <turbo-frame id="author_content">
    <article data-card="video_500" data-author-title-0="Sam Sacks" data-author-permalink-0="sam-sacks">
      <a class="card-title" href="/programs/next-video" title="Next Video">Next Video</a>
      <img src="/images/programs/500.jpg" /><span class="badge-item">1:00</span>
    </article>
  </turbo-frame>`;
const searchCardsHtml = `
  <article data-card="video_4092231" data-author-title-0="Sam Sacks" data-author-permalink-0="sam-sacks">
    <a class="card-title" href="/programs/mmn-daily_031326" title="MMN Daily">MMN Daily</a>
    <img src="/images/programs/4092231.jpg" /><span class="badge-item">26:12</span>
  </article>`;
const relatedHtml = `
  <turbo-frame id="program_related"><section class="cbt-related">
    ${searchCardsHtml}${searchCardsHtml}
  </section></turbo-frame>`;
const commentsHtml = `
  <turbo-frame id="video_4092231_comments">
    <div id="comment_7169752" class="comment" data-comment-id="7169752">
      <a href="/community/profiles/10484243"><ds-avatar url="/images/authors/viewer.jpg" text="Viewer"></ds-avatar></a>
      <a class="profile-url" href="/community/profiles/10484243">Viewer</a>
      <div class="text-xs text-ds-muted">January 01, 2026</div>
      <div class="comment-body"><p>A useful comment.</p><p>A second paragraph.</p></div>
      <div class="likes-counter">4</div>
      <turbo-frame id="comment_7169752_replies"><div id="comment_7171638" class="reply"></div></turbo-frame>
    </div>
  </turbo-frame>`;
const repliesHtml = await readFixture("replies-production-turbo.html");
const playlistsHtml = `
  <section id="playlists_container">
    <article data-playlist-id="12"><a href="/playlists/12"><span class="playlist-title">Watch later</span><img src="/images/playlists/12.jpg" /></a></article>
    <a href="/playlists/new">New</a>
  </section>`;
const playlistDetailHtml = `
  <h1>Watch later</h1><img src="/images/playlists/12.jpg" />
  <article data-content-id="4092231"><a class="card-title" href="/programs/mmn-daily_031326">MMN Daily</a><img src="/images/programs/4092231.jpg" /><span class="badge-item">26:12</span></article>`;
const statsStreamHtml = `${streamHtml}<video-player data-program-video-stats-value="{&quot;store_id&quot;:&quot;store-1&quot;,&quot;video_id&quot;:-99,&quot;content_id&quot;:&quot;4092231&quot;,&quot;content_type&quot;:&quot;video&quot;,&quot;environment_id&quot;:&quot;env-1&quot;,&quot;user_id&quot;:&quot;user-1&quot;}"></video-player>`;
const previewStreamHtml =
  '<turbo-stream><template><div data-test="free-preview-video"><video><source src="https://stream.mux.com/preview.m3u8" /></video></div></template></turbo-stream>';

type SourceRuntime = {
  readonly isChannelUrl: (url: string) => boolean;
  readonly isContentDetailsUrl: (url: string) => boolean;
  readonly isPlaylistUrl: (url: string) => boolean;
  readonly setSettings: (settings: unknown) => void;
  readonly enable: (config: SourceConfig, settings: unknown, savedState?: string | null) => void;
  readonly saveState: () => string;
  readonly getChannel: (url: string) => unknown;
  readonly getChannelContents: (url: string, type: unknown, order: unknown, filters: unknown) => unknown;
  readonly searchChannelContents: (url: string, query: string, type: unknown, order: unknown, filters: unknown) => unknown;
  readonly getContentDetails: (url: string) => unknown;
  readonly getContentRecommendations: (url: string) => unknown;
  readonly getComments: (url: string) => unknown;
  readonly getSubComments: (comment: unknown) => unknown;
  readonly getUserPlaylists: () => string[];
  readonly getPlaylist: (url: string) => unknown;
  readonly getPlaybackTracker: (url: string) => unknown;
};

function sourceRuntime(): SourceRuntime {
  return (globalThis as typeof globalThis & { readonly source: SourceRuntime }).source;
}

function videoNames(results: unknown): string[] {
  return requireArray(results).map((entry) => String(requireRecord(entry).name));
}


function setAuthorProfileRoute(slug: string, thumbnailPath = `/images/authors/${slug}.jpg`): void {
  setHttpRoute(
    `${DOMAIN.API_CDN}/authors/${encodeURIComponent(slug)}.turbo_stream`,
    `<turbo-stream target="author_show"><div>
      <h1 class="s-title">${slug}</h1>
      <div class="ui-avatar"><img src="${thumbnailPath}" /></div>
    </div></turbo-stream>`,
  );
}
beforeEach(() => {
  resetHttpMocks();
  clearAuthorThumbnailCache();
});

describe("API request contracts", () => {
  test("loads catalog, content, session, and entitled streams through the authenticated client", () => {
    setHttpRoute(URLS.CATALOG_INITIAL, catalogInitialHtml);
    setHttpRoute(`${URLS.CATALOG_MORE}?page=2`, catalogEmptyHtml);
    setHttpRoute(urlContents("mmn-daily_031326"), videoFixture);
    setHttpRoute(urlProgramContent("mmn-daily_031326", 4092231, "mmn-daily_031326"), streamHtml);
    setHttpRoute(URLS.SESSIONS, sessionsFixture);
    setAuthorProfileRoute("sam-sacks");
    setAuthorProfileRoute("Prince-Shakur");

    const catalog = getCatalogPage(1);
    const firstVideo = catalog.categories[0]?.items[0];
    expect(catalog.categories).toHaveLength(2);
    expect(firstVideo?.thumbnailUrl).toBe(
      "https://alpha.uscreencdn.com/images/programs/4092231/horizontal/74e06e0a-f182-4aea-9848-32b80b212817.jpg?auto=webp&width=350",
    );
    expect(firstVideo?.authorThumbnailUrl).toBe("https://alpha.uscreencdn.com/images/authors/sam-sacks.jpg");
    expect(httpCalls().filter((call) => call.url.includes("/authors/") && call.url.endsWith(".turbo_stream"))).toHaveLength(2);
    expect(getCatalogPage(2).hasMore).toBe(false);
    expect(getContent("mmn-daily_031326").id).toBe(4092231);
    expect(getStreamUrl("mmn-daily_031326", 4092231, "mmn-daily_031326")).toContain("stream.mux.com/");
    expect(getSession().logged).toBe(false);

    const streamCall = httpCalls().find((call) => call.url.includes("/program_content"));
    expect(streamCall).toMatchObject({ method: "GET", useAuth: true });
    expect(streamCall?.headers["turbo-frame"]).toBe("program_content");
    expect(streamCall?.headers["Referer"]).toBe("https://means.tv/programs/mmn-daily_031326?cid=4092231&permalink=mmn-daily_031326");
    expect(httpCalls()[0]?.headers["User-Agent"]).toBe(USER_AGENT);
  });

  test("classifies authentication and entitlement failures without exposing response bodies", () => {
    const endpoint = urlProgramContent("mmn-daily_031326");
    setHttpRoute(endpoint, "", { code: 401 });
    expect(() => getStreamUrl("mmn-daily_031326")).toThrow(LoginRequiredException);

    setHttpRoute(endpoint, "", { code: 403 });
    expect(() => getStreamUrl("mmn-daily_031326")).toThrow(UnavailableException);
  });
});

describe("pagers", () => {
  test("HomePager replaces results and stops on the observed empty catalog page", () => {
    setHttpRoute(URLS.CATALOG_INITIAL, catalogInitialHtml);
    setHttpRoute(`${URLS.CATALOG_MORE}?page=2`, catalogEmptyHtml);
    setAuthorProfileRoute("sam-sacks");
    setAuthorProfileRoute("Prince-Shakur");

    const pager = new HomePager();
    expect(videoNames(pager.results)).toHaveLength(3);
    expect(pager.hasMorePagers()).toBe(true);
    expect(pager.nextPage()).toBe(pager);
    expect(pager.results).toEqual([]);
    expect(pager.hasMorePagers()).toBe(false);
  });

  test("ChannelContentsPager preloads author cards, deduplicates, and follows only the returned Turbo URL", () => {
    const initialUrl = urlAuthorSearch("secondthought");
    const nextUrl = `${initialUrl}&page=2`;
    setHttpRoute(initialUrl, authorCardsPageOne);
    setHttpRoute(nextUrl, authorCardsPageTwo);
    setAuthorProfileRoute("sam-sacks");

    const pager = new ChannelContentsPager("secondthought");
    expect(videoNames(pager.results)).toEqual(["MMN Daily"]);
    expect(pager.hasMorePagers()).toBe(true);
    expect(pager.nextPage()).toBe(pager);
    expect(videoNames(pager.results)).toEqual(["Next Video"]);
    expect(pager.hasMorePagers()).toBe(false);
    expect(pager.nextPage()).toBe(pager);

    const authorCalls = httpCalls().filter((call) => call.url.includes("/authors/secondthought/search"));
    expect(authorCalls).toHaveLength(2);
    expect(authorCalls.every((call) => !call.useAuth)).toBe(true);
    expect(httpCalls().filter((call) => call.url.endsWith("/authors/sam-sacks.turbo_stream"))).toHaveLength(1);
  });
});

describe("Source wiring", () => {
  test("uses canonical URL detectors and author channels without collection overlap", () => {
    const runtime = sourceRuntime();
    expect(runtime.isChannelUrl("https://means.tv/authors/secondthought?tab=videos#top")).toBe(true);
    expect(runtime.isChannelUrl("https://means.tv/programs/mmn-daily_031326")).toBe(false);
    expect(runtime.isContentDetailsUrl("https://means.tv/programs/mmn-daily_031326")).toBe(true);
    expect(runtime.isContentDetailsUrl("https://means.tv/authors/secondthought")).toBe(false);
    expect(runtime.isPlaylistUrl("https://means.tv/playlists/12?from=import")).toBe(true);
    expect(runtime.isPlaylistUrl("https://means.tv/playlists/new")).toBe(false);

    setHttpRoute("https://api.uscreencdn.com/authors/secondthought.turbo_stream", authorProfileHtml);
    const channel = requireRecord(runtime.getChannel("https://means.tv/authors/secondthought"));
    expect(channel).toMatchObject({ name: "Second Thought", url: "https://means.tv/authors/secondthought" });
    expect("subscribers" in channel).toBe(false);
    expect(JSON.parse(runtime.saveState())).toMatchObject({
      thumbnails: {
        secondthought: "https://alpha.uscreencdn.com/images/authors/secondthought.jpg",
      },
    });
  });

  test("refreshes the authenticated client on enable before checking the session", () => {
    const runtime = sourceRuntime();
    setLoggedIn(true);
    setHttpRoute(DOMAIN.MAIN, "<html></html>");
    setHttpRoute(URLS.SESSIONS, loggedInSessionFixture);

    runtime.enable({} as SourceConfig, {}, null);

    expect(httpCalls().map((call) => call.url)).toEqual([DOMAIN.MAIN, URLS.SESSIONS]);
    expect(httpCalls().every((call) => call.useAuth)).toBe(true);
    expect(capturedLogs()).toEqual(["MeansTV session verified"]);
  });

  test("preserves login-required versus entitlement errors for preview-only playback", () => {
    const runtime = sourceRuntime();
    setHttpRoute(urlContents("mmn-daily_031326"), videoFixture);
    setHttpRoute(urlProgramContent("mmn-daily_031326"), previewStreamHtml);
    setHttpRoute(URLS.SESSIONS, sessionsFixture);
    expect(() => runtime.getContentDetails("https://means.tv/programs/mmn-daily_031326")).toThrow(LoginRequiredException);

    setHttpRoute(URLS.SESSIONS, loggedInSessionFixture);
    expect(() => runtime.getContentDetails("https://means.tv/programs/mmn-daily_031326")).toThrow(UnavailableException);
  });

  test("provides terminal global and related-video pagers without eagerly loading related content", () => {
    const runtime = sourceRuntime();
    setHttpRoute(urlContentSearch("MMN Daily"), searchCardsHtml);
    setHttpRoute(urlProgramRelated("mmn-daily_031326"), relatedHtml);
    setAuthorProfileRoute("sam-sacks");
    setHttpRoute(urlContents("mmn-daily_031326"), videoFixture);
    setHttpRoute(urlProgramContent("mmn-daily_031326"), streamHtml);

    const details = requireRecord(runtime.getContentDetails("https://means.tv/programs/mmn-daily_031326"));
    expect(httpCalls().some((call) => call.url === urlProgramRelated("mmn-daily_031326"))).toBe(false);
    const detailRecommendations = (details.getContentRecommendations as () => { results: unknown[] })();
    expect(videoNames(detailRecommendations.results)).toEqual(["MMN Daily"]);

    const recommendations = requireRecord(runtime.getContentRecommendations("https://means.tv/programs/mmn-daily_031326"));
    expect(videoNames(recommendations.results)).toEqual(["MMN Daily"]);
    expect(httpCalls().filter((call) => call.url.endsWith("/authors/sam-sacks.turbo_stream"))).toHaveLength(1);
  });

  test("constructs read-only comments and validated reply pagers", () => {
    const runtime = sourceRuntime();
    setHttpRoute(urlContents("mmn-daily_031326"), videoFixture);
    setHttpRoute(urlComments(4092231), commentsHtml);
    setHttpRoute(urlReplies("4092231", "7169752"), repliesHtml);

    const comments = requireRecord(runtime.getComments("https://means.tv/programs/mmn-daily_031326"));
    const parent = requireRecord(requireArray(comments.results)[0]);
    expect(parent).toMatchObject({
      contextUrl: "https://means.tv/programs/mmn-daily_031326",
      message: "A useful comment.\n\nA second paragraph.",
      replyCount: 1,
      context: { contentId: "4092231", commentId: "7169752", threadId: "7169752" },
    });

    const replies = requireRecord(runtime.getSubComments(JSON.stringify(parent)));
    const reply = requireRecord(requireArray(replies.results)[0]);
    expect(reply).toMatchObject({
      contextUrl: "https://means.tv/programs/mmn-daily_031326",
      message: expect.stringContaining("The only reliable way is through expropriation."),
      context: { contentId: "4092231", commentId: "7171638", threadId: "7169752" },
    });
    const replyCall = httpCalls().at(-1);
    expect(replyCall?.url).toBe("https://means.tv/contents/4092231/replies?thread_id=7169752");
    expect(replyCall?.headers["Accept"]).toBe("text/vnd.turbo-stream.html, text/html, application/xhtml+xml");
    expect(replyCall?.headers["Referer"]).toBe("https://means.tv/programs/mmn-daily_031326");
    expect(replyCall?.headers["turbo-frame"]).toBeUndefined();
    expect(capturedLogs()).toEqual([
      "MeansTV loaded 1 comments with 1 replies",
      "MeansTV loading replies for thread 7169752",
      "MeansTV loaded 1 replies for thread 7169752",
    ]);
    expect(httpCalls().some((call) => call.method === "POST")).toBe(false);
  });

  test("follows a validated replies Turbo Stream continuation", () => {
    const runtime = sourceRuntime();
    const continuationUrl =
      "https://means.tv/contents/4092231/replies?thread_id=7169752&page=2&cursor=next";
    const firstReplyPage = repliesHtml.replace(
      '<turbo-stream action="update" target="more_replies_link_7169752"><template></template></turbo-stream>',
      `<turbo-stream action="update" target="more_replies_link_7169752"><template><a href="${continuationUrl}">More</a></template></turbo-stream>`,
    );
    const secondReplyPage = `
      <turbo-stream action="append" target="comment_7169752_replies"><template>
        <div id="comment_7171639" class="reply">
          <a class="profile-url" href="/community/profiles/30234620">Cholojuanito</a>
          <div class="comment-body"><p>Second reply.</p></div>
        </div>
      </template></turbo-stream>
      <turbo-stream action="update" target="more_replies_link_7169752"><template></template></turbo-stream>`;
    setHttpRoute(urlContents("mmn-daily_031326"), videoFixture);
    setHttpRoute(urlComments(4092231), commentsHtml);
    setHttpRoute(urlReplies("4092231", "7169752"), firstReplyPage);
    setHttpRoute(continuationUrl, secondReplyPage);

    const comments = requireRecord(runtime.getComments("https://means.tv/programs/mmn-daily_031326"));
    const parent = requireRecord(requireArray(comments.results)[0]);
    const replies = requireRecord(runtime.getSubComments(parent));
    expect(replies.hasMore).toBe(true);
    (replies.nextPage as () => unknown)();

    expect(requireArray(replies.results).map((reply) => requireRecord(reply).message)).toEqual(["Second reply."]);
    expect(httpCalls().at(-1)?.url).toBe(continuationUrl);
    expect(replies.hasMore).toBe(false);
  });

  test("rejects unsafe reply continuations before issuing a request", () => {
    const invalidUrls = [
      "https://example.com/contents/4092231/replies?thread_id=7169752&page=2",
      "https://means.tv/contents/999/replies?thread_id=7169752&page=2",
      "https://means.tv/contents/4092231/replies?thread_id=999&page=2",
      "https://means.tv/contents/4092231/replies?thread_id=%&page=2",
    ];

    for (const nextUrl of invalidUrls) {
      expect(() => getReplies("4092231", "7169752", nextUrl)).toThrow(UnavailableException);
    }
    expect(httpCalls()).toEqual([]);
  });

  test("resolves collection comments through the child permalink and preserves the collection ID", () => {
    const runtime = sourceRuntime();
    const collection = JSON.stringify({
      id: 2825844,
      permalink: "secondthought",
      content_type: "collection",
      children_videos: [{ id: 4220396, permalink: "st-432-the-death-of-global-capitalism-second-thought" }],
    });
    const child = JSON.stringify({
      id: 4220396,
      permalink: "st-432-the-death-of-global-capitalism-second-thought",
      content_type: "video",
    });
    setHttpRoute(urlContents("secondthought"), collection);
    setHttpRoute(urlContents("st-432-the-death-of-global-capitalism-second-thought"), child);
    setHttpRoute(urlComments(4220396, 2825844), commentsHtml);

    const comments = requireRecord(
      runtime.getComments(
        "https://means.tv/programs/secondthought?cid=4833992&permalink=st-432-the-death-of-global-capitalism-second-thought",
      ),
    );
    const parent = requireRecord(requireArray(comments.results)[0]);

    expect(parent.context).toEqual({
      contentId: "4220396",
      commentId: "7169752",
      threadId: "7169752",
    });
    expect(httpCalls().map((call) => call.url)).toEqual([
      urlContents("secondthought"),
      urlContents("st-432-the-death-of-global-capitalism-second-thought"),
      "https://means.tv/contents/4220396/comments?collection_id=2825844",
    ]);
  });

  test("loads a validated top-level comments continuation without rebuilding its query", () => {
    const runtime = sourceRuntime();
    const continuationUrl =
      "https://means.tv/contents/4092231/comments?content_id=4092231&page=2&cursor=next";
    const firstPage = `${commentsHtml}<a id="more_comments_link_7169752" href="${continuationUrl}">More</a>`;
    const secondPage = `
      <div id="comment_7169753" class="comment" data-comment-id="7169753">
        <a class="profile-url" href="/community/profiles/10484243">Viewer</a>
        <div class="comment-body"><p>Page two.</p></div>
      </div>`;
    setHttpRoute(urlContents("mmn-daily_031326"), videoFixture);
    setHttpRoute(urlComments(4092231), firstPage);
    setHttpRoute(continuationUrl, secondPage);

    const comments = requireRecord(runtime.getComments("https://means.tv/programs/mmn-daily_031326"));
    expect(comments.hasMore).toBe(true);
    (comments.nextPage as () => unknown)();

    expect(requireArray(comments.results).map((comment) => requireRecord(comment).message)).toEqual(["Page two."]);
    expect(httpCalls().at(-1)?.url).toBe(continuationUrl);
    expect(comments.hasMore).toBe(false);
  });

  test("rejects playlist import before fetching account pages when the session is logged out", () => {
    const runtime = sourceRuntime();
    setHttpRoute(URLS.SESSIONS, sessionsFixture);

    expect(() => runtime.getUserPlaylists()).toThrow(LoginRequiredException);
    expect(httpCalls().map((call) => call.url)).toEqual([URLS.SESSIONS]);
  });

  test("imports canonical playlist videos through exact content IDs and never calls mutations", () => {
    const runtime = sourceRuntime();
    setHttpRoute(URLS.SESSIONS, loggedInSessionFixture);
    setHttpRoute(URLS.PLAYLISTS, playlistsHtml);
    setHttpRoute(urlPlaylist("12"), playlistDetailHtml);
    setHttpRoute(urlContentSearch("MMN Daily"), searchCardsHtml);
    setAuthorProfileRoute("sam-sacks");

    expect(runtime.getUserPlaylists()).toEqual(["https://means.tv/playlists/12"]);
    const playlist = requireRecord(runtime.getPlaylist("https://means.tv/playlists/12"));
    const contents = requireRecord(playlist.contents);
    expect(videoNames(contents.results)).toEqual(["MMN Daily"]);
    expect(httpCalls().every((call) => call.method === "GET")).toBe(true);
  });

  test("gates activity, obtains an ephemeral token, and never lets sync failures affect playback", () => {
    const runtime = sourceRuntime();
    setHttpRoute(urlContents("mmn-daily_031326"), videoFixture);
    setHttpRoute(urlProgramContent("mmn-daily_031326"), statsStreamHtml);
    setHttpRoute(URLS.SESSIONS, loggedInSessionFixture);
    setHttpRoute(URLS.SYNC_TOKEN, JSON.stringify("sanitized-token"));
    setHttpRoute(URLS.SYNC_STATE, "");

    runtime.getContentDetails("https://means.tv/programs/mmn-daily_031326");
    expect(runtime.getPlaybackTracker("https://means.tv/programs/mmn-daily_031326")).toBeNull();

    runtime.setSettings({ meansTvActivity: "true" });
    runtime.getContentDetails("https://means.tv/programs/mmn-daily_031326");
    const tracker = requireRecord(runtime.getPlaybackTracker("https://means.tv/programs/mmn-daily_031326"));
    (tracker.onInit as (seconds: number) => void)(0);
    (tracker.onProgress as (seconds: number, playing: boolean) => void)(10.9, true);
    (tracker.onConcluded as () => void)();

    const posts = httpCalls().filter((call) => call.method === "POST");
    expect(posts).toHaveLength(3);
    const firstBody = parseJsonRecord(posts[0]?.body ?? "");
    expect(firstBody).toMatchObject({ token: "sanitized-token", video_id: 99, source: "web" });
    expect(firstBody).not.toHaveProperty("sync_token");
    const tokenCall = httpCalls().find((call) => call.url === URLS.SYNC_TOKEN);
    expect(tokenCall?.headers).toMatchObject({ "X-Store-Id": "store-1", "X-User-Id": "user-1" });
    expect(posts.every((call) => call.useAuth && call.headers.Referer === "https://means.tv/programs/mmn-daily_031326")).toBe(true);
  });

  test("contains remote activity failures inside tracker callbacks", () => {
    const runtime = sourceRuntime();
    setHttpRoute(urlContents("mmn-daily_031326"), videoFixture);
    setHttpRoute(urlProgramContent("mmn-daily_031326"), statsStreamHtml);
    setHttpRoute(URLS.SESSIONS, loggedInSessionFixture);
    setHttpRoute(URLS.SYNC_TOKEN, JSON.stringify("sanitized-token"));
    setHttpRoute(URLS.SYNC_STATE, "", { code: 500 });

    runtime.setSettings({ meansTvActivity: true });
    runtime.getContentDetails("https://means.tv/programs/mmn-daily_031326");
    const tracker = requireRecord(runtime.getPlaybackTracker("https://means.tv/programs/mmn-daily_031326"));
    expect(() => (tracker.onInit as (seconds: number) => void)(0)).not.toThrow();
  });
});
