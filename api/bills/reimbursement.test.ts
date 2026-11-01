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
  CreateBillInput,
  UpdateBillInput,
  type ReimbursementStatus,
} from "../../contracts/bill";
import {
  BillFormSchema,
  getBillUpdateInput,
} from "../../src/components/bills/form-values";

const fixture = vi.hoisted(() => ({ url: "" }));
vi.mock("../lib/env", () => ({
  env: { databaseUrl: fixture.url, isProduction: false },
}));
vi.mock("../auth", () => ({ getSession: () => ({}) }));

// Import only after configuring a temporary DB; never open the user's DB.
const directory = mkdtempSync(join(tmpdir(), "mav-reimbursement-test-"));
fixture.url = `file:${join(directory, "app.db")}`;
const connection = await import("../queries/connection");
const { cleanupDirectory } = await import("../database/operations");
const { billRouter } = await import("./router");
const caller = billRouter.createCaller({
  req: new Request("http://localhost/api/trpc"),
  resHeaders: new Headers(),
});
const month = { year: 2026, month: 6 };
const input = {
  date: "2026-06-15",
  category: "测试分类",
  name: "测试账单",
  source: "测试来源",
  amount: 100.01,
  isAmortized: false,
  amortizationMonths: 1,
  reimbursementStatus: "pending" as const,
  reimbursementParty: "公司",
};

beforeAll(async () => {
  const db = await connection.getSqlClient();
  // Also prevents bootstrapping from the user's legacy JSON files.
  await db.execute({
    sql: "INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)",
    args: ["test-category", input.category, "#fff", "now"],
  });
});
beforeEach(async () => {
  await (await connection.getSqlClient()).execute("DELETE FROM bills");
});
afterAll(async () => {
  await connection.closeDbConnection();
  await cleanupDirectory(directory);
  // Windows rm retries both child files and their parent; allow the same
  // teardown budget as the SQLite sync tests (retries can exceed 10 seconds).
}, 30_000);

describe("bill reimbursement update contract and form payload", () => {
  it("sends explicit clears through validation and JSON, dropping a stale party", () => {
    const values = BillFormSchema.parse({
      ...input,
      reimbursementStatus: null,
    });
    const payload = getBillUpdateInput("bill-id", values);
    expect(
      UpdateBillInput.parse(JSON.parse(JSON.stringify(payload)))
    ).toMatchObject({
      reimbursementStatus: null,
      reimbursementParty: null,
      amount: 100.01,
    });
  });

  it("treats an initially non-reimbursable form as an explicit clear on update", () => {
    const values = BillFormSchema.parse({
      ...input,
      reimbursementStatus: undefined,
    });
    expect(getBillUpdateInput("bill-id", values)).toMatchObject({
      reimbursementStatus: null,
      reimbursementParty: null,
    });
  });

  it("preserves omitted patch fields and rejects invalid status values", () => {
    expect(
      UpdateBillInput.parse({ id: "bill-id", name: "改名" })
    ).not.toHaveProperty("reimbursementStatus");
    for (const status of ["none", "", "invalid"]) {
      expect(
        UpdateBillInput.safeParse({
          id: "bill-id",
          reimbursementStatus: status,
        }).success
      ).toBe(false);
    }
    expect(
      CreateBillInput.safeParse({ ...input, reimbursementStatus: null }).success
    ).toBe(false);
    expect(
      BillFormSchema.safeParse({
        ...input,
        isAmortized: true,
        amortizationMonths: undefined,
      }).success
    ).toBe(false);
  });
});

