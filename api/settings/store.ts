import { eq } from "drizzle-orm";
import {
  AppSettingsSchema,
  type AppSettings,
  type UpdateSettingsInput,
  DEFAULT_BILL_RECOGNITION_PROMPT,
  DEFAULT_BILL_CATEGORY_MATCHING_PROMPT,
  DEFAULT_TAG_INFERENCE_PROMPT,
} from "../../contracts/settings";
import { settings } from "../../db/schema";
import { getDb } from "../queries/connection";

const SETTINGS_KEY = "app";
const DEFAULT_SETTINGS: AppSettings = {
  reimbursementParties: ["公司"],
  ai: {
    apiKey: "",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5.5",
    enableBillCategoryMatching: false,
    billRecognitionPrompt: DEFAULT_BILL_RECOGNITION_PROMPT,
    billCategoryMatchingPrompt: DEFAULT_BILL_CATEGORY_MATCHING_PROMPT,
    tagInferencePrompt: DEFAULT_TAG_INFERENCE_PROMPT,
  },
};

function normalizeList(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }

  return result;
}

function normalizeSettings(value: AppSettings): AppSettings {
  return {
    reimbursementParties: normalizeList(value.reimbursementParties),
    ai: {
      apiKey: value.ai.apiKey.trim(),
      baseUrl: value.ai.baseUrl.trim() || DEFAULT_SETTINGS.ai.baseUrl,
      model: value.ai.model.trim() || DEFAULT_SETTINGS.ai.model,
      enableBillCategoryMatching: !!value.ai.enableBillCategoryMatching,
      billRecognitionPrompt:
        value.ai.billRecognitionPrompt.trim() ||
        DEFAULT_SETTINGS.ai.billRecognitionPrompt,
      billCategoryMatchingPrompt:
        value.ai.billCategoryMatchingPrompt.trim() ||
        DEFAULT_SETTINGS.ai.billCategoryMatchingPrompt,
      tagInferencePrompt:
        value.ai.tagInferencePrompt.trim() || DEFAULT_SETTINGS.ai.tagInferencePrompt,
    },
  };
}

async function writeSettings(input: AppSettings): Promise<AppSettings> {
  const db = await getDb();
  const nextSettings = normalizeSettings(input);
  const now = new Date().toISOString();

  await db
    .insert(settings)
    .values({
      key: SETTINGS_KEY,
      value: JSON.stringify(nextSettings),
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: settings.key,
      set: {
        value: JSON.stringify(nextSettings),
        updatedAt: now,
      },
    });

  return nextSettings;
}

export async function getSettings(): Promise<AppSettings> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, SETTINGS_KEY))
    .limit(1);

  if (!row) return writeSettings(DEFAULT_SETTINGS);

  try {
    return normalizeSettings(
      AppSettingsSchema.parse({
        ...DEFAULT_SETTINGS,
        ...JSON.parse(row.value),
      })
    );
  } catch {
    return writeSettings(DEFAULT_SETTINGS);
  }
}

export async function updateSettings(
  input: UpdateSettingsInput
): Promise<AppSettings> {
  const current = await getSettings();
  return writeSettings({
    ...current,
    ...input,
    ai: {
      ...current.ai,
      ...(input.ai ?? {}),
    },
  });
}
