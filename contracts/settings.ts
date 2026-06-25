import { z } from "zod";

export const AiSettingsSchema = z.object({
  apiKey: z.string().default(""),
  baseUrl: z.string().default("https://api.openai.com/v1"),
  model: z.string().default("gpt-5.5"),
  enableBillCategoryMatching: z.boolean().default(false),
});

export const AppSettingsSchema = z.object({
  reimbursementParties: z.array(z.string().min(1)).default([]),
  ai: AiSettingsSchema.default({
    apiKey: "",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5.5",
    enableBillCategoryMatching: false,
  }),
});

export const UpdateSettingsInput = z.object({
  reimbursementParties: z.array(z.string().min(1)).optional(),
  ai: AiSettingsSchema.partial().optional(),
});

export type AppSettings = z.infer<typeof AppSettingsSchema>;
export type AiSettings = z.infer<typeof AiSettingsSchema>;
export type UpdateSettingsInput = z.infer<typeof UpdateSettingsInput>;
