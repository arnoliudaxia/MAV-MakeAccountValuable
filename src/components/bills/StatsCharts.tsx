import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { trpc } from "@/providers/trpc";
import { cn } from "@/lib/utils";
import { Loader2, PieChart as PieChartIcon, BarChart3 } from "lucide-react";
import { Pie, PieChart, ResponsiveContainer, Sector, Tooltip } from "recharts";
import type { PieLabelRenderProps, SectorProps } from "recharts";
import { overviewFilters } from "./category-filters";
import { useCategoryGestures } from "./use-category-gestures";

interface StatsChartsProps {
  year: number;
  month: number;
  source: string;
  keyword: string;
  category: string;
  excludedCategories: string[];
  onCategorySelect: (category: string) => void;
  onCategoryExclude: (category: string) => void;
}

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
  const { cx, cy, midAngle, outerRadius, name } = props;
  if (
    typeof cx !== "number" ||
    typeof cy !== "number" ||
    typeof midAngle !== "number" ||
    typeof outerRadius !== "number"
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
      fill="hsl(var(--foreground))"
      fontSize={14}
      textAnchor={x > cx ? "start" : "end"}
      dominantBaseline="central"
    >
      {name}
    </text>
  );
}

export function StatsCharts({
  year,
  month,
  source,
  keyword,
  category,
  excludedCategories,
  onCategorySelect,
  onCategoryExclude,
}: StatsChartsProps) {
  const { data: stats, isLoading } = trpc.bill.stats.useQuery(
    overviewFilters(year, month, source, keyword)
  );
  const categoryGestures = useCategoryGestures(
    onCategorySelect,
    onCategoryExclude
  );

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
  const categoryPieData = categoryEntries.map(([name, amount], index) => ({
    category: name,
    amount,
    fill: COLORS[index % COLORS.length],
  }));

  // Recharts 2.x has no generic Pie `shape` prop. Render both shape states,
  // with activeIndex set, so every slice uses a real SVG event wrapper.
  // Cell is configuration only; it cannot receive real pointer events.
  const renderSector = (raw: unknown) => {
    const props = raw as SectorProps & { category: string };
    const name = props.category;
    const excluded = excludedCategories.includes(name);
    const selected = category === name;
    const handlers = categoryGestures(name);
    return (
      <g
        {...handlers}
        role="button"
        tabIndex={0}
        aria-label={`${name}${excluded ? "，已排除" : ""}；点击仅看，右键或长按排除或恢复`}
        aria-pressed={selected}
        className="cursor-pointer select-none outline-none [-webkit-touch-callout:none] focus-visible:opacity-80"
        onKeyDown={event => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            onCategorySelect(name);
          } else {
            handlers.onKeyDown(event);
          }
        }}
      >
        <Sector
          cx={props.cx}
          cy={props.cy}
          innerRadius={props.innerRadius}
          outerRadius={props.outerRadius}
          startAngle={props.startAngle}
          endAngle={props.endAngle}
          fill={props.fill}
          opacity={excluded ? 0.25 : 1}
          stroke="hsl(var(--card))"
          strokeWidth={2}
        />
      </g>
    );
  };

  return (
    <section aria-label="本月分类概览" className="space-y-2">
      <p className="text-xs text-muted-foreground">
        点击仅看；右键或长按 0.6 秒排除／恢复（可多选）。
        图表保留全貌，金额与明细同步筛选；灰淡为排除，筛选栏显示当前仅看分类。
      </p>
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
              <div className="space-y-2">
                {categoryEntries.map(([name, amount], index) => {
                  const excluded = excludedCategories.includes(name);
                  const selected = category === name;
                  return (
                    <div key={name} className="flex items-center gap-2">
                      <button
                        type="button"
                        {...categoryGestures(name)}
                        aria-label={`仅看分类：${name}${excluded ? "（已排除）" : ""}`}
                        aria-pressed={selected}
                        className={cn(
                          "min-w-0 flex-1 space-y-1 rounded-md border border-transparent p-2 text-left select-none [-webkit-touch-callout:none] hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          selected && "bg-primary/5",
                          excluded && "opacity-40"
                        )}
                      >
                        <span className="flex justify-between gap-2 text-sm">
                          <span
                            className={cn(
                              "font-medium",
                              excluded && "line-through"
                            )}
                          >
                            {name}
                            {selected && " · 仅看"}
                            {excluded && " · 已排除"}
                          </span>
                          <span className="text-muted-foreground">
                            ¥{amount.toFixed(2)}
                          </span>
                        </span>
                        <span className="block h-2 rounded-full bg-muted overflow-hidden">
                          <span
                            className="block h-full rounded-full transition-all"
                            style={{
                              width: `${(amount / maxCategory) * 100}%`,
                              backgroundColor: COLORS[index % COLORS.length],
                            }}
                          />
                        </span>
                      </button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={`${excluded ? "恢复" : "排除"}分类：${name}`}
                        aria-pressed={excluded}
                        onClick={() => onCategoryExclude(name)}
                      >
                        {excluded ? "恢复" : "排除"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:h-full">
          <CardHeader className="flex flex-row items-center gap-2">
            <PieChartIcon className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-lg font-medium">分类占比</CardTitle>
          </CardHeader>
          <CardContent className="lg:flex lg:flex-1 lg:min-h-0">
            {categoryEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                暂无数据
              </p>
            ) : (
              <div className="h-80 w-full lg:h-full lg:min-h-[20rem]">
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
                      label={props => (
                        <g
                          {...categoryGestures(props.name)}
                          className="cursor-pointer select-none [-webkit-touch-callout:none]"
                          opacity={
                            excludedCategories.includes(props.name) ? 0.35 : 1
                          }
                          fontWeight={
                            category === props.name ? "bold" : "normal"
                          }
                          textDecoration={
                            excludedCategories.includes(props.name)
                              ? "line-through"
                              : undefined
                          }
                        >
                          {renderCategoryPieLabel(props)}
                        </g>
                      )}
                      labelLine={{
                        stroke: "hsl(var(--muted-foreground))",
                        strokeWidth: 1,
                      }}
                      rootTabIndex={-1}
                      activeIndex={categoryPieData.map((_, index) => index)}
                      activeShape={renderSector}
                      inactiveShape={renderSector}
                      isAnimationActive={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--popover))",
                        borderColor: "hsl(var(--border))",
                        color: "hsl(var(--popover-foreground))",
                      }}
                      itemStyle={{ color: "hsl(var(--popover-foreground))" }}
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
    </section>
  );
}
