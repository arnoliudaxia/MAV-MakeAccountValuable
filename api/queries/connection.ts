import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdir, rm } from "fs/promises";
import { dirname, isAbsolute, resolve } from "path";
import { env } from "../lib/env";
import * as schema from "@db/schema";

let client = createClient({ url: env.databaseUrl });
let db = drizzle(client, { schema });
let initialized: Promise<void> | null = null;
let clientClosed = false;

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

async function ensureColumn(table: string, column: string, definition: string) {
  const result = await client.execute(`PRAGMA table_info(${table})`);
  const exists = result.rows.some(row => row.name === column);
  if (!exists) {
    await client.execute(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }
}

export async function ensureDb() {
  if (!initialized) {
    initialized = (async () => {
      await ensureDatabaseFileDir();
      await client.batch([
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
          category TEXT NOT NULL,
          name TEXT NOT NULL,
          source TEXT NOT NULL,
          amount REAL NOT NULL,
          is_amortized INTEGER NOT NULL DEFAULT 0,
          amortization_months INTEGER NOT NULL DEFAULT 1,
          reimbursement_status TEXT,
          reimbursement_party TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )`,
        `CREATE INDEX IF NOT EXISTS bills_date_idx ON bills (date)`,
        `CREATE INDEX IF NOT EXISTS bills_category_idx ON bills (category)`,
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
    })();
  }
  return initialized;
}

export async function getDb() {
  await ensureDb();
  return db;
}

export async function getSqlClient() {
  await ensureDb();
  return client;
}

export async function closeDbConnection() {
  if (!clientClosed) {
    client.close();
    clientClosed = true;
  }
  initialized = null;
}

export async function resetDbConnection() {
  await closeDbConnection();
  client = createClient({ url: env.databaseUrl });
  db = drizzle(client, { schema });
  clientClosed = false;
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
