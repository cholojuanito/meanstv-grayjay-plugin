export type HomeContext = { page: number };

export type ContentType = "video" | "collection";

export type ReleaseStage =
  | "published"
  | "scheduled"
  | "unpublished"
  | "live"
  | "preregistration"
  | "finished"
  | "processing";

export interface ContentJson {
  id: number;
  title: string;
  description: string;
  short_description: string;
  permalink: string;
  content_type: ContentType;
  main_poster: string;
  url: string;
  slider_video_hls: string | null;
  video_count: number;
  duration: number;
  children_videos: Array<{ id: number; permalink: string }>;
  tags: string[];
  categories: number[];
  trailer_id: number | null;
  free: boolean;
  release_stage: ReleaseStage;
  published_at: number;
}

export interface SwiperSlide {
  id: string;
  type: ContentType;
  slug: string;
  title: string;
  thumbnail: string;
  shortDescription: string;
  authorTitle?: string;
  authorPermalink?: string;
}
