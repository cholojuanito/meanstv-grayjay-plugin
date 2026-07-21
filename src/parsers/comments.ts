// Parsers for read-only MeansTV comment and reply Turbo fragments.

import { withDocument } from "../utilities/dom";
import { absoluteImageUrl, absoluteMainUrl } from "../utilities/url";
import type { CommentPage, CommentRecord } from "../types";

function countFrom(value: string): number {
  const digits = value.match(/\d[\d,]*/)?.[0];
  return digits ? Number(digits.replaceAll(",", "")) || 0 : 0;
}

function normalizedId(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? "";
  const prefixedNumeric = /^(?:comment|reply)[_-](\d+)$/.exec(trimmed);
  return prefixedNumeric?.[1] ?? trimmed;
}

function queryValue(url: string, name: string): string {
  const query = url.split("?", 2)[1]?.split("#", 1)[0] ?? "";
  for (const entry of query.split("&")) {
    const [rawKey = "", rawValue = ""] = entry.split("=", 2);
    try {
      if (decodeURIComponent(rawKey) === name) return decodeURIComponent(rawValue);
    } catch {
      return "";
    }
  }
  return "";
}

function profileId(url: string): string {
  const value = /\/community\/profiles\/([^/?#]+)/.exec(url)?.[1] ?? "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function continuationUrl(root: DOMNode, replies: boolean): string | null {
  const prefix = replies ? "more_replies" : "more_comments";
  const href =
    root.querySelector(`[data-${prefix.replace("_", "-")}] a[href]`)?.getAttribute("href") ??
    root.querySelector(`a[id^="${prefix}_link_"][href]`)?.getAttribute("href") ??
    root.querySelector(`[id^="${prefix}_link_"] a[href]`)?.getAttribute("href") ??
    root.querySelector(`turbo-stream[target^="${prefix}_link_"] a[href]`)?.getAttribute("href");
  const src =
    root.querySelector(`turbo-frame#${prefix}[src]`)?.getAttribute("src") ??
    root.querySelector(`turbo-frame[id^="${prefix}_link_"][src]`)?.getAttribute("src") ??
    root.querySelector(`turbo-stream[target^="${prefix}_link_"] turbo-frame[src]`)?.getAttribute("src");
  const value = href ?? src ?? "";
  return value ? absoluteMainUrl(value) : null;
}

function dateSeconds(value: string, now: Date): number {
  const direct = Date.parse(value);
  if (Number.isFinite(direct) && /\b\d{4}\b/.test(value)) return Math.floor(direct / 1000);

  const year = now.getUTCFullYear();
  const withYear = Date.parse(`${value} ${year} UTC`);
  if (!Number.isFinite(withYear)) return 0;

  const resolved = new Date(withYear);
  if (resolved.getTime() > now.getTime()) resolved.setUTCFullYear(year - 1);
  return Math.floor(resolved.getTime() / 1000);
}

function parseComment(
  node: DOMNode,
  contentId: string,
  now: Date,
  isReply: boolean,
  replyThreadId: string,
): CommentRecord | null {
  const id = normalizedId(
    node.getAttribute("data-comment-id") ??
      node.getAttribute("data-reply-id") ??
      node.getAttribute("id"),
  );
  if (!id) return null;

  const authorLink = node.querySelector(".profile-url[href]");
  const authorProfileUrl = absoluteMainUrl(authorLink?.getAttribute("href") ?? "");
  const authorName = (authorLink?.text ?? "").trim();
  const messageNode = node.querySelector(".comment-body");
  const paragraphs = messageNode
    ?.querySelectorAll("p")
    .map((paragraph) => paragraph.text.trim())
    .filter(Boolean) ?? [];
  const message = paragraphs.length > 0 ? paragraphs.join("\n\n") : (messageNode?.text ?? "").trim();
  if (!authorName || !message) return null;

  const dateText =
    node.querySelector("time")?.getAttribute("datetime") ??
    node.querySelector(".text-xs.text-ds-muted")?.text?.trim() ??
    "";
  const replyAction = node.querySelector('form[action*="/replies?"]')?.getAttribute("action") ?? "";
  const explicitThreadId =
    node.getAttribute("data-thread-id") ??
    node.getAttribute("data-comment-thread-id") ??
    node.querySelector("[data-thread-id]")?.getAttribute("data-thread-id") ??
    queryValue(replyAction, "thread_id");
  const threadId = normalizedId(explicitThreadId || (isReply ? replyThreadId : id));
  const nestedReplyCount = isReply ? 0 : node.querySelectorAll(".reply").length;
  const replyCount = Math.max(
    countFrom(node.getAttribute("data-reply-count") ?? ""),
    countFrom(node.querySelector(".reply-count, .comment-replies, .comment__replies")?.text ?? ""),
    nestedReplyCount,
  );

  return {
    id,
    contentId,
    threadId,
    authorId:
      normalizedId(authorLink?.getAttribute("data-author-id")) ||
      profileId(authorLink?.getAttribute("href") ?? ""),
    authorName,
    authorProfileUrl,
    authorAvatarUrl: absoluteImageUrl(node.querySelector("ds-avatar[url]")?.getAttribute("url") ?? ""),
    message,
    likeCount:
      countFrom(node.getAttribute("data-like-count") ?? "") ||
      countFrom(node.querySelector(".likes-counter, .comment-likes, .comment__likes, [data-like-count]")?.text ?? ""),
    dateSeconds: dateSeconds(dateText, now),
    replyCount,
  };
}

/** Parses one comments or replies response without constructing Grayjay objects. */
export function parseCommentPage(
  html: string,
  contentId: string,
  now = new Date(),
  replyThreadId: string | null = null,
): CommentPage {
  const documentHtml = html.includes("<turbo-stream")
    ? html.replaceAll(/<\/?template(?:\s[^>]*)?>/gi, "")
    : html;
  return withDocument(documentHtml, (root) => {
    const comments: CommentRecord[] = [];
    const seen = new Set<string>();
    const isReplyPage = replyThreadId !== null;
    const nodes = root.querySelectorAll(isReplyPage ? ".reply" : ".comment");

    for (const node of nodes) {
      const comment = parseComment(node, contentId, now, isReplyPage, replyThreadId ?? "");
      if (!comment || seen.has(comment.id)) continue;
      seen.add(comment.id);
      comments.push(comment);
    }

    return {
      comments,
      nextUrl: continuationUrl(root, isReplyPage),
    };
  });
}