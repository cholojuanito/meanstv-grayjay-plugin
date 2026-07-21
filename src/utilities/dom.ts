// Thin wrapper over Grayjay's jsoup-backed DOMParser (`DOMParser` package →
// `domParser` global). Uscreen returns prebuilt HTML fragments for the catalog
// and the stream manifest; we parse them here rather than with regex. Parsing
// runs app-side (native), so it is memory-appropriate for phones — no JS DOM
// tree is built, and we release the native tree via `dispose()` when available.
//
// Notes:
//  - @types/grayjay-source declares a minimal `DOMNode` without `dispose()`;
//    the real jsoup node has it, so we call it behind an `in`/`typeof` guard.
//  - Grayjay's DevServer swaps in the browser's DOMParser (also no `dispose()`),
//    so behavior can differ slightly there vs. the shipped app — the guard keeps
//    both paths safe.

export function withDocument<T>(html: string, use: (root: DOMNode) => T): T {
  const root = domParser.parseFromString(html);
  try {
    return use(root);
  } finally {
    if ("dispose" in root && typeof root.dispose === "function") {
      root.dispose();
    }
  }
}

/** Extracts the plain text of an HTML snippet (e.g. a rich-text description). */
export function stripHtml(html: string): string {
  if (!html) return "";
  try {
    const text = withDocument(html, (root) => (typeof root.text === "string" ? root.text : ""));
    if (text) return text.trim();
  } catch {
    // DevServer/browser DOMParser can differ from Grayjay's jsoup DOMParser.
    // Fall through to the allocation-light textual fallback instead of failing
    // content details on rich-text descriptions.
  }
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
