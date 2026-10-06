import { describe, expect, it, vi } from "vitest";
import { DEFAULT_WEBDAV_SETTINGS } from "../../contracts/settings";
import { davRequest, davUrls, remoteBuffer } from "./client";
const config = {
  ...DEFAULT_WEBDAV_SETTINGS,
  endpoint: "https://example.test/dav/dir",
  username: "test-user",
  password: "test-password",
};
describe("DAV transport", () => {
  it("resolves the fixed filename under the directory and rejects URL credentials", () => {
    expect(davUrls(config).file).toBe("https://example.test/dav/dir/app.db");
    for (const endpoint of [
      "https://user:secret@example.test/",
      "file:///app.db",
      "https://example.test/?password=secret",
    ])
      expect(() => davUrls({ ...config, endpoint })).toThrow();
  });
  it("uses Basic auth, timeout, Depth 0 and refuses redirects; sanitizes failures", async () => {
    const mock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("", { status: 207 }));
    await davRequest(
      config,
      davUrls(config).directory,
      "PROPFIND",
      { Depth: "0" },
      undefined,
      mock
    );
    const options = mock.mock.calls[0][1]!;
    expect(options.redirect).toBe("error");
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.headers).toMatchObject({
      Depth: "0",
      Authorization: `Basic ${Buffer.from("test-user:test-password").toString("base64")}`,
    });
    mock.mockRejectedValue(new Error("secret-url test-password"));
    await expect(
      davRequest(config, davUrls(config).file, "GET", {}, undefined, mock)
    ).rejects.toThrow("网络请求失败");
    mock.mockResolvedValue(new Response("secret response", { status: 412 }));
    await expect(
      davRequest(config, davUrls(config).file, "PUT", {}, undefined, mock)
    ).rejects.toThrow("远端数据库已更改");
  });
  it("limits downloads and consumes successful bytes", async () => {
    expect(await remoteBuffer(new Response("database"))).toEqual(
      Buffer.from("database")
    );
    await expect(
      remoteBuffer(
        new Response("x", {
          headers: { "Content-Length": String(101 * 1024 * 1024) },
        })
      )
    ).rejects.toThrow("100 MiB");
  });
});
