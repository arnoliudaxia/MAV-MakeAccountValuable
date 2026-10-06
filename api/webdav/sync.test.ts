import { afterAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { pathToFileURL } from "node:url";

const fixture = vi.hoisted(() => ({ path: "", authenticated: false }));
vi.mock("../auth", () => ({
  isAuthenticated: () => fixture.authenticated,
  getSession: () => (fixture.authenticated ? {} : null),
  handleLogin: () => new Response(),
  handleLogout: () => new Response(),
  handleSession: () => new Response(),
}));
vi.mock("../lib/env", () => ({
  env: { databaseUrl: `file:${fixture.path}`, isProduction: false },
}));
// Dynamic imports ensure no access to the user's configured database.
fixture.path = join(
  mkdtempSync(join(tmpdir(), "mav-webdav-test-")),
  "local's app.db"
);
const connection = await import("../queries/connection");
const {
  databaseSnapshot,
  replaceDatabase,
  validateDatabase,
  cleanupDirectory,
  withDatabaseLock,
} = await import("../database/operations");
const { getSettings, updateSettings } = await import("../settings/store");
const { initializeSync, runSync, syncStatus, configureSync } =
  await import("./sync");
const fetchMock = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", fetchMock);

const localConfig = {
  enabled: true,
  endpoint: "https://example.test/dav/mav/",
  username: "mock-user",
  password: "mock-password",
  intervalHours: 24,
};
let remote: Buffer;
let backup: string;
afterAll(async () => {
  await configureSync({ ...localConfig, enabled: false });
  await connection.closeDbConnection();
  vi.unstubAllGlobals();
  await cleanupDirectory(join(fixture.path, ".."));
}, 30_000);

describe.sequential(
  "SQLite DAV sync integration (temporary DB only)",
  { timeout: 60_000 },
  () => {
    it("startup missing remote continues local; HMR initialization does not pull twice", async () => {
      const db = await connection.getSqlClient();
      await db.execute("PRAGMA journal_mode = WAL");
      await db.execute(
        "INSERT INTO tags (id,name,color,created_at) VALUES ('local','Local','#fff','now')"
      );
      await updateSettings({ webdav: localConfig });
      fetchMock.mockResolvedValue(new Response(null, { status: 404 }));
      await initializeSync();
      expect(syncStatus().error).toContain("不存在");
      expect((await db.execute("SELECT id FROM tags")).rows[0].id).toBe(
        "local"
      );
      const count = fetchMock.mock.calls.length;
      await initializeSync();
      expect(fetchMock.mock.calls.length).toBe(count);
      expect(syncStatus().nextRunAt).not.toBeNull();
    });
    it("snapshots a path with spaces/apostrophes (native Windows paths on Windows)", async () => {
      remote = await databaseSnapshot();
      expect(remote.subarray(0, 16).toString()).toBe("SQLite format 3\0");
      const stage = join(fixture.path, "..", "validation.db");
      const client = await validateDatabase(stage, remote);
      expect(
        (await client.execute("SELECT count(*) AS n FROM tags")).rows[0].n
      ).toBe(1);
      client.close();
    });
    it("rejects bad headers, version, schema and foreign key violations without touching local", async () => {
      const stage = join(fixture.path, "..", "invalid.db");
      await expect(
        replaceDatabase(Buffer.from("not SQLite"), localConfig)
      ).rejects.toThrow("SQLite");
      const corrupt = Buffer.from(remote);
      corrupt.fill(0, 100, Math.min(corrupt.length, 4096));
      await expect(replaceDatabase(corrupt, localConfig)).rejects.toThrow();
      for (const sql of [
        "PRAGMA user_version = 999",
        "ALTER TABLE bills RENAME COLUMN amount TO old_amount",
        "INSERT INTO bills (id,date,category_id,name,source,amount,created_at,updated_at) VALUES ('bad','2026-01-01','missing','bad','x',1,'now','now')",
      ]) {
        await writeFile(stage, remote);
        const client = createClient({ url: pathToFileURL(stage).href });
        try {
          await client.execute("PRAGMA foreign_keys = OFF");
          await client.execute(sql);
        } finally {
          client.close();
        }
        await expect(
          replaceDatabase(await readFile(stage), localConfig)
        ).rejects.toThrow();
      }
      expect(
        (await (await connection.getSqlClient()).execute("SELECT id FROM tags"))
          .rows[0].id
      ).toBe("local");
    });
    it("pull preserves local DAV settings and retains a consistent backup", async () => {
      const stage = join(fixture.path, "..", "remote.db");
      await writeFile(stage, remote);
      const client = createClient({ url: pathToFileURL(stage).href });
      await client.execute("UPDATE tags SET name='Remote' WHERE id='local'");
      await client.execute({
        sql: "UPDATE settings SET value = ? WHERE key='app'",
        args: [
          JSON.stringify({
            webdav: { ...localConfig, password: "remote-password" },
            reimbursementParties: ["Remote party"],
          }),
        ],
      });
      client.close();
      remote = await readFile(stage);
      fetchMock.mockResolvedValue(
        new Response(new Uint8Array(remote), { headers: { ETag: '"rev1"' } })
      );
      await runSync("pull");
      expect((await getSettings()).webdav).toEqual(localConfig);
      expect((await getSettings()).reimbursementParties).toEqual([
        "Remote party",
      ]);
      expect(
        (
          await (
            await connection.getSqlClient()
          ).execute("SELECT name FROM tags")
        ).rows[0].name
      ).toBe("Remote");
      backup = syncStatus().backupPath!;
      expect((await readFile(backup)).subarray(0, 16).toString()).toBe(
        "SQLite format 3\0"
      );
    });
    it("push uses known ETag and rejects changed remote without disclosing errors", async () => {
      fetchMock.mockResolvedValue(
        new Response(null, { status: 204, headers: { ETag: '"rev2"' } })
      );
      await runSync("push");
      expect(fetchMock.mock.lastCall?.[1]?.headers).toMatchObject({
        "If-Match": '"rev1"',
      });
      fetchMock.mockResolvedValue(
        new Response("credentials must not escape", { status: 412 })
      );
      await expect(runSync("push")).rejects.toThrow("远端数据库已更改");
      expect(fetchMock.mock.lastCall?.[1]?.headers).toMatchObject({
        "If-Match": '"rev2"',
      });
      expect(syncStatus().error).not.toContain("credentials");
    });
    it("creates missing remote with If-None-Match * and refuses overlap", async () => {
      await updateSettings({
        webdav: { endpoint: "https://example.test/dav/new/" },
      });
      fetchMock
        .mockResolvedValueOnce(new Response(null, { status: 404 }))
        .mockResolvedValueOnce(
          new Response(null, { status: 201, headers: { ETag: '"new"' } })
        );
      await runSync("push");
      expect(fetchMock.mock.lastCall?.[1]?.headers).toMatchObject({
        "If-None-Match": "*",
      });
      let finish!: (response: Response) => void;
      fetchMock.mockImplementationOnce(
        () =>
          new Promise(resolve => {
            finish = resolve;
          })
      );
      const pending = runSync("test");
      await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
      await expect(runSync("push")).rejects.toThrow("正在进行");
      finish(new Response("", { status: 207 }));
      await pending;
    });
    it("verifies uploaded bytes before accepting a GET-only ETag", async () => {
      let uploaded!: Buffer;
      fetchMock
        .mockImplementationOnce(async (_url, options) => {
          uploaded = Buffer.from(options!.body as Uint8Array);
          return new Response(null, { status: 204 });
        })
        .mockImplementationOnce(
          async () =>
            new Response(new Uint8Array(uploaded), {
              headers: { ETag: '"verified"' },
            })
        );
      await runSync("push");
      fetchMock
        .mockResolvedValueOnce(new Response(null, { status: 204 }))
        .mockResolvedValueOnce(
          new Response("concurrent writer", {
            headers: { ETag: '"different"' },
          })
        );
      await expect(runSync("push")).rejects.toThrow("发生更改");
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 412 }));
      await expect(runSync("push")).rejects.toThrow("远端数据库已更改");
      expect(fetchMock.mock.lastCall?.[1]?.headers).toMatchObject({
        "If-Match": '"verified"',
      });
    });
    it("manual endpoints require authentication and explicit pull confirmation", async () => {
      const { default: app } = await import("../boot");
      for (const action of ["test", "push", "pull"]) {
        expect(
          (await app.request(`/api/webdav/${action}`, { method: "POST" }))
            .status
        ).toBe(401);
      }
      expect((await app.request("/api/webdav/status")).status).toBe(401);
      fixture.authenticated = true;
      expect(
        (
          await app.request("/api/webdav/pull", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          })
        ).status
      ).toBe(400);
      const status = await app.request("/api/webdav/status");
      expect(status.status).toBe(200);
      expect(await status.text()).not.toContain("mock-password");
      fixture.authenticated = false;
    });
    it("serializes database work and restores backup on replacement initialization failure", async () => {
      const events: string[] = [];
      await Promise.all([
        withDatabaseLock(async () => {
          events.push("start");
          await new Promise(resolve => setTimeout(resolve, 5));
          events.push("end");
        }),
        withDatabaseLock(async () => {
          events.push("next");
        }),
      ]);
      expect(events).toEqual(["start", "end", "next"]);
      const reset = vi
        .spyOn(connection, "resetDbConnection")
        .mockRejectedValueOnce(new Error("forced failure"));
      await expect(
        replaceDatabase(await readFile(backup), localConfig)
      ).rejects.toThrow("forced failure");
      reset.mockRestore();
      expect(
        (
          await (
            await connection.getSqlClient()
          ).execute("SELECT name FROM tags")
        ).rows[0].name
      ).toBe("Remote");
    });
  }
);
