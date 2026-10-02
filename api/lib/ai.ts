import OpenAI from "openai";
import { getSettings } from "../settings/store";
import type { AiSettings } from "../../contracts/settings";

type AiRuntimeConfig = Pick<AiSettings, "apiKey" | "baseUrl" | "model">;

function createClient(config: AiRuntimeConfig) {
  // The OpenAI SDK reads several process.env values when constructing a client,
  // including custom headers. Clear those values for the synchronous
  // constructor call so database settings are the only AI configuration source.
  const envKeys = [
    "OPENAI_API_KEY",
    "OPENAI_ADMIN_KEY",
    "OPENAI_BASE_URL",
    "OPENAI_ORG_ID",
    "OPENAI_PROJECT_ID",
    "OPENAI_WEBHOOK_SECRET",
    "OPENAI_CUSTOM_HEADERS",
  ];
  const previousValues = new Map(envKeys.map(key => [key, process.env[key]]));

  for (const key of envKeys) delete process.env[key];

  try {
    return new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      adminAPIKey: null,
      organization: null,
      project: null,
      webhookSecret: null,
    });
  } finally {
    for (const [key, value] of previousValues) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function getDatabaseAiConfig(): Promise<AiRuntimeConfig> {
  const settings = await getSettings();
  const config: AiRuntimeConfig = {
    ...settings.ai,
    apiKey: settings.ai.apiKey.trim(),
    baseUrl: settings.ai.baseUrl.trim(),
    model: settings.ai.model.trim(),
  };

  if (!config.apiKey) {
    throw new Error("请先在设置页面填写并保存 AI API Key");
  }

  return config;
}

export async function getAiClient() {
  const databaseConfig = await getDatabaseAiConfig();
  return {
    client: createClient(databaseConfig),
    model: databaseConfig.model,
  };
}
