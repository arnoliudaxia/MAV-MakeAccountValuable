import { z } from "zod";
import { createRouter, publicQuery } from "../middleware";
import * as store from "./store";
import { getAiClient } from "../lib/ai";
import { getSettings } from "../settings/store";
import {
  CreateBillInput,
  RecognizedBillsSchema,
  RecognizeBillInput,
  UpdateBillInput,
  ListBillsInput,
  type Bill,
  type RecognizedBills,
} from "../../contracts/bill";

const CategoryMatchResponseSchema = z.object({
  matches: z
    .array(
      z.object({
        index: z.number().int().min(0),
        category: z.string().min(1),
      })
    )
    .default([]),
});

type BillMatchCandidate = {
  name: string;
  category: string;
  source: string;
  amount: number;
  date: string;
  score: number;
};

function parseJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(withoutFence);
  } catch {
    const start = withoutFence.indexOf("{");
    const end = withoutFence.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      throw new Error("No JSON object found");
    }
    return JSON.parse(withoutFence.slice(start, end + 1));
  }
}

function normalizeRecognizedBill(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const input = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  const stringFields = [
    "date",
    "category",
    "name",
    "source",
    "reimbursementParty",
  ] as const;

  for (const field of stringFields) {
    const raw = input[field];
    if (typeof raw === "string" && raw.trim()) {
      output[field] = raw.trim();
    }
  }

  if (typeof input.amount === "number" && Number.isFinite(input.amount)) {
    output.amount = Math.abs(input.amount);
  } else if (typeof input.amount === "string") {
    const amount = Number.parseFloat(input.amount.replace(/[^\d.-]/g, ""));
    if (Number.isFinite(amount)) {
      output.amount = Math.abs(amount);
    }
  }

  if (
    input.reimbursementStatus === "pending" ||
    input.reimbursementStatus === "approved" ||
    input.reimbursementStatus === "rejected"
  ) {
    output.reimbursementStatus = input.reimbursementStatus;
  }

  if (typeof input.isAmortized === "boolean") {
    output.isAmortized = input.isAmortized;
  }

  if (
    typeof input.amortizationMonths === "number" &&
    Number.isInteger(input.amortizationMonths)
  ) {
    output.amortizationMonths = input.amortizationMonths;
  } else if (typeof input.amortizationMonths === "string") {
    const months = Number.parseInt(input.amortizationMonths, 10);
    if (Number.isInteger(months)) {
      output.amortizationMonths = months;
    }
  }

  return output;
}

function normalizeRecognizedBills(value: unknown): unknown {
  if (Array.isArray(value)) {
    return { bills: value.map(normalizeRecognizedBill) };
  }

  if (value && typeof value === "object") {
    const input = value as Record<string, unknown>;
    if (Array.isArray(input.bills)) {
      return { bills: input.bills.map(normalizeRecognizedBill) };
    }
  }

  return { bills: [normalizeRecognizedBill(value)] };
}

function normalizeSearchText(value: string) {
  return Array.from(value.toLowerCase())
    .filter(char => /[\p{L}\p{N}]/u.test(char))
    .join("");
}

function levenshteinDistance(a: string, b: string) {
  const left = Array.from(a);
  const right = Array.from(b);
  const previous = Array.from(
    { length: right.length + 1 },
    (_, index) => index
  );
  const current = Array.from({ length: right.length + 1 }, () => 0);

  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1)
      );
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length];
}

function getNameSimilarityScore(query: string, candidate: string) {
  const normalizedQuery = normalizeSearchText(query);
  const normalizedCandidate = normalizeSearchText(candidate);
  if (!normalizedQuery || !normalizedCandidate) return 0;

  if (normalizedQuery === normalizedCandidate) return 1;

  const shorter =
    normalizedQuery.length < normalizedCandidate.length
      ? normalizedQuery
      : normalizedCandidate;
  const longer =
    normalizedQuery.length >= normalizedCandidate.length
      ? normalizedQuery
      : normalizedCandidate;

  const includeScore = longer.includes(shorter)
    ? Math.max(0.65, shorter.length / longer.length)
    : 0;
  const queryChars = new Set(Array.from(normalizedQuery));
  const candidateChars = new Set(Array.from(normalizedCandidate));
  const overlap = Array.from(queryChars).filter(char =>
    candidateChars.has(char)
  ).length;
  const overlapScore = overlap / Math.max(queryChars.size, candidateChars.size);
  const editDistance = levenshteinDistance(
    normalizedQuery,
    normalizedCandidate
  );
  const editScore =
    1 -
    editDistance / Math.max(normalizedQuery.length, normalizedCandidate.length);

  return Math.max(includeScore, overlapScore * 0.85, editScore);
}

