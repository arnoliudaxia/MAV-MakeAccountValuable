import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/providers/trpc";
import { Search, Plus, ChevronLeft, ChevronRight, Tag } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { CategoryIcon } from "@/lib/category-icons";

interface FilterBarProps {
  year: number;
  month: number;
  onYearChange: (year: number) => void;
  onMonthChange: (month: number) => void;
  category?: string;
  source?: string;
  keyword?: string;
  onCategoryChange: (category: string) => void;
  onSourceChange: (source: string) => void;
  onKeywordChange: (keyword: string) => void;
  onAddClick: () => void;
}

export function FilterBar({
  year,
  month,
  onYearChange,
  onMonthChange,
  category,
  source,
  keyword,
  onCategoryChange,
  onSourceChange,
  onKeywordChange,
  onAddClick,
}: FilterBarProps) {
  const { data: filters } = trpc.bill.filters.useQuery();
  const { data: tags } = trpc.tag.list.useQuery();
  const [localKeyword, setLocalKeyword] = useState(keyword || "");
  const topLevelTags =
    tags?.filter(
      tag =>
        !tag.parentId || !tags.some(candidate => candidate.id === tag.parentId)
    ) ?? [];
  const childrenByParent = new Map<string, typeof topLevelTags>();
  tags?.forEach(tag => {
    if (!tag.parentId) return;
    childrenByParent.set(tag.parentId, [
      ...(childrenByParent.get(tag.parentId) ?? []),
      tag,
    ]);
  });

  const handlePrevMonth = () => {
    if (month === 1) {
      onYearChange(year - 1);
      onMonthChange(12);
    } else {
      onMonthChange(month - 1);
    }
  };

  const handleNextMonth = () => {
    if (month === 12) {
      onYearChange(year + 1);
      onMonthChange(1);
    } else {
      onMonthChange(month + 1);
    }
  };

  const handleSearch = () => {
    onKeywordChange(localKeyword);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const years = Array.from(
    { length: 11 },
    (_, i) => new Date().getFullYear() - 5 + i
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handlePrevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <Select
              value={year.toString()}
              onValueChange={v => onYearChange(parseInt(v))}
            >
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map(y => (
                  <SelectItem key={y} value={y.toString()}>
                    {y}年
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={month.toString()}
              onValueChange={v => onMonthChange(parseInt(v))}
            >
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                  <SelectItem key={m} value={m.toString()}>
                    {m}月
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="icon" onClick={handleNextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <Button onClick={onAddClick}>
          <Plus className="h-4 w-4 mr-2" />
          新增账单
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="flex gap-2 flex-1 min-w-[200px]">
          <Input
            placeholder="搜索名称、分类、来源..."
            value={localKeyword}
            onChange={e => setLocalKeyword(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1"
          />
          <Button variant="secondary" size="icon" onClick={handleSearch}>
            <Search className="h-4 w-4" />
          </Button>
        </div>

        <Select
          value={category || "all"}
          onValueChange={v => onCategoryChange(v === "all" ? "" : v)}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="全部分类" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部分类</SelectItem>
            {topLevelTags.map(tag => {
              const children = childrenByParent.get(tag.id) ?? [];
              return (
                <SelectGroup key={tag.id}>
                  {children.length > 0 && <SelectLabel>{tag.name}</SelectLabel>}
                  <SelectItem value={tag.name}>
                    <CategoryIcon name={tag.icon} className="h-4 w-4" />
                    {tag.name}
                  </SelectItem>
                  {children.map(child => (
                    <SelectItem
                      key={child.id}
                      value={child.name}
                      className="pl-6"
                    >
                      <CategoryIcon name={child.icon} className="h-4 w-4" />
                      {child.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              );
            })}
            <div className="border-t mt-1 pt-1 px-2 pb-1">
              <Link
                to="/tags"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
              >
                <Tag className="h-3 w-3" />
                管理分类
              </Link>
            </div>
          </SelectContent>
        </Select>

        <Select
          value={source || "all"}
          onValueChange={v => onSourceChange(v === "all" ? "" : v)}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="全部来源" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部来源</SelectItem>
            {filters?.sources.map(s => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
