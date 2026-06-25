import { useEffect, useState } from "react";
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
  const [category, setCategory] = useState("");
  const [source, setSource] = useState("");
  const [keyword, setKeyword] = useState("");
  const [formOpen, setFormOpen] = useState(false);

  useEffect(() => {
    window.sessionStorage.setItem(
      dashboardMonthStorageKey,
      JSON.stringify({ year, month })
    );
  }, [year, month]);

  return (
    <div className="space-y-6">
      <StatsCards year={year} month={month} />

      <StatsCharts year={year} month={month} onCategorySelect={setCategory} />

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
            source={source}
            keyword={keyword}
            onCategoryChange={setCategory}
            onSourceChange={setSource}
            onKeywordChange={setKeyword}
            onAddClick={() => setFormOpen(true)}
          />
          <BillTable
            year={year}
            month={month}
            category={category || undefined}
            source={source || undefined}
            keyword={keyword || undefined}
          />
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
