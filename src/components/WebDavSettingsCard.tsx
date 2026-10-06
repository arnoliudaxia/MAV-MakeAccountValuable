import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/providers/trpc";
import { toast } from "sonner";
import type { WebDavSettings } from "../../contracts/settings";

type Status = {
  busy: boolean;
  lastAction: string | null;
  remoteUpdatedAt: string | null;
  remoteStatus:
    | "unconfigured"
    | "unknown"
    | "available"
    | "missing"
    | "unavailable";
  remoteError: string | null;
  error: string | null;
  backupPath: string | null;
};
export function WebDavSettingsCard({ initial }: { initial: WebDavSettings }) {
  const [config, setConfig] = useState(initial);
  const [status, setStatus] = useState<Status>();
  const [busy, setBusy] = useState(false);
  const statusRequest = useRef<Promise<void> | null>(null);
  const utils = trpc.useUtils();
  const save = trpc.settings.update.useMutation({
    onSuccess: async data => {
      setConfig(data.webdav);
      await utils.settings.get.invalidate();
      toast.success("WebDAV 设置已保存，定时计划已更新");
      await refreshStatus();
    },
    onError: error => toast.error(error.message),
  });
  function refreshStatus() {
    if (statusRequest.current) return statusRequest.current;
    statusRequest.current = (async () => {
      try {
        const response = await fetch("/api/webdav/status", {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("状态读取失败");
        setStatus(await response.json());
      } catch {
        setStatus(
          previous =>
            previous && {
              ...previous,
              remoteUpdatedAt: null,
              remoteStatus: "unavailable",
              remoteError: "无法读取远端状态，请稍后刷新",
            }
        );
      } finally {
        statusRequest.current = null;
      }
    })();
    return statusRequest.current;
  }
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      await refreshStatus();
      if (!stopped) timer = setTimeout(() => void poll(), 30_000);
    }
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, []);
  async function run(action: "test" | "push" | "pull") {
    if (
      action === "pull" &&
      !window.confirm(
        "拉取会覆盖全部本地账单、分类及其他设置（保留本机 WebDAV 配置），不会合并。覆盖前保留本地备份。确定继续吗？"
      )
    )
      return;
    if (
      action === "push" &&
      !window.confirm(
        "上传会以完整本地数据库覆盖远端 app.db（含明文 API Key 和 WebDAV 密码）。确定继续吗？"
      )
    )
      return;
    setBusy(true);
    try {
      const response = await fetch(`/api/webdav/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: action === "pull" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "操作失败");
      toast.success(
        action === "test" ? "WebDAV 目录连接成功（未测试写权限）" : "同步成功"
      );
      if (action === "pull") await utils.invalidate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "操作失败");
    } finally {
      setBusy(false);
      await refreshStatus();
    }
  }
  const disabled = busy || status?.busy || save.isPending;
  return (
    <Card>
      <CardHeader>
        <CardTitle>WebDAV 数据库备份 / 恢复</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          启用后，启动时先拉取
          app.db；之后按间隔上传完整数据库。不是双向合并。请使用专用目录和
          HTTPS，先保存设置再测试或同步。
        </p>
        <label className="flex items-center justify-between">
          启用自动同步
          <Switch
            checked={config.enabled}
            onCheckedChange={enabled => setConfig({ ...config, enabled })}
          />
        </label>
        <label className="block space-y-2">
          <span>服务器目录 URL</span>
          <Input
            value={config.endpoint}
            placeholder="https://example.com/dav/backups/"
            onChange={e => setConfig({ ...config, endpoint: e.target.value })}
          />
        </label>
        <label className="block space-y-2">
          <span>用户名</span>
          <Input
            autoComplete="off"
            value={config.username}
            onChange={e => setConfig({ ...config, username: e.target.value })}
          />
        </label>
        <label className="block space-y-2">
          <span>密码 / 应用密码</span>
          <Input
            type="password"
            autoComplete="new-password"
            value={config.password}
            onChange={e => setConfig({ ...config, password: e.target.value })}
          />
        </label>
        <label className="block space-y-2">
          <span>上传间隔（小时，默认 24）</span>
          <Input
            type="number"
            min={1}
            max={8760}
            value={config.intervalHours}
            onChange={e =>
              setConfig({ ...config, intervalHours: Number(e.target.value) })
            }
          />
        </label>
        <p className="text-xs text-muted-foreground">
          凭据明文保存在本地数据库中，并随完整备份上传到远端；登录用户可读取。备份也包含
          AI API Key。禁用自动同步不影响手动操作。
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={disabled}
            onClick={() => save.mutate({ webdav: config })}
          >
            保存设置
          </Button>
          <Button
            variant="outline"
            disabled={disabled}
            onClick={() => void run("test")}
          >
            测试连接
          </Button>
          <Button
            variant="outline"
            disabled={disabled}
            onClick={() => void run("push")}
          >
            立即上传
          </Button>
          <Button
            variant="destructive"
            disabled={disabled}
            onClick={() => void run("pull")}
          >
            拉取并覆盖本地
          </Button>
          <Button variant="ghost" onClick={() => void refreshStatus()}>
            刷新状态
          </Button>
        </div>
        {status && (
          <div className="text-xs space-y-1 break-all">
            <p>
              状态：{status.busy ? "同步中" : "空闲"}；最近操作：
              {status.lastAction ?? "无"}
            </p>
            <p>
              最新备份: 
              {status.remoteUpdatedAt
                ? new Date(status.remoteUpdatedAt).toLocaleString("zh-CN")
                : status.remoteStatus === "missing"
                  ? "远端文件不存在"
                  : status.remoteStatus === "unconfigured"
                    ? "未配置 WebDAV"
                    : status.remoteStatus === "unavailable"
                      ? "暂时无法读取"
                      : "远端未提供修改时间"}
            </p>
            {status.remoteError && (
              <p className="text-destructive">{status.remoteError}</p>
            )}
            {status.error && <p className="text-destructive">{status.error}</p>}
            {status.backupPath && <p>覆盖前备份：{status.backupPath}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
