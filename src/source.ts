// All `source.xxx = ...` assignments live here.
// This module has no exports — it exists purely for side effects.
// `source` is declared as `const source: Source` in plugin.d.ts.

import {
  config as _config,
  _settings as __settings,
  _clientContext as __clientContext,
} from "./constants";
import { HomePager } from "./pagers/HomePager";

// We re-bind the module-level state through local `let` refs so we can
// reassign them from within the callbacks.  Exports from constants.ts are
// live bindings in ES modules, but bun bundles to IIFE so the simplest
// approach is to use a mutable container object.
let config: Record<string, unknown> = _config;
let _settings: Record<string, unknown> = __settings;
let _clientContext: Record<string, unknown> = __clientContext;

// Cast source to any so we can assign arbitrary method shapes without fighting
// the `Source` interface's parameter/return type expectations on stubs.
// The Grayjay runtime sets the concrete object; the interface is for
// documentation, not enforcement at the bundled-JS layer.
const src = source as unknown as Record<string, unknown>;

src["isChannelUrl"] = (_url: string): boolean => false;
src["isContentDetailsUrl"] = (_url: string): boolean => false;
src["isPlaylistUrl"] = (_url: string): boolean => false;

src["setSettings"] = function (settings: Record<string, unknown>): void {
  _settings = settings;
};

src["enable"] = function (
  conf: Record<string, unknown>,
  settings: Record<string, unknown>,
  saveStateStr: string
): void {
  config = conf ?? {};
  _settings = settings ?? {};
  log(`Config: ${JSON.stringify(config)}`);
  log(`Settings: ${JSON.stringify(_settings)}`);
  log(`Saved state: ${saveStateStr}`);
  let didSaveState = false;
  try {
    if (saveStateStr) {
      const saveState = JSON.parse(saveStateStr) as Record<string, unknown>;
      log("Saved state found");
      if (saveState && saveState["clientContext"]) {
        _clientContext = saveState["clientContext"] as Record<string, unknown>;
        log("Using save state");
        didSaveState = true;
      }
    }
  } catch (ex) {
    log("Failed to parse saveState:" + String(ex));
    didSaveState = false;
  }
  if (!didSaveState) {
    log(config);
    log("Settings:\n" + JSON.stringify(_settings, null, "   "));
    const isLoggedIn = bridge.isLoggedIn();
    log("isLoggedIn: " + isLoggedIn);
  }
};

src["disable"] = function (): void {};

src["saveState"] = function (): string {
  return JSON.stringify({ clientContext: _clientContext });
};

src["getHome"] = function (): HomePager {
  return new HomePager({ next: null });
};

src["searchSuggestions"] = function (_query: string): string[] {
  return [];
};

src["search"] = function (
  _query: string,
  _type: string,
  _order: string,
  _filters: unknown
): void {};

src["getSearchCapabilities"] = function (): void {};

src["getChannel"] = function (_url: string): void {};

src["getChannelContents"] = function (
  _url: string,
  _type: string,
  _order: string,
  _filters: unknown
): void {};

src["getChannelCapabilities"] = function (): void {};

src["getContentDetails"] = function (_url: string): void {};

src["getComments"] = function (_url: string): void {};

src["getSubComments"] = function (_comment: unknown): void {};

src["getUserSubscriptions"] = function (): string[] {
  return [];
};

src["getUserPlaylists"] = function (): string[] {
  return [];
};
