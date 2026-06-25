import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/providers/trpc";
import { Loader2, Receipt, Wallet, Clock, CheckCircle } from "lucide-react";

interface StatsCardsProps {
  year: number;
  month: number;
}

export function StatsCards({ year, month }: StatsCardsProps) {
  const { data: stats, isLoading } = trpc.bill.stats.useQuery({ year, month });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="h-28 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </Card>
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat("zh-CN", {
      style: "currency",
      currency: "CNY",
      minimumFractionDigits: 2,
    }).format(amount);
  };
  const pendingReimbursement = stats.totalReimbursable - stats.totalReimbursed;
  const actualExpense =
    stats.totalExpense - pendingReimbursement - stats.totalReimbursed;

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-lg font-medium">总支出</CardTitle>
          <Receipt className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-red-600">
            {formatAmount(stats.totalExpense)}
          </div>
          <p className="text-xs text-muted-foreground">
            {stats.totalCount} 笔本月计入账单
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-lg font-medium">实际支出</CardTitle>
          <Wallet className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {formatAmount(actualExpense)}
          </div>
          <p className="text-xs text-muted-foreground">
            总支出扣除待报销与已报销
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-lg font-medium">待报销</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-amber-600">
            {formatAmount(pendingReimbursement)}
          </div>
          <p className="text-xs text-muted-foreground">按本月摊销额计算</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-lg font-medium">已报销</CardTitle>
          <CheckCircle className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-600">
            {formatAmount(stats.totalReimbursed)}
          </div>
          <p className="text-xs text-muted-foreground">按本月摊销额计算</p>
        </CardContent>
      </Card>
    </div>
  );
}
