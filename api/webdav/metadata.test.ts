import { afterEach, describe, expect, it, vi } from "vitest";
import { RemoteMetadata, remoteModifiedAt } from "./metadata";

const config = {
  enabled: false,
  endpoint: "https://example.test/dav/",
  username: "user",
  password: "secret",
  intervalHours: 24,
};
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("remote database metadata", () => {
  it("reads authenticated HEAD without downloading the database; throttles and deduplicates", async () => {
    vi.useFakeTimers();
    const metadata = new RemoteMetadata();
    let finish!: (response: Response) => void;
    const fetcher = vi.fn(
      () =>
        new Promise<Response>(resolve => {
          finish = resolve;
        })
    );
    vi.stubGlobal("fetch", fetcher);
    const first = metadata.refresh(config);
    const second = metadata.refresh(config);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(
      "https://example.test/dav/app.db",
      expect.objectContaining({
        method: "HEAD",
        redirect: "error",
        headers: {
          Authorization: `Basic ${Buffer.from("user:secret").toString("base64")}`,
        },
      })
    );
    finish(
      new Response(null, {
        headers: { "Last-Modified": "Mon, 05 Oct 2026 08:00:00 GMT" },
      })
    );
    await Promise.all([first, second]);
    expect(metadata.remoteUpdatedAt).toBe("2026-10-05T08:00:00.000Z");
    await metadata.refresh(config);
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(30_000);
    fetcher.mockResolvedValueOnce(new Response(null, { status: 404 }));
    await metadata.refresh(config);
    expect(metadata.remoteStatus).toBe("missing");
    expect(metadata.remoteUpdatedAt).toBeNull();
  });

  it("does not fabricate timestamps for missing metadata, no configuration or failures", async () => {
    const metadata = new RemoteMetadata();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null));
    vi.stubGlobal("fetch", fetcher);
    await metadata.refresh({ ...config, endpoint: "" });
    expect(metadata.remoteStatus).toBe("unconfigured");
    expect(fetcher).not.toHaveBeenCalled();
    await metadata.refresh(config);
    expect(metadata.remoteStatus).toBe("available");
    expect(metadata.remoteUpdatedAt).toBeNull();
    expect(
      remoteModifiedAt(
        new Response(null, { headers: { "Last-Modified": "invalid" } })
      )
    ).toBeNull();
    fetcher.mockResolvedValueOnce(new Response("secret", { status: 401 }));
    await metadata.refresh({ ...config, password: "new-secret" });
    expect(metadata.remoteStatus).toBe("unavailable");
    expect(metadata.remoteUpdatedAt).toBeNull();
    expect(metadata.remoteError).toBe("WebDAV 请求失败 (HTTP 401)");
    await metadata.refresh({ ...config, password: "new-secret" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("rechecks a PUT without Last-Modified and clears the previous server timestamp", async () => {
    const metadata = new RemoteMetadata();
    metadata.observe(
      config,
      new Response(null, {
        headers: { "Last-Modified": "Mon, 05 Oct 2026 08:00:00 GMT" },
      })
    );
    metadata.observe(config, new Response(null, { status: 204 }));
    expect(metadata.remoteUpdatedAt).toBeNull();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        headers: { "Last-Modified": "Mon, 05 Oct 2026 09:00:00 GMT" },
      })
    );
    vi.stubGlobal("fetch", fetcher);
    await metadata.refresh(config);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(metadata.remoteUpdatedAt).toBe("2026-10-05T09:00:00.000Z");
  });
});
