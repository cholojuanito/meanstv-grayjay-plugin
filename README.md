# meanstv-grayjay-plugin

A [Grayjay](https://github.com/GrayjayApp) plugin for [MeansTV](https://means.tv) — the world's first worker-owned streaming platform

# Overview

MeansTV is a subscription streaming service backed by Uscreen. This plugin lets you browse and watch MeansTV content directly inside Grayjay. Your paid subscription to MeansTV is required to fully view all videos.

# Features
- [ x ] Home feed
- [ x ] Channel/creator pages with video listings
- [ x ] Video playback with HLS streaming
- [ x ] Comments
- [ ] Video search (general and per-channel)
- [ ] Nested comments
- [ ] User playlists
- [ ] Playback activity sync (opt-in)

# About GrayJay

[GrayJay](https://github.com/GrayjayApp) is an open-source media aggregator and player with a plugin-based architecture. Each streaming platform is supported by a TypeScript plugin implementing the `Source` interface. Plugins are bundled into single IIFE JavaScript files and loaded at runtime.

Key GrayJay features relevant to plugin development:

- **Plugin-based extensibility** — any platform can be added via a Source plugin
- **Built-in authentication** — cookies/headers are managed on the app side, never exposed to plugins directly
- **Pager system** — pagination for feeds, channels, comments, etc.
- **Content types** — PlatformVideo, PlatformPost, PlatformNestedMediaContent, and their detail variants
- **HLS/DASH streaming support** — plugins provide signed URLs, GrayJay handles playback
- **Casting support** — Chromecast, AirPlay
- **URL-based deep linking** — URLs are matched by regex to route to the correct plugin

# How it works

The plugin speaks the [Grayjay Source plugin protocol](https://github.com/GrayjayApp/GrayjaySourcePlugin). It does not run inside a browser — instead it makes HTTP requests to MeansTV's backend APIs (which are Uscreen's infrastructure) and parses the responses:

- **JSON endpoints** for content details, catalog, and session info
- **HTML/Turbo Stream fragments** for author pages, comments, and replies
- **HLS manifests** from Mux CDNs for playback

The plugin is written in TypeScript and bundled to a single IIFE JavaScript file with Bun.

# Key design decisions

These decisions were reached through reverse-engineering MeansTV's API and testing against GrayJay's runtime:

1. **Session cookies remain app-managed** — The plugin uses `http.GET(..., true)` and never reads credential values. Grayjay manages the cookies.
2. **No custom HTTP client** — Grayjay's default authenticated HTTP package suffices.
3. **No Mux cookie propagation** — Mux requests contain no cookies in browser captures.
4. **No invented bearer auth** — The `_sync-token` endpoint is not a playback bearer credential; it's a transient token for playback activity sync.
5. **Service-side session verification** — `source.enable` checks `/api/sessions` to verify the captured session is still valid.
6. **Fresh entitlement discovery** — Always calls the authenticated `program_content` endpoint rather than caching stream URLs.
7. **Fail closed** — Preview/missing streams become explicit `LoginRequiredException` or `UnavailableException`.
8. **Error separation** — `LoginRequiredException` for auth issues, `UnavailableException` for content/access issues.

## Authentication flow

MeansTV uses Uscreen's session-based auth. The full flow:

1. **Login** — User opens a WebView via Grayjay's auth system, enters credentials on MeansTV's login page
2. **Cookie capture** — Grayjay captures `_uscreen2_session` and `remember_user_token` cookies
3. **Session verification** — On `source.enable`, the plugin calls `/api/sessions` to verify the session
4. **Stream discovery** — For playback, the plugin calls the authenticated `program_content` endpoint to get a signed HLS URL from Mux
5. **Playback activity** (optional) — Uses a transient token from `_sync-token` to post watch events to `_sync-state`

# Setting up the dev environment

## Prerequisites

- [Node.js](https://nodejs.org/) 20+ (or [Bun](https://bun.sh/) 1.0+)
- A Grayjay-compatible browser (Android) or Grayjay desktop for testing

## Install dependencies

```bash
npm install
# or
bun install
```

## Build

```bash
npm run build
# or
bun run build
```

## Watch mode

```bash
npm run dev
# or
bun run dev
```

Runs the build watcher and starts a local HTTP server at `http://localhost:3000`. You can load this URL into Grayjay for live development.

## Lint and typecheck

```bash
npm run lint
npm run typecheck
```

## Tests

```bash
npm test
```

Tests use Bun's built-in test runner with mocked HTTP responses and a `linkedom`-backed DOM parser.

# Developing the plugin

## Adding a new API endpoint

1. Add the URL template to `src/constants.ts`
2. Add a regex if you need to match URLs for that endpoint
3. Add the API function to `src/api.ts`
4. Add a parser to `src/parsers/`
5. Add a pager to `src/pagers/` if it's paginated
6. Wire it up in `src/source.ts`

## Adding a new parser

Parsers take raw HTML or JSON and return normalized domain objects (from `src/types.ts`). They should not depend on Grayjay types — only factories in `src/utilities/factories.ts` should construct `Platform*` objects.

## Testing new endpoints

Capture new HAR files by browsing MeansTV with a browser dev tools. Save them in the repo (they get ignored by `.gitignore` in the build output). Use them as fixtures in `tests/fixtures/`.


# License

AGPL-3.0-or-later — see [LICENSE](LICENSE) for details.

# Contributing

Contributions are welcome! Here's how to get started:

1. Fork the repository
2. Create a feature branch from `main`
3. Make your changes, run `npm run lint && npm run typecheck && npm test`
4. Submit a pull request

For Grayjay plugin development specifics, see the [Grayjay Source Plugin docs](https://github.com/GrayjayApp/GrayjaySourcePlugin).

# Known limitations

- Playback sync is opt-in (disabled by default) and only works when the user has enabled "Send playback activity to MeansTV" in plugin settings
- Some Uscreen CDN URLs may change — the `allowUrls` list in `MeansTvConfig.json` may need updates
- Comments and replies are read-only (no posting support)
