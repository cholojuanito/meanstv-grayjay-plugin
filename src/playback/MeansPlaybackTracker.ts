import { syncPlayback } from "../api";
import type { PlaybackStats, PlaybackSyncEvent } from "../types";

const CADENCE_MS = 10_000;

/** Sends only observed MeansTV sync events and isolates all reporting failures. */
export class MeansPlaybackTracker extends PlaybackTracker {
  private readonly stats: PlaybackStats;
  private readonly syncToken: string;
  private readonly referer: string;
  private lastSecond = 0;
  private sentPlay = false;
  private concluded = false;

  constructor(stats: PlaybackStats, syncToken: string, referer: string) {
    super(CADENCE_MS);
    this.stats = stats;
    this.syncToken = syncToken;
    this.referer = referer;
  }

  private send(names: readonly PlaybackSyncEvent["name"][], seconds: number): void {
    const currentSecond = Math.max(0, Math.floor(seconds));
    this.lastSecond = currentSecond;
    try {
      syncPlayback(
        {
          events: names.map((name) => ({
            created_at: new Date().toISOString(),
            current_second: currentSecond,
            name,
          })),
          content_id: this.stats.contentId,
          content_type: this.stats.contentType,
          environment_id: this.stats.environmentId,
          video_id: this.stats.videoId,
          store_id: this.stats.storeId,
          source: "web",
          user_id: this.stats.userId,
          token: this.syncToken,
        },
        this.referer,
      );
    } catch {
      log("MeansTV playback activity reporting failed");
    }
  }

  override onInit(seconds: number): void {
    this.send(["loadstart", "canplay", "loadeddata"], seconds);
  }

  override onProgress(seconds: number, isPlaying: boolean): void {
    this.lastSecond = Math.max(0, Math.floor(seconds));
    if (!isPlaying || this.concluded) return;

    if (!this.sentPlay) {
      this.sentPlay = true;
      this.send(["play", "timeupdate"], seconds);
      return;
    }
    this.send(["timeupdate"], seconds);
  }

  override onConcluded(): void {
    if (this.concluded) return;
    this.concluded = true;
    this.send(["timeupdate"], this.lastSecond);
  }
}