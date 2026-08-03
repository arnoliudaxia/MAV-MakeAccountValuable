import { z } from "zod";

export const ReimbursementStatus = z.enum(["pending", "approved", "rejected"]);

export const BillSchema = z.object({
  id: z.string(),
  date: z.string(),
  category: z.string(),
  name: z.string(),
  source: z.string(),
  amount: z.number(),
  isAmortized: z.boolean(),
  amortizationMonths: z.number().int().min(1),
  monthlyAmount: z.number().optional(),
  amortizationMonthIndex: z.number().int().min(1).optional(),
  reimbursementStatus: ReimbursementStatus.optional(),
  reimbursementParty: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const CreateBillInput = z
  .object({
    date: z.string(),
    category: z.string().min(1, "分类不能为空"),
    name: z.string().min(1, "名称不能为空"),
    source: z.string().trim(),
    amount: z.number().min(0, "金额不能为负数"),
    isAmortized: z.boolean().optional(),
    amortizationMonths: z
      .number()
      .int("摊销时长必须是整数")
      .min(1, "摊销时长至少为 1 个月")
      .max(360, "摊销时长不能超过 360 个月")
      .optional(),
    reimbursementStatus: ReimbursementStatus.optional(),
    reimbursementParty: z.string().optional(),
  })
  .refine(input => !input.isAmortized || !!input.amortizationMonths, {
    path: ["amortizationMonths"],
    message: "请填写摊销时长",
  });

export const UpdateBillInput = z.object({
  id: z.string(),
  date: z.string().optional(),
  category: z.string().optional(),
  name: z.string().optional(),
  source: z.string().trim().optional(),
  amount: z.number().min(0, "金额不能为负数").optional(),
  isAmortized: z.boolean().optional(),
  amortizationMonths: z
    .number()
    .int("摊销时长必须是整数")
    .min(1, "摊销时长至少为 1 个月")
    .max(360, "摊销时长不能超过 360 个月")
    .optional(),
  reimbursementStatus: ReimbursementStatus.optional(),
  reimbursementParty: z.string().optional(),
});

export const ListBillsInput = z.object({
  year: z.number(),
  month: z.number().min(1).max(12),
  category: z.string().optional(),
  source: z.string().optional(),
  keyword: z.string().optional(),
});

export const RecognizeBillInput = z
  .object({
    text: z.string().max(5000).optional(),
    imageDataUrls: z
      .array(z.string().max(15 * 1024 * 1024))
      .max(10, "一次最多识别 10 张图片")
      .default([]),
    year: z.number(),
    month: z.number().min(1).max(12),
    categories: z.array(z.string()).default([]),
    sources: z.array(z.string()).default([]),
    reimbursementParties: z.array(z.string()).default([]),
  })
  .refine(input => input.text?.trim() || input.imageDataUrls.length > 0, {
    message: "请输入文字或上传图片",
  });

export const RecognizedBillSchema = z.object({
  date: z.string().optional(),
  category: z.string().optional(),
  name: z.string().optional(),
  source: z.string().optional(),
  amount: z.number().optional(),
  isAmortized: z.boolean().optional(),
  amortizationMonths: z.number().int().min(1).max(360).optional(),
  reimbursementStatus: ReimbursementStatus.optional(),
  reimbursementParty: z.string().optional(),
});

export const RecognizedBillsSchema = z.object({
  bills: z.array(RecognizedBillSchema).min(1).max(50),
});

export type Bill = z.infer<typeof BillSchema>;
export type CreateBillInput = z.infer<typeof CreateBillInput>;
export type UpdateBillInput = z.infer<typeof UpdateBillInput>;
export type ListBillsInput = z.infer<typeof ListBillsInput>;
export type RecognizeBillInput = z.infer<typeof RecognizeBillInput>;
export type RecognizedBill = z.infer<typeof RecognizedBillSchema>;
export type RecognizedBills = z.infer<typeof RecognizedBillsSchema>;
export type ReimbursementStatus = z.infer<typeof ReimbursementStatus>;
