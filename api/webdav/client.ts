import type { WebDavSettings } from "../../contracts/settings";

export class DavError extends Error {}
export function davUrls(config: WebDavSettings) {
  let directory: URL;
  try {
    directory = new URL(config.endpoint);
  } catch {
    throw new DavError("请填写有效的 WebDAV 目录 URL");
  }
  if (
    !["https:", "http:"].includes(directory.protocol) ||
    directory.username ||
    directory.password ||
    directory.search ||
    directory.hash
  )
    throw new DavError(
      "WebDAV URL 仅允许 HTTP(S) 目录，不允许内嵌凭据、查询或片段"
    );
  directory.pathname = directory.pathname.replace(/\/*$/, "/");
  return { directory: directory.href, file: new URL("app.db", directory).href };
}

export async function davRequest(
  config: WebDavSettings,
  url: string,
  method: string,
  headers: Record<string, string> = {},
  body?: Uint8Array,
  fetcher: typeof fetch = fetch
) {
  try {
    const response = await fetcher(url, {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(60_000),
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`,
        ...headers,
      },
      ...(body ? { body: new Uint8Array(body) } : {}),
    });
    if (!response.ok && response.status !== 404) {
      await response.body?.cancel();
      throw new DavError(
        response.status === 412
          ? "远端数据库已更改，上传被拒绝；请先确认并拉取远端数据"
          : `WebDAV 请求失败 (HTTP ${response.status})`
      );
    }
    return response;
  } catch (error) {
    if (error instanceof DavError) throw error;
    // Never expose response bodies, URLs, credentials or underlying fetch errors.
    throw new DavError("WebDAV 网络请求失败或超时（不跟随重定向）");
  }
}

export async function remoteBuffer(response: Response) {
  const limit = 100 * 1024 * 1024;
  if (Number(response.headers.get("content-length")) > limit) {
    await response.body?.cancel();
    throw new DavError("远端数据库超过 100 MiB 限制");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new DavError("远端数据库内容为空");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) throw new DavError("远端数据库超过 100 MiB 限制");
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    if (error instanceof DavError) throw error;
    throw new DavError("远端数据库下载失败或超时");
  } finally {
    reader.releaseLock();
  }
}
