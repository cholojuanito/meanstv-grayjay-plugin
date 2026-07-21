import { DOMAIN, USER_AGENT } from "./constants";
import { isRecord } from "./utilities/guards";

function readErrorMessage(value: unknown): string | null {
  if (!isRecord(value)) return null;

  if (typeof value["error"] === "string" && value["error"]) return value["error"];
  if (typeof value["message"] === "string" && value["message"]) return value["message"];

  const errors = value["errors"];
  if (typeof errors === "string" && errors) return errors;
  if (Array.isArray(errors)) {
    const message = errors.find((entry): entry is string => typeof entry === "string" && entry.length > 0);
    return message ?? null;
  }

  return null;
}

function queryValue(query: string, name: string): string | null {
  for (const part of query.split("&")) {
    const [key = "", value = ""] = part.split("=", 2);
    if (decodeURIComponent(key) === name) return value;
  }
  return null;
}

function programContentReferer(url: string): string | null {
  const [path = "", query = ""] = url.split("?", 2);
  if (!path.endsWith("/program_content")) return null;

  const programUrl = path.slice(0, -"/program_content".length);
  const cid = queryValue(query, "cid");
  const permalink = queryValue(query, "permalink");
  return cid && permalink ? `${programUrl}?cid=${cid}&permalink=${permalink}` : programUrl;
}

function throwResponseError(url: string, code: number): never {
  const label = url.split(/[?#]/, 1)[0] ?? url;
  if (code === 401) throw new LoginRequiredException(`MeansTV rejected the authenticated request to ${label}`);
  if (code === 403) throw new UnavailableException(`MeansTV denied access to ${label}`);
  throw new UnavailableException(`MeansTV request to ${label} failed with HTTP ${code}`);
}

function defaultHeaders(url: string): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    Accept: "application/json, text/html, */*",
  };

  if (url.startsWith(DOMAIN.API_CDN) || url.startsWith(DOMAIN.MAIN)) {
    headers["x-fastly-origin"] = "meansmediatv";
  }

  if (url.includes("/program_content")) {
    headers["Accept"] = "text/html, application/xhtml+xml";
    headers["turbo-frame"] = "program_content";
    const referer = programContentReferer(url);
    if (referer) headers["Referer"] = referer;
  }

  return headers;
}

/** Fetches `url` with the selected Grayjay client and returns its body. */
export function callUrl(
  url: string,
  useAuth = true,
  extraHeaders: Readonly<Record<string, string>> = {},
): string {
  const response = http.GET(url, { ...defaultHeaders(url), ...extraHeaders }, useAuth);
  if (!response.isOk) throwResponseError(url, response.code);
  return response.body;
}

/** Fetches URLs through Grayjay's batch client; failed entries are returned as null. */
export function tryCallUrls(
  urls: readonly string[],
  useAuth = true,
  extraHeaders: Readonly<Record<string, string>> = {},
): Array<string | null> {
  if (urls.length === 0) return [];

  let batch = http.batch();
  for (const url of urls) {
    batch = batch.GET(url, { ...defaultHeaders(url), ...extraHeaders }, useAuth);
  }

  return batch.execute().map((response) => (response.isOk ? response.body : null));
}

/** Fetches JSON while handling Uscreen's application-level error envelopes. */
export function callJson<T>(
  url: string,
  useAuth = true,
  extraHeaders: Readonly<Record<string, string>> = {},
): T {
  const parsed: unknown = JSON.parse(callUrl(url, useAuth, extraHeaders));
  const errorMessage = readErrorMessage(parsed);
  if (errorMessage) throw new UnavailableException(`MeansTV returned an error: ${errorMessage}`);
  return parsed as T;
}

/** Sends a JSON body without assuming that the successful response is JSON. */
export function postJson(
  url: string,
  body: unknown,
  extraHeaders: Readonly<Record<string, string>> = {},
  useAuth = true,
): string {
  const response = http.POST(
    url,
    JSON.stringify(body),
    {
      ...defaultHeaders(url),
      Accept: "application/json, text/html, */*",
      "Content-Type": "application/json",
      Origin: DOMAIN.MAIN,
      ...extraHeaders,
    },
    useAuth,
  );
  if (!response.isOk) throwResponseError(url, response.code);
  return response.body;
}
