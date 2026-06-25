import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/providers/trpc";
import {
  Bot,
  Building2,
  Database,
  Download,
  Plus,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import type { AiSettings } from "../../contracts/settings";

function normalizeOptions(options: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const option of options) {
    const trimmed = option.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }

  return result;
}

function ReimbursementPartiesCard({
  initialParties,
}: {
  initialParties: string[];
}) {
  const utils = trpc.useUtils();
  const [reimbursementParties, setReimbursementParties] =
    useState<string[]>(initialParties);
  const [newParty, setNewParty] = useState("");

  const updateSettingsMutation = trpc.settings.update.useMutation({
    onSuccess: async data => {
      setReimbursementParties(data.reimbursementParties);
      await utils.settings.get.invalidate();
      toast.success("报销方选项已保存");
    },
    onError: error => toast.error(error.message || "保存失败"),
  });

  const handleAddParty = () => {
    const trimmed = newParty.trim();
    if (!trimmed) return;
    setReimbursementParties(current => normalizeOptions([...current, trimmed]));
    setNewParty("");
  };

  const handleRemoveParty = (party: string) => {
    setReimbursementParties(current => current.filter(item => item !== party));
  };

  const handleSaveSettings = () => {
    updateSettingsMutation.mutate({
      reimbursementParties: normalizeOptions(reimbursementParties),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Building2 className="h-4 w-4" />
          报销方选项
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            value={newParty}
            onChange={event => setNewParty(event.target.value)}
            onKeyDown={event => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleAddParty();
              }
            }}
            placeholder="如：公司、客户、项目组"
          />
          <Button type="button" variant="secondary" onClick={handleAddParty}>
            <Plus className="h-4 w-4 mr-2" />
            添加
          </Button>
        </div>

        <div className="space-y-2">
          {reimbursementParties.length === 0 ? (
            <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              暂无报销方选项，添加后会出现在账单表单下拉框中。
            </div>
          ) : (
            reimbursementParties.map(party => (
              <div
                key={party}
                className="flex items-center justify-between rounded-md border px-3 py-2"
              >
                <span className="font-medium">{party}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => handleRemoveParty(party)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))
          )}
        </div>

        <Button
          onClick={handleSaveSettings}
          disabled={updateSettingsMutation.isPending}
        >
          <Save className="h-4 w-4 mr-2" />
          {updateSettingsMutation.isPending ? "保存中..." : "保存报销方选项"}
        </Button>
      </CardContent>
    </Card>
  );
}

