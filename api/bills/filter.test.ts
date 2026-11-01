import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ListBillsInput,
  UpdateBillInput,
  type Bill,
  type CreateBillInput,
} from "../../contracts/bill";
import { createBillFilter } from "./filter";

const month = { year: 2026, month: 6 };
type Filters = Omit<ListBillsInput, "year" | "month">;
const pureBills = [
  { name: "Lunch", category: "Food", source: "Wallet" },
  { name: "Latte", category: "Coffee", source: "Wallet" },
  { name: "Train", category: "Travel", source: "Card" },
];

describe("bill filter contract and pure predicate", () => {
  it("accepts omitted/empty/multiple exclusions without changing reimbursement clears", () => {
    expect(ListBillsInput.parse(month)).toEqual(month);
    for (const excludedCategories of [[], ["Food", "Travel"]]) {
      expect(ListBillsInput.parse({ ...month, excludedCategories })).toEqual({
        ...month,
        excludedCategories,
      });
    }
    expect(
      UpdateBillInput.parse({ id: "bill", reimbursementStatus: null })
    ).toEqual({ id: "bill", reimbursementStatus: null });
    for (const excludedCategories of [null, "Food", [1]]) {
      expect(
        ListBillsInput.safeParse({ ...month, excludedCategories }).success
      ).toBe(false);
    }
  });

  it.each<{ filters: Filters; names: string[] }>([
    { filters: {}, names: ["Lunch", "Latte", "Train"] },
    { filters: { excludedCategories: [] }, names: ["Lunch", "Latte", "Train"] },
    { filters: { category: "Food" }, names: ["Lunch"] },
    { filters: { category: "food" }, names: [] },
    { filters: { excludedCategories: ["Food", "Travel"] }, names: ["Latte"] },
    {
      filters: { excludedCategories: ["Food", "Food", "missing"] },
      names: ["Latte", "Train"],
    },
    {
      filters: { excludedCategories: ["food"] },
      names: ["Lunch", "Latte", "Train"],
    },
    { filters: { category: "Food", excludedCategories: ["Food"] }, names: [] },
    {
      filters: { category: "Coffee", excludedCategories: ["Food"] },
      names: ["Latte"],
    },
    {
      filters: {
        source: "Wallet",
        keyword: "LAT",
        excludedCategories: ["Travel"],
      },
      names: ["Latte"],
    },
    { filters: { keyword: "COFFEE" }, names: ["Latte"] },
    { filters: { keyword: "cArD" }, names: ["Train"] },
    { filters: { source: "wallet" }, names: [] },
    { filters: { keyword: " Lunch " }, names: [] },
    {
      filters: { category: "", source: "", keyword: "" },
      names: ["Lunch", "Latte", "Train"],
    },
  ])("selects $names for $filters", ({ filters, names }) => {
    expect(
      pureBills.filter(createBillFilter(filters)).map(b => b.name)
    ).toEqual(names);
  });

  it("does not mutate projected bill data or filter inputs", () => {
    const projected = Object.freeze({
      ...pureBills[0],
      amount: 100.01,
      monthlyAmount: 33.33,
      amortizationMonthIndex: 3,
    });
    const filters = Object.freeze({ excludedCategories: ["Travel"] });
    Object.freeze(filters.excludedCategories);
    expect([projected].filter(createBillFilter(filters))).toEqual([projected]);
    expect([projected].filter(createBillFilter(filters))[0]).toBe(projected);
  });
});

const fixture = vi.hoisted(() => ({ url: "" }));
vi.mock("../lib/env", () => ({
  env: { databaseUrl: fixture.url, isProduction: false },
}));
vi.mock("../auth", () => ({ getSession: () => ({}) }));

// Configure SQLite before importing the router; never open the user's DB.
const directory = mkdtempSync(join(tmpdir(), "mav-filter-test-"));
fixture.url = `file:${join(directory, "app.db")}`;
const connection = await import("../queries/connection");
const { cleanupDirectory } = await import("../database/operations");
const { billRouter } = await import("./router");
const caller = billRouter.createCaller({
  req: new Request("http://localhost/api/trpc"),
  resHeaders: new Headers(),
});

