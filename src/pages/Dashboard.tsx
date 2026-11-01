import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import {
  dashboardFilters,
  selectCategory,
  toggleExcludedCategory,
} from "@/components/bills/category-filters";
import { StatsCards } from "@/components/bills/StatsCards";
import { StatsCharts } from "@/components/bills/StatsCharts";
import { BillTable } from "@/components/bills/BillTable";
import { FilterBar } from "@/components/bills/FilterBar";
import { BillForm } from "@/components/bills/BillForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const dashboardMonthStorageKey = "billing.dashboard.selectedMonth";

function getInitialDashboardMonth() {
  const now = new Date();
  const fallback = {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  };

  if (typeof window === "undefined") return fallback;

  try {
    const storedValue = window.sessionStorage.getItem(dashboardMonthStorageKey);
    if (!storedValue) return fallback;

    const parsed = JSON.parse(storedValue) as unknown;
    if (!parsed || typeof parsed !== "object") return fallback;

    const { year, month } = parsed as { year?: unknown; month?: unknown };
    if (
      typeof year === "number" &&
      Number.isInteger(year) &&
      year >= 1900 &&
      year <= 2100 &&
      typeof month === "number" &&
      Number.isInteger(month) &&
      month >= 1 &&
      month <= 12
    ) {
      return { year, month };
    }
  } catch {
    return fallback;
  }

  return fallback;
}

export default function Dashboard() {
  const initialMonth = getInitialDashboardMonth();
  const [year, setYear] = useState(initialMonth.year);
  const [month, setMonth] = useState(initialMonth.month);
  const [categoryFilter, setCategoryFilter] = useState(() =>
    selectCategory("")
  );
  const { category, excludedCategories } = categoryFilter;
  const handleCategorySelect = useCallback((name: string) => {
    setCategoryFilter(selectCategory(name));
  }, []);
  const handleCategoryExclude = useCallback((name: string) => {
    setCategoryFilter(current => toggleExcludedCategory(current, name));
  }, []);
  const [source, setSource] = useState("");
  const [keyword, setKeyword] = useState("");
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    window.sessionStorage.setItem(
      dashboardMonthStorageKey,
      JSON.stringify({ year, month })
    );
  }, [year, month]);

  const activeFilters = dashboardFilters(
    year,
    month,
    source,
    keyword,
    categoryFilter
  );

  return (
    <div className="space-y-6">
      <section
        aria-label="当前分类筛选"
        className="flex flex-wrap items-center gap-2 rounded-lg border p-3"
      >
        <span className="text-sm text-muted-foreground">分类筛选：</span>
        <div
          role="status"
          className="flex flex-wrap items-center gap-2 text-sm"
        >
          {category ? (
            <span>仅看：{category}</span>
          ) : excludedCategories.length === 0 ? (
            <span>全部分类</span>
          ) : (
            <span>已排除：</span>
          )}
          {excludedCategories.map(name => (
            <Button
              key={name}
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 gap-1 rounded-full"
              aria-label={`恢复分类：${name}`}
              onClick={() => handleCategoryExclude(name)}
            >
              {name}
              <X className="h-3 w-3" aria-hidden="true" />
            </Button>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={() => handleCategorySelect("")}
        >
          清除分类筛选
        </Button>
      </section>

      <StatsCards {...activeFilters} />

      <StatsCharts
        year={year}
        month={month}
        source={source}
        keyword={keyword}
        category={category}
        excludedCategories={excludedCategories}
        onCategorySelect={handleCategorySelect}
        onCategoryExclude={handleCategoryExclude}
      />

      <Card>
        <CardHeader>
          <CardTitle>账单明细</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FilterBar
            year={year}
            month={month}
            onYearChange={setYear}
            onMonthChange={setMonth}
            category={category}
            excludedCategories={excludedCategories}
            source={source}
            keyword={keyword}
            onCategoryChange={handleCategorySelect}
            onSourceChange={setSource}
            onKeywordChange={setKeyword}
            onAddClick={() => setFormOpen(true)}
          />
          <BillTable {...activeFilters} />
        </CardContent>
      </Card>

      <BillForm
        open={formOpen}
        onOpenChange={setFormOpen}
        year={year}
        month={month}
      />
    </div>
  );
}
