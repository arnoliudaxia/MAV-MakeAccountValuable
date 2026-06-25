import OpenAI from "openai";
import { env } from "./env";
import { getSettings } from "../settings/store";
import type { AiSettings } from "../../contracts/settings";

type AiRuntimeConfig = Pick<AiSettings, "apiKey" | "baseUrl" | "model"> & {
  source: "env" | "database";
};

let validatedEnvSignature = "";

function getEnvAiConfig(): AiRuntimeConfig | null {
  if (!env.openaiApiKey.trim()) return null;
  return {
    apiKey: env.openaiApiKey.trim(),
    baseUrl: env.openaiBaseUrl.trim(),
    model: env.openaiModel.trim(),
    source: "env",
  };
}

function createClient(config: AiRuntimeConfig) {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
  });
}

function getConfigSignature(config: AiRuntimeConfig) {
  return `${config.baseUrl}\n${config.model}\n${config.apiKey}`;
}

function getHttpStatus(error: unknown) {
  if (!error || typeof error !== "object") return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

async function testAiConfig(config: AiRuntimeConfig) {
  const signature = getConfigSignature(config);
  if (config.source === "env" && validatedEnvSignature === signature) return;

  const client = createClient(config);
  try {
    await client.chat.completions.create({
      model: config.model,
      messages: [
        {
          role: "user",
          content: "测试指令：请只回复 OK。",
        },
      ],
    });
    if (config.source === "env") {
      validatedEnvSignature = signature;
    }
  } catch (error) {
    const status = getHttpStatus(error);
    if (status) {
      throw new Error(`HTTP ${status}`);
    }
    throw error;
  }
}

async function getDatabaseAiConfig(): Promise<AiRuntimeConfig> {
  const settings = await getSettings();
  const config: AiRuntimeConfig = {
    ...settings.ai,
    apiKey: settings.ai.apiKey.trim(),
    baseUrl: settings.ai.baseUrl.trim(),
    model: settings.ai.model.trim(),
    source: "database",
  };

  if (!config.apiKey) {
    throw new Error(
      "ENV AI 配置测试失败，且数据库 AI 配置尚未填写；已在设置中创建默认 AI 配置，请补充 API Key"
    );
  }

  return config;
}

export async function getAiClient() {
  const envConfig = getEnvAiConfig();
  if (envConfig) {
    try {
      await testAiConfig(envConfig);
      return {
        client: createClient(envConfig),
        model: envConfig.model,
        source: envConfig.source,
      };
    } catch (error) {
      console.warn(
        `ENV AI 配置测试失败，尝试读取数据库 AI 配置：${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  const databaseConfig = await getDatabaseAiConfig();
  return {
    client: createClient(databaseConfig),
    model: databaseConfig.model,
    source: databaseConfig.source,
  };
}
