// Normalized domain models for the MeansTV (Uscreen) plugin.
//
// Parsers normalize JSON, HTML, and Turbo frames into these framework-agnostic
// values. Only factory functions construct Grayjay Platform* objects.

/** Discriminator returned by the Uscreen `/api/contents` endpoint. */
export type UscreenContentType = "video" | "collection" | "live_event";

/** Author/creator block embedded in a content JSON response. */
export interface ContentAuthor {
  id: number;
  title: string;
  permalink: string | null;
  avatarUrl: string | null;
  url: string | null;
  description: string;
}

/** A single episode reference inside a collection response. */
export interface ContentChild {
  id: number;
  permalink: string;
}

/** Normalized content details parsed from `/api/contents/{slug}`. */
export interface Content {
  id: number;
  title: string;
  description: string;
  shortDescription: string;
  permalink: string;
  contentType: UscreenContentType;
  mainPoster: string;
  url: string;
  videoCount: number;
  durationSeconds: number;
  children: ContentChild[];
  tags: string[];
  categories: number[];
  author: ContentAuthor | null;
}

/** A shared Uscreen card extracted from catalog and Turbo fragments. */
export interface CatalogItem {
  id: string;
  contentType: UscreenContentType;
  title: string;
  slug: string;
  url: string;
  thumbnailUrl: string;
  authorThumbnailUrl: string;
  shortDescription: string;
  authorTitle: string;
  authorPermalink: string;
  durationSeconds: number;
}

/** A named group of catalog cards (a home-feed row). */
export interface CatalogCategory {
  title: string;
  items: CatalogItem[];
}

/** A parsed page of the catalog, plus whether more pages likely exist. */
export interface CatalogPage {
  categories: CatalogCategory[];
  hasMore: boolean;
}

/** Session info parsed from `/api/sessions`. */
export interface Session {
  logged: boolean;
  id: string | null;
  email: string | null;
  name: string | null;
  role: string | null;
  country: string | null;
}

/** A canonical MeansTV creator profile. */
export interface AuthorChannel {
  slug: string;
  name: string;
  thumbnailUrl: string;
  description: string;
}

/** A page of cards returned by author or general content search. */
export interface ContentCardPage {
  items: CatalogItem[];
  nextUrl: string | null;
}

/** A parsed MeansTV comment or reply. */
export interface CommentRecord {
  id: string;
  contentId: string;
  threadId: string;
  authorId: string;
  authorName: string;
  authorProfileUrl: string;
  authorAvatarUrl: string;
  message: string;
  likeCount: number;
  dateSeconds: number;
  replyCount: number;
}

/** A comments or replies response and its observed continuation control. */
export interface CommentPage {
  comments: CommentRecord[];
  nextUrl: string | null;
}

/** A user playlist card from `/playlists`. */
export interface UserPlaylistSummary {
  id: string;
  title: string;
  url: string;
  thumbnailUrl: string;
  itemCount: number;
}

/** A content reference from a user playlist detail page. */
export interface UserPlaylistItem {
  contentId: string;
  title: string;
  thumbnailUrl: string;
  durationSeconds: number | null;
}

/** A playlist summary together with its ordered content references. */
export interface UserPlaylistDetails {
  summary: UserPlaylistSummary;
  items: UserPlaylistItem[];
}

/** Playback metadata embedded in an entitled program-content response. */
export interface PlaybackStats {
  storeId: string;
  videoId: number;
  contentId: string;
  contentType: string;
  environmentId: string;
  userId: string;
}

/** A single event accepted by MeansTV's `_sync-state` endpoint. */
export interface PlaybackSyncEvent {
  created_at: string;
  current_second: number;
  name: "loadstart" | "canplay" | "loadeddata" | "play" | "timeupdate";
}