function findSimilarBills(
  name: string | undefined,
  existingBills: Bill[]
): BillMatchCandidate[] {
  if (!name?.trim()) return [];

  return existingBills
    .map(bill => ({
      bill,
      score: getNameSimilarityScore(name, bill.name),
    }))
    .filter(item => item.score >= 0.35)
    .sort((a, b) => {
      const scoreDiff = b.score - a.score;
      if (scoreDiff !== 0) return scoreDiff;
      return new Date(b.bill.date).getTime() - new Date(a.bill.date).getTime();
    })
    .slice(0, 3)
    .map(({ bill, score }) => ({
      name: bill.name,
      category: bill.category,
      source: bill.source,
      amount: bill.amount,
      date: bill.date,
      score: Number(score.toFixed(3)),
    }));
}

async function refineRecognizedBillCategories(
  recognized: RecognizedBills,
  categories: string[],
  ai: Awaited<ReturnType<typeof getAiClient>>
): Promise<RecognizedBills> {
  const existingBills = await store.findAll();
  if (existingBills.length === 0 || recognized.bills.length === 0) {
    return recognized;
  }

  const candidateGroups = recognized.bills
    .map((bill, index) => ({
      index,
      recognized: {
        name: bill.name,
        category: bill.category,
        source: bill.source,
        amount: bill.amount,
      },
      candidates: findSimilarBills(bill.name, existingBills),
    }))
    .filter(group => group.candidates.length > 0);

  if (candidateGroups.length === 0) return recognized;

  try {
    const response = await ai.client.chat.completions.create({
      model: ai.model,
      messages: [
        {
          role: "user",
          content: [
            "你正在校准账单识别结果的分类。",
            "只返回合法 JSON 对象，不要 markdown，不要解释。",
            '返回格式为 {"matches":[{"index":0,"category":"分类名"}]}。matches 可以只包含需要修正分类的账单。',
            categories.length
              ? `可用分类：${categories.join("、")}。category 必须从这些分类中选择。`
              : "如果没有可用分类，不要返回任何 matches。",
            "规则：只有当数据库候选条目和识别出的账单明显是同一商户、同一商品、同一服务或高度相似事项时，才使用候选条目的分类；不确定时不要修改。",
            `识别结果与数据库候选 JSON：${JSON.stringify(candidateGroups)}`,
          ].join("\n"),
        },
      ],
    });

    const outputText = response.choices[0]?.message?.content;
    if (!outputText) return recognized;

    const parsed = CategoryMatchResponseSchema.parse(
      parseJsonObject(outputText)
    );
    const allowedCategories = new Set(categories);
    const nextBills = recognized.bills.map(bill => ({ ...bill }));

    for (const match of parsed.matches) {
      if (!nextBills[match.index]) continue;
      if (
        allowedCategories.size > 0 &&
        !allowedCategories.has(match.category)
      ) {
        continue;
      }
      nextBills[match.index].category = match.category;
    }

    return { bills: nextBills };
  } catch (error) {
    console.error("Failed to refine bill categories", error);
    return recognized;
  }
}