const seeds: CreateBillInput[] = [
  {
    date: "2026-06-01",
    category: "Food",
    name: "Food lunch",
    source: "Wallet",
    amount: 10,
  },
  {
    date: "2026-06-02",
    category: "Coffee",
    name: "Cafe lunch",
    source: "Wallet",
    amount: 20,
  },
  {
    date: "2026-06-03",
    category: "Travel",
    name: "Train lunch",
    source: "Card",
    amount: 30,
  },
  {
    date: "2026-06-04",
    category: "Work",
    name: "Pending lunch",
    source: "Wallet",
    amount: 40,
    reimbursementStatus: "pending",
  },
  {
    date: "2026-06-05",
    category: "Work",
    name: "Approved lunch",
    source: "Wallet",
    amount: 60,
    reimbursementStatus: "approved",
  },
  {
    date: "2026-06-06",
    category: "Work",
    name: "Rejected lunch",
    source: "Card",
    amount: 50,
    reimbursementStatus: "rejected",
  },
  {
    date: "2026-06-07",
    category: "Other",
    name: "Dinner",
    source: "Wallet",
    amount: 70,
  },
  {
    date: "2026-05-10",
    category: "Work",
    name: "Laptop",
    source: "Wallet",
    amount: 100.01,
    isAmortized: true,
    amortizationMonths: 3,
    reimbursementStatus: "approved",
  },
];
const allNames = seeds.map(b => b.name);

beforeAll(async () => {
  const db = await connection.getSqlClient();
  // Seed a real hierarchy and prevent bootstrapping the user's legacy JSON.
  for (const name of ["Food", "Coffee", "Travel", "Work", "Other"]) {
    await db.execute({
      sql: "INSERT INTO tags (id, name, color, parent_id, created_at) VALUES (?, ?, ?, ?, ?)",
      args: [name, name, "#fff", name === "Coffee" ? "Food" : null, "now"],
    });
  }
});
beforeEach(async () => {
  await (await connection.getSqlClient()).execute("DELETE FROM bills");
  for (const seed of seeds) await caller.create(seed);
});
afterAll(async () => {
  await connection.closeDbConnection();
  await cleanupDirectory(directory);
  // Windows may retry deleting SQLite sidecars and the parent directory.
}, 30_000);

async function expectSelection(filters: Filters, names: string[]) {
  const input = { ...month, ...filters };
  const bills = await caller.list(input);
  const stats = await caller.stats(input);
  expect(bills.map(b => b.name).sort()).toEqual([...names].sort());
  expect(bills.map(b => b.date)).toEqual(
    bills
      .map(b => b.date)
      .sort()
      .reverse()
  );
  const amount = (b: Bill) => b.monthlyAmount ?? b.amount;
  const reimbursable = bills.filter(
    b =>
      b.reimbursementStatus === "pending" ||
      b.reimbursementStatus === "approved"
  );
  expect(stats.totalCount).toBe(names.length);
  expect(stats.totalExpense).toBeCloseTo(
    bills.reduce((sum, b) => sum + amount(b), 0),
    8
  );
  expect(stats.totalReimbursable).toBeCloseTo(
    reimbursable.reduce((sum, b) => sum + amount(b), 0),
    8
  );
  expect(stats.totalReimbursed).toBeCloseTo(
    bills
      .filter(b => b.reimbursementStatus === "approved")
      .reduce((sum, b) => sum + amount(b), 0),
    8
  );
  const byCategory: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  for (const bill of bills) {
    if (!reimbursable.includes(bill)) {
      byCategory[bill.category] =
        (byCategory[bill.category] ?? 0) + amount(bill);
    }
    bySource[bill.source] = (bySource[bill.source] ?? 0) + amount(bill);
  }
  expect(stats.byCategory).toEqual(byCategory);
  expect(stats.bySource).toEqual(bySource);
  return { bills, stats };
}

