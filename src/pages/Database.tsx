import { useMemo, useState } from "react";
import { Database, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
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
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";

type TableName = "bills" | "tags" | "settings";
type RawRow = Record<string, unknown>;

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number") return value.toString();
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

function formatJson(row: RawRow) {
  return JSON.stringify(row, null, 2);
}

export default function DatabasePage() {
  const utils = trpc.useUtils();
  const [table, setTable] = useState<TableName>("bills");
  const [selectedId, setSelectedId] = useState("");
  const [editorValue, setEditorValue] = useState<string | null>(null);

  const { data: tables } = trpc.database.tables.useQuery();
  const rowsQuery = trpc.database.rows.useQuery({ table });
  const rows = useMemo(
    () => (rowsQuery.data ?? []) as RawRow[],
    [rowsQuery.data]
  );

  const tableMeta = useMemo(
    () => tables?.find(item => item.name === table),
    [table, tables]
  );
  const columns = tableMeta?.columns ?? [];
  const primaryKey = tableMeta?.primaryKey ?? "id";
  const selectedRow =
    rows.find(row => row[primaryKey] === selectedId) ?? rows[0];
  const selectedRowId =
    typeof selectedRow?.[primaryKey] === "string"
      ? selectedRow[primaryKey]
      : "";
  const editorText =
    editorValue ?? (selectedRow ? formatJson(selectedRow) : "");

  const updateMutation = trpc.database.updateRow.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.database.rows.invalidate({ table }),
        utils.bill.list.invalidate(),
        utils.bill.stats.invalidate(),
        utils.bill.filters.invalidate(),
        utils.bill.reimbursements.invalidate(),
        utils.tag.list.invalidate(),
        utils.settings.get.invalidate(),
      ]);
      setEditorValue(null);
      toast.success("数据库行已保存");
    },
    onError: error => {
      toast.error(error.message || "保存失败");
    },
  });

  const handleTableChange = (value: string) => {
    setTable(value as TableName);
    setSelectedId("");
    setEditorValue(null);
  };

  const handleSelectRow = (row: RawRow) => {
    const rowId = row[primaryKey];
    if (typeof rowId !== "string") return;
    setSelectedId(rowId);
    setEditorValue(formatJson(row));
  };

  const handleRefresh = async () => {
    await rowsQuery.refetch();
    toast.success("已刷新数据库内容");
  };

  const handleSave = () => {
    if (!selectedRow || !selectedRowId) {
      toast.error("请选择要编辑的行");
      return;
    }

    let parsed: RawRow;
    try {
      parsed = JSON.parse(editorText) as RawRow;
    } catch {
      toast.error("JSON 格式不正确");
      return;
    }

    updateMutation.mutate({
      table,
      id: selectedRowId,
      values: parsed,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">数据库管理</h1>
          <p className="text-sm text-muted-foreground">
            查看并编辑本地 SQLite/libSQL 数据表内容
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={table} onValueChange={handleTableChange}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {tables?.map(item => (
                <SelectItem key={item.name} value={item.name}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={rowsQuery.isFetching}
          >
            <RefreshCw
              className={cn(
                "h-4 w-4 mr-2",
                rowsQuery.isFetching && "animate-spin"
              )}
            />
            刷新
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Database className="h-4 w-4" />
              {tableMeta?.label ?? table} ({rows.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {columns.map(column => (
                      <TableHead key={column} className="whitespace-nowrap">
                        {column}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={columns.length || 1}
                        className="h-24 text-center text-muted-foreground"
                      >
                        暂无数据
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map(row => (
                      <TableRow
                        key={String(row[primaryKey])}
                        className={cn(
                          "cursor-pointer",
                          row[primaryKey] === selectedRowId && "bg-muted"
                        )}
                        onClick={() => handleSelectRow(row)}
                      >
                        {columns.map(column => (
                          <TableCell
                            key={column}
                            className="max-w-56 truncate whitespace-nowrap"
                          >
                            {displayValue(row[column])}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">行 JSON 编辑</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={editorText}
              onChange={event => setEditorValue(event.target.value)}
              className="min-h-[420px] font-mono text-xs"
              spellCheck={false}
              disabled={!selectedRow}
            />
            <Button
              className="w-full"
              onClick={handleSave}
              disabled={!selectedRow || updateMutation.isPending}
            >
              <Save className="h-4 w-4 mr-2" />
              {updateMutation.isPending ? "保存中..." : "保存当前行"}
            </Button>
            <p className="text-xs text-muted-foreground">
              主键字段用于定位行，不会被保存修改。保存分类名称时，会同步更新账单分类。
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
