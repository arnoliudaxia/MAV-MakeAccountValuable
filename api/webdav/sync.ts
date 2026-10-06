import { getSettings } from "../settings/store";
import {
  databaseSnapshot,
  replaceDatabase,
  withDatabaseLock,
} from "../database/operations";
import { davRequest, davUrls, DavError, remoteBuffer } from "./client";
import { SyncScheduler } from "./scheduler";
import type { WebDavSettings } from "../../contracts/settings";

type Action = "test" | "push" | "pull";
type SyncState = {
  scheduler: SyncScheduler;
  startup?: Promise<void>;
  busy: boolean;
  lastAction: Action | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  error: string | null;
  backupPath: string | null;
  etags: Map<string, string>;
};
const shared = globalThis as typeof globalThis & { mavWebDavSync?: SyncState };
const state: SyncState = (shared.mavWebDavSync ??= {
  scheduler: new SyncScheduler(),
  busy: false,
  lastAction: null,
  lastAttemptAt: null,
  lastSuccessAt: null,
  error: null,
  backupPath: null,
  etags: new Map(),
});
export function syncStatus() {
  return {
    busy: state.busy,
    lastAction: state.lastAction,
    lastAttemptAt: state.lastAttemptAt,
    lastSuccessAt: state.lastSuccessAt,
    error: state.error,
    backupPath: state.backupPath,
    nextRunAt: state.scheduler.nextRunAt,
  };
}
export async function configureSync(config?: WebDavSettings) {
  const value = config ?? (await getSettings()).webdav;
  state.scheduler.stop();
  if (value.enabled)
    state.scheduler.start(value.intervalHours, () => runSync("push"));
}

export async function runSync(action: Action) {
  if (state.busy) throw new DavError("同步正在进行，请稍后重试");
  state.busy = true;
  state.lastAction = action;
  state.lastAttemptAt = new Date().toISOString();
  state.error = null;
  try {
    return await withDatabaseLock(async () => {
      const config = (await getSettings()).webdav;
      const urls = davUrls(config);
      if (action === "test") {
        const response = await davRequest(config, urls.directory, "PROPFIND", {
          Depth: "0",
        });
        await response.body?.cancel();
        if (response.status === 404)
          throw new DavError("WebDAV 目录不存在，请先创建目录");
      } else if (action === "push") {
        // Capture a strong ETag on first contact; thereafter retain the known
        // revision so changes by another device are rejected, not silently lost.
        let etag = state.etags.get(urls.file);
        let missing = false;
        if (!etag) {
          const response = await davRequest(config, urls.file, "GET");
          missing = response.status === 404;
          etag = response.headers.get("etag") ?? undefined;
          await response.body?.cancel();
          if (!missing && (!etag || etag.startsWith("W/")))
            throw new DavError(
              "远端未提供强 ETag，无法安全覆盖；请使用支持 ETag 的 WebDAV 服务"
            );
        }
        const snapshot = await databaseSnapshot();
        const response = await davRequest(
          config,
          urls.file,
          "PUT",
          {
            "Content-Type": "application/vnd.sqlite3",
            ...(missing ? { "If-None-Match": "*" } : { "If-Match": etag! }),
          },
          snapshot
        );
        if (response.status === 404)
          throw new DavError("WebDAV 目录不存在，请先创建目录");
        const nextEtag = response.headers.get("etag");
        await response.body?.cancel();
        if (nextEtag && !nextEtag.startsWith("W/"))
          state.etags.set(urls.file, nextEtag);
        else {
          // Some DAV providers only expose ETag on GET. Only accept that new
          // revision after verifying its bytes match exactly what we uploaded;
          // never adopt a concurrent writer's different database revision.
          state.etags.set(urls.file, etag ?? '"unknown-after-upload"');
          const verification = await davRequest(config, urls.file, "GET");
          const verifiedEtag = verification.headers.get("etag");
          if (verification.status === 404) {
            await verification.body?.cancel();
            throw new DavError("上传后远端文件已被删除，无法验证上传结果");
          }
          const verifiedBytes = await remoteBuffer(verification);
          if (!verifiedBytes.equals(snapshot))
            throw new DavError(
              "上传后远端数据库发生更改，未接受新的修订；请检查远端数据"
            );
          if (!verifiedEtag || verifiedEtag.startsWith("W/"))
            throw new DavError(
              "上传已完成，但远端未提供强 ETag，后续自动覆盖将被安全拒绝"
            );
          state.etags.set(urls.file, verifiedEtag);
        }
      } else {
        const response = await davRequest(config, urls.file, "GET");
        if (response.status === 404) {
          await response.body?.cancel();
          throw new DavError("远端 app.db 不存在，继续使用本地数据库");
        }
        const buffer = await remoteBuffer(response);
        const result = await replaceDatabase(buffer, config);
        state.backupPath = result.backupPath;
        const etag = response.headers.get("etag");
        if (etag && !etag.startsWith("W/")) state.etags.set(urls.file, etag);
        else state.etags.delete(urls.file);
      }
      state.lastSuccessAt = new Date().toISOString();
      return { ok: true as const };
    });
  } catch (error) {
    // DB validation errors are controlled messages, but filesystem/libsql errors
    // can contain local paths and SQL/settings. Only allow known messages.
    const message =
      error instanceof DavError
        ? error.message
        : error instanceof Error &&
            error.message ===
              "数据库恢复失败，请使用保留的本地备份恢复并重启应用"
          ? error.message
          : "数据库同步失败：文件校验或替换失败；原数据库及备份保留";
    state.error = message;
    throw new DavError(message);
  } finally {
    state.busy = false;
  }
}

export function initializeSync() {
  if (!state.startup) {
    state.startup = (async () => {
      const config = (await getSettings()).webdav;
      if (config.enabled) await runSync("pull").catch(() => undefined);
      await configureSync();
    })();
  } else {
    // Replace timer callbacks on HMR without repeating the destructive startup pull.
    void state.startup
      .then(() => withDatabaseLock(() => configureSync()))
      .catch(() => undefined);
  }
  return state.startup;
}
