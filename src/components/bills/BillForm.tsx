import {
  useState,
  useEffect,
  type ChangeEvent,
  type ClipboardEvent,
} from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/providers/trpc";
import type {
  Bill,
  CreateBillInput,
  RecognizedBill,
} from "../../../contracts/bill";
import { CreateBillInput as CreateBillInputSchema } from "../../../contracts/bill";
import { TagSelector } from "./TagSelector";
import { ImagePlus, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router";

interface BillFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bill?: Bill | null;
  year: number;
  month: number;
  onSuccess?: () => void;
}

interface AIImage {
  id: string;
  name: string;
  dataUrl: string;
}

function getDefaultCreateBillValues(
  year: number,
  month: number
): CreateBillInput {
  return {
    date: `${year}-${String(month).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`,
    category: "",
    name: "",
    source: "",
    amount: 0,
    isAmortized: false,
    amortizationMonths: 1,
    reimbursementStatus: undefined,
    reimbursementParty: "",
  };
}

function getRecognizedBillValues(
  recognized: RecognizedBill,
  year: number,
  month: number
): CreateBillInput {
  const isAmortized = !!recognized.isAmortized;
  const defaults = getDefaultCreateBillValues(year, month);

  return {
    ...defaults,
    date: recognized.date || defaults.date,
    category: recognized.category || "",
    name: recognized.name || "",
    source: recognized.source || "",
    amount: recognized.amount ?? 0,
    isAmortized,
    amortizationMonths: isAmortized ? recognized.amortizationMonths || 1 : 1,
    reimbursementStatus: recognized.reimbursementStatus,
    reimbursementParty: recognized.reimbursementParty || "",
  };
}