export const billRouter = createRouter({
  list: publicQuery.input(ListBillsInput).query(async ({ input }) => {
    const bills = await store.findByMonth(input.year, input.month);

    let filtered = bills;
    if (input.category) {
      filtered = filtered.filter(b => b.category === input.category);
    }
    if (input.source) {
      filtered = filtered.filter(b => b.source === input.source);
    }
    if (input.keyword) {
      const kw = input.keyword.toLowerCase();
      filtered = filtered.filter(
        b =>
          b.name.toLowerCase().includes(kw) ||
          b.category.toLowerCase().includes(kw) ||
          b.source.toLowerCase().includes(kw)
      );
    }

    return filtered.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }),

  reimbursements: publicQuery.query(async () => {
    const bills = await store.findAll();
    return bills
      .filter(bill => !!bill.reimbursementStatus)
      .sort((a, b) => {
        const dateDiff =
          new Date(a.date).getTime() - new Date(b.date).getTime();
        if (dateDiff !== 0) return dateDiff;
        return (
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
      });
  }),

  getById: publicQuery
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return store.findById(input.id);
    }),

  create: publicQuery.input(CreateBillInput).mutation(async ({ input }) => {
    const now = new Date().toISOString();
    const isAmortized = !!input.isAmortized;
    const bill: Bill = {
      ...input,
      isAmortized,
      amortizationMonths: isAmortized ? input.amortizationMonths || 1 : 1,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    return store.create(bill);
  }),

  recognize: publicQuery
    .input(RecognizeBillInput)
    .mutation(async ({ input }) => {
      const content: Array<
        | { type: "text"; text: string }
        | { type: "image_url"; image_url: { url: string; detail: "auto" } }
      > = [
        {
          type: "text",
          text: [
            "请从用户提供的账单文字或图片中识别账单信息。",
            "只返回一个合法 JSON 对象，不要 markdown，不要解释。",
            '返回格式必须是 {"bills":[...]}。即使只识别到一笔账单，也必须放在 bills 数组里；如果有多笔交易，每笔交易一个对象。',
            `当前表单年月是 ${input.year}-${String(input.month).padStart(2, "0")}。`,
            input.categories.length
              ? `已有分类：${input.categories.join("、")}。category 必须从这些已有分类中选择，优先使用最具体的匹配分类；无法命中时使用“杂项”。`
              : "暂无已有分类，category 使用“杂项”。",
            "根据名称语义匹配分类，不要盲信用户的输入。",
            input.sources.length
              ? `已有来源：${input.sources.join("、")}。优先复用最匹配的已有来源。`
              : "暂无已有来源，请识别付款来源或商户来源。",
            input.reimbursementParties.length
              ? `可选报销方：${input.reimbursementParties.join("、")}。如果能确定报销方，必须优先从这些选项中选择。`
              : "暂无可选报销方配置。除非账单中明确写出报销方，否则不要填写 reimbursementParty。",
            "字段含义：date 为 YYYY-MM-DD；category 为分类；name 为账单名称或商户/事项；source 为支付渠道或来源；amount 为支出金额，使用正数；isAmortized 表示是否摊销；amortizationMonths 为摊销月数；reimbursementStatus 只能是 pending、approved、rejected 之一；无报销信息时不要填 reimbursementStatus 和 reimbursementParty。",
            "不要输出 null。金额即使原图是负数，也必须转换为正数。无报销信息或不可报销时，不要输出 reimbursementStatus 和 reimbursementParty。",
            "如果无法确定某个字段，就省略该字段，不要编造。不能确定已有分类时，category 使用“杂项”。单笔账单对象的字段只能包含 date、category、name、source、amount、isAmortized、amortizationMonths、reimbursementStatus、reimbursementParty。",
            input.text?.trim() ? `用户文字：${input.text.trim()}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ];

      for (const imageDataUrl of input.imageDataUrls) {
        content.push({
          type: "image_url",
          image_url: {
            url: imageDataUrl,
            detail: "auto",
          },
        });
      }

      const ai = await getAiClient();
      const response = await ai.client.chat.completions.create({
        model: ai.model,
        messages: [{ role: "user", content }],
      });

      const outputText = response.choices[0]?.message?.content;
      if (!outputText) {
        throw new Error("AI 未返回识别结果，请重试");
      }

      try {
        const parsed = normalizeRecognizedBills(parseJsonObject(outputText));
        const recognized = RecognizedBillsSchema.parse(parsed);
        const settings = await getSettings();

        if (!settings.ai.enableBillCategoryMatching) {
          return recognized;
        }

        return refineRecognizedBillCategories(recognized, input.categories, ai);
      } catch (error) {
        console.error(
          "Failed to parse bill recognition response",
          error,
          outputText
        );
        throw new Error("AI 识别结果格式不正确，请调整输入后重试");
      }
    }),

  update: publicQuery.input(UpdateBillInput).mutation(async ({ input }) => {
    const { id, ...data } = input;
    const result = await store.update(id, data);
    if (!result) {
      throw new Error("账单不存在");
    }
    return result;
  }),

  delete: publicQuery
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const success = await store.remove(input.id);
      if (!success) {
        throw new Error("账单不存在");
      }
      return { success: true };
    }),

  stats: publicQuery.input(ListBillsInput).query(async ({ input }) => {
    const bills = await store.findByMonth(input.year, input.month);

    const getAccountingAmount = (bill: Bill) =>
      bill.monthlyAmount ?? bill.amount;
    const isReimbursableBill = (bill: Bill) =>
      bill.reimbursementStatus === "pending" ||
      bill.reimbursementStatus === "approved";
    const totalExpense = bills.reduce(
      (sum, b) => sum + getAccountingAmount(b),
      0
    );
    const totalReimbursable = bills
      .filter(isReimbursableBill)
      .reduce((sum, b) => sum + getAccountingAmount(b), 0);
    const totalReimbursed = bills
      .filter(b => b.reimbursementStatus === "approved")
      .reduce((sum, b) => sum + getAccountingAmount(b), 0);

    const byCategory: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    for (const b of bills) {
      const accountingAmount = getAccountingAmount(b);
      if (!isReimbursableBill(b)) {
        byCategory[b.category] =
          (byCategory[b.category] || 0) + accountingAmount;
      }
      bySource[b.source] = (bySource[b.source] || 0) + accountingAmount;
    }

    return {
      totalCount: bills.length,
      totalExpense,
      totalReimbursable,
      totalReimbursed,
      byCategory,
      bySource,
    };
  }),

  filters: publicQuery.query(async () => {
    const [categories, sources] = await Promise.all([
      store.getCategories(),
      store.getSources(),
    ]);
    return { categories, sources };
  }),
});
