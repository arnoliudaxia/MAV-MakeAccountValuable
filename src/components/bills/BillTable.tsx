import { useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/providers/trpc";
import { BillForm } from "./BillForm";
import type { Bill } from "../../../contracts/bill";
import {
  Loader2,
  Pencil,
  Trash2,
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
} from "lucide-react";
import { CategoryIcon } from "@/lib/category-icons";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface BillTableProps {
  year: number;
  month: number;
  category?: string;
  source?: string;
  keyword?: string;
}

type SortKey = "date" | "amount";
type SortDirection = "asc" | "desc";

export function BillTable({
  year,
  month,
  category,
  source,
  keyword,
}: BillTableProps) {
  const utils = trpc.useUtils();
  const { data: bills, isLoading } = trpc.bill.list.useQuery({
    year,
    month,
    category: category || undefined,
    source: source || undefined,
    keyword: keyword || undefined,
  });

  const { data: tags } = trpc.tag.list.useQuery();

  const [editBill, setEditBill] = useState<Bill | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{
    key: SortKey;
    direction: SortDirection;
  }>({ key: "date", direction: "desc" });

  const getTag = (categoryName: string) => {
    return tags?.find(t => t.name === categoryName);
  };

  const deleteMutation = trpc.bill.delete.useMutation({
    onSuccess: () => {
      utils.bill.list.invalidate();
      utils.bill.stats.invalidate();
      utils.bill.reimbursements.invalidate();
      setDeleteId(null);
    },
  });

  const handleEdit = (bill: Bill) => {
    setEditBill(bill);
    setFormOpen(true);
  };

  const handleDelete = (id: string) => {
    setDeleteId(id);
  };

  const handleSort = (key: SortKey) => {
    setSortConfig(current =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "desc" }
    );
  };

  const sortedBills = useMemo(() => {
    if (!bills) return [];

    return [...bills].sort((a, b) => {
      const direction = sortConfig.direction === "asc" ? 1 : -1;
      const left =
        sortConfig.key === "date"
          ? new Date(a.date).getTime()
          : (a.monthlyAmount ?? a.amount);
      const right =
        sortConfig.key === "date"
          ? new Date(b.date).getTime()
          : (b.monthlyAmount ?? b.amount);
      const valueDiff = left - right;

      if (valueDiff !== 0) return valueDiff * direction;
      return (
        (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()) *
        direction
      );
    });
  }, [bills, sortConfig]);

  const renderSortIcon = (key: SortKey) => {
    if (sortConfig.key !== key) {
      return <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />;
    }

    return sortConfig.direction === "asc" ? (
      <ArrowUp className="h-3.5 w-3.5" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5" />
    );
  };

  const confirmDelete = () => {
    if (deleteId) {
      deleteMutation.mutate({ id: deleteId });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!bills || bills.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <AlertCircle className="h-8 w-8 mb-2" />
        <p>本月暂无账单记录</p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="-ml-3 h-8 gap-1.5 px-3"
                  onClick={() => handleSort("date")}
                >
                  日期
                  {renderSortIcon("date")}
                </Button>
              </TableHead>
              <TableHead>名称</TableHead>
              <TableHead>分类</TableHead>
              <TableHead>来源</TableHead>
              <TableHead className="text-right">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="-mr-3 h-8 gap-1.5 px-3"
                  onClick={() => handleSort("amount")}
                >
                  本月金额
                  {renderSortIcon("amount")}
                </Button>
              </TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedBills.map(bill => (
              <TableRow key={bill.id}>
                <TableCell className="font-medium whitespace-nowrap">
                  {bill.date}
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <div
                      className={cn(
                        "font-medium",
                        bill.isAmortized && "text-blue-600"
                      )}
                    >
                      {bill.name}
                    </div>
                    {bill.isAmortized && (
                      <div className="text-xs text-muted-foreground">
                        摊销 {bill.amortizationMonthIndex || 1}/
                        {bill.amortizationMonths}
                      </div>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {(() => {
                    const tag = getTag(bill.category);
                    return tag ? (
                      <Badge
                        variant="outline"
                        style={{
                          borderColor: tag.color,
                          color: tag.color,
                          backgroundColor: tag.color + "15",
                        }}
                      >
                        <CategoryIcon
                          name={tag.icon}
                          className="w-3 h-3 mr-1.5"
                        />
                        {bill.category}
                      </Badge>
                    ) : (
                      <Badge variant="outline">{bill.category}</Badge>
                    );
                  })()}
                </TableCell>
                <TableCell>{bill.source}</TableCell>
                <TableCell className="text-right font-mono">
                  <div className="flex flex-col items-end gap-1">
                    <span className={bill.amount > 0 ? "text-red-600" : ""}>
                      ¥{(bill.monthlyAmount ?? bill.amount).toFixed(2)}
                    </span>
                    {bill.isAmortized && (
                      <span className="text-xs text-muted-foreground">
                        总额 ¥{bill.amount.toFixed(2)} ·{" "}
                        {bill.amortizationMonthIndex || 1}/
                        {bill.amortizationMonths}
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(bill)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(bill.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <BillForm
        open={formOpen}
        onOpenChange={setFormOpen}
        bill={editBill}
        year={year}
        month={month}
        onSuccess={() => setEditBill(null)}
      />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              此操作不可撤销，确定要删除这条账单记录吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
