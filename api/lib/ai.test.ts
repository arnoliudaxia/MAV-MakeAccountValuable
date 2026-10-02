import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSettings } = vi.hoisted(() => ({
  getSettings: vi.fn(),
}));

vi.mock("../settings/store", () => ({
  getSettings,
}));

import { getAiClient } from "./ai";

describe("getAiClient", () => {
  beforeEach(() => {
    getSettings.mockReset();
  });

  it("uses the latest database AI settings for each client lookup", async () => {
    getSettings.mockResolvedValue({
      reimbursementParties: [],
      ai: {
        apiKey: "database-key",
        baseUrl: "https://example.test/v1",
        model: "database-model",
        enableBillCategoryMatching: false,
      },
    });

    const first = await getAiClient();

    getSettings.mockResolvedValue({
      reimbursementParties: [],
      ai: {
        apiKey: "database-key-2",
        baseUrl: "https://example.test/v2",
        model: "database-model-2",
        enableBillCategoryMatching: false,
      },
    });

    const second = await getAiClient();

    expect(first.model).toBe("database-model");
    expect(second.model).toBe("database-model-2");
    expect(first.client).not.toBe(second.client);
  });
});

describe("database-only configuration", () => {
  it("ignores environment credentials and rejects an empty database key", async () => {
    vi.stubEnv("OPENAI_API_KEY", "environment-key");
    vi.stubEnv("OPENAI_MODEL", "environment-model");
    vi.stubEnv("OPENAI_BASE_URL", "https://environment.test/v1");
    vi.stubEnv("OPENAI_ORG_ID", "environment-org");
    vi.stubEnv("OPENAI_PROJECT_ID", "environment-project");
    vi.stubEnv(
      "OPENAI_CUSTOM_HEADERS",
      "Authorization: Bearer environment-header\nOpenAI-Organization: environment-header-org\nOpenAI-Project: environment-header-project"
    );
    try {
      getSettings.mockResolvedValue({
        ai: {
          apiKey: " ",
          baseUrl: "https://database.test/v1",
          model: "db-model",
        },
      });
      await expect(getAiClient()).rejects.toThrow(
        "请先在设置页面填写并保存 AI API Key"
      );
      getSettings.mockResolvedValue({
        ai: {
          apiKey: "db-key",
          baseUrl: "https://database.test/v1",
          model: "db-model",
        },
      });
      let requestUrl = "";
      let requestHeaders: Headers | undefined;
      const fetchMock: typeof fetch = async (input, init) => {
        requestUrl = String(input);
        requestHeaders = new Headers(init?.headers);
        return new Response(
          JSON.stringify({ choices: [{ message: { content: "ok" } }] }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      };
      vi.stubGlobal("fetch", fetchMock);

      const ai = await getAiClient();
      expect(ai.model).toBe("db-model");
      expect(
        (ai.client as unknown as { _options: Record<string, unknown> })._options
      ).toMatchObject({
        apiKey: "db-key",
        baseURL: "https://database.test/v1",
        organization: null,
        project: null,
      });
      expect(
        (ai.client as unknown as { _options: Record<string, unknown> })._options
          .defaultHeaders
      ).toBeUndefined();
      await ai.client.chat.completions.create({
        model: ai.model,
        messages: [],
      });
      expect(requestUrl).toBe("https://database.test/v1/chat/completions");
      expect(requestHeaders?.get("authorization")).toBe("Bearer db-key");
      expect(requestHeaders?.get("openai-organization")).toBeNull();
      expect(requestHeaders?.get("openai-project")).toBeNull();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
