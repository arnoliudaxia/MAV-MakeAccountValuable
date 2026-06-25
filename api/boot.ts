import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { copyFile, readFile, rm, writeFile } from "fs/promises";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";
import {
  closeDbConnection,
  getDatabaseFileName,
  getDatabaseFilePath,
  getSqlClient,
  removeDatabaseSidecarFiles,
  resetDbConnection,
} from "./queries/connection";

const app = new Hono<{ Bindings: HttpBindings }>();

type UploadedFileLike = {
  name?: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

function isUploadedFile(value: unknown): value is UploadedFileLike {
  return (
    !!value &&
    typeof value === "object" &&
    "arrayBuffer" in value &&
    typeof (value as UploadedFileLike).arrayBuffer === "function"
  );
}

function isSqliteDatabase(buffer: Buffer) {
  return (
    buffer.length > 100 &&
    buffer.subarray(0, 16).equals(Buffer.from("SQLite format 3\0"))
  );
}

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));
app.use("/api/trpc/*", async c => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});
app.get("/api/database/download", async c => {
  const databasePath = getDatabaseFilePath();
  if (!databasePath) {
    return c.json({ error: "当前数据库不是本地文件，无法下载" }, 400);
  }

  const client = await getSqlClient();
  await client.execute("PRAGMA wal_checkpoint(FULL)");
  const file = await readFile(databasePath);
  c.header("Content-Type", "application/vnd.sqlite3");
  c.header(
    "Content-Disposition",
    `attachment; filename="${getDatabaseFileName()}"`
  );
  return c.body(file);
});

app.post("/api/database/upload", async c => {
  const databasePath = getDatabaseFilePath();
  if (!databasePath) {
    return c.json({ error: "当前数据库不是本地文件，无法上传覆盖" }, 400);
  }

  const formData = await c.req.formData();
  const uploaded = formData.get("database");
  if (!isUploadedFile(uploaded)) {
    return c.json({ error: "请上传 SQLite 数据库文件" }, 400);
  }

  const buffer = Buffer.from(await uploaded.arrayBuffer());
  if (!isSqliteDatabase(buffer)) {
    return c.json({ error: "上传文件不是有效的 SQLite 数据库" }, 400);
  }

  const backupPath = `${databasePath}.backup-${Date.now()}`;
  let hasBackup = false;

  try {
    await closeDbConnection();
    await removeDatabaseSidecarFiles();
    try {
      await copyFile(databasePath, backupPath);
      hasBackup = true;
    } catch {
      hasBackup = false;
    }

    await writeFile(databasePath, buffer);
    await resetDbConnection();

    if (hasBackup) {
      await rm(backupPath, { force: true });
    }

    return c.json({ ok: true });
  } catch (error) {
    if (hasBackup) {
      await copyFile(backupPath, databasePath).catch(() => undefined);
      await rm(backupPath, { force: true }).catch(() => undefined);
      await resetDbConnection().catch(() => undefined);
    }

    console.error("Failed to replace database", error);
    return c.json({ error: "数据库覆盖失败，已尝试恢复原数据库" }, 500);
  }
});
app.all("/api/*", c => c.json({ error: "Not Found" }, 404));

export default app;

if (env.isProduction) {
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  serveStaticFiles(app);

  const port = parseInt(process.env.PORT || "3000");
  serve({ fetch: app.fetch, port }, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}
