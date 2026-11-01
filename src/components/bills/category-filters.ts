import type { ListBillsInput } from "@contracts/bill";

export interface CategoryFilterState {
  category: string;
  excludedCategories: string[];
}

export function selectCategory(category: string): CategoryFilterState {
  return { category, excludedCategories: [] };
}

export function toggleExcludedCategory(
  state: CategoryFilterState,
  category: string
): CategoryFilterState {
  return {
    category: "",
    excludedCategories: state.excludedCategories.includes(category)
      ? state.excludedCategories.filter(name => name !== category)
      : [...state.excludedCategories, category],
  };
}

export function dashboardFilters(
  year: number,
  month: number,
  source: string,
  keyword: string,
  state: CategoryFilterState
): ListBillsInput {
  return {
    ...overviewFilters(year, month, source, keyword),
    category: state.category || undefined,
    excludedCategories: state.excludedCategories.length
      ? state.excludedCategories
      : undefined,
  };
}

// The overview intentionally ignores both kinds of category filter.
export function overviewFilters(
  year: number,
  month: number,
  source: string,
  keyword: string
): ListBillsInput {
  return {
    year,
    month,
    source: source || undefined,
    keyword: keyword || undefined,
  };
}