describe("reimbursement updates through router and SQLite", () => {
  it.each(
    (["pending", "approved", "rejected"] as ReimbursementStatus[]).flatMap(
      status => [false, true].map(isAmortized => ({ status, isAmortized }))
    )
  )(
    "clears $status (amortized=$isAmortized) without changing the amount",
    async ({ status, isAmortized }) => {
      const bill = await caller.create({
        ...input,
        reimbursementStatus: status,
        isAmortized,
        amortizationMonths: isAmortized ? 3 : 1,
      });
      const accountingAmount = isAmortized ? 33.34 : 100.01;
      expect(await caller.reimbursements()).toHaveLength(1);
      expect(await caller.stats(month)).toMatchObject({
        totalExpense: accountingAmount,
        totalReimbursable: status === "rejected" ? 0 : accountingAmount,
        totalReimbursed: status === "approved" ? accountingAmount : 0,
      });

      // Status alone must clear the old party too; clients need not send both.
      const updated = await caller.update({
        id: bill.id,
        reimbursementStatus: null,
      });
      expect(updated.reimbursementStatus).toBeUndefined();
      expect(updated.reimbursementParty).toBeUndefined();
      expect(updated.amount).toBe(input.amount);
      expect(updated.amortizationMonths).toBe(isAmortized ? 3 : 1);
      const raw = await (
        await connection.getSqlClient()
      ).execute({
        sql: "SELECT amount, reimbursement_status, reimbursement_party FROM bills WHERE id = ?",
        args: [bill.id],
      });
      expect(raw.rows[0]).toMatchObject({
        amount: 10001,
        reimbursement_status: null,
        reimbursement_party: null,
      });
      expect(await caller.getById({ id: bill.id })).toEqual(updated);
      expect(await caller.reimbursements()).toEqual([]);
      expect(await caller.list(month)).toMatchObject([
        { id: bill.id, amount: 100.01, monthlyAmount: accountingAmount },
      ]);
      expect(await caller.stats(month)).toMatchObject({
        totalCount: 1,
        totalExpense: accountingAmount,
        totalReimbursable: 0,
        totalReimbursed: 0,
        byCategory: { [input.category]: accountingAmount },
        bySource: { [input.source]: accountingAmount },
      });
      if (isAmortized) {
        const finalMonth = { year: 2026, month: 8 };
        expect(await caller.list(finalMonth)).toMatchObject([
          { id: bill.id, amount: 100.01, monthlyAmount: 33.33 },
        ]);
        expect(await caller.stats(finalMonth)).toMatchObject({
          totalExpense: 33.33,
          totalReimbursable: 0,
          byCategory: { [input.category]: 33.33 },
        });
      }
    }
  );

  it("persists the validated form clear even if its party was stale", async () => {
    const bill = await caller.create(input);
    const values = BillFormSchema.parse({ ...bill, reimbursementStatus: null });
    await caller.update(
      JSON.parse(JSON.stringify(getBillUpdateInput(bill.id, values)))
    );
    expect(await caller.getById({ id: bill.id })).toMatchObject({
      reimbursementStatus: undefined,
      reimbursementParty: undefined,
    });
  });

  it("keeps reimbursement on unrelated patches and still permits status/party-only edits", async () => {
    const bill = await caller.create(input);
    expect(await caller.update({ id: bill.id, name: "改名" })).toMatchObject({
      reimbursementStatus: "pending",
      reimbursementParty: "公司",
      amount: 100.01,
    });
    expect(
      await caller.update({ id: bill.id, reimbursementStatus: "approved" })
    ).toMatchObject({
      reimbursementStatus: "approved",
      reimbursementParty: "公司",
    });
    expect(
      await caller.update({ id: bill.id, reimbursementParty: null })
    ).toMatchObject({
      reimbursementStatus: "approved",
      reimbursementParty: undefined,
    });
    await caller.update({
      id: bill.id,
      reimbursementStatus: null,
      reimbursementParty: "stale",
    });
    expect(await caller.getById({ id: bill.id })).toMatchObject({
      reimbursementStatus: undefined,
      reimbursementParty: undefined,
    });
    await caller.update({
      id: bill.id,
      reimbursementStatus: "pending",
      reimbursementParty: "新公司",
    });
    expect(await caller.reimbursements()).toMatchObject([
      {
        id: bill.id,
        reimbursementStatus: "pending",
        reimbursementParty: "新公司",
      },
    ]);
  });
});
