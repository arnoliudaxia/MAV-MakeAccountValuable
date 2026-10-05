import { z } from "zod";

export const DEFAULT_BILL_RECOGNITION_PROMPT = `请从用户提供的账单文字或图片中识别账单信息。
只返回一个合法 JSON 对象，不要 markdown，不要解释。
返回格式必须是 {"bills":[...]}。即使只识别到一笔账单，也必须放在 bills 数组里；如果有多笔交易，每笔交易一个对象。
根据名称语义匹配分类，不要盲信用户的输入。
字段含义：date 为 YYYY-MM-DD；category 为分类；name 为账单名称或商户/事项；source 为支付渠道或来源；amount 为支出金额，使用正数；isAmortized 表示是否摊销；amortizationMonths 为摊销月数；reimbursementStatus 只能是 pending、approved、rejected 之一；无报销信息时不要填 reimbursementStatus 和 reimbursementParty。
不要输出 null。金额即使原图是负数，也必须转换为正数。无报销信息或不可报销时，不要输出 reimbursementStatus 和 reimbursementParty。
如果无法确定某个字段，就省略该字段，不要编造。不能确定已有分类时，category 使用“杂项”。
单笔账单对象的字段只能包含 date、category、name、source、amount、isAmortized、amortizationMonths、reimbursementStatus、reimbursementParty。`;
export const BILL_RECOGNITION_OUTPUT_FORMAT_PROMPT =
  '输出格式必须是一个 JSON 对象：{"bills":[{"date":"2026-06-22","category":"三餐","name":"午餐","source":"支付宝","amount":36.5,"isAmortized":false,"amortizationMonths":1,"reimbursementStatus":"pending","reimbursementParty":"公司"}]}。bills 必须是数组；每个账单对象只能包含 date、category、name、source、amount、isAmortized、amortizationMonths、reimbursementStatus、reimbursementParty；无法确定的可选字段省略。不要输出 JSON 以外的内容。';

export const DEFAULT_BILL_CATEGORY_MATCHING_PROMPT = `你正在校准账单识别结果的分类。
只返回合法 JSON 对象，不要 markdown，不要解释。
返回格式为 {"matches":[{"index":0,"category":"分类名"}]}。matches 可以只包含需要修正分类的账单。
只有当数据库候选条目和识别出的账单明显是同一商户、同一商品、同一服务或高度相似事项时，才使用候选条目的分类；不确定时不要修改。`;
export const DEFAULT_TAG_INFERENCE_PROMPT = `你正在为账单分类管理应用推荐新分类的父分类、图标和颜色。
只返回一个合法 JSON 对象，不要 markdown，不要解释。
输出字段只能包含 parentId、icon、color。`;

export const AiSettingsSchema = z.object({
  apiKey: z.string().default(""),
  baseUrl: z.string().default("https://api.openai.com/v1"),
  model: z.string().default("gpt-5.5"),
  enableBillCategoryMatching: z.boolean().default(false),
  billRecognitionPrompt: z.string().default(DEFAULT_BILL_RECOGNITION_PROMPT),
  billCategoryMatchingPrompt: z
    .string()
    .default(DEFAULT_BILL_CATEGORY_MATCHING_PROMPT),
  tagInferencePrompt: z.string().default(DEFAULT_TAG_INFERENCE_PROMPT),
});

export const AppSettingsSchema = z.object({
  reimbursementParties: z.array(z.string().min(1)).default([]),
  ai: AiSettingsSchema.default({
    apiKey: "",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5.5",
    enableBillCategoryMatching: false,
    billRecognitionPrompt: DEFAULT_BILL_RECOGNITION_PROMPT,
    billCategoryMatchingPrompt: DEFAULT_BILL_CATEGORY_MATCHING_PROMPT,
    tagInferencePrompt: DEFAULT_TAG_INFERENCE_PROMPT,
  }),
});

export const UpdateSettingsInput = z.object({
  reimbursementParties: z.array(z.string().min(1)).optional(),
  ai: AiSettingsSchema.partial().optional(),
});

export type AppSettings = z.infer<typeof AppSettingsSchema>;
export type AiSettings = z.infer<typeof AiSettingsSchema>;
export type UpdateSettingsInput = z.infer<typeof UpdateSettingsInput>;
