import { eq } from "drizzle-orm";
import { access, readFile } from "fs/promises";
import { join } from "path";
import type { Bill } from "../../contracts/bill";
import { MISC_CATEGORY_NAME, type Tag } from "../../contracts/tag";
import { bills, tags } from "../../db/schema";
import { getDb } from "../queries/connection";
import { ensureTagByName, findByName } from "../tags/store";

const DATA_DIR = join(process.cwd(), "data");
const BILLS_FILE = join(DATA_DIR, "bills.json");
const TAGS_FILE = join(DATA_DIR, "tags.json");

let bootstrapPromise: Promise<void> | null = null;

function normalizeBill(row: typeof bills.$inferSelect): Bill {
  return {
    id: row.id,
    date: row.date,
    category: row.category,
    name: row.name,
    source: row.source,
    amount: row.amount,
    isAmortized: !!row.isAmortized,
    amortizationMonths: row.amortizationMonths || 1,
    reimbursementStatus: row.reimbursementStatus ?? undefined,
    reimbursementParty: row.reimbursementParty ?? undefined,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function normalizeAmortization(bill: Bill): Bill {
  const isAmortized = !!bill.isAmortized;
  const amortizationMonths = isAmortized
    ? Math.max(1, Math.trunc(bill.amortizationMonths || 1))
    : 1;

  return {
    ...bill,
    isAmortized,
    amortizationMonths,
  };
}

function getMonthIndex(year: number, month: number) {
  return year * 12 + month - 1;
}

function getBillStartMonthIndex(date: string) {
  const [year, month] = date.slice(0, 7).split("-").map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return undefined;
  return getMonthIndex(year, month);
}

function getMonthlyAmount(amount: number, months: number, offset: number) {
  const cents = Math.round(amount * 100);
  const normalizedMonths = Math.max(1, Math.trunc(months));
  const baseCents = Math.floor(cents / normalizedMonths);
  const remainder = cents % normalizedMonths;
  return (baseCents + (offset < remainder ? 1 : 0)) / 100;
}

function getBillForAccountingMonth(
  bill: Bill,
  year: number,
  month: number
): Bill | undefined {
  const targetMonth = getMonthIndex(year, month);
  const startMonth = getBillStartMonthIndex(bill.date);
  if (startMonth === undefined) return undefined;

  const offset = targetMonth - startMonth;
  if (bill.isAmortized) {
    if (offset < 0 || offset >= bill.amortizationMonths) return undefined;
    return {
      ...bill,
      monthlyAmount: getMonthlyAmount(
        bill.amount,
        bill.amortizationMonths,
        offset
      ),
      amortizationMonthIndex: offset + 1,
    };
  }

  if (offset !== 0) return undefined;
  return {
    ...bill,
    monthlyAmount: bill.amount,
  };
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    await access(filePath);
    return JSON.parse(await readFile(filePath, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

async function insertTagIfMissing(tag: Tag) {
  const db = await getDb();
  const normalizedTag: Tag = {
    ...tag,
    parentId: tag.parentId ?? null,
    icon: tag.icon || "Tag",
    sortOrder: tag.sortOrder ?? Date.now(),
  };
  await db
    .insert(tags)
    .values(normalizedTag)
    .onConflictDoNothing({ target: tags.name });
}

async function bootstrapFromJson() {
  const db = await getDb();
  const [existingBill] = await db.select({ id: bills.id }).from(bills).limit(1);
  const [existingTag] = await db.select({ id: tags.id }).from(tags).limit(1);
  if (existingBill || existingTag) return;

  const [jsonBills, jsonTags] = await Promise.all([
    readJsonFile<Bill[]>(BILLS_FILE, []),
    readJsonFile<Tag[]>(TAGS_FILE, []),
  ]);

  for (const tag of jsonTags) {
    await insertTagIfMissing(tag);
  }

  for (const bill of jsonBills) {
    await ensureTagByName(bill.category);
    const normalizedBill = normalizeAmortization({
      ...bill,
      isAmortized: bill.isAmortized ?? false,
      amortizationMonths: bill.amortizationMonths ?? 1,
    });
    await db
      .insert(bills)
      .values({
        ...normalizedBill,
        reimbursementStatus: normalizedBill.reimbursementStatus ?? null,
        reimbursementParty: normalizedBill.reimbursementParty || null,
      })
      .onConflictDoNothing({ target: bills.id });
  }
}

async function ensureBootstrap() {
  if (!bootstrapPromise) {
    bootstrapPromise = bootstrapFromJson();
  }
  return bootstrapPromise;
}

async function resolveCategoryName(name: string): Promise<string> {
  const trimmed = name.trim();
  if (trimmed) {
    const tag = await findByName(trimmed);
    if (tag) return tag.name;
  }

  const miscTag = await ensureTagByName(MISC_CATEGORY_NAME, "#6366f1");
  return miscTag.name;
}

export async function findAll(): Promise<Bill[]> {
  await ensureBootstrap();
  const db = await getDb();
  const rows = await db.select().from(bills);
  return rows.map(normalizeBill);
}

export async function findByMonth(
  year: number,
  month: number
): Promise<Bill[]> {
  await ensureBootstrap();
  const db = await getDb();
  const rows = await db.select().from(bills);
  return rows
    .map(normalizeBill)
    .map(bill => getBillForAccountingMonth(bill, year, month))
    .filter((bill): bill is Bill => !!bill);
}

export async function findById(id: string): Promise<Bill | undefined> {
  await ensureBootstrap();
  const db = await getDb();
  const [bill] = await db.select().from(bills).where(eq(bills.id, id)).limit(1);
  return bill ? normalizeBill(bill) : undefined;
}

export async function create(bill: Bill): Promise<Bill> {
  await ensureBootstrap();
  const category = await resolveCategoryName(bill.category);
  const normalizedBill = normalizeAmortization({ ...bill, category });
  const db = await getDb();
  await db.insert(bills).values({
    ...normalizedBill,
    reimbursementStatus: normalizedBill.reimbursementStatus ?? null,
    reimbursementParty: normalizedBill.reimbursementParty || null,
  });
  return normalizedBill;
}

export async function update(
  id: string,
  data: Partial<Bill>
): Promise<Bill | undefined> {
  await ensureBootstrap();
  const existing = await findById(id);
  if (!existing) return undefined;

  if ("category" in data && data.category !== undefined) {
    data.category = await resolveCategoryName(data.category);
  }

  const db = await getDb();
  const updateData: Partial<typeof bills.$inferInsert> = {
    ...data,
    updatedAt: new Date().toISOString(),
  };
  if ("reimbursementStatus" in data) {
    updateData.reimbursementStatus = data.reimbursementStatus ?? null;
  }
  if ("reimbursementParty" in data) {
    updateData.reimbursementParty = data.reimbursementParty || null;
  }
  if (data.isAmortized === false) {
    updateData.amortizationMonths = 1;
  } else if (data.isAmortized === true && !data.amortizationMonths) {
    updateData.amortizationMonths = existing.amortizationMonths || 1;
  }

  await db.update(bills).set(updateData).where(eq(bills.id, id));
  return findById(id);
}

export async function remove(id: string): Promise<boolean> {
  await ensureBootstrap();
  const db = await getDb();
  const result = await db.delete(bills).where(eq(bills.id, id));
  return result.rowsAffected > 0;
}

export async function getCategories(): Promise<string[]> {
  await ensureBootstrap();
  const db = await getDb();
  const rows = await db
    .select({ name: tags.name })
    .from(tags)
    .orderBy(tags.sortOrder, tags.name);
  return rows.map(row => row.name);
}

export async function getSources(): Promise<string[]> {
  await ensureBootstrap();
  const db = await getDb();
  const rows = await db.selectDistinct({ source: bills.source }).from(bills);
  return rows.map(row => row.source).filter(Boolean);
}
