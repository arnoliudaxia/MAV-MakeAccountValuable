import type { WebDavSettings } from "../../contracts/settings";
import { davRequest, davUrls, DavError } from "./client";

export function remoteModifiedAt(response: Response): string | null {
  const value = response.headers.get("last-modified");
  const timestamp = value ? Date.parse(value) : NaN;
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

// Metadata never updates the optimistic-concurrency ETag used for uploads.
export class RemoteMetadata {
  remoteUpdatedAt: string | null = null;
  remoteStatus:
    | "unconfigured"
    | "unknown"
    | "available"
    | "missing"
    | "unavailable" = "unknown";
  remoteError: string | null = null;
  private key = "";
  private checkedAt = -Infinity;
  private pending?: Promise<void>;

  invalidate() {
    this.checkedAt = -Infinity;
    this.remoteUpdatedAt = null;
    this.remoteStatus = "unknown";
    this.remoteError = null;
  }

  private select(config: WebDavSettings) {
    const key = JSON.stringify([
      config.endpoint,
      config.username,
      config.password,
    ]);
    if (key !== this.key) {
      this.key = key;
      this.checkedAt = -Infinity;
      this.remoteUpdatedAt = null;
      this.remoteStatus = "unknown";
      this.remoteError = null;
    }
  }

  observe(config: WebDavSettings, response: Response) {
    this.select(config);
    this.remoteUpdatedAt =
      response.status === 404 ? null : remoteModifiedAt(response);
    this.remoteStatus = response.status === 404 ? "missing" : "available";
    this.remoteError = null;
    // A PUT without Last-Modified must be followed by a metadata request,
    // not replaced by the local upload completion time.
    this.checkedAt =
      this.remoteUpdatedAt || response.status === 404 ? Date.now() : -Infinity;
  }

  async refresh(config: WebDavSettings) {
    // Serialize even across configuration changes; callers then recheck the key.
    if (this.pending) await this.pending;
    this.select(config);
    if (!config.endpoint.trim()) {
      this.remoteUpdatedAt = null;
      this.remoteStatus = "unconfigured";
      this.remoteError = null;
      return;
    }
    // Bound status polling (including failures) to one request per 30 seconds.
    if (Date.now() - this.checkedAt < 30_000) return;
    this.pending = (async () => {
      try {
        const response = await davRequest(config, davUrls(config).file, "HEAD");
        this.observe(config, response);
        await response.body?.cancel();
      } catch (error) {
        this.remoteUpdatedAt = null;
        this.remoteStatus = "unavailable";
        this.remoteError =
          error instanceof DavError ? error.message : "远端文件信息读取失败";
      } finally {
        this.checkedAt = Date.now();
      }
    })();
    try {
      await this.pending;
    } finally {
      this.pending = undefined;
    }
  }
}
