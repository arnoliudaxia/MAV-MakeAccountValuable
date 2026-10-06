import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdirSync } from "fs";
import { mkdir, rm } from "fs/promises";
import { dirname, isAbsolute, resolve } from "path";
import { env } from "../lib/env";
import * as schema from "@db/schema";

export const CURRENT_DATABASE_VERSION = 0;

export function getDatabaseFilePath() {
  if (!env.databaseUrl.startsWith("file:")) return undefined;

  const filePath = env.databaseUrl.slice("file:".length);
  if (!filePath || filePath === ":memory:") return undefined;

  return isAbsolute(filePath) ? filePath : resolve(process.cwd(), filePath);
}

export function getDatabaseFileName() {
  return getDatabaseFilePath()?.split(/[\\/]/).at(-1) ?? "app.db";
}

async function ensureDatabaseFileDir() {
  const filePath = getDatabaseFilePath();
  if (!filePath) return;
  await mkdir(dirname(filePath), { recursive: true });
}

function ensureDatabaseFileDirSync() {
  const filePath = getDatabaseFilePath();
  if (!filePath) return;
  mkdirSync(dirname(filePath), { recursive: true });
}

ensureDatabaseFileDirSync();

function createDatabase(client: Client) {
  return drizzle(client, { schema });
}
type ConnectionState = {
  client: Client;
  db: ReturnType<typeof createDatabase>;
  initialized: Promise<void> | null;
  clientClosed: boolean;
};
const shared = globalThis as typeof globalThis & {
  mavSqliteConnection?: ConnectionState;
};
// Keep one client across dev reloads; old timer/request closures access the same
// mutable connection state after a database replacement.
if (!shared.mavSqliteConnection) {
  const client = createClient({ url: env.databaseUrl });
  shared.mavSqliteConnection = {
    client,
    db: createDatabase(client),
    initialized: null,
    clientClosed: false,
  };
}
const state = shared.mavSqliteConnection;

async function ensureColumn(table: string, column: string, definition: string) {
  const result = await state.client.execute(`PRAGMA table_info(${table})`);
  const exists = result.rows.some(row => row.name === column);
  if (!exists) {
    await state.client.execute(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }
}

export async function ensureDb() {
  if (!state.initialized) {
    state.initialized = (async () => {
      await ensureDatabaseFileDir();
      const versionResult = await state.client.execute("PRAGMA user_version");
      const databaseVersion = Number(
        versionResult.rows[0]?.user_version ?? CURRENT_DATABASE_VERSION
      );
      if (databaseVersion !== CURRENT_DATABASE_VERSION) {
        throw new Error(
          `不支持的数据库版本 v${databaseVersion}，当前应用只接受 v${CURRENT_DATABASE_VERSION}`
        );
      }
      await state.client.execute("PRAGMA foreign_keys = ON");
      await state.client.batch([
        `CREATE TABLE IF NOT EXISTS tags (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL UNIQUE,
          color TEXT NOT NULL,
          parent_id TEXT,
          icon TEXT NOT NULL DEFAULT 'Tag',
          sort_order REAL NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS bills (
          id TEXT PRIMARY KEY NOT NULL,
          date TEXT NOT NULL,
          category_id TEXT NOT NULL,
          name TEXT NOT NULL,
          source TEXT NOT NULL,
          amount INTEGER NOT NULL,
          is_amortized INTEGER NOT NULL DEFAULT 0,
          amortization_months INTEGER NOT NULL DEFAULT 1,
          reimbursement_status TEXT,
          reimbursement_party TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (category_id) REFERENCES tags(id) ON UPDATE CASCADE ON DELETE RESTRICT
        )`,
        `CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`,
        `CREATE INDEX IF NOT EXISTS bills_date_idx ON bills (date)`,
        `CREATE INDEX IF NOT EXISTS bills_category_id_idx ON bills (category_id)`,
        `CREATE INDEX IF NOT EXISTS bills_source_idx ON bills (source)`,
      ]);
      await ensureColumn("tags", "parent_id", "parent_id TEXT");
      await ensureColumn("tags", "icon", "icon TEXT NOT NULL DEFAULT 'Tag'");
      await ensureColumn(
        "tags",
        "sort_order",
        "sort_order REAL NOT NULL DEFAULT 0"
      );
      await ensureColumn(
        "bills",
        "is_amortized",
        "is_amortized INTEGER NOT NULL DEFAULT 0"
      );
      await ensureColumn(
        "bills",
        "amortization_months",
        "amortization_months INTEGER NOT NULL DEFAULT 1"
      );
      await state.client.execute(
        `PRAGMA user_version = ${CURRENT_DATABASE_VERSION}`
      );
    })();
  }
  return state.initialized;
}

export async function getDb() {
  await ensureDb();
  return state.db;
}

export async function getSqlClient() {
  await ensureDb();
  return state.client;
}

export async function closeDbConnection() {
  if (!state.clientClosed) {
    state.client.close();
    state.clientClosed = true;
  }
  state.initialized = null;
}

export async function resetDbConnection() {
  await closeDbConnection();
  await ensureDatabaseFileDir();
  state.client = createClient({ url: env.databaseUrl });
  state.db = createDatabase(state.client);
  state.clientClosed = false;
  await ensureDb();
}

export async function removeDatabaseSidecarFiles() {
  const filePath = getDatabaseFilePath();
  if (!filePath) return;

  await Promise.all(
    [`${filePath}-wal`, `${filePath}-shm`].map(path =>
      rm(path, { force: true })
    )
  );
}
