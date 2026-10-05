import { z } from "zod";
import { createRouter, protectedQuery } from "../middleware";
import { getSqlClient } from "../queries/connection";

const tableConfig = {
  bills: {
    label: "账单",
    primaryKey: "id",
    orderBy: "date DESC, created_at DESC",
    columns: [
      "id",
      "date",
      "category_id",
      "name",
      "source",
      "amount",
      "is_amortized",
      "amortization_months",
      "reimbursement_status",
      "reimbursement_party",
      "created_at",
      "updated_at",
    ],
  },
  tags: {
    label: "分类",
    primaryKey: "id",
    orderBy: "sort_order ASC, name ASC",
    columns: [
      "id",
      "name",
      "color",
      "parent_id",
      "icon",
      "sort_order",
      "created_at",
    ],
  },
  settings: {
    label: "设置",
    primaryKey: "key",
    orderBy: "key ASC",
    columns: ["key", "value", "updated_at"],
  },
} as const;

type TableName = keyof typeof tableConfig;

const tableNameSchema = z.enum(["bills", "tags", "settings"]);
function getConfig(table: TableName) {
  return tableConfig[table];
}

export const databaseRouter = createRouter({
  overview: protectedQuery.query(async () => {
    const client = await getSqlClient();
    const result = await client.execute(
      "SELECT COUNT(*) AS bill_count, COALESCE(SUM(amount), 0) AS total_amount FROM bills"
    );
    const row = result.rows[0];

    return {
      billCount: Number(row?.bill_count ?? 0),
      totalAmount: Number(row?.total_amount ?? 0) / 100,
    };
  }),

  tables: protectedQuery.query(() => {
    return Object.entries(tableConfig).map(([name, config]) => ({
      name,
      label: config.label,
      primaryKey: config.primaryKey,
      columns: config.columns,
    }));
  }),

  rows: protectedQuery
    .input(
      z.object({
        table: tableNameSchema,
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(50),
      })
    )
    .query(async ({ input }) => {
      const client = await getSqlClient();
      const config = getConfig(input.table);
      const countResult = await client.execute(
        `SELECT COUNT(*) AS total_count FROM ${input.table}`
      );
      const totalCount = Number(countResult.rows[0]?.total_count ?? 0);
      const offset = (input.page - 1) * input.pageSize;
      const result = await client.execute({
        sql: `SELECT ${config.columns.join(", ")} FROM ${input.table} ORDER BY ${config.orderBy} LIMIT ? OFFSET ?`,
        args: [input.pageSize, offset],
      });
      return {
        rows: result.rows.map(row => ({ ...row })),
        totalCount,
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

});
