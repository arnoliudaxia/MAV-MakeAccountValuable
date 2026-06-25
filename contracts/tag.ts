import { z } from "zod";

export const TagSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "分类名不能为空"),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "颜色格式不正确"),
  parentId: z.string().nullable().optional(),
  icon: z.string().min(1, "图标不能为空"),
  sortOrder: z.number().optional(),
  createdAt: z.string(),
});

export const CreateTagInput = z.object({
  name: z.string().min(1, "分类名不能为空"),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "颜色格式不正确"),
  parentId: z.string().nullable().optional(),
  icon: z.string().min(1, "图标不能为空").default("Tag"),
  sortOrder: z.number().optional(),
});

export const UpdateTagInput = z.object({
  id: z.string(),
  name: z.string().min(1, "分类名不能为空").optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "颜色格式不正确")
    .optional(),
  parentId: z.string().nullable().optional(),
  icon: z.string().min(1, "图标不能为空").optional(),
  sortOrder: z.number().optional(),
});

export const InferTagInput = z.object({
  name: z.string().min(1, "分类名不能为空"),
  parentCategories: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
      })
    )
    .default([]),
  iconOptions: z.array(z.string().min(1)).default([]),
});

export const InferredTagSchema = z.object({
  parentId: z.string().nullable(),
  icon: z.string().min(1),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "颜色格式不正确"),
});

export const MergeTagInput = z.object({
  sourceId: z.string().min(1, "源分类不能为空"),
  targetId: z.string().min(1, "目标分类不能为空"),
});

export type Tag = z.infer<typeof TagSchema>;
export type CreateTagInput = z.infer<typeof CreateTagInput>;
export type UpdateTagInput = z.infer<typeof UpdateTagInput>;
export type InferTagInput = z.infer<typeof InferTagInput>;
export type InferredTag = z.infer<typeof InferredTagSchema>;
export type MergeTagInput = z.infer<typeof MergeTagInput>;

export const TAG_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#f43f5e",
  "#10b981",
  "#6366f1",
  "#14b8a6",
];

export const MISC_CATEGORY_NAME = "杂项";

export const CATEGORY_ICONS = [
  "House",
  "Utensils",
  "Cookie",
  "Shirt",
  "Package",
  "Cross",
  "Dumbbell",
  "BookOpen",
  "Gamepad2",
  "Monitor",
  "Cloud",
  "Plane",
  "Bus",
  "BatteryCharging",
  "Tag",
] as const;

export const DEFAULT_CATEGORY_TREE = [
  {
    name: "生活保障",
    icon: "House",
    color: "#22c55e",
    children: [
      { name: "三餐", icon: "Utensils", color: "#f97316" },
      { name: "零食", icon: "Cookie", color: "#eab308" },
      { name: "衣服", icon: "Shirt", color: "#ec4899" },
      { name: "日用品", icon: "Package", color: "#06b6d4" },
      { name: "医疗", icon: "Cross", color: "#ef4444" },
      { name: "运动", icon: "Dumbbell", color: "#10b981" },
    ],
  },
  { name: "学习", icon: "BookOpen", color: "#3b82f6", children: [] },
  { name: "娱乐", icon: "Gamepad2", color: "#8b5cf6", children: [] },
  {
    name: "设备",
    icon: "Monitor",
    color: "#6366f1",
    children: [{ name: "云服务", icon: "Cloud", color: "#14b8a6" }],
  },
  {
    name: "旅行",
    icon: "Plane",
    color: "#f43f5e",
    children: [
      { name: "交通", icon: "Bus", color: "#f97316" },
      { name: "电车充电", icon: "BatteryCharging", color: "#eab308" },
    ],
  },
  { name: MISC_CATEGORY_NAME, icon: "Tag", color: "#6366f1", children: [] },
] as const;
