#!/usr/bin/env python3
"""Secret-safe HAR analyzer for Means.TV, Uscreen, and signed Mux HLS.

Raw HARs contain passwords, cookies, identity data, CSRF/sync tokens, and signed
media URLs. This tool parses those values only in memory. Its report emits names,
metadata, normalized endpoint shapes, and short non-reversible correlation IDs.
It never emits request/response credential values or complete signed URLs.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import re
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence
from urllib.parse import parse_qsl, urljoin, urlparse

ASSET_EXTENSIONS = {
    ".avif",
    ".css",
    ".eot",
    ".gif",
    ".ico",
    ".jpeg",
    ".jpg",
    ".js",
    ".map",
    ".png",
    ".svg",
    ".ttf",
    ".webp",
    ".woff",
    ".woff2",
}

TELEMETRY_PATTERN = re.compile(
    r"analytics|amplitude|beacon|doubleclick|facebook|fullstory|google-analytics|"
    r"googletagmanager|heap|hotjar|litix|mixpanel|newrelic|pixel|sentry|telemetry|"
    r"tracker|twitter",
    re.IGNORECASE,
)

UUID_PATTERN = re.compile(
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
    re.IGNORECASE,
)
NUMERIC_SEGMENT_PATTERN = re.compile(r"(?<=/)\d+(?=/|$)")
JWT_PATTERN = re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+")

RELEVANT_REQUEST_HEADERS = {
    "accept",
    "authorization",
    "content-type",
    "cookie",
    "origin",
    "range",
    "referer",
    "turbo-frame",
    "user-agent",
    "x-api-key",
    "x-auth-token",
    "x-csrf-token",
    "x-fastly-origin",
    "x-turbo-request-id",
}

CRITICAL_CATEGORIES = {
    "auth",
    "session",
    "playback-discovery",
    "playback-accounting",
    "media-master",
    "media-rendition",
    "media-segment",
    "subtitle",
    "storyboard",
}

MEDIA_CATEGORIES = {
    "media-master",
    "media-rendition",
    "media-segment",
    "subtitle",
    "storyboard",
}

PREVIEW_MARKERS = (
    "program-video-free-preview",
    'data-test="free-preview-video"',
    "&quot;content_type&quot;:&quot;free_preview&quot;",
    '"content_type":"free_preview"',
    "Subscribe to watch",
)


@dataclass(frozen=True)
class CookieMetadata:
    name: str
    domain: str
    path: str
    same_site: str
    secure: bool
    http_only: bool
    clearing: bool


@dataclass
class EndpointGroup:
    category: str
    method: str
    host: str
    endpoint: str
    query_names: tuple[str, ...]
    count: int = 0
    statuses: dict[str, int] = field(default_factory=lambda: defaultdict(int))
    mime_types: set[str] = field(default_factory=set)
    first_time: str = ""
    last_time: str = ""


@dataclass(frozen=True)
class Event:
    started: str
    file_name: str
    category: str
    method: str
    status: str
    host: str
    endpoint: str
    query_names: tuple[str, ...]
    header_names: tuple[str, ...]
    cookie_names: tuple[str, ...]
    signal: str
    correlation_id: str


@dataclass
class HarReport:
    file_name: str
    entry_count: int
    start_time: str
    end_time: str
    hosts_by_category: dict[str, set[str]] = field(default_factory=lambda: defaultdict(set))
    endpoint_groups: dict[tuple[str, str, str, str, tuple[str, ...]], EndpointGroup] = field(default_factory=dict)
    critical_events: list[Event] = field(default_factory=list)
    set_cookies: set[CookieMetadata] = field(default_factory=set)
    request_cookie_names: dict[str, set[str]] = field(default_factory=lambda: defaultdict(set))
    session_states: list[tuple[str, str]] = field(default_factory=list)
    content_slider_present: int = 0
    content_slider_null: int = 0
    program_content_full: int = 0
    program_content_preview: int = 0
    program_content_missing: int = 0
    hls_references: dict[str, set[str]] = field(default_factory=lambda: defaultdict(set))
    hls_reference_categories: dict[str, str] = field(default_factory=dict)
    observed_media_ids: set[str] = field(default_factory=set)
    errors: list[str] = field(default_factory=list)


def correlation_id(value: str) -> str:
    """Return a deterministic, non-reversible identifier for an opaque URL."""
    return hashlib.sha256(value.encode("utf-8", "replace")).hexdigest()[:10]


def header_values(headers: Sequence[Mapping[str, Any]] | None) -> dict[str, list[str]]:
    """Preserve duplicate HAR headers while normalizing names."""
    result: dict[str, list[str]] = defaultdict(list)
    for header in headers or ():
        name = str(header.get("name", "")).strip().lower()
        if name:
            result[name].append(str(header.get("value", "")))
    return result


def cookie_names_from_header(value: str) -> set[str]:
    names: set[str] = set()
    for part in value.split(";"):
        pair = part.strip()
        if "=" not in pair:
            continue
        name = pair.split("=", 1)[0].strip()
        if name:
            names.add(name)
    return names


def parse_set_cookie(value: str, response_host: str) -> CookieMetadata | None:
    parts = [part.strip() for part in value.split(";")]
    if not parts or "=" not in parts[0]:
        return None

    name, cookie_value = parts[0].split("=", 1)
    attributes: dict[str, str | bool] = {}
    for part in parts[1:]:
        if "=" in part:
            key, attribute_value = part.split("=", 1)
            attributes[key.strip().lower()] = attribute_value.strip()
        elif part:
            attributes[part.lower()] = True

    max_age = str(attributes.get("max-age", ""))
    expires = str(attributes.get("expires", ""))
    clearing = cookie_value == "" or max_age == "0" or "1970" in expires
    return CookieMetadata(
        name=name.strip() or "<unnamed>",
        domain=str(attributes.get("domain", "host-only:" + response_host)),
        path=str(attributes.get("path", "/")),
        same_site=str(attributes.get("samesite", "unspecified")),
        secure="secure" in attributes,
        http_only="httponly" in attributes,
        clearing=clearing,
    )


def response_text(response: Mapping[str, Any]) -> str | None:
    content = response.get("content")
    if not isinstance(content, Mapping):
        return None
    text = content.get("text")
    if not isinstance(text, str):
        return None
    if content.get("encoding") == "base64":
        try:
            return base64.b64decode(text).decode("utf-8", "replace")
        except (ValueError, UnicodeDecodeError):
            return None
    return text


def query_names(url: str) -> tuple[str, ...]:
    return tuple(sorted({name for name, _ in parse_qsl(urlparse(url).query, keep_blank_values=True)}))


def normalize_path(host: str, path: str) -> str:
    path = UUID_PATTERN.sub("{uuid}", path)
    path = NUMERIC_SEGMENT_PATTERN.sub("{id}", path)

    if host == "stream.mux.com" and path.endswith(".m3u8"):
        return "/{playback-id}.m3u8"
    if host == "image.mux.com":
        if path.endswith("/storyboard.json"):
            return "/{playback-id}/storyboard.json"
        if "/subtitles/" in path or path.endswith(".vtt"):
            return "/{playback-id}/subtitles/{track}.vtt"
        return "/{playback-id}/{asset}"
    if ".mux.com" in host and host.startswith("manifest-") and path.endswith(".m3u8"):
        return "/{manifest-id}/rendition.m3u8"
    if ".mux.com" in host and (host.startswith("chunk-") or "/chunk/" in path):
        suffix = ".m4s" if path.endswith(".m4s") else ".ts" if path.endswith(".ts") else ""
        return f"/v1/chunk/{{chunk-id}}/{{segment}}{suffix}"
    if host.endswith("uscreencdn.com") and path.startswith("/sub/") and path.endswith(".vtt"):
        return "/sub/{id}/{subtitle-token}.vtt"

    replacements = (
        (r"^/api/contents/search$", "/api/contents/search"),
        (r"^/api/contents/[^/]+$", "/api/contents/{slug}"),
        (r"^/api/contents/[^/]+/[^/]+$", "/api/contents/{slug}/{resource}"),
        (r"^/programs/[^/]+/program_content$", "/programs/{slug}/program_content"),
        (r"^/programs/[^/]+\.(turbo_stream)$", "/programs/{slug}.turbo_stream"),
        (r"^/programs/[^/]+/(related|resources)$", "/programs/{slug}/{resource}"),
        (r"^/programs/[^/]+$", "/programs/{slug}"),
        (r"^/contents/\{id\}/comments$", "/contents/{id}/comments"),
    )
    for pattern, replacement in replacements:
        if re.match(pattern, path):
            return replacement
    return path




def classify(host: str, path: str, mime_type: str) -> str:
    lower_path = path.lower()
    lower_mime = mime_type.lower()

    if host == "stream.mux.com" and lower_path.endswith(".m3u8"):
        return "media-master"
    if ".mux.com" in host and host.startswith("manifest-") and lower_path.endswith(".m3u8"):
        return "media-rendition"
    if ".mux.com" in host and (host.startswith("chunk-") or lower_path.endswith((".ts", ".m4s"))):
        return "media-segment"
    if host == "image.mux.com" and ("storyboard" in lower_path or lower_path.endswith(".json")):
        return "storyboard"
    if lower_path.endswith(".vtt") or "text/vtt" in lower_mime:
        return "subtitle"
    if host == "means.tv" and lower_path.endswith("/program_content"):
        return "playback-discovery"
    if host == "means.tv" and (
        lower_path in {"/api/_sync-state", "/api/_sync-products", "/stats/play"}
        or lower_path == "/community/challenges/watched_video"
    ):
        return "playback-accounting"
    if host == "means.tv" and lower_path == "/api/sessions":
        return "session"
    if host == "means.tv" and (
        lower_path.startswith("/sign_in")
        or lower_path.startswith("/sign_out")
        or lower_path == "/api/_sync-token"
    ):
        return "auth"
    if host == "cable.uscreen.at" or "text/event-stream" in lower_mime:
        return "realtime"
    if TELEMETRY_PATTERN.search(host) or TELEMETRY_PATTERN.search(path):
        return "telemetry"
    if any(lower_path.endswith(extension) for extension in ASSET_EXTENSIONS):
        return "asset"
    if "javascript" in lower_mime or lower_mime.startswith(("font/", "image/", "text/css")):
        return "asset"
    if host in {"means.tv", "api.uscreencdn.com"} and (
        lower_path.startswith("/api/") or lower_path.startswith("/catalog/")
    ):
        return "api"
    if host == "means.tv" and "text/html" in lower_mime:
        return "document"
    return "other"


def status_label(status: Any) -> str:
    try:
        code = int(status)
    except (TypeError, ValueError):
        return "UNKNOWN"
    return "CANCELED" if code == 0 else str(code)


def parse_json_safely(text: str | None) -> Any:
    if text is None:
        return None
    try:
        return json.loads(text)
    except (json.JSONDecodeError, TypeError):
        return None


def iter_content_objects(value: Any) -> Iterable[Mapping[str, Any]]:
    if isinstance(value, Mapping):
        if "content_type" in value or "slider_video_hls" in value:
            yield value
        for child in value.values():
            if isinstance(child, (Mapping, list)):
                yield from iter_content_objects(child)
    elif isinstance(value, list):
        for child in value:
            yield from iter_content_objects(child)


def hls_uris(base_url: str, text: str) -> set[str]:
    uris: set[str] = set()
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith(("http://", "https://", "/")) or ".m3u8" in line or line.endswith((".ts", ".m4s", ".vtt")):
            uris.add(urljoin(base_url, line))
    return uris


def event_signal(
    category: str,
    request_url: str,
    response: Mapping[str, Any],
    body_text: str | None,
) -> str:
    if category == "session":
        parsed = parse_json_safely(body_text)
        if isinstance(parsed, Mapping):
            return "logged=" + ("true" if parsed.get("logged") is True else "false")
        return "logged=cache-dependent" if status_label(response.get("status")) == "304" else "logged=unknown"
    if category == "playback-discovery":
        if body_text is None:
            return "body=unavailable"
        if any(marker in body_text for marker in PREVIEW_MARKERS):
            return "preview=yes signed-mux-source=no"
        match = re.search(r"https://stream\.mux\.com/[^\"'<>\s]+\.m3u8(?:\?[^\"'<>\s]*)?", body_text)
        if match:
            return "preview=no signed-mux-source=yes source-query=" + ",".join(query_names(match.group(0)))
        return "preview=no signed-mux-source=no"
    if category in MEDIA_CATEGORIES:
        parsed = urlparse(request_url)
        names = query_names(request_url)
        return "credentials=url-query:" + (",".join(names) if names else "none")
    return ""


def analyze_har(path: Path) -> HarReport:
    with path.open("r", encoding="utf-8") as handle:
        document = json.load(handle)

    entries = document.get("log", {}).get("entries", [])
    if not isinstance(entries, list):
        raise ValueError("HAR log.entries is not an array")

    report = HarReport(file_name=path.name, entry_count=len(entries), start_time="", end_time="")

    for entry in entries:
        if not isinstance(entry, Mapping):
            continue
        request = entry.get("request")
        response = entry.get("response")
        if not isinstance(request, Mapping) or not isinstance(response, Mapping):
            continue

        started = str(entry.get("startedDateTime", ""))
        if started and (not report.start_time or started < report.start_time):
            report.start_time = started
        if started and (not report.end_time or started > report.end_time):
            report.end_time = started

        request_url = str(request.get("url", ""))
        parsed_url = urlparse(request_url)
        host = parsed_url.hostname or "<no-host>"
        path_value = parsed_url.path or "/"
        method = str(request.get("method", "GET")).upper()
        status = status_label(response.get("status"))
        content = response.get("content")
        mime_type = str(content.get("mimeType", "")) if isinstance(content, Mapping) else ""
        category = classify(host, path_value, mime_type)
        endpoint = normalize_path(host, path_value)
        names = query_names(request_url)
        report.hosts_by_category[category].add(host)

        group_key = (category, method, host, endpoint, names)
        group = report.endpoint_groups.get(group_key)
        if group is None:
            group = EndpointGroup(
                category=category,
                method=method,
                host=host,
                endpoint=endpoint,
                query_names=names,
                first_time=started,
                last_time=started,
            )
            report.endpoint_groups[group_key] = group
        group.count += 1
        group.statuses[status] += 1
        if mime_type:
            group.mime_types.add(mime_type.split(";", 1)[0])
        if started:
            group.last_time = started

        request_headers = header_values(request.get("headers") if isinstance(request.get("headers"), list) else None)
        response_headers = header_values(response.get("headers") if isinstance(response.get("headers"), list) else None)
        present_header_names = tuple(sorted(name for name in request_headers if name in RELEVANT_REQUEST_HEADERS))

        request_cookie_names = {
            str(cookie.get("name"))
            for cookie in request.get("cookies", [])
            if isinstance(cookie, Mapping) and cookie.get("name")
        }
        for cookie_header in request_headers.get("cookie", ()):
            request_cookie_names.update(cookie_names_from_header(cookie_header))
        if request_cookie_names:
            report.request_cookie_names[host].update(request_cookie_names)

        for set_cookie_value in response_headers.get("set-cookie", ()):
            metadata = parse_set_cookie(set_cookie_value, host)
            if metadata:
                report.set_cookies.add(metadata)
        for cookie in response.get("cookies", []):
            if not isinstance(cookie, Mapping) or not cookie.get("name"):
                continue
            report.set_cookies.add(
                CookieMetadata(
                    name=str(cookie.get("name")),
                    domain=str(cookie.get("domain") or "host-only:" + host),
                    path=str(cookie.get("path") or "/"),
                    same_site=str(cookie.get("sameSite") or "unspecified"),
                    secure=bool(cookie.get("secure")),
                    http_only=bool(cookie.get("httpOnly")),
                    clearing=False,
                )
            )

        body_text = response_text(response)
        signal = event_signal(category, request_url, response, body_text)
        request_id = correlation_id(request_url)

        if category == "session" and signal:
            report.session_states.append((started, signal))

        if host in {"means.tv", "api.uscreencdn.com"} and (
            path_value.startswith("/api/contents/") or path_value == "/api/contents/search"
        ):
            parsed_body = parse_json_safely(body_text)
            for content_object in iter_content_objects(parsed_body):
                if content_object.get("slider_video_hls") is None:
                    report.content_slider_null += 1
                elif isinstance(content_object.get("slider_video_hls"), str):
                    report.content_slider_present += 1

        if category == "playback-discovery":
            if "preview=yes" in signal:
                report.program_content_preview += 1
            elif "signed-mux-source=yes" in signal:
                report.program_content_full += 1
            else:
                report.program_content_missing += 1

        if category in {"media-master", "media-rendition"} and body_text:
            report.observed_media_ids.add(request_id)
            for referenced_url in hls_uris(request_url, body_text):
                referenced_id = correlation_id(referenced_url)
                report.hls_references[request_id].add(referenced_id)
                ref_parsed = urlparse(referenced_url)
                report.hls_reference_categories[referenced_id] = classify(
                    ref_parsed.hostname or "<no-host>",
                    ref_parsed.path,
                    "",
                )
        elif category in MEDIA_CATEGORIES:
            report.observed_media_ids.add(request_id)

        if category in CRITICAL_CATEGORIES:
            report.critical_events.append(
                Event(
                    started=started,
                    file_name=path.name,
                    category=category,
                    method=method,
                    status=status,
                    host=host,
                    endpoint=endpoint,
                    query_names=names,
                    header_names=present_header_names,
                    cookie_names=tuple(sorted(request_cookie_names)),
                    signal=signal,
                    correlation_id=request_id if category in MEDIA_CATEGORIES else "",
                )
            )

    return report


def short_time(timestamp: str) -> str:
    if not timestamp:
        return "unknown-time"
    try:
        normalized = timestamp.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
        return parsed.isoformat(timespec="milliseconds")
    except ValueError:
        return timestamp


def query_shape(names: Sequence[str]) -> str:
    return "?" + "&".join(f"{name}=<redacted>" for name in names) if names else ""


def status_counts(statuses: Mapping[str, int]) -> str:
    return ", ".join(f"{status}×{count}" for status, count in sorted(statuses.items()))


def compress_events(events: Sequence[Event]) -> list[tuple[Event, Event, int]]:
    if not events:
        return []
    compressed: list[tuple[Event, Event, int]] = []
    first = previous = events[0]
    count = 1
    for event in events[1:]:
        previous_key = (
            previous.category,
            previous.method,
            previous.status,
            previous.host,
            previous.endpoint,
            previous.query_names,
            previous.header_names,
            previous.cookie_names,
            previous.signal,
        )
        event_key = (
            event.category,
            event.method,
            event.status,
            event.host,
            event.endpoint,
            event.query_names,
            event.header_names,
            event.cookie_names,
            event.signal,
        )
        if event_key == previous_key:
            previous = event
            count += 1
            continue
        compressed.append((first, previous, count))
        first = previous = event
        count = 1
    compressed.append((first, previous, count))
    return compressed


def render_report(reports: Sequence[HarReport]) -> str:
    lines: list[str] = [
        "# MeansTV / Uscreen HAR report",
        "",
        "> Secret-safe output: values are redacted; media URLs use non-reversible correlation IDs.",
        "> HAR status `0` is rendered as `CANCELED`, not as an HTTP response.",
        "",
        "## Combined host roles",
        "",
    ]

    combined_hosts: dict[str, set[str]] = defaultdict(set)
    for report in reports:
        for category, hosts in report.hosts_by_category.items():
            combined_hosts[category].update(hosts)
    for category in sorted(combined_hosts):
        lines.append(f"- **{category}**: " + ", ".join(f"`{host}`" for host in sorted(combined_hosts[category])))

    lines.extend(["", "## Combined critical timeline", ""])
    all_events = sorted(
        (event for report in reports for event in report.critical_events),
        key=lambda event: (event.started, event.file_name),
    )
    for first, last, count in compress_events(all_events):
        time_range = short_time(first.started)
        if count > 1:
            time_range += "–" + short_time(last.started)
        headers = ",".join(first.header_names) or "none"
        cookies = ",".join(first.cookie_names) or "none"
        signal = f"; {first.signal}" if first.signal else ""
        correlation = f"; id={first.correlation_id}" if first.correlation_id else ""
        lines.append(
            f"- `{time_range}` **{first.category}** {first.method} "
            f"`{first.host}{first.endpoint}{query_shape(first.query_names)}` -> {first.status}"
            f"; headers={headers}; cookie-names={cookies}{signal}{correlation}"
            f"{f'; count={count}' if count > 1 else ''}"
        )

    for report in reports:
        lines.extend(
            [
                "",
                f"## {report.file_name}",
                "",
                f"- Entries: {report.entry_count}",
                f"- Window: `{short_time(report.start_time)}` to `{short_time(report.end_time)}`",
                f"- Session observations: {', '.join(signal for _, signal in report.session_states) or 'none'}",
                f"- Content objects: `slider_video_hls` present={report.content_slider_present}, null={report.content_slider_null}",
                f"- `program_content`: full={report.program_content_full}, preview={report.program_content_preview}, missing-source={report.program_content_missing}",
                "",
                "### Relevant endpoint groups",
                "",
                "| Category | Method | Endpoint shape | Status/count | MIME | First | Last |",
                "|---|---|---|---|---|---|---|",
            ]
        )

        groups = sorted(
            report.endpoint_groups.values(),
            key=lambda group: (group.category, group.host, group.endpoint, group.method, group.query_names),
        )
        for group in groups:
            if group.category in {"asset", "telemetry", "other"}:
                continue
            endpoint_shape = group.host + group.endpoint + query_shape(group.query_names)
            mime = ", ".join(sorted(group.mime_types)) or "unknown"
            lines.append(
                f"| {group.category} | {group.method} | `{endpoint_shape}` | "
                f"{status_counts(group.statuses)}; total={group.count} | {mime} | "
                f"`{short_time(group.first_time)}` | `{short_time(group.last_time)}` |"
            )

        lines.extend(["", "### Cookie metadata", ""])
        if report.set_cookies:
            lines.extend(
                [
                    "| Name | Domain | Path | SameSite | Secure | HttpOnly | Clearing |",
                    "|---|---|---|---|---|---|---|",
                ]
            )
            for cookie in sorted(
                report.set_cookies,
                key=lambda item: (item.name, item.domain, item.path, item.clearing),
            ):
                lines.append(
                    f"| `{cookie.name}` | `{cookie.domain}` | `{cookie.path}` | `{cookie.same_site}` | "
                    f"{str(cookie.secure).lower()} | {str(cookie.http_only).lower()} | {str(cookie.clearing).lower()} |"
                )
        else:
            lines.append("No Set-Cookie metadata found.")

        lines.extend(["", "Request cookie names by host:"])
        if report.request_cookie_names:
            for host, names in sorted(report.request_cookie_names.items()):
                lines.append(f"- `{host}`: " + ", ".join(f"`{name}`" for name in sorted(names)))
        else:
            lines.append("- none")

        lines.extend(["", "### HLS correlation", ""])
        if not report.hls_references:
            lines.append("No HLS playlist body with child URIs was available in this capture.")
        else:
            for parent_id, child_ids in sorted(report.hls_references.items()):
                observed = sum(child_id in report.observed_media_ids for child_id in child_ids)
                categories = sorted(
                    {report.hls_reference_categories.get(child_id, "unknown") for child_id in child_ids}
                )
                lines.append(
                    f"- Playlist `{parent_id}` references {len(child_ids)} unique "
                    f"{','.join(categories)} URI(s); {observed} exact referenced request(s) observed."
                )

        if report.errors:
            lines.extend(["", "### Parse warnings", ""])
            lines.extend(f"- {error}" for error in report.errors)

    lines.extend(
        [
            "",
            "## Authentication and playback interpretation",
            "",
            "- MeansTV authentication is cookie-backed. Treat `/api/sessions` `logged=true` as service-side proof.",
            "- `/api/_sync-token` is observed but is not a Mux or HTTP Authorization credential in these captures.",
            "- Full playback discovery is authenticated `GET /programs/{slug}/program_content?playlist_position=<redacted>&preview=<redacted>`.",
            "- `slider_video_hls` is metadata/preview state and is not a reliable entitled-playback source.",
            "- Mux master/rendition/segment authorization is in signed query values. Preserve all values unchanged; do not send Means cookies to Mux without new evidence.",
            "- `allowUrls` behavior must be checked per Grayjay platform. This report lists concrete observed hosts and does not claim wildcard support.",
            "",
        ]
    )
    rendered = "\n".join(lines)
    if JWT_PATTERN.search(rendered):
        raise RuntimeError("refusing to emit output containing a JWT-shaped value")
    return rendered


def discover_inputs(arguments: Sequence[str]) -> list[Path]:
    if arguments:
        return [Path(argument) for argument in arguments]
    return sorted(Path.cwd().glob("*.har"), key=lambda path: path.name)


def parse_args(argv: Sequence[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Analyze MeansTV/Uscreen HARs without emitting credential values.",
    )
    parser.add_argument("files", nargs="*", help="HAR files; defaults to every *.har in the current directory")
    parser.add_argument("-o", "--output", help="Write Markdown to this path instead of stdout")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    paths = discover_inputs(args.files)
    if not paths:
        print("ERROR: no HAR files found", file=sys.stderr)
        return 2

    reports: list[HarReport] = []
    failed = False
    for path in paths:
        try:
            reports.append(analyze_har(path))
        except FileNotFoundError:
            print(f"ERROR: HAR file not found: {path}", file=sys.stderr)
            failed = True
        except (json.JSONDecodeError, OSError, ValueError) as error:
            print(f"ERROR: could not parse {path.name}: {type(error).__name__}", file=sys.stderr)
            failed = True

    if not reports:
        return 2

    output = render_report(reports)
    if args.output:
        Path(args.output).write_text(output + "\n", encoding="utf-8")
    else:
        print(output)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
