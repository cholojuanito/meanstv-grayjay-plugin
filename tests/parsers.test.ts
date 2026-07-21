import { describe, expect, test } from "bun:test";
import { parseCatalog } from "../src/parsers/catalog";
import { parseContentJson, parseStreamUrl } from "../src/parsers/content";
import { parseCommentPage } from "../src/parsers/comments";
import { readFixture } from "./helpers";

const catalogInitialHtml = await readFixture("catalog-initial.html");
const catalogEmptyHtml = await readFixture("catalog-empty.html");
const videoJson = await readFixture("content-video.json");
const collectionJson = await readFixture("content-collection.json");
const streamHtml = await readFixture("program-content-stream.html");
const productionCommentsHtml = await Bun.file(new URL("../comment_section.html", import.meta.url)).text();
const productionRepliesTurboHtml = await readFixture("replies-production-turbo.html");

describe("catalog parser", () => {
  test("groups real catalog cards by category and preserves video card fields consumers render", () => {
    const page = parseCatalog(catalogInitialHtml);

    expect(page.hasMore).toBe(true);
    expect(page.categories).toHaveLength(2);
    expect(page.categories.map((category) => category.title)).toEqual(["NEW RELEASES", "CREATORS"]);

    const firstVideo = page.categories[0]?.items[0];
    expect(firstVideo).toMatchObject({
      id: "4092231",
      contentType: "video",
      title: "March 13, 2026 | MMN Daily",
      slug: "mmn-daily_031326",
      url: "https://means.tv/programs/mmn-daily_031326",
      authorTitle: "Sam Sacks",
      authorPermalink: "sam-sacks",
      durationSeconds: 1572,
    });
    expect(firstVideo?.thumbnailUrl).toBe(
      "https://alpha.uscreencdn.com/images/programs/4092231/horizontal/74e06e0a-f182-4aea-9848-32b80b212817.jpg?auto=webp&width=350",
    );
    const authorThumbnailPage = parseCatalog(catalogInitialHtml, () => "/images/author/sam-sacks.jpg");
    expect(authorThumbnailPage.categories[0]?.items[0]?.thumbnailUrl).toBe(firstVideo?.thumbnailUrl);
    expect(authorThumbnailPage.categories[0]?.items[0]?.authorThumbnailUrl).toBe(
      "https://alpha.uscreencdn.com/images/author/sam-sacks.jpg",
    );

    const creatorCollection = page.categories[1]?.items[1];
    expect(creatorCollection).toMatchObject({
      id: "2825844",
      contentType: "collection",
      title: "Second Thought",
      slug: "secondthought",
      url: "https://means.tv/programs/secondthought",
    });
  });

  test("treats optional slide metadata attributes as empty strings when the DOM returns null", () => {
    const htmlWithoutOptionalMetadata = catalogInitialHtml
      .replaceAll(/\s+data-short-description="[^"]*"/g, "")
      .replaceAll(/\s+data-author-title-0="[^"]*"/g, "")
      .replaceAll(/\s+data-author-permalink-0="[^"]*"/g, "");

    const firstVideo = parseCatalog(htmlWithoutOptionalMetadata).categories[0]?.items[0];

    expect(firstVideo).toMatchObject({
      title: "March 13, 2026 | MMN Daily",
      shortDescription: "",
      authorTitle: "",
      authorPermalink: "",
    });
  });

  test("returns an exhausted page for an empty catalog frame", () => {
    expect(parseCatalog(catalogEmptyHtml)).toEqual({ categories: [], hasMore: false });
  });
});

