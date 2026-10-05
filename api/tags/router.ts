import { z } from "zod";
import { createRouter, protectedQuery } from "../middleware";
import * as store from "./store";
import { getAiClient } from "../lib/ai";
import { getSettings } from "../settings/store";
import {
  CreateTagInput,
  InferTagInput,
  InferredTagSchema,
  MergeTagInput,
  MISC_CATEGORY_NAME,
  TAG_COLORS,
  UpdateTagInput,
} from "../../contracts/tag";

function isSystemTagName(name: string) {
  return name === MISC_CATEGORY_NAME;
}

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

function normalizeInferredTag(value: unknown, input: InferTagInput): unknown {
  const parentIds = new Set(input.parentCategories.map(parent => parent.id));
  const iconOptions = new Set(input.iconOptions);

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      parentId: null,
      icon: input.iconOptions.includes("Tag") ? "Tag" : input.iconOptions[0],
      color: TAG_COLORS[0],
    };
  }

  const raw = value as Record<string, unknown>;
  const parentId =
    typeof raw.parentId === "string" && parentIds.has(raw.parentId)
      ? raw.parentId
      : null;
  const icon =
    typeof raw.icon === "string" && iconOptions.has(raw.icon)
      ? raw.icon
      : input.iconOptions.includes("Tag")
        ? "Tag"
        : input.iconOptions[0];
  const color =
    typeof raw.color === "string" && TAG_COLORS.includes(raw.color)
      ? raw.color
      : TAG_COLORS[0];

  return { parentId, icon: icon || "Tag", color };
}

export const tagRouter = createRouter({
  list: protectedQuery.query(async () => {
    return store.findAll();
  }),

  getById: protectedQuery
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      return store.findById(input.id);
    }),

  create: protectedQuery.input(CreateTagInput).mutation(async ({ input }) => {
    const existing = await store.findByName(input.name);
    if (existing) {
      throw new Error(`分类 "${input.name}" 已存在`);
    }
    const tag = {
      ...input,
      id: crypto.randomUUID(),
      parentId: input.parentId ?? null,
      icon: input.icon || "Tag",
      sortOrder: input.sortOrder ?? Date.now(),
      createdAt: new Date().toISOString(),
    };
    return store.create(tag);
  }),

  infer: protectedQuery.input(InferTagInput).mutation(async ({ input }) => {
    const [ai, settings] = await Promise.all([getAiClient(), getSettings()]);
    const response = await ai.client.chat.completions.create({
      model: ai.model,
      messages: [
        {
          role: "user",
          content: [
            settings.ai.tagInferencePrompt,
            `新分类名称：${input.name}`,
            input.parentCategories.length
              ? `可选父分类 JSON：${JSON.stringify(input.parentCategories)}。parentId 必须从这些 id 中选择；如果应该作为一级分类，返回 null。`
              : "当前没有可选父分类，parentId 必须返回 null。",
            input.iconOptions.length
              ? `可选图标名称：${input.iconOptions.join("、")}。icon 必须从这些名称中选择。`
              : "没有可选图标时，icon 返回 Tag。",
            `可选颜色：${TAG_COLORS.join("、")}。color 必须从这些颜色中选择。`,
            "输出字段只能包含 parentId、icon、color。",
          ].join("\n"),
        },
      ],
    });

    const outputText = response.choices[0]?.message?.content;
    if (!outputText) {
      throw new Error("AI 未返回推断结果，请重试");
    }

    try {
      const parsed = normalizeInferredTag(parseJsonObject(outputText), input);
      return InferredTagSchema.parse(parsed);
    } catch (error) {
      console.error(
        "Failed to parse tag inference response",
        error,
        outputText
      );
      throw new Error("AI 推断结果格式不正确，请重试");
    }
  }),

  update: protectedQuery.input(UpdateTagInput).mutation(async ({ input }) => {
    const { id, ...data } = input;
    const tag = await store.findById(id);
    if (!tag) {
      throw new Error("分类不存在");
    }
    if (isSystemTagName(tag.name)) {
      throw new Error("系统分类“杂项”不能修改");
    }

    if (data.name) {
      const existing = await store.findByName(data.name);
      if (existing && existing.id !== id) {
        throw new Error(`分类 "${data.name}" 已存在`);
      }
    }
    const result = await store.update(id, data);
    if (!result) {
      throw new Error("分类不存在");
    }
    return result;
  }),

  delete: protectedQuery
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const tag = await store.findById(input.id);
      if (!tag) {
        throw new Error("分类不存在");
      }
      if (isSystemTagName(tag.name)) {
        throw new Error("系统分类“杂项”不能删除");
      }
      if (await store.hasChildren(tag.id)) {
        throw new Error(`分类“${tag.name}”仍有子分类，无法删除`);
      }

      const relatedBills = await store.findBillsUsingTag(tag.id);
      if (relatedBills.length > 0) {
        const preview = relatedBills
          .slice(0, 10)
          .map(bill => `${bill.date} ${bill.name} ¥${bill.amount}`)
          .join("、");
        const suffix = relatedBills.length > 10
          ? `；另有 ${relatedBills.length - 10} 笔未列出`
          : "";
        throw new Error(
          `分类“${tag.name}”正在被 ${relatedBills.length} 笔账单使用，无法删除：${preview}${suffix}`
        );
      }
      const success = await store.remove(input.id);
      if (!success) {
        throw new Error("删除失败");
      }
      return { success: true };
    }),

  merge: protectedQuery.input(MergeTagInput).mutation(async ({ input }) => {
    if (input.sourceId === input.targetId) {
      throw new Error("源分类和目标分类不能相同");
    }

    const [source, target] = await Promise.all([
      store.findById(input.sourceId),
      store.findById(input.targetId),
    ]);

    if (!source) {
      throw new Error("源分类不存在");
    }
    if (!target) {
      throw new Error("目标分类不存在");
    }

    if (isSystemTagName(source.name)) {
      throw new Error("系统分类“杂项”不能合并到其他分类");
    }

    const sourceHasChildren = await store.hasChildren(source.id);
    if (sourceHasChildren) {
      throw new Error("该分类还有子分类，请先合并或移动子分类");
    }

    const result = await store.mergeInto(source, target);
    if (!result.deleted) {
      throw new Error("合并失败，源分类未删除");
    }

    return {
      success: true,
      source,
      target,
      mergedBills: result.mergedBills,
    };
  }),
});