export function BillForm({
  open,
  onOpenChange,
  bill,
  year,
  month,
  onSuccess,
}: BillFormProps) {
  const utils = trpc.useUtils();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [aiText, setAiText] = useState("");
  const [aiImages, setAiImages] = useState<AIImage[]>([]);
  const [recognizedBills, setRecognizedBills] = useState<RecognizedBill[]>([]);
  const [recognizedBillIndex, setRecognizedBillIndex] = useState(0);
  const { data: tags } = trpc.tag.list.useQuery();
  const { data: filters } = trpc.bill.filters.useQuery();
  const { data: settings } = trpc.settings.get.useQuery();
  const reimbursementParties = settings?.reimbursementParties ?? [];

  const form = useForm<CreateBillInput>({
    resolver: zodResolver(CreateBillInputSchema),
    defaultValues: getDefaultCreateBillValues(year, month),
  });
  const isAmortized = useWatch({
    control: form.control,
    name: "isAmortized",
  });
  const recognizedBillCount = recognizedBills.length;
  const hasRecognizedBillQueue = !bill && recognizedBillCount > 0;
  const canSkipRecognizedBill =
    hasRecognizedBillQueue && recognizedBillCount > 1;
  const hasNextRecognizedBill =
    hasRecognizedBillQueue && recognizedBillIndex + 1 < recognizedBillCount;

  const applyRecognizedBill = (recognized: RecognizedBill) => {
    form.reset(getRecognizedBillValues(recognized, year, month));
  };

  useEffect(() => {
    if (!open) return;

    if (bill) {
      form.reset({
        date: bill.date,
        category: bill.category,
        name: bill.name,
        source: bill.source,
        amount: bill.amount,
        isAmortized: bill.isAmortized,
        amortizationMonths: bill.amortizationMonths || 1,
        reimbursementStatus: bill.reimbursementStatus,
        reimbursementParty: bill.reimbursementParty || "",
      });
    } else {
      form.reset(getDefaultCreateBillValues(year, month));
    }

    setAiText("");
    setAiImages([]);
    setRecognizedBills([]);
    setRecognizedBillIndex(0);
  }, [bill, year, month, form, open]);

  const createMutation = trpc.bill.create.useMutation({
    onSuccess: () => {
      utils.bill.list.invalidate();
      utils.bill.stats.invalidate();
      utils.bill.filters.invalidate();
      utils.bill.reimbursements.invalidate();
    },
  });

  const updateMutation = trpc.bill.update.useMutation({
    onSuccess: () => {
      utils.bill.list.invalidate();
      utils.bill.stats.invalidate();
      utils.bill.filters.invalidate();
      utils.bill.reimbursements.invalidate();
    },
  });

  const recognizeMutation = trpc.bill.recognize.useMutation({
    onSuccess: recognized => {
      const firstBill = recognized.bills[0];
      if (!firstBill) {
        toast.error("AI 未识别到账单");
        return;
      }

      setRecognizedBills(recognized.bills);
      setRecognizedBillIndex(0);
      applyRecognizedBill(firstBill);
      toast.success(
        recognized.bills.length > 1
          ? `AI 识别出 ${recognized.bills.length} 笔账单，已填充第 1 笔`
          : "AI 已填充可识别的信息"
      );
    },
    onError: error => {
      toast.error(error.message || "AI 识别失败");
    },
  });

  const submitAIRecognize = (text: string, images: AIImage[]) => {
    if (!text.trim() && images.length === 0) {
      toast.error("请输入文字或上传图片");
      return false;
    }

    recognizeMutation.mutate({
      text: text.trim() || undefined,
      imageDataUrls: images.map(image => image.dataUrl),
      year,
      month,
      categories: tags?.map(tag => tag.name) ?? [],
      sources: filters?.sources ?? [],
      reimbursementParties,
    });
    return true;
  };

  const readAIImage = (file: File | undefined, name?: string) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("请上传图片文件");
      return false;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("图片不能超过 5MB");
      return false;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        const dataUrl = reader.result;
        setAiImages(current => {
          if (current.length >= 10) {
            toast.error("一次最多添加 10 张图片");
            return current;
          }
          return [
            ...current,
            {
              id: crypto.randomUUID(),
              name: name || file.name || "剪贴板图片",
              dataUrl,
            },
          ];
        });
      }
    };
    reader.onerror = () => toast.error("图片读取失败");
    reader.readAsDataURL(file);
    return true;
  };

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    Array.from(event.target.files ?? []).forEach(file => readAIImage(file));
    event.target.value = "";
  };

  const handleAIPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const items = Array.from(event.clipboardData.items);
    const files = items
      .filter(item => item.type.startsWith("image/"))
      .map(item => item.getAsFile())
      .filter((file): file is File => !!file);

    if (files.length === 0) return;

    event.preventDefault();
    files.forEach((file, index) =>
      readAIImage(file, files.length > 1 ? `剪贴板图片 ${index + 1}` : "剪贴板图片")
    );
    toast.success(`已添加 ${files.length} 张剪贴板图片，请点击填充信息进行识别`);
  };

  const clearAIImage = (id: string) => {
    setAiImages(current => current.filter(image => image.id !== id));
  };

  const handleRecognize = () => {
    submitAIRecognize(aiText, aiImages);
  };

  const handleSkipRecognizedBill = () => {
    if (!canSkipRecognizedBill) return;

    if (hasNextRecognizedBill) {
      const nextIndex = recognizedBillIndex + 1;
      const nextBill = recognizedBills[nextIndex];
      if (!nextBill) {
        toast.error("下一笔识别结果不存在");
        return;
      }

      setRecognizedBillIndex(nextIndex);
      applyRecognizedBill(nextBill);
      toast.info(
        `已跳过第 ${recognizedBillIndex + 1} 笔，请确认第 ${nextIndex + 1}/${recognizedBillCount} 笔`
      );
      return;
    }

    form.reset(getDefaultCreateBillValues(year, month));
    setRecognizedBills([]);
    setRecognizedBillIndex(0);
    onOpenChange(false);
    toast.info("已跳过最后一笔识别结果");
  };

  const onSubmit = async (data: CreateBillInput) => {
    const payload: CreateBillInput = {
      ...data,
      isAmortized: !!data.isAmortized,
      amortizationMonths: data.isAmortized ? data.amortizationMonths || 1 : 1,
      ...(!bill
        ? {
            reimbursementStatus: data.reimbursementParty
              ? ("pending" as const)
              : undefined,
          }
        : {}),
    };

    setIsSubmitting(true);
    try {
      if (bill) {
        await updateMutation.mutateAsync({ id: bill.id, ...payload });
        onOpenChange(false);
        onSuccess?.();
      } else {
        await createMutation.mutateAsync(payload);
        if (hasNextRecognizedBill) {
          const nextIndex = recognizedBillIndex + 1;
          const nextBill = recognizedBills[nextIndex];
          if (!nextBill) {
            throw new Error("下一笔识别结果不存在");
          }

          setRecognizedBillIndex(nextIndex);
          applyRecognizedBill(nextBill);
          toast.success(
            `已保存第 ${recognizedBillIndex + 1} 笔，请确认第 ${nextIndex + 1}/${recognizedBillCount} 笔`
          );
          onSuccess?.();
        } else {
          form.reset(getDefaultCreateBillValues(year, month));
          setAiText("");
          setAiImages([]);
          setRecognizedBills([]);
          setRecognizedBillIndex(0);
          onOpenChange(false);
          onSuccess?.();
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{bill ? "编辑账单" : "新增账单"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {!bill && (
              <div
                className="rounded-md border bg-muted/30 p-3 space-y-3"
                onPaste={handleAIPaste}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Sparkles className="h-4 w-4" />
                    AI 识别
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleRecognize}
                    disabled={recognizeMutation.isPending}
                  >
                    {recognizeMutation.isPending ? "识别中..." : "填充信息"}
                  </Button>
                </div>
                {hasRecognizedBillQueue && (
                  <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
                    AI 识别出 {recognizedBillCount} 笔账单，当前第{" "}
                    {recognizedBillIndex + 1} 笔。保存当前账单后
                    {hasNextRecognizedBill
                      ? "会自动填充下一笔。"
                      : "会完成本次识别队列。"}
                  </div>
                )}
                <Textarea
                  value={aiText}
                  onChange={event => setAiText(event.target.value)}
                  placeholder="粘贴账单文字或多张剪贴板图片，例如：6月15日 支付宝 星巴克 36元 可报销 公司"
                  className="min-h-20"
                />
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                  <label className="inline-flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap rounded-md border bg-background px-3 py-2 text-sm hover:bg-accent">
                    <ImagePlus className="h-4 w-4 shrink-0" />
                    上传图片
                    <Input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={handleImageChange}
                    />
                  </label>
                  {aiImages.length > 0 && (
                    <div className="min-w-0 flex-1 space-y-1 text-sm text-muted-foreground">
                      {aiImages.map((image, index) => (
                        <div key={image.id} className="flex min-w-0 items-center gap-2">
                          <span className="min-w-0 flex-1 truncate">
                            {index + 1}. {image.name}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0"
                            aria-label={`移除 ${image.name}`}
                            onClick={() => clearAIImage(image.id)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>日期</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>分类</FormLabel>
                    <FormControl>
                      <TagSelector
                        value={field.value}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="source"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>来源</FormLabel>
                    <FormControl>
                      <Input placeholder="如：支付宝、微信" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>名称</FormLabel>
                  <FormControl>
                    <Input placeholder="账单名称" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>金额</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      {...field}
                      onChange={e =>
                        field.onChange(parseFloat(e.target.value) || 0)
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isAmortized"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-md border px-3 py-2">
                  <div className="space-y-0.5">
                    <FormLabel>是否摊销</FormLabel>
                    <p className="text-xs text-muted-foreground">
                      将这笔交易金额分摊到多个自然月
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={!!field.value}
                      onCheckedChange={checked => {
                        field.onChange(checked);
                        if (!checked) {
                          form.setValue("amortizationMonths", 1, {
                            shouldDirty: true,
                            shouldTouch: true,
                            shouldValidate: true,
                          });
                        }
                      }}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {isAmortized && (
              <FormField
                control={form.control}
                name="amortizationMonths"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>摊销时长（月）</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="1"
                        min="1"
                        max="360"
                        placeholder="如：12"
                        {...field}
                        value={field.value || 1}
                        onChange={event =>
                          field.onChange(
                            Math.max(
                              1,
                              Math.trunc(
                                Number.parseInt(event.target.value, 10) || 1
                              )
                            )
                          )
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <div className={bill ? "grid grid-cols-2 gap-4" : "grid gap-4"}>
              {bill && (
                <FormField
                  control={form.control}
                  name="reimbursementStatus"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>报销状态</FormLabel>
                      <Select
                        onValueChange={value =>
                          field.onChange(value === "none" ? undefined : value)
                        }
                        value={field.value || "none"}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="选择报销状态" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">无需报销</SelectItem>
                          <SelectItem value="pending">待报销</SelectItem>
                          <SelectItem value="approved">已报销</SelectItem>
                          <SelectItem value="rejected">已拒绝</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <FormField
                control={form.control}
                name="reimbursementParty"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>报销方</FormLabel>
                    <Select
                      onValueChange={value => {
                        const party = value === "none" ? "" : value;
                        field.onChange(party);
                        if (!bill) {
                          form.setValue(
                            "reimbursementStatus",
                            party ? "pending" : undefined,
                            { shouldDirty: true }
                          );
                        }
                      }}
                      value={field.value || "none"}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="选择报销方" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">无报销方</SelectItem>
                        {field.value &&
                          !reimbursementParties.includes(field.value) && (
                            <SelectItem value={field.value}>
                              {field.value}（当前值）
                            </SelectItem>
                          )}
                        {reimbursementParties.map(party => (
                          <SelectItem key={party} value={party}>
                            {party}
                          </SelectItem>
                        ))}
                        {reimbursementParties.length === 0 && (
                          <div className="px-2 py-1.5 text-xs text-muted-foreground">
                            请先到设置中添加报销方
                          </div>
                        )}
                        <div className="border-t mt-1 px-2 py-1">
                          <Link
                            to="/settings"
                            className="text-xs text-muted-foreground hover:text-foreground"
                          >
                            管理报销方选项
                          </Link>
                        </div>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              {canSkipRecognizedBill && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSubmitting}
                  onClick={handleSkipRecognizedBill}
                >
                  跳过
                </Button>
              )}
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? "保存中..."
                  : bill
                    ? "更新"
                    : hasNextRecognizedBill
                      ? "保存并确认下一笔"
                      : "保存"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
