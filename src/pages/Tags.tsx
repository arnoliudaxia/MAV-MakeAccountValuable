import { useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/providers/trpc";
import {
  MISC_CATEGORY_NAME,
  TAG_COLORS,
  CreateTagInput as CreateTagInputSchema,
  type Tag,
} from "../../contracts/tag";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  AlertCircle,
  Tags,
  Sparkles,
  GitMerge,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { CATEGORY_ICON_OPTIONS, CategoryIcon } from "@/lib/category-icons";
import { IconPicker } from "@/components/tags/IconPicker";

type TagFormInput = z.input<typeof CreateTagInputSchema>;
type TagFormOutput = z.output<typeof CreateTagInputSchema>;

const defaultFormValues: TagFormInput = {
  name: "",
  color: TAG_COLORS[0],
  parentId: null,
  icon: "Tag",
};

const isSystemTag = (tag: Tag) => tag.name === MISC_CATEGORY_NAME;

function getIconOptionsForInference(name: string) {
  const normalizedName = name.trim().toLowerCase();
  const terms = normalizedName.split(/[\s,，、/]+/).filter(Boolean);
  const chars = Array.from(normalizedName).filter(char => char.trim());

  const scoredOptions = CATEGORY_ICON_OPTIONS.map((option, index) => {
    const searchText = option.searchText.toLowerCase();
    let score = 0;

    if (normalizedName && searchText.includes(normalizedName)) {
      score += 20;
    }
    for (const term of terms) {
      if (searchText.includes(term)) score += 8;
    }
    for (const char of chars) {
      if (searchText.includes(char)) score += 1;
    }

    return { name: option.name, score, index };
  })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .filter(option => option.score > 0)
    .slice(0, 80)
    .map(option => option.name);

  const fallbackOptions = CATEGORY_ICON_OPTIONS.slice(0, 80).map(
    option => option.name
  );

  return Array.from(new Set([...scoredOptions, "Tag", ...fallbackOptions]));
}

export default function TagsPage() {
  const utils = trpc.useUtils();
  const { data: tags, isLoading } = trpc.tag.list.useQuery();

  const [formOpen, setFormOpen] = useState(false);
  const [editTag, setEditTag] = useState<Tag | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [mergeSource, setMergeSource] = useState<Tag | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState("");

  const topLevelTags = useMemo(
    () =>
      tags?.filter(
        tag =>
          !tag.parentId ||
          !tags.some(candidate => candidate.id === tag.parentId)
      ) ?? [],
    [tags]
  );

  const childrenByParent = useMemo(() => {
    const groups = new Map<string, Tag[]>();
    tags?.forEach(tag => {
      if (!tag.parentId) return;
      groups.set(tag.parentId, [...(groups.get(tag.parentId) ?? []), tag]);
    });
    return groups;
  }, [tags]);

  const parentOptions = topLevelTags.filter(tag => tag.id !== editTag?.id);
  const editTagHasChildren = editTag
    ? (childrenByParent.get(editTag.id)?.length ?? 0) > 0
    : false;
  const mergeTargetOptions =
    tags?.filter(tag => tag.id !== mergeSource?.id) ?? [];

  const form = useForm<TagFormInput, unknown, TagFormOutput>({
    resolver: zodResolver(CreateTagInputSchema),
    defaultValues: defaultFormValues,
  });
  const previewColor = useWatch({ control: form.control, name: "color" });
  const previewIcon = useWatch({ control: form.control, name: "icon" });
  const previewName = useWatch({ control: form.control, name: "name" });

  const createMutation = trpc.tag.create.useMutation({
    onSuccess: () => {
      utils.tag.list.invalidate();
      setFormOpen(false);
      form.reset(defaultFormValues);
      toast.success("分类创建成功");
    },
    onError: err => toast.error(err.message),
  });

  const updateMutation = trpc.tag.update.useMutation({
    onSuccess: () => {
      utils.tag.list.invalidate();
      utils.bill.filters.invalidate();
      setFormOpen(false);
      setEditTag(null);
      form.reset(defaultFormValues);
      toast.success("分类更新成功");
    },
    onError: err => toast.error(err.message),
  });

  const deleteMutation = trpc.tag.delete.useMutation({
    onSuccess: () => {
      utils.tag.list.invalidate();
      setDeleteId(null);
      toast.success("分类删除成功");
    },
    onError: err => toast.error(err.message),
  });

  const mergeMutation = trpc.tag.merge.useMutation({
    onSuccess: result => {
      utils.tag.list.invalidate();
      utils.bill.list.invalidate();
      utils.bill.filters.invalidate();
      utils.bill.stats.invalidate();
      utils.bill.reimbursements.invalidate();
      setMergeSource(null);
      setMergeTargetId("");
      toast.success(
        `已将 ${result.mergedBills} 笔账单归并到「${result.target.name}」`
      );
    },
    onError: err => toast.error(err.message),
  });

  const inferMutation = trpc.tag.infer.useMutation({
    onSuccess: inferred => {
      form.setValue("parentId", inferred.parentId, {
        shouldDirty: true,
        shouldValidate: true,
      });
      form.setValue("icon", inferred.icon, {
        shouldDirty: true,
        shouldValidate: true,
      });
      form.setValue("color", inferred.color, {
        shouldDirty: true,
        shouldValidate: true,
      });
      toast.success("已根据分类名称填充推荐项");
    },
    onError: err => toast.error(err.message),
  });

  const handleAdd = () => {
    setEditTag(null);
    form.reset(defaultFormValues);
    setFormOpen(true);
  };

  const handleEdit = (tag: Tag) => {
    if (isSystemTag(tag)) {
      toast.error("系统分类“杂项”不能修改");
      return;
    }

    setEditTag(tag);
    form.reset({
      name: tag.name,
      color: tag.color,
      parentId: tag.parentId ?? null,
      icon: tag.icon || "Tag",
      sortOrder: tag.sortOrder,
    });
    setFormOpen(true);
  };

  const onSubmit = (data: TagFormOutput) => {
    if (editTag && editTagHasChildren && data.parentId) {
      toast.error("已有子分类的分类不能再归入其他分类");
      return;
    }

    const payload = {
      ...data,
      parentId: data.parentId ?? null,
      icon: data.icon || "Tag",
    };

    if (editTag) {
      updateMutation.mutate({ id: editTag.id, ...payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleInfer = () => {
    const name = form.getValues("name").trim();
    if (!name) {
      form.setError("name", { message: "请先填写分类名称" });
      toast.error("请先填写分类名称");
      return;
    }

    inferMutation.mutate({
      name,
      parentCategories: parentOptions.map(tag => ({
        id: tag.id,
        name: tag.name,
      })),
      iconOptions: getIconOptionsForInference(name),
    });
  };

  const handleOpenMerge = (tag: Tag) => {
    if (isSystemTag(tag)) {
      toast.error("系统分类“杂项”不能合并到其他分类");
      return;
    }

    if ((childrenByParent.get(tag.id)?.length ?? 0) > 0) {
      toast.error("该分类还有子分类，请先合并或移动子分类");
      return;
    }
    setMergeSource(tag);
    setMergeTargetId("");
  };

  const handleConfirmMerge = () => {
    if (!mergeSource || !mergeTargetId) {
      toast.error("请选择目标分类");
      return;
    }

    mergeMutation.mutate({
      sourceId: mergeSource.id,
      targetId: mergeTargetId,
    });
  };

  const renderTagActions = (tag: Tag, size: "sm" | "md" = "md") => {
    if (isSystemTag(tag)) return null;

    const buttonSize = size === "sm" ? "h-7 w-7" : "h-8 w-8";
    const hoverClass =
      size === "sm"
        ? "group-hover/child:opacity-100"
        : "group-hover:opacity-100";

    return (
      <div
        className={`flex items-center gap-1 opacity-0 ${hoverClass} transition-opacity`}
      >
        <Button
          variant="ghost"
          size="icon"
          className={buttonSize}
          onClick={() => handleOpenMerge(tag)}
        >
          <GitMerge className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={buttonSize}
          onClick={() => handleEdit(tag)}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={`${buttonSize} text-destructive hover:text-destructive`}
          onClick={() => setDeleteId(tag.id)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  };

  const renderCategoryIcon = (tag: Tag, size = "md") => (
    <span
      className={
        size === "sm"
          ? "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border"
          : "flex h-9 w-9 shrink-0 items-center justify-center rounded-md border"
      }
      style={{
        borderColor: tag.color,
        backgroundColor: `${tag.color}18`,
        color: tag.color,
      }}
    >
      <CategoryIcon
        name={tag.icon}
        className={size === "sm" ? "h-4 w-4" : "h-5 w-5"}
      />
    </span>
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">分类管理</h1>
          <p className="text-sm text-muted-foreground">
            管理二级账单分类，分类图标会显示在记账和筛选区域
          </p>
        </div>
        <Button onClick={handleAdd}>
          <Plus className="h-4 w-4 mr-2" />
          新建分类
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Tags className="h-4 w-4" />
            全部分类 ({tags?.length || 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !tags || tags.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
              <AlertCircle className="h-8 w-8 mb-2" />
              <p>暂无分类，点击「新建分类」创建</p>
            </div>
          ) : (
            <div className="space-y-4">
              {topLevelTags.map(tag => {
                const children = childrenByParent.get(tag.id) ?? [];
                return (
                  <div key={tag.id} className="rounded-lg border p-4 group">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {renderCategoryIcon(tag)}
                        <div className="min-w-0">
                          <div className="font-semibold truncate">
                            {tag.name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {children.length > 0
                              ? `${children.length} 个子分类`
                              : "一级分类"}
                          </div>
                        </div>
                      </div>
                      {renderTagActions(tag)}
                    </div>

                    {children.length > 0 && (
                      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {children.map(child => (
                          <div
                            key={child.id}
                            className="flex items-center justify-between gap-2 rounded-md border bg-muted/20 px-3 py-2 group/child"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              {renderCategoryIcon(child, "sm")}
                              <span className="font-medium truncate">
                                {child.name}
                              </span>
                            </div>
                            {renderTagActions(child, "sm")}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editTag ? "编辑分类" : "新建分类"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>分类名称</FormLabel>
                    <FormControl>
                      <Input placeholder="如：三餐" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="parentId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>父分类</FormLabel>
                      <Select
                        value={field.value ?? "none"}
                        onValueChange={value =>
                          field.onChange(value === "none" ? null : value)
                        }
                        disabled={editTagHasChildren}
                      >
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="选择父分类" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">无，作为一级分类</SelectItem>
                          {parentOptions.map(tag => (
                            <SelectItem key={tag.id} value={tag.id}>
                              <CategoryIcon
                                name={tag.icon}
                                className="h-4 w-4"
                              />
                              {tag.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="icon"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>图标</FormLabel>
                      <FormControl>
                        <IconPicker
                          value={field.value || "Tag"}
                          onChange={field.onChange}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="color"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>分类颜色</FormLabel>
                    <FormControl>
                      <div className="flex flex-wrap gap-2">
                        {TAG_COLORS.map(color => (
                          <button
                            key={color}
                            type="button"
                            onClick={() => field.onChange(color)}
                            className="relative"
                          >
                            <div
                              className={`w-8 h-8 rounded-full border-2 transition-all ${
                                field.value === color
                                  ? "border-foreground scale-110"
                                  : "border-transparent hover:scale-105"
                              }`}
                              style={{ backgroundColor: color }}
                            />
                            {field.value === color && (
                              <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-2 h-2 rounded-full bg-white" />
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div
                className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium"
                style={{
                  borderColor: previewColor,
                  backgroundColor: `${previewColor}18`,
                  color: previewColor,
                }}
              >
                <CategoryIcon name={previewIcon} className="h-4 w-4" />
                {previewName || "预览分类"}
              </div>

              <DialogFooter>
                {!editTag && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={
                      inferMutation.isPending ||
                      createMutation.isPending ||
                      updateMutation.isPending
                    }
                    onClick={handleInfer}
                  >
                    {inferMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4 mr-2" />
                    )}
                    {inferMutation.isPending
                      ? "推断中..."
                      : "根据分类名称推断其他"}
                  </Button>
                )}
                <Button
                  type="submit"
                  disabled={
                    createMutation.isPending || updateMutation.isPending
                  }
                >
                  {createMutation.isPending || updateMutation.isPending
                    ? "保存中..."
                    : editTag
                      ? "更新"
                      : "创建"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!mergeSource}
        onOpenChange={open => {
          if (!open) {
            setMergeSource(null);
            setMergeTargetId("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>合并分类</AlertDialogTitle>
            <AlertDialogDescription>
              将「{mergeSource?.name}」的所有账单归并到目标分类，然后删除「
              {mergeSource?.name}」。
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2">
            <div className="text-sm font-medium">目标分类</div>
            <Select value={mergeTargetId} onValueChange={setMergeTargetId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="选择要归并到的分类" />
              </SelectTrigger>
              <SelectContent>
                {mergeTargetOptions.map(tag => (
                  <SelectItem key={tag.id} value={tag.id}>
                    <CategoryIcon name={tag.icon} className="h-4 w-4" />
                    {tag.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {mergeTargetOptions.length === 0 && (
              <p className="text-sm text-muted-foreground">
                暂无其他分类可作为目标分类。
              </p>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={mergeMutation.isPending}>
              取消
            </AlertDialogCancel>
            <Button
              type="button"
              disabled={
                mergeMutation.isPending ||
                !mergeTargetId ||
                mergeTargetOptions.length === 0
              }
              onClick={handleConfirmMerge}
            >
              {mergeMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <GitMerge className="h-4 w-4 mr-2" />
              )}
              合并
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              如果分类正在被账单使用，将无法删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deleteId && deleteMutation.mutate({ id: deleteId })
              }
              className="bg-destructive text-destructive-foreground"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