function AiSettingsCard({ initialAi }: { initialAi: AiSettings }) {
  const utils = trpc.useUtils();
  const [apiKey, setApiKey] = useState(initialAi.apiKey);
  const [baseUrl, setBaseUrl] = useState(initialAi.baseUrl);
  const [model, setModel] = useState(initialAi.model);
  const [enableBillCategoryMatching, setEnableBillCategoryMatching] = useState(
    initialAi.enableBillCategoryMatching
  );

  const updateSettingsMutation = trpc.settings.update.useMutation({
    onSuccess: async data => {
      setApiKey(data.ai.apiKey);
      setBaseUrl(data.ai.baseUrl);
      setModel(data.ai.model);
      setEnableBillCategoryMatching(data.ai.enableBillCategoryMatching);
      await utils.settings.get.invalidate();
      toast.success("AI 设置已保存");
    },
    onError: error => toast.error(error.message || "保存失败"),
  });

  const handleSave = () => {
    updateSettingsMutation.mutate({
      ai: {
        apiKey,
        baseUrl,
        model,
        enableBillCategoryMatching,
      },
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Bot className="h-4 w-4" />
          AI 设置
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          AI 调用会优先读取环境变量并发送测试指令；如果环境变量配置返回 HTTP
          错误，会回退使用这里保存的数据库配置。
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">API Key</label>
          <Input
            type="password"
            value={apiKey}
            onChange={event => setApiKey(event.target.value)}
            placeholder="备用 API Key"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Base URL</label>
          <Input
            value={baseUrl}
            onChange={event => setBaseUrl(event.target.value)}
            placeholder="https://api.openai.com/v1"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Model</label>
          <Input
            value={model}
            onChange={event => setModel(event.target.value)}
            placeholder="gpt-5.5"
          />
        </div>

        <div className="flex items-center justify-between rounded-md border px-3 py-2">
          <div className="space-y-0.5">
            <div className="text-sm font-medium">分类数据库匹配</div>
            <p className="text-xs text-muted-foreground">
              识别后按账单名称搜索历史记录，并让 AI 参考相似记录修正分类。
            </p>
          </div>
          <Switch
            checked={enableBillCategoryMatching}
            onCheckedChange={setEnableBillCategoryMatching}
          />
        </div>

        <Button
          onClick={handleSave}
          disabled={updateSettingsMutation.isPending}
        >
          <Save className="h-4 w-4 mr-2" />
          {updateSettingsMutation.isPending ? "保存中..." : "保存 AI 设置"}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const utils = trpc.useUtils();
  const { data: filters } = trpc.bill.filters.useQuery();
  const { data: settings } = trpc.settings.get.useQuery();
  const { data: databaseOverview } = trpc.database.overview.useQuery();
  const [isDownloadingDb, setIsDownloadingDb] = useState(false);
  const [isUploadingDb, setIsUploadingDb] = useState(false);

  const refreshAllData = async () => {
    await Promise.all([
      utils.bill.list.invalidate(),
      utils.bill.stats.invalidate(),
      utils.bill.filters.invalidate(),
      utils.bill.reimbursements.invalidate(),
      utils.tag.list.invalidate(),
      utils.settings.get.invalidate(),
      utils.database.overview.invalidate(),
      utils.database.tables.invalidate(),
      utils.database.rows.invalidate(),
    ]);
  };

  const handleDownloadDb = async () => {
    setIsDownloadingDb(true);
    try {
      const response = await fetch("/api/database/download");
      if (!response.ok) {
        const result = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(result?.error || "下载失败");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `app-db-${new Date().toISOString().split("T")[0]}.db`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("数据库下载成功");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "数据库下载失败");
    } finally {
      setIsDownloadingDb(false);
    }
  };

  const handleUploadDb = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const confirmed = window.confirm(
      "上传后会覆盖当前本地数据库。建议先下载备份，确定继续吗？"
    );
    if (!confirmed) return;

    const formData = new FormData();
    formData.append("database", file);
    setIsUploadingDb(true);
    try {
      const response = await fetch("/api/database/upload", {
        method: "POST",
        body: formData,
      });
      const result = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) {
        throw new Error(result?.error || "上传失败");
      }

      await refreshAllData();
      toast.success("数据库上传并覆盖成功");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "数据库上传失败");
    } finally {
      setIsUploadingDb(false);
    }
  };

  const stats = {
    categories: filters?.categories.length || 0,
    billCount: databaseOverview?.billCount || 0,
    totalAmount: databaseOverview?.totalAmount || 0,
  };
  const formattedTotalAmount = new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
  }).format(stats.totalAmount);
  const reimbursementParties = settings?.reimbursementParties ?? [];
  const aiSettings = settings?.ai ?? {
    apiKey: "",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5.5",
    enableBillCategoryMatching: false,
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">设置</h1>
        <p className="text-sm text-muted-foreground">管理应用配置和数据</p>
      </div>

      <ReimbursementPartiesCard
        key={reimbursementParties.join("\u0000")}
        initialParties={reimbursementParties}
      />

      <AiSettingsCard
        key={`${aiSettings.apiKey}\u0000${aiSettings.baseUrl}\u0000${aiSettings.model}\u0000${aiSettings.enableBillCategoryMatching}`}
        initialAi={aiSettings}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Database className="h-4 w-4" />
            数据概览
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="p-4 rounded-lg bg-muted">
              <div className="text-2xl font-bold">{stats.categories}</div>
              <div className="text-sm text-muted-foreground">分类</div>
            </div>
            <div className="p-4 rounded-lg bg-muted">
              <div className="text-2xl font-bold">{stats.billCount}</div>
              <div className="text-sm text-muted-foreground">账单条目</div>
            </div>
            <div className="p-4 rounded-lg bg-muted">
              <div className="text-2xl font-bold">{formattedTotalAmount}</div>
              <div className="text-sm text-muted-foreground">总记录金额</div>
            </div>
          </div>
          <Separator />
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              className="gap-2"
              onClick={handleDownloadDb}
              disabled={isDownloadingDb || isUploadingDb}
            >
              <Download className="h-4 w-4" />
              {isDownloadingDb ? "下载中..." : "下载 DB"}
            </Button>
            <label>
              <Input
                type="file"
                accept=".db,.sqlite,.sqlite3,application/vnd.sqlite3,application/x-sqlite3"
                className="hidden"
                onChange={handleUploadDb}
                disabled={isUploadingDb || isDownloadingDb}
              />
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                disabled={isUploadingDb || isDownloadingDb}
                asChild
              >
                <span>
                  <Upload className="h-4 w-4" />
                  {isUploadingDb ? "上传中..." : "上传 DB 并覆盖"}
                </span>
              </Button>
            </label>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
