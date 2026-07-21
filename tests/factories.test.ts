import { describe, expect, test } from "bun:test";
import { parseContentJson } from "../src/parsers/content";
import { channelFromAuthor, videoDetailsFromContent, videoFromContent } from "../src/utilities/factories";
import { readFixture, requireArray, requireRecord } from "./helpers";

const videoFixture = await readFixture("content-video.json");
const hlsUrl = "https://stream.mux.com/test-manifest.m3u8?token=signed";

describe("Grayjay factories", () => {
  test("creates PlatformVideo objects from parsed content with stable playback metadata", () => {
    const video = requireRecord(videoFromContent(parseContentJson(videoFixture)));
    const id = requireRecord(video.id);
    const thumbnails = requireRecord(video.thumbnails);
    const thumbnailSources = requireArray(thumbnails.sources).map(requireRecord);
    const author = requireRecord(video.author);

    expect(id).toMatchObject({ platform: "MeansTV", pluginId: "test-plugin-id", value: "4092231" });
    expect(video).toMatchObject({
      plugin_type: "PlatformVideo",
      name: "March 13, 2026 | MMN Daily",
      duration: 1572,
      datetime: 0,
      url: "https://means.tv/programs/mmn-daily_031326",
      shareUrl: "https://means.tv/programs/mmn-daily_031326",
      isLive: false,
    });
    expect(thumbnailSources[0]).toMatchObject({
      url: "https://alpha.uscreencdn.com/images/programs/4092231/horizontal/74e06e0a-f182-4aea-9848-32b80b212817.jpg",
      quality: 0,
    });
    expect(author).toMatchObject({ name: "Sam Sacks", url: "https://means.tv/authors/sam-sacks" });
  });

  test("creates PlatformVideoDetails with a playable HLS descriptor and plain-text description", () => {
    const details = requireRecord(videoDetailsFromContent(parseContentJson(videoFixture), hlsUrl));
    const descriptor = requireRecord(details.video);
    const sources = requireArray(descriptor.videoSources).map(requireRecord);

    expect(details).toMatchObject({
      plugin_type: "PlatformVideoDetails",
      name: "March 13, 2026 | MMN Daily",
      duration: 1572,
      url: "https://means.tv/programs/mmn-daily_031326",
      shareUrl: "https://means.tv/programs/mmn-daily_031326",
    });
    expect(String(details.description)).toContain("On today's episode:");
    expect(String(details.description)).not.toContain("<p>");
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      plugin_type: "HLSSource",
      name: "HLS",
      duration: 1572,
      url: hlsUrl,
      requestModifier: {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Linux; Android 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36",
          Origin: "https://means.tv",
          Referer: "https://means.tv/",
        },
      },
    });
  });

  test("creates canonical creator channels without inventing a subscriber count", () => {
    const channel = requireRecord(
      channelFromAuthor({
        slug: "secondthought",
        name: "Second Thought",
        thumbnailUrl: "https://alpha.uscreencdn.com/authors/secondthought.jpg",
        description: "Creator description",
      }),
    );
    const id = requireRecord(channel.id);

    expect(channel).toMatchObject({
      plugin_type: "PlatformChannel",
      name: "Second Thought",
      thumbnail: "https://alpha.uscreencdn.com/authors/secondthought.jpg",
      description: "Creator description",
      url: "https://means.tv/authors/secondthought",
    });
    expect("subscribers" in channel).toBe(false);
    expect(id).toMatchObject({ platform: "MeansTV", pluginId: "test-plugin-id", value: "secondthought" });
  });
});
