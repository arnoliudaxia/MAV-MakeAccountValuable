import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/providers/trpc";
import type { ReimbursementStatus } from "../../contracts/bill";
import {
  AlertCircle,
  Download,
  Loader2,
  RefreshCw,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

const statusMap: Record<
  ReimbursementStatus,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
  }
> = {
  pending: { label: "待报销", variant: "secondary" },
  approved: { label: "已报销", variant: "default" },
  rejected: { label: "已拒绝", variant: "destructive" },
};

export default function ReimbursementsPage() {
  const utils = trpc.useUtils();
  const {
    data: bills,
    isLoading,
    isFetching,
    refetch,
  } = trpc.bill.reimbursements.useQuery();
  const { data: settings } = trpc.settings.get.useQuery();
  const reimbursementParties = settings?.reimbursementParties ?? [];

  const updateMutation = trpc.bill.update.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.bill.reimbursements.invalidate(),
        utils.bill.list.invalidate(),
        utils.bill.stats.invalidate(),
        utils.bill.filters.invalidate(),
      ]);
      toast.success("报销信息已更新");
    },
    onError: error => toast.error(error.message || "更新失败"),
  });

  const handleStatusChange = (id: string, value: string) => {
    updateMutation.mutate({
      id,
      reimbursementStatus: value as ReimbursementStatus,
    });
  };

  const handlePartyChange = (id: string, value: string) => {
    updateMutation.mutate({
      id,
      reimbursementParty: value === "none" ? "" : value,
    });
  };

  const formatAmount = (amount: number) =>
    new Intl.NumberFormat("zh-CN", {
      style: "currency",
      currency: "CNY",
      minimumFractionDigits: 2,
    }).format(amount);

  const escapeCsvCell = (value: string | number | boolean | undefined) => {
    const text = value === undefined ? "" : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const handleExportCsv = () => {
    if (!bills || bills.length === 0) {
      toast.error("暂无可导出的报销账单");
      return;
    }

    const headers = [
      "日期",
      "名称",
      "分类",
      "来源",
      "金额",
      "报销方",
      "报销状态",
      "是否摊销",
      "摊销月数",
    ];
    const rows = bills.map(bill => [
      bill.date,
      bill.name,
      bill.category,
      bill.source,
      bill.amount.toFixed(2),
      bill.reimbursementParty || "",
      bill.reimbursementStatus ? statusMap[bill.reimbursementStatus].label : "",
      bill.isAmortized ? "是" : "否",
      bill.isAmortized ? bill.amortizationMonths : "",
    ]);
    const csv = [headers, ...rows]
      .map(row => row.map(escapeCsvCell).join(","))
      .join("\r\n");
    const blob = new Blob([`\uFEFF${csv}`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `reimbursements-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("报销账单已导出");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">报销管理</h1>
          <p className="text-sm text-muted-foreground">
            所有设置了报销状态的账单，按账单日期从早到晚展示
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleExportCsv}
            disabled={isLoading || !bills || bills.length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            导出
          </Button>
          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`}
            />
            刷新
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            需要报销的账单 ({bills?.length || 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !bills || bills.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <AlertCircle className="h-8 w-8 mb-2" />
              <p>暂无需要报销的账单</p>
            </div>
          ) : (
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>日期</TableHead>
                    <TableHead>名称</TableHead>
                    <TableHead>分类</TableHead>
                    <TableHead>来源</TableHead>
                    <TableHead className="text-right">金额</TableHead>
                    <TableHead>报销方</TableHead>
                    <TableHead>报销状态</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bills.map(bill => (
                    <TableRow key={bill.id}>
                      <TableCell className="font-medium whitespace-nowrap">
                        {bill.date}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium">{bill.name}</div>
                          {bill.isAmortized && (
                            <Badge variant="outline" className="text-xs">
                              摊销 {bill.amortizationMonths} 个月
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{bill.category}</TableCell>
                      <TableCell>{bill.source}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatAmount(bill.amount)}
                      </TableCell>
                      <TableCell className="min-w-36">
                        <Select
                          value={bill.reimbursementParty || "none"}
                          onValueChange={value =>
                            handlePartyChange(bill.id, value)
                          }
                          disabled={updateMutation.isPending}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="选择报销方" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">未指定</SelectItem>
                            {bill.reimbursementParty &&
                              !reimbursementParties.includes(
                                bill.reimbursementParty
                              ) && (
                                <SelectItem value={bill.reimbursementParty}>
                                  {bill.reimbursementParty}（当前值）
                                </SelectItem>
                              )}
                            {reimbursementParties.map(party => (
                              <SelectItem key={party} value={party}>
                                {party}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="min-w-32">
                        <Select
                          value={bill.reimbursementStatus}
                          onValueChange={value =>
                            handleStatusChange(bill.id, value)
                          }
                          disabled={updateMutation.isPending}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="选择状态" />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(statusMap).map(([value, item]) => (
                              <SelectItem key={value} value={value}>
                                {item.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
