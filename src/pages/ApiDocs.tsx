import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { trpc } from "@/providers/trpc";
import type { Tag } from "../../contracts/tag";
import { BookOpen, Code2, Copy, FileJson, Terminal } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";

const createBillFields = [
  {
    name: "date",
    type: "string",
    required: "是",
    description: "账单日期，格式为 YYYY-MM-DD",
  },
  {
    name: "category",
    type: "string",
    required: "是",
    description: "分类名称。优先使用已有分类；分类不存在时后端会强制归为“杂项”",
  },
  {
    name: "name",
    type: "string",
    required: "是",
    description: "账单名称，例如商户、商品或事项",
  },
  {
    name: "source",
    type: "string",
    required: "否",
    description: "来源或支付渠道，可以为空字符串",
  },
  {
    name: "amount",
    type: "number",
    required: "是",
    description: "支出金额，必须大于等于 0",
  },
  {
    name: "isAmortized",
    type: "boolean",
    required: "否",
    description: "是否摊销，默认 false",
  },
  {
    name: "amortizationMonths",
    type: "number",
    required: "摊销时是",
    description: "摊销月数，1 到 360 之间；非摊销可省略或传 1",
  },
  {
    name: "reimbursementStatus",
    type: '"pending" | "approved" | "rejected"',
    required: "否",
    description: "报销状态；不需要报销时省略",
  },
  {
    name: "reimbursementParty",
    type: "string",
    required: "否",
    description: "报销方名称；无报销方时可省略或传空字符串",
  },
];

const requestExample = `fetch("/api/trpc/bill.create", {
  method: "POST",
  headers: {
    "content-type": "application/json"
  },
  credentials: "include",
  body: JSON.stringify({
    json: {
      date: "2026-06-22",
      category: "设备",
      name: "显示器",
      source: "京东",
      amount: 1299,
      isAmortized: true,
      amortizationMonths: 12,
      reimbursementStatus: "pending",
      reimbursementParty: "公司"
    }
  })
});`;

const curlExample = `curl -X POST "http://localhost:3000/api/trpc/bill.create" \\
  -H "content-type: application/json" \\
  --data-raw '{
    "json": {
      "date": "2026-06-22",
      "category": "三餐",
      "name": "午餐",
      "source": "支付宝",
      "amount": 36.5,
      "isAmortized": false,
      "amortizationMonths": 1
    }
  }'`;

const responseExample = `{
  "result": {
    "data": {
      "json": {
        "id": "生成的账单 ID",
        "date": "2026-06-22",
        "category": "三餐",
        "name": "午餐",
        "source": "支付宝",
        "amount": 36.5,
        "isAmortized": false,
        "amortizationMonths": 1,
        "createdAt": "2026-06-22T...",
        "updatedAt": "2026-06-22T..."
      }
    }
  }
}`;

function formatCategoryContext(tags: Tag[] | undefined) {
  if (!tags) return "当前分类正在加载中，请加载完成后再复制上下文。";
  if (tags.length === 0) return "当前没有可用分类。";

  const childrenByParent = new Map<string, Tag[]>();
  const tagIds = new Set(tags.map(tag => tag.id));
  const rootTags: Tag[] = [];

  for (const tag of tags) {
    if (tag.parentId && tagIds.has(tag.parentId)) {
      childrenByParent.set(tag.parentId, [
        ...(childrenByParent.get(tag.parentId) ?? []),
        tag,
      ]);
    } else {
      rootTags.push(tag);
    }
  }

  return rootTags
    .map(tag => {
      const children = childrenByParent.get(tag.id) ?? [];
      if (children.length === 0) return `- ${tag.name}`;
      return `- ${tag.name}：${children.map(child => child.name).join("、")}`;
    })
    .join("\n");
}

