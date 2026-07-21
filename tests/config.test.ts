import { describe, expect, test } from "bun:test";
import { requireArray, requireRecord } from "./helpers";

const configFile = Bun.file(new URL("../MeansTvConfig.json", import.meta.url));
const config = requireRecord(JSON.parse(await configFile.text()));
const packageFile = Bun.file(new URL("../package.json", import.meta.url));
const packageJson = requireRecord(JSON.parse(await packageFile.text()));

describe("MeansTV Grayjay config", () => {
  test("completes login from authenticated cookies without a brittle URL gate", () => {
    expect(config.version).toBe(1);
    expect(config.author).toBe("cholojuanito");
    expect(config.authorUrl).toBe("https://github.com/cholojuanito");
    expect(config.sourceUrl).toBe("https://cholojuanito.github.io/meanstv-grayjay-plugin/MeansTvConfig.json");
    expect(config.repositoryUrl).toBe("https://github.com/cholojuanito/meanstv-grayjay-plugin");

    const authentication = requireRecord(config.authentication);

    expect(authentication.loginUrl).toBe("https://means.tv/sign_in?passwordless=false&email=");
    expect("completionUrl" in authentication).toBe(false);
    expect(typeof authentication.userAgent).toBe("string");
    expect("UserAgent" in authentication).toBe(false);
    expect(authentication.cookiesToFind).toEqual(["_uscreen2_session", "remember_user_token"]);
    expect(authentication.cookiesExclOthers).toBe(false);
  });

  test("serves script, config, and logo from the dist artifact root", () => {
    expect(config.scriptUrl).toBe("./MeansTvScript.js");
    expect(config.iconUrl).toBe("./MeansTvLogo.jpg");

    const scripts = requireRecord(packageJson.scripts);
    expect(String(scripts.prebuild)).toContain("assets/MeansTvLogo.jpg dist/");
    expect(String(scripts.build)).toContain("--outfile dist/MeansTvScript.js");
    expect(String(scripts.serve)).toContain("http-server dist/");
  });

  test("allows every concrete Mux HLS host observed in the playback captures", () => {
    const allowUrls = requireArray(config.allowUrls);

    expect(allowUrls).toContain("stream.mux.com");
    expect(allowUrls).toContain("manifest-oci-us-ashburn-1-vop1.edgemv.mux.com");
    expect(allowUrls).toContain("chunk-oci-us-ashburn-1-vop1.edgemv.mux.com");
    expect(allowUrls).toContain("manifest-oci-us-phoenix-1-vop1.edgemv.mux.com");
    expect(allowUrls).toContain("chunk-oci-us-phoenix-1-vop1.edgemv.mux.com");
  });

  test("defines opt-in MeansTV activity using Grayjay's Boolean setting schema", () => {
    const settings = requireArray(config.settings).map(requireRecord);
    expect(settings).toContainEqual({
      variable: "meansTvActivity",
      name: "Send playback activity to MeansTV",
      description: "Tell MeansTV what you played. Disabled by default.",
      type: "Boolean",
      default: "false",
    });
  });
});
