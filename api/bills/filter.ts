import type { Bill, ListBillsInput } from "../../contracts/bill";

type BillFilters = Pick<
  ListBillsInput,
  "category" | "excludedCategories" | "source" | "keyword"
>;

// Apply to monthly projected bills, so filtering never changes amortization.
export function createBillFilter(filters: BillFilters) {
  const excludedCategories = new Set(filters.excludedCategories);
  const keyword = filters.keyword?.toLowerCase();

  return (bill: Pick<Bill, "category" | "source" | "name">): boolean => {
    // Category names are exact matches, with no parent/descendant expansion.
    if (excludedCategories.has(bill.category)) return false;
    if (filters.category && bill.category !== filters.category) return false;
    if (filters.source && bill.source !== filters.source) return false;
    return (
      !keyword ||
      bill.name.toLowerCase().includes(keyword) ||
      bill.category.toLowerCase().includes(keyword) ||
      bill.source.toLowerCase().includes(keyword)
    );
  };
}