function buildAgentFriendlyContext(categoryContext: string) {
  return `你正在协助用户操作一个本地账单与标签管理应用。这个应用的后端 API 使用 tRPC HTTP，不是普通 REST。新增账单的接口是 POST /api/trpc/bill.create，请求头使用 content-type: application/json，请求体必须包在 json 字段中，例如 {"json":{"date":"2026-06-22","category":"三餐","name":"午餐","source":"支付宝","amount":36.5,"isAmortized":false,"amortizationMonths":1}}。

字段规则：date 是 YYYY-MM-DD 字符串；category 是必填分类名称，优先使用当前可用分类中的已有分类，分类不存在或无法命中时后端会强制归为“杂项”；name 是必填账单名称；source 是来源或支付渠道，可以传空字符串；amount 是必填数字且必须大于等于 0；isAmortized 表示是否摊销，默认 false；amortizationMonths 是摊销月数，范围 1 到 360，非摊销时可以省略或传 1；reimbursementStatus 可选，只能是 pending、approved、rejected，未报销或不需要报销时不要传；reimbursementParty 是可选报销方名称。

当前可用分类如下，分类信息来自本地数据库动态加载；识别时优先匹配最具体的子分类，无法匹配时使用“杂项”，不要编造新分类：
${categoryContext}

你需要先从用户提供的文字、截图、账单、发票或流水中识别每一笔交易。不要直接调用接口新增账单，必须先输出供用户确认的内容。输出必须包含两部分：
1. 命令：给出每一笔交易对应的 fetch 或 curl 命令，命令必须可以直接调用 /api/trpc/bill.create 创建该账单。
2. 识别详情：逐笔列出识别出的交易详情，至少包含 date、category、name、source、amount、isAmortized、amortizationMonths；如果识别到报销信息，再列出 reimbursementStatus、reimbursementParty。

如果一次识别出多笔交易，请为每一笔交易单独编号，并让命令和识别详情使用相同编号，方便用户确认。无法确定的字段要明确标记为“待确认”，不要编造。金额即使原始材料里带负号，也应按支出金额转换为正数。

浏览器环境中可以使用 fetch("/api/trpc/bill.create",{method:"POST",headers:{"content-type":"application/json"},credentials:"include",body:JSON.stringify({json:{date:"2026-06-22",category:"三餐",name:"午餐",source:"支付宝",amount:36.5,isAmortized:false,amortizationMonths:1}})})。本地生产服务通常是 http://localhost:3000，开发环境使用当前页面同源地址即可。新增成功后接口会返回完整账单对象，包含 id、createdAt、updatedAt。`;
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-md border bg-muted/40 p-4 text-sm leading-6">
      <code>{children}</code>
    </pre>
  );
}

export default function ApiDocsPage() {
  const { data: tags, isLoading: isTagsLoading } = trpc.tag.list.useQuery();
  const categoryContext = useMemo(() => formatCategoryContext(tags), [tags]);
  const agentFriendlyContext = useMemo(
    () => buildAgentFriendlyContext(categoryContext),
    [categoryContext]
  );

  const handleCopyAgentContext = async () => {
    try {
      await navigator.clipboard.writeText(agentFriendlyContext);
      toast.success("Agent 上下文已复制");
    } catch {
      toast.error("复制失败，请手动复制文本");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">API 与文档</h1>
          <p className="text-sm text-muted-foreground">
            当前应用通过 tRPC 暴露接口。下面示例展示如何通过 HTTP
            请求新增一笔账单。
          </p>
        </div>
        <Badge variant="outline" className="gap-1">
          <BookOpen className="h-3.5 w-3.5" />
          tRPC HTTP
        </Badge>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Copy className="h-4 w-4" />
            Agent Friendly 上下文
          </CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isTagsLoading}
            onClick={handleCopyAgentContext}
          >
            <Copy className="mr-2 h-4 w-4" />
            复制
          </Button>
        </CardHeader>
        <CardContent>
          <div className="max-h-56 overflow-auto rounded-md border bg-muted/40 p-4 text-sm leading-6 text-muted-foreground">
            {agentFriendlyContext}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Terminal className="h-4 w-4" />
            创建账单接口
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Method</div>
              <div className="mt-1 font-mono text-sm">POST</div>
            </div>
            <div className="rounded-md border p-3 sm:col-span-2">
              <div className="text-xs text-muted-foreground">Endpoint</div>
              <div className="mt-1 font-mono text-sm">
                /api/trpc/bill.create
              </div>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            请求体需要放在 tRPC 的 <code className="font-mono">json</code>{" "}
            字段中。开发环境通常使用当前站点同源地址；生产环境把域名替换为部署后的域名即可。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileJson className="h-4 w-4" />
            字段说明
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>字段</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>必填</TableHead>
                  <TableHead>说明</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {createBillFields.map(field => (
                  <TableRow key={field.name}>
                    <TableCell className="font-mono">{field.name}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {field.type}
                    </TableCell>
                    <TableCell>{field.required}</TableCell>
                    <TableCell>{field.description}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Code2 className="h-4 w-4" />
            JavaScript 示例
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <CodeBlock>{requestExample}</CodeBlock>
          <p className="text-sm text-muted-foreground">
            如果应用启用了登录态或 Cookie，保留{" "}
            <code className="font-mono">credentials: "include"</code>。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Terminal className="h-4 w-4" />
            cURL 示例
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CodeBlock>{curlExample}</CodeBlock>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileJson className="h-4 w-4" />
            返回示例
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <CodeBlock>{responseExample}</CodeBlock>
          <p className="text-sm text-muted-foreground">
            新增成功后，后端会返回完整账单对象，并自动补充{" "}
            <code className="font-mono">id</code>、
            <code className="font-mono">createdAt</code> 和{" "}
            <code className="font-mono">updatedAt</code>。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
