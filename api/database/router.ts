import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import { getSqlClient } from "../queries/connection";

const tableConfig = {
  bills: {
    label: "账单",
    primaryKey: "id",
    orderBy: "date DESC, created_at DESC",
    columns: [
      "id",
      "date",
      "category",
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
const jsonRecordSchema = z.record(z.string(), z.unknown());

function getConfig(table: TableName) {
  return tableConfig[table];
}

function normalizeValue(value: unknown) {
  if (value === undefined) return undefined;
  return value as string | number | boolean | null;
}

export const databaseRouter = createRouter({
  overview: publicQuery.query(async () => {
    const client = await getSqlClient();
    const result = await client.execute(
      "SELECT COUNT(*) AS bill_count, COALESCE(SUM(amount), 0) AS total_amount FROM bills"
    );
    const row = result.rows[0];

    return {
      billCount: Number(row?.bill_count ?? 0),
      totalAmount: Number(row?.total_amount ?? 0),
    };
  }),

  tables: publicQuery.query(() => {
    return Object.entries(tableConfig).map(([name, config]) => ({
      name,
      label: config.label,
      primaryKey: config.primaryKey,
      columns: config.columns,
      editableColumns: config.columns.filter(
        column => column !== config.primaryKey
      ),
    }));
  }),

  rows: publicQuery
    .input(z.object({ table: tableNameSchema }))
    .query(async ({ input }) => {
      const client = await getSqlClient();
      const config = getConfig(input.table);
      const result = await client.execute(
        `SELECT ${config.columns.join(", ")} FROM ${input.table} ORDER BY ${config.orderBy}`
      );
      return result.rows.map(row => ({ ...row }));
    }),

  updateRow: publicQuery
    .input(
      z.object({
        table: tableNameSchema,
        id: z.string().min(1),
        values: jsonRecordSchema,
      })
    )
    .mutation(async ({ input }) => {
      const client = await getSqlClient();
      const config = getConfig(input.table);
      const primaryKey = config.primaryKey;
      const editableColumns = new Set<string>(
        config.columns.filter(column => column !== primaryKey)
      );
      const entries = Object.entries(input.values)
        .filter(([column]) => editableColumns.has(column))
        .map(([column, value]) => [column, normalizeValue(value)] as const)
        .filter(
          (
            entry
          ): entry is readonly [string, string | number | boolean | null] =>
            entry[1] !== undefined
        );

      if (entries.length === 0) {
        throw new Error("没有可保存的字段");
      }

      let oldTagName: string | undefined;
      if (input.table === "tags" && input.values.name) {
        const existing = await client.execute({
          sql: "SELECT name FROM tags WHERE id = ?",
          args: [input.id],
        });
        oldTagName = existing.rows[0]?.name as string | undefined;
      }

      const setClause = entries.map(([column]) => `${column} = ?`).join(", ");
      const args = [...entries.map(([, value]) => value), input.id];
      const result = await client.execute({
        sql: `UPDATE ${input.table} SET ${setClause} WHERE ${primaryKey} = ?`,
        args,
      });

      const newTagName =
        input.table === "tags" && typeof input.values.name === "string"
          ? input.values.name.trim()
          : "";
      if (oldTagName && newTagName && newTagName !== oldTagName) {
        await client.execute({
          sql: "UPDATE bills SET category = ? WHERE category = ?",
          args: [newTagName, oldTagName],
        });
      }

      return { rowsAffected: result.rowsAffected };
    }),
});
