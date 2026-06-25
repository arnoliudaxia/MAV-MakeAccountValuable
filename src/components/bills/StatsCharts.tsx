import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/providers/trpc";
import { Loader2, PieChart as PieChartIcon, BarChart3 } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { PieLabelRenderProps } from "recharts";

interface StatsChartsProps {
  year: number;
  month: number;
  onCategorySelect?: (category: string) => void;
}

type CategoryPieClickData = {
  payload?: {
    category?: string;
  };
  category?: string;
  name?: string;
};

const COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

const RADIAN = Math.PI / 180;

function renderCategoryPieLabel(props: PieLabelRenderProps) {
  const { cx, cy, midAngle, outerRadius } = props;
  const payload = props.payload as { category?: string } | undefined;
  const category = payload?.category ?? props.name;

  if (
    typeof cx !== "number" ||
    typeof cy !== "number" ||
    typeof midAngle !== "number" ||
    typeof outerRadius !== "number" ||
    !category
  ) {
    return null;
  }

  const radius = outerRadius + 24;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text
      x={x}
      y={y}
      fill="#222222"
      // fill="#64748b"
      fontSize={14}
      textAnchor={x > cx ? "start" : "end"}
      dominantBaseline="central"
    >
      {category}
    </text>
  );
}

export function StatsCharts({
  year,
  month,
  onCategorySelect,
}: StatsChartsProps) {
  const { data: stats, isLoading } = trpc.bill.stats.useQuery({ year, month });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[...Array(2)].map((_, i) => (
          <Card key={i} className="h-64 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </Card>
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const categoryEntries = Object.entries(stats.byCategory).sort(
    (a, b) => b[1] - a[1]
  );
  const maxCategory = categoryEntries[0]?.[1] || 1;
  const categoryPieData = categoryEntries.map(([category, amount], index) => ({
    category,
    amount,
    color: COLORS[index % COLORS.length],
  }));
  const handlePieClick = (data: unknown) => {
    if (!onCategorySelect || !data || typeof data !== "object") return;

    const item = data as CategoryPieClickData;
    const category = item.payload?.category ?? item.category ?? item.name;
    if (category) {
      onCategorySelect(category);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-lg font-medium">分类统计</CardTitle>
        </CardHeader>
        <CardContent>
          {categoryEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              暂无数据
            </p>
          ) : (
            <div className="space-y-3">
              {categoryEntries.map(([category, amount], index) => (
                <div key={category} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium">{category}</span>
                    <span className="text-muted-foreground">
                      ¥{amount.toFixed(2)}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${(amount / maxCategory) * 100}%`,
                        backgroundColor: COLORS[index % COLORS.length],
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="lg:h-full">
        <CardHeader className="flex flex-row items-center gap-2">
          <PieChartIcon className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-lg font-medium">分类统计</CardTitle>
        </CardHeader>
        <CardContent className="lg:flex lg:flex-1 lg:min-h-0">
          {categoryEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              暂无数据
            </p>
          ) : (
            <div className="h-72 w-full lg:h-full lg:min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart
                  className="bill-category-pie-chart"
                  margin={{ top: 36, right: 36, bottom: 36, left: 36 }}
                >
                  <Pie
                    data={categoryPieData}
                    dataKey="amount"
                    nameKey="category"
                    innerRadius="74%"
                    outerRadius="98%"
                    paddingAngle={2}
                    strokeWidth={2}
                    label={renderCategoryPieLabel}
                    labelLine={{ stroke: "#94a3b8", strokeWidth: 1 }}
                    rootTabIndex={-1}
                    onClick={handlePieClick}
                  >
                    {categoryPieData.map(item => (
                      <Cell
                        key={item.category}
                        fill={item.color}
                        className={onCategorySelect ? "cursor-pointer" : ""}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, _name, item) => [
                      `¥${Number(value).toFixed(2)}`,
                      item.payload.category,
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