describe("shared list/stats filters through router and temporary SQLite", () => {
  it.each<{ filters: Filters; names: string[] }>([
    { filters: {}, names: allNames },
    { filters: { excludedCategories: [] }, names: allNames },
    { filters: { excludedCategories: ["missing"] }, names: allNames },
    { filters: { category: "Food" }, names: ["Food lunch"] },
    {
      filters: { excludedCategories: ["Food", "Travel"] },
      names: [
        "Cafe lunch",
        "Pending lunch",
        "Approved lunch",
        "Rejected lunch",
        "Dinner",
        "Laptop",
      ],
    },
    { filters: { category: "Food", excludedCategories: ["Food"] }, names: [] },
    {
      filters: { category: "Coffee", excludedCategories: ["Food"] },
      names: ["Cafe lunch"],
    },
    {
      filters: {
        source: "Wallet",
        keyword: "LUNCH",
        excludedCategories: ["Work"],
      },
      names: ["Food lunch", "Cafe lunch"],
    },
    {
      filters: {
        source: "Card",
        keyword: "lunch",
        excludedCategories: ["Travel"],
      },
      names: ["Rejected lunch"],
    },
    { filters: { keyword: "cOFfEe" }, names: ["Cafe lunch"] },
    {
      filters: { keyword: "wALleT", excludedCategories: ["Other"] },
      names: [
        "Food lunch",
        "Cafe lunch",
        "Pending lunch",
        "Approved lunch",
        "Laptop",
      ],
    },
    { filters: { keyword: "Dinner" }, names: ["Dinner"] },
    {
      filters: {
        category: "Work",
        source: "Wallet",
        keyword: "approved",
        excludedCategories: ["Travel"],
      },
      names: ["Approved lunch"],
    },
    { filters: { source: "card" }, names: [] },
    { filters: { keyword: "missing" }, names: [] },
    {
      filters: {
        excludedCategories: ["Food", "Coffee", "Travel", "Work", "Other"],
      },
      names: [],
    },
  ])(
    "keeps list/stats selection identical for $filters",
    async ({ filters, names }) => {
      await expectSelection(filters, names);
    }
  );

  it("keeps pending/approved out of byCategory, but includes rejected bills", async () => {
    const filters = {
      keyword: "lunch",
      excludedCategories: ["Food", "Coffee", "Travel", "Other"],
    };
    const { stats } = await expectSelection(filters, [
      "Pending lunch",
      "Approved lunch",
      "Rejected lunch",
    ]);
    expect(stats).toEqual({
      totalCount: 3,
      totalExpense: 150,
      totalReimbursable: 100,
      totalReimbursed: 60,
      byCategory: { Work: 50 },
      bySource: { Wallet: 100, Card: 50 },
    });
    const approved = (await caller.list({ ...month, ...filters })).find(
      b => b.name === "Approved lunch"
    )!;
    await caller.update({ id: approved.id, reimbursementStatus: null });
    expect(await caller.stats({ ...month, ...filters })).toEqual({
      totalCount: 3,
      totalExpense: 150,
      totalReimbursable: 40,
      totalReimbursed: 0,
      byCategory: { Work: 110 },
      bySource: { Wallet: 100, Card: 50 },
    });
  });

  it("filters projected installments without losing carryover, rounding or reimbursement accounting", async () => {
    const filters = {
      category: "Work",
      keyword: "LAPTOP",
      source: "Wallet",
      excludedCategories: ["Food", "Travel"],
    };
    let total = 0;
    for (const [month, monthlyAmount, index] of [
      [5, 33.34, 1],
      [6, 33.34, 2],
      [7, 33.33, 3],
    ]) {
      const input = { year: 2026, month, ...filters };
      expect(await caller.list(input)).toMatchObject([
        {
          name: "Laptop",
          date: "2026-05-10",
          amount: 100.01,
          monthlyAmount,
          amortizationMonthIndex: index,
        },
      ]);
      expect(await caller.stats(input)).toEqual({
        totalCount: 1,
        totalExpense: monthlyAmount,
        totalReimbursable: monthlyAmount,
        totalReimbursed: monthlyAmount,
        byCategory: {},
        bySource: { Wallet: monthlyAmount },
      });
      total += monthlyAmount;
    }
    expect(total).toBeCloseTo(100.01, 8);
    for (const input of [
      { year: 2026, month: 4, ...filters },
      { year: 2026, month: 8, ...filters },
      { ...month, ...filters, excludedCategories: ["Work"] },
    ]) {
      expect(await caller.list(input)).toEqual([]);
      expect(await caller.stats(input)).toEqual({
        totalCount: 0,
        totalExpense: 0,
        totalReimbursable: 0,
        totalReimbursed: 0,
        byCategory: {},
        bySource: {},
      });
    }
  });
});
