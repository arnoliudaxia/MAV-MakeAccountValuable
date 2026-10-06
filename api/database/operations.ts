import { createClient, type Client } from "@libsql/client";
import { mkdtemp, readFile, rm, writeFile, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import {
  CURRENT_DATABASE_VERSION,
  getDatabaseFilePath,
  getSqlClient,
  closeDbConnection,
  resetDbConnection,
  removeDatabaseSidecarFiles,
} from "../queries/connection";
import {
  AppSettingsSchema,
  type WebDavSettings,
} from "../../contracts/settings";

// A process-wide queue survives dev module reloads. All API requests that use
// the DB and background replacements share this queue (not a multi-process lock).
const globalState = globalThis as typeof globalThis & {
  mavDatabaseQueue?: Promise<unknown>;
};
export function withDatabaseLock<T>(work: () => Promise<T>): Promise<T> {
  const result = (globalState.mavDatabaseQueue ?? Promise.resolve()).then(
    work,
    work
  );
  globalState.mavDatabaseQueue = result.catch(() => undefined);
  return result;
}

export async function cleanupDirectory(path: string) {
  // libsql may release Windows file handles asynchronously. Cleanup is best effort.
  await rm(path, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  }).catch(() => undefined);
}

export async function vacuumSnapshot(client: Client, path: string) {
  // SQLite SQL string, not a URL: normalize Windows separators and escape quotes.
  const sqlPath = path.replace(/\\/g, "/").replace(/'/g, "''");
  await client.execute(`VACUUM INTO '${sqlPath}'`);
}

export async function databaseSnapshot() {
  if (!getDatabaseFilePath()) throw new Error("仅支持本地 SQLite 数据库");
  const dir = await mkdtemp(join(tmpdir(), "mav-snapshot-"));
  try {
    const path = join(dir, "app.db");
    await vacuumSnapshot(await getSqlClient(), path);
    return await readFile(path);
  } finally {
    await cleanupDirectory(dir);
  }
}

export async function validateDatabase(path: string, buffer: Buffer) {
  if (
    buffer.length < 100 ||
    !buffer.subarray(0, 16).equals(Buffer.from("SQLite format 3\0"))
  ) {
    throw new Error("文件不是有效的 SQLite 数据库");
  }
  await writeFile(path, buffer);
  const client = createClient({ url: pathToFileURL(path).href });
  try {
    const version = await client.execute("PRAGMA user_version");
    if (Number(version.rows[0]?.user_version) !== CURRENT_DATABASE_VERSION)
      throw new Error("数据库版本不受支持");
    const integrity = await client.execute("PRAGMA integrity_check");
    if (
      integrity.rows.length !== 1 ||
      integrity.rows[0]?.integrity_check !== "ok"
    )
      throw new Error("数据库完整性检查失败");
    const required: Record<string, Record<string, string>> = {
      tags: {
        id: "TEXT",
        name: "TEXT",
        color: "TEXT",
        parent_id: "TEXT",
        icon: "TEXT",
        sort_order: "REAL",
        created_at: "TEXT",
      },
      bills: {
        id: "TEXT",
        date: "TEXT",
        category_id: "TEXT",
        name: "TEXT",
        source: "TEXT",
        amount: "INTEGER",
        is_amortized: "INTEGER",
        amortization_months: "INTEGER",
        reimbursement_status: "TEXT",
        reimbursement_party: "TEXT",
        created_at: "TEXT",
        updated_at: "TEXT",
      },
      settings: { key: "TEXT", value: "TEXT", updated_at: "TEXT" },
    };
    const objects = await client.execute(
      "SELECT type FROM sqlite_master WHERE type IN ('view', 'trigger')"
    );
    if (objects.rows.length)
      throw new Error("数据库包含不受支持的视图或触发器");
    for (const [table, columns] of Object.entries(required)) {
      const info = await client.execute(`PRAGMA table_info(${table})`);
      const primary = table === "settings" ? "key" : "id";
      const optional = new Set([
        "parent_id",
        "reimbursement_status",
        "reimbursement_party",
      ]);
      if (info.rows.length !== Object.keys(columns).length)
        throw new Error("数据库表结构不兼容");
      for (const [name, type] of Object.entries(columns)) {
        const column = info.rows.find(row => row.name === name);
        if (
          !column ||
          String(column.type).toUpperCase() !== type ||
          (name === primary
            ? Number(column.pk) !== 1
            : Number(column.pk) !== 0) ||
          (!optional.has(name) && Number(column.notnull) !== 1)
        ) {
          throw new Error("数据库表结构不兼容");
        }
      }
    }
    const indexes = await client.execute("PRAGMA index_list(tags)");
    let uniqueName = false;
    for (const index of indexes.rows) {
      if (Number(index.unique) !== 1 || Number(index.partial) !== 0) continue;
      const name = String(index.name).replace(/'/g, "''");
      const columns = await client.execute(`PRAGMA index_info('${name}')`);
      if (columns.rows.length === 1 && columns.rows[0].name === "name")
        uniqueName = true;
    }
    if (!uniqueName) throw new Error("数据库分类唯一约束不兼容");
    const keys = await client.execute("PRAGMA foreign_key_list(bills)");
    if (
      !keys.rows.some(
        row =>
          row.table === "tags" &&
          row.from === "category_id" &&
          row.to === "id" &&
          row.on_delete === "RESTRICT" &&
          row.on_update === "CASCADE"
      )
    )
      throw new Error("数据库分类外键不兼容");
    const foreign = await client.execute("PRAGMA foreign_key_check");
    if (foreign.rows.length) throw new Error("数据库外键检查失败");
    return client;
  } catch (error) {
    client.close();
    throw error;
  }
}

// Caller holds withDatabaseLock. Validate and preserve configuration in staging
// before touching the live file; retain a consistent backup even after success.
export async function replaceDatabase(buffer: Buffer, webdav?: WebDavSettings) {
  const path = getDatabaseFilePath();
  if (!path) throw new Error("仅支持本地 SQLite 数据库");
  const dir = await mkdtemp(join(dirname(path), ".mav-restore-"));
  const stage = join(dir, "app.db");
  const backupPath = `${path}.backup-${Date.now()}-${randomUUID()}`;
  let backupReady = false;
  let liveClosed = false;
  let replacementStarted = false;
  try {
    const candidate = await validateDatabase(stage, buffer);
    try {
      if (webdav) {
        const result = await candidate.execute(
          "SELECT value FROM settings WHERE key = 'app'"
        );
        const value = result.rows[0]?.value;
        let settings: Record<string, unknown> = {};
        if (typeof value === "string") {
          try {
            settings = JSON.parse(value);
          } catch {
            throw new Error("数据库设置格式无效");
          }
          if (
            !settings ||
            typeof settings !== "object" ||
            Array.isArray(settings)
          )
            throw new Error("数据库设置格式无效");
        }
        await candidate.execute({
          sql: "INSERT INTO settings (key, value, updated_at) VALUES ('app', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
          args: [
            JSON.stringify(AppSettingsSchema.parse({ ...settings, webdav })),
            new Date().toISOString(),
          ],
        });
      }
      await candidate.execute("PRAGMA wal_checkpoint(TRUNCATE)");
    } finally {
      candidate.close();
    }
    await vacuumSnapshot(await getSqlClient(), backupPath);
    backupReady = true;
    // Detach WAL while the owning connection is still open. In particular on
    // Windows, deleting mapped -wal/-shm files immediately after close can fail.
    const live = await getSqlClient();
    const checkpoint = await live.execute("PRAGMA wal_checkpoint(TRUNCATE)");
    if (Number(checkpoint.rows[0]?.busy ?? 0) !== 0)
      throw new Error("数据库仍被其他连接使用");
    await live.execute("PRAGMA journal_mode = DELETE");
    await closeDbConnection();
    liveClosed = true;
    await removeDatabaseSidecarFiles();
    // Windows rename cannot replace an existing destination consistently.
    replacementStarted = true;
    await copyFile(stage, path);
    await resetDbConnection();
    return { backupPath };
  } catch (error) {
    if (backupReady && replacementStarted) {
      try {
        await closeDbConnection();
        await removeDatabaseSidecarFiles();
        await copyFile(backupPath, path);
        await resetDbConnection();
      } catch {
        throw new Error("数据库恢复失败，请使用保留的本地备份恢复并重启应用");
      }
    } else if (liveClosed) {
      await resetDbConnection();
    }
    throw error;
  } finally {
    await cleanupDirectory(dir);
  }
}
