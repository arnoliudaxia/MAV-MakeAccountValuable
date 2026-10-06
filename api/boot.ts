import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import {
  handleLogin,
  handleLogout,
  handleSession,
  isAuthenticated,
} from "./auth";
import { env } from "./lib/env";
import { getDatabaseFileName } from "./queries/connection";
import {
  databaseSnapshot,
  replaceDatabase,
  withDatabaseLock,
} from "./database/operations";
import {
  initializeSync,
  configureSync,
  runSync,
  syncStatus,
} from "./webdav/sync";
import { DavError } from "./webdav/client";

const app = new Hono<{ Bindings: HttpBindings }>();
const startup = initializeSync();
app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));
// Development requests wait too; production does not listen until startup settles.
// Serialize complete API handlers so a replacement cannot close a connection
// while a request (including a tRPC batch) is still using it.
app.use("/api/*", async (c, next) => {
  await startup;
  if (c.req.path.startsWith("/api/webdav/")) return next();
  return withDatabaseLock(async () => {
    await next();
  });
});
app.post("/api/auth/login", c => handleLogin(c.req.raw));
app.get("/api/auth/session", c => handleSession(c.req.raw));
app.post("/api/auth/logout", c => handleLogout(c.req.raw));
app.use("/api/trpc/*", async c =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  })
);
app.use("/api/webdav/*", async (c, next) => {
  if (!isAuthenticated(c.req.raw)) return c.json({ error: "请先登录" }, 401);
  await next();
});
app.get("/api/webdav/status", c => c.json(syncStatus()));
for (const action of ["test", "push", "pull"] as const) {
  app.post(`/api/webdav/${action}`, async c => {
    if (action === "pull") {
      const input = await c.req.json().catch(() => null);
      if (input?.confirm !== true)
        return c.json({ error: "请确认覆盖本地数据库" }, 400);
    }
    try {
      return c.json(await runSync(action));
    } catch (error) {
      return c.json(
        { error: error instanceof DavError ? error.message : "数据库同步失败" },
        409
      );
    }
  });
}
app.get("/api/database/download", async c => {
  if (!isAuthenticated(c.req.raw)) return c.json({ error: "请先登录" }, 401);
  try {
    const file = await databaseSnapshot();
    c.header("Content-Type", "application/vnd.sqlite3");
    c.header(
      "Content-Disposition",
      `attachment; filename="${getDatabaseFileName()}"`
    );
    return c.body(file);
  } catch {
    return c.json({ error: "数据库快照下载失败" }, 500);
  }
});
app.post("/api/database/upload", async c => {
  if (!isAuthenticated(c.req.raw)) return c.json({ error: "请先登录" }, 401);
  const formData = await c.req.formData();
  const file = formData.get("database");
  if (!file || typeof file === "string" || !("arrayBuffer" in file))
    return c.json({ error: "请上传 SQLite 数据库文件" }, 400);
  try {
    await replaceDatabase(Buffer.from(await file.arrayBuffer()));
    await configureSync();
    return c.json({ ok: true });
  } catch {
    return c.json({ error: "数据库校验或覆盖失败，原数据库及备份保留" }, 400);
  }
});
app.all("/api/*", c => c.json({ error: "Not Found" }, 404));
export default app;

if (env.isProduction) {
  await startup;
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  serveStaticFiles(app);
  const port = parseInt(process.env.PORT || "3000");
  serve({ fetch: app.fetch, port }, () =>
    console.log(`Server running on http://localhost:${port}/`)
  );
}
