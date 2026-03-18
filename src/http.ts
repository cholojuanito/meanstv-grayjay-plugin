import { DOMAIN, USER_AGENT } from "./constants";

/**
 * Fetches `url` and returns the response body as a string.
 *
 * When `parse_response` is true the body is JSON-parsed and the result is
 * returned.  The return type is declared as `string` for call-site convenience;
 * callers that pass `parse_response = true` must cast the result themselves.
 * This is a known type fudge — proper overloads are the right long-term fix.
 */
export function callUrl(
  url: string,
  use_authenticated = true,
  parse_response = false
): string {
  log(`Calling ${url}`);
  const isCdn = url.includes(DOMAIN.API_CDN);
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    Accept: "application/json, text/plain, */*",
    DNT: "1",
    Origin: DOMAIN.MAIN,
    Referer: DOMAIN.MAIN + "/",
    Host: url.split("/")[2] ?? "",
  };
  if (isCdn) {
    headers["x-fastly-origin"] = "meansmediatv";
  }
  const resp = http.GET(url, headers, use_authenticated);
  if (!resp.isOk) {
    log(resp);
    if (resp.code === 401) {
      throw new UnavailableException(
        "Video is only available to MeansTV Subscribers"
      );
    } else if (resp.code === 403) {
      throw new ScriptLoginRequiredException(
        "MeansTV login may have expired, please login again, this should be mostly automatic."
      );
    } else {
      throw new ScriptException(
        "ScriptException",
        resp.statusMessage + "(code: " + resp.code + ")"
      );
    }
  }
  if (parse_response) {
    const json: unknown = JSON.parse(resp.body);
    if (
      json !== null &&
      typeof json === "object" &&
      "errors" in json &&
      Array.isArray((json as Record<string, unknown>)["errors"])
    ) {
      const errors = (json as { errors: Array<{ message: string }> }).errors;
      throw new ScriptException("ScriptException", errors[0]?.message ?? "unknown error");
    }
    // Callers using parse_response=true receive parsed JSON; they must cast.
    return json as string;
  }
  return resp.body;
}

export function unescapeHtml(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, function (_: string, code: string) {
      return String.fromCharCode(parseInt(code, 10));
    });
}