describe("content parser", () => {
  test("normalizes a real video JSON response including author, duration, and poster URL", () => {
    const content = parseContentJson(videoJson);

    expect(content).toMatchObject({
      id: 4092231,
      title: "March 13, 2026 | MMN Daily",
      permalink: "mmn-daily_031326",
      contentType: "video",
      durationSeconds: 1572,
      videoCount: 0,
      author: {
        id: 70499,
        title: "Sam Sacks",
        permalink: "sam-sacks",
        avatarUrl: "https://alpha.uscreencdn.com/images/author/70499/small_samsacks-2329855414.1689391719.jpg",
        url: "/authors/sam-sacks",
      },
    });
    expect(content.mainPoster).toBe(
      "https://alpha.uscreencdn.com/images/programs/4092231/horizontal/74e06e0a-f182-4aea-9848-32b80b212817.jpg",
    );
    expect(content.tags).toContain("US Iran war White House claims victory");
  });

  test("normalizes a real collection JSON response with child video references", () => {
    const content = parseContentJson(collectionJson);

    expect(content.contentType).toBe("collection");
    expect(content.videoCount).toBe(39);
    expect(content.children).toHaveLength(39);
    expect(content.children.slice(0, 3)).toEqual([
      { id: 450832, permalink: "the-facility" },
      { id: 302806, permalink: "gaza-fights-for-freedom" },
      { id: 3707381, permalink: "i-am-somebody" },
    ]);
  });

  test("extracts the signed HLS manifest from a turbo-stream player fragment", () => {
    const streamUrl = parseStreamUrl(streamHtml);

    expect(streamUrl?.startsWith("https://stream.mux.com/IGn01qolWjRoaHZh1ZsSWb6J3Tax5vnOG.m3u8?token=")).toBe(true);
    expect(streamUrl).not.toContain("&amp;");
  });
});

describe("comment parser", () => {
  test("parses the production comments Turbo frame and preserves paragraph boundaries", () => {
    const page = parseCommentPage(productionCommentsHtml, "4220396", new Date("2026-07-10T00:00:00Z"));

    expect(page.nextUrl).toBeNull();
    expect(page.comments).toHaveLength(1);
    expect(page.comments[0]).toMatchObject({
      id: "7169752",
      contentId: "4220396",
      threadId: "7169752",
      authorId: "10484243",
      authorName: "Harry (.",
      authorProfileUrl: "https://means.tv/community/profiles/10484243",
      authorAvatarUrl:
        "https://alpha.uscreencdn.com/images/user/10484243/small_20230316_120650.1678982975.jpg",
      likeCount: 6,
      dateSeconds: Math.floor(Date.parse("2026-06-05T00:00:00Z") / 1000),
      replyCount: 1,
    });
    expect(page.comments[0]?.message).toContain("crushing us to cushion their fall.\n\nSo it's not enough");
  });

  test("parses the standalone production replies Turbo Stream and retains the parent thread", () => {
    const page = parseCommentPage(
      productionRepliesTurboHtml,
      "4220396",
      new Date("2026-07-10T00:00:00Z"),
      "7169752",
    );

    expect(page.nextUrl).toBeNull();
    expect(page.comments).toHaveLength(1);
    expect(page.comments[0]).toMatchObject({
      id: "7171638",
      contentId: "4220396",
      threadId: "7169752",
      authorId: "30234620",
      authorName: "Cholojuanito",
      authorProfileUrl: "https://means.tv/community/profiles/30234620",
      authorAvatarUrl:
        "https://www.gravatar.com/avatar/683bda2483d0c5b6b1183d21e20beb8b?d=https%3A%2F%2Fui-avatars.com%2Fapi%2FTD%2F90%2FEDE9FF%2F886dfa%2F2%2F0.44",
      dateSeconds: Math.floor(Date.parse("2026-06-05T00:00:00Z") / 1000),
      likeCount: 0,
      replyCount: 0,
    });
    expect(page.comments[0]?.message).toStartWith("Harry (he/him)");
    expect(page.comments[0]?.message).toContain("The only reliable way is through expropriation.");
  });

  test("extracts a reply continuation from a Turbo Stream update target", () => {
    const continuationPath = "/contents/4220396/replies?thread_id=7169752&page=2&cursor=next";
    const response = productionRepliesTurboHtml.replace(
      '<turbo-stream action="update" target="more_replies_link_7169752"><template></template></turbo-stream>',
      `<turbo-stream action="update" target="more_replies_link_7169752"><template><a href="${continuationPath}">More</a></template></turbo-stream>`,
    );

    const page = parseCommentPage(response, "4220396", new Date("2026-07-10T00:00:00Z"), "7169752");

    expect(page.nextUrl).toBe(`https://means.tv${continuationPath}`);
  });
});
