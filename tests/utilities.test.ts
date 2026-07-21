import { describe, expect, test } from "bun:test";
import { urlProgramContent } from "../src/constants";
import { parseDuration } from "../src/utilities/duration";
import { stripHtml } from "../src/utilities/dom";
import { absoluteImageUrl, absoluteMainUrl, extractSlug, stripQuery } from "../src/utilities/url";

describe("duration utility", () => {
  test("normalizes the duration formats returned by Uscreen into whole seconds", () => {
    const cases: ReadonlyArray<{ readonly value: string | number | null | undefined; readonly expected: number }> = [
      { value: "26:12", expected: 1572 },
      { value: "01:02:03", expected: 3723 },
      { value: "PT1H16M", expected: 4560 },
      { value: "PT45S", expected: 45 },
      { value: 12.9, expected: 12 },
      { value: "not a duration", expected: 0 },
      { value: null, expected: 0 },
    ];

    for (const { value, expected } of cases) {
      expect(parseDuration(value)).toBe(expected);
    }
  });
});

describe("DOM utilities", () => {
  test("falls back to textual stripping when DevServer parser exposes no root text", () => {
    const globals = globalThis as typeof globalThis & { domParser: typeof domParser };
    const originalDomParser = globals.domParser;
    globals.domParser = {
      parseFromString: () => ({ text: undefined, dispose: () => {} }) as unknown as DOMNode,
    };

    try {
      expect(stripHtml("<p>Hello <strong>Means</strong></p>")).toBe("Hello Means");
    } finally {
      globals.domParser = originalDomParser;
    }
  });
});

describe("URL utilities", () => {
  test("resolves Uscreen-relative image and site paths to the origins Grayjay can load", () => {
    expect(absoluteImageUrl("images/programs/poster.jpg")).toBe("https://alpha.uscreencdn.com/images/programs/poster.jpg");
    expect(absoluteImageUrl("/images/programs/poster.jpg")).toBe("https://alpha.uscreencdn.com/images/programs/poster.jpg");
    expect(absoluteImageUrl("https://cdn.example/poster.jpg")).toBe("https://cdn.example/poster.jpg");

    expect(absoluteMainUrl("programs/mmn-daily_031326")).toBe("https://means.tv/programs/mmn-daily_031326");
    expect(absoluteMainUrl("/programs/mmn-daily_031326")).toBe("https://means.tv/programs/mmn-daily_031326");
    expect(absoluteMainUrl("https://means.tv/programs/mmn-daily_031326")).toBe(
      "https://means.tv/programs/mmn-daily_031326",
    );
  });

  test("extracts content slugs from supported MeansTV URLs without leaking query strings", () => {
    expect(stripQuery("/programs/mmn-daily_031326?category_id=34135#player")).toBe("/programs/mmn-daily_031326");
    expect(extractSlug("https://means.tv/programs/mmn-daily_031326?category_id=34135")).toBe("mmn-daily_031326");
    expect(extractSlug("/contents/4092231?watch=true")).toBe("4092231");
    expect(extractSlug("https://example.com/not-means-tv")).toBeNull();
  });

  test("builds authenticated program_content URLs that request full streams", () => {
    expect(urlProgramContent("st-427-after-dark-propaganda-second-thought")).toBe(
      "https://means.tv/programs/st-427-after-dark-propaganda-second-thought/program_content?playlist_position=sidebar&preview=false",
    );
    expect(urlProgramContent("secondthought", 4675200, "st-427-after-dark-propaganda-second-thought")).toBe(
      "https://means.tv/programs/secondthought/program_content?cid=4675200&permalink=st-427-after-dark-propaganda-second-thought&playlist_position=sidebar&preview=false",
    );
  });
});
