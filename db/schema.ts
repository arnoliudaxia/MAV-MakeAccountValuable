import {
  index,
  integer,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export const tags = sqliteTable("tags", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  color: text("color").notNull(),
  parentId: text("parent_id"),
  icon: text("icon").notNull().default("Tag"),
  sortOrder: real("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

export const bills = sqliteTable(
  "bills",
  {
    id: text("id").primaryKey(),
    date: text("date").notNull(),
    category: text("category").notNull(),
    name: text("name").notNull(),
    source: text("source").notNull(),
    amount: real("amount").notNull(),
    isAmortized: integer("is_amortized", { mode: "boolean" })
      .notNull()
      .default(false),
    amortizationMonths: integer("amortization_months").notNull().default(1),
    reimbursementStatus: text("reimbursement_status", {
      enum: ["pending", "approved", "rejected"],
    }),
    reimbursementParty: text("reimbursement_party"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  table => [
    index("bills_date_idx").on(table.date),
    index("bills_category_idx").on(table.category),
    index("bills_source_idx").on(table.source),
  ]
);

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});
