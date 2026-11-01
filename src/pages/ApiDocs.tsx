import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
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
import {
  AlertTriangle,
  BookOpen,
  Code2,
  Copy,
  Database,
  FileJson,
  KeyRound,
  ListTree,
  Receipt,
  Server,
  SlidersHorizontal,
  Sparkles,
  Tags,
  Terminal,
} from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { toast } from "sonner";

const TRPC_PROCEDURE_COUNT = 22;
const REST_ENDPOINT_COUNT = 9;

type EndpointRow = {
  path: string;
  kind: "query" | "mutation";
  input: string;
  output: string;
  note: string;
};

const billEndpoints: EndpointRow[] = [
  {
    path: "bill.list",
    kind: "query",
    input: "{ year, month, category?, source?, keyword? }",
    output: "Bill[]",
    note: "按“账期”返回：摊销账单会出现在它分摊的每个月，并附带 monthlyAmount 与 amortizationMonthIndex；结果按 date 倒序。month 取 1-12",
  },
  {
    path: "bill.reimbursements",
    kind: "query",
    input: "无",
    output: "Bill[]",
    note: "所有 reimbursementStatus 非空的账单，date 升序，不限月份",
  },
  {
    path: "bill.getById",
    kind: "query",
    input: "{ id }",
    output: "Bill | undefined",
    note: "查不到时 HTTP 仍是 200，json 为 null 且 meta.values 标记 undefined",
  },
  {
    path: "bill.create",
    kind: "mutation",
    input: "CreateBillInput（见下方字段说明）",
    output: "Bill",
    note: "自动补 id / createdAt / updatedAt；category 打不中已有分类时强制归为“杂项”；金额以整数分入库",
  },
  {
    path: "bill.recognize",
    kind: "mutation",
    input:
      "{ text?, imageDataUrls?, year, month, categories, sources, reimbursementParties }",
    output: "{ bills: RecognizedBill[] }",
    note: "调用 AI 识别文字或截图，只返回建议、不写库；依赖设置里的 AI 配置，详见“AI 识别接口”",
  },
  {
    path: "bill.update",
    kind: "mutation",
    input: "{ id, ...可选字段 }",
    output: "Bill",
    note: "字段级更新；账单不存在时抛“账单不存在”（500）",
  },
  {
    path: "bill.delete",
    kind: "mutation",
    input: "{ id }",
    output: "{ success: true }",
    note: "账单不存在时抛“账单不存在”（500）",
  },
  {
    path: "bill.stats",
    kind: "query",
    input: "{ year, month }",
    output:
      "{ totalCount, totalExpense, totalReimbursable, totalReimbursed, byCategory, bySource }",
    note: "金额按 monthlyAmount 累加；pending / approved 计入可报销，approved 再计入已报销；byCategory 会排除可报销账单，bySource 不排除",
  },
  {
    path: "bill.filters",
    kind: "query",
    input: "无",
    output: "{ categories: string[], sources: string[] }",
    note: "全量分类名与来源名，供筛选下拉使用",
  },
];

const tagEndpoints: EndpointRow[] = [
  {
    path: "tag.list",
    kind: "query",
    input: "无",
    output: "Tag[]",
    note: "sortOrder 升序；parentId 为 null 即一级分类。首次启动会自动写入默认分类树（含“杂项”）",
  },
  {
    path: "tag.getById",
    kind: "query",
    input: "{ id }",
    output: "Tag | undefined",
    note: "查不到时 json 为 null",
  },
  {
    path: "tag.create",
    kind: "mutation",
    input: "{ name, color, parentId?, icon?, sortOrder? }",
    output: "Tag",
    note: 'color 必须匹配 #RRGGBB；icon 默认 "Tag"；sortOrder 默认 Date.now()；同名分类报错',
  },
  {
    path: "tag.infer",
    kind: "mutation",
    input: "{ name, parentCategories: [{ id, name }], iconOptions: string[] }",
    output: "{ parentId, icon, color }",
    note: "让 AI 推荐父分类 / 图标 / 颜色；越界的返回值会被服务端回落到默认值，依赖 AI 配置",
  },
  {
    path: "tag.update",
    kind: "mutation",
    input: "{ id, ...可选字段 }",
    output: "Tag",
    note: "系统分类“杂项”不能修改；改名撞已有分类会报错",
  },
  {
    path: "tag.delete",
    kind: "mutation",
    input: "{ id }",
    output: "{ success: true }",
    note: "“杂项”不能删除；有子分类或被账单引用时拒绝删除，错误信息里最多预览 10 笔占用账单",
  },
  {
    path: "tag.merge",
    kind: "mutation",
    input: "{ sourceId, targetId }",
    output: "{ success, source, target, mergedBills }",
    note: "把源分类的账单整体改挂到目标分类并删除源分类；源分类是“杂项”或仍有子分类时报错",
  },
];

const databaseEndpoints: EndpointRow[] = [
  {
    path: "database.overview",
    kind: "query",
    input: "无",
    output: "{ billCount, totalAmount }",
    note: "账单总数与总支出，totalAmount 已换算成元",
  },
  {
    path: "database.tables",
    kind: "query",
    input: "无",
    output: "{ name, label, primaryKey, columns }[]",
    note: "固定三张表：bills（账单）、tags（分类）、settings（设置）",
  },
  {
    path: "database.rows",
    kind: "query",
    input: "{ table, page?, pageSize? }",
    output: "{ rows, totalCount, page, pageSize }",
    note: "table 只能是 bills / tags / settings；page 从 1 开始，pageSize 1-100 默认 50。返回原始行：列名是 snake_case，amount 是整数分，is_amortized 是 0/1，与 tRPC 的 Bill 对象不同",
  },
];

const settingsEndpoints: EndpointRow[] = [
  {
    path: "ping",
    kind: "query",
    input: "无",
    output: "{ ok: true, ts: number }",
    note: "探活，同时验证登录态是否有效",
  },
  {
    path: "settings.get",
    kind: "query",
    input: "无",
    output: "AppSettings",
    note: "含 webdav、reimbursementParties、ai 三块。注意：ai.apiKey 与 webdav.password 会明文返回，不要写进日志或转发给第三方",
  },
  {
    path: "settings.update",
    kind: "mutation",
    input: "{ webdav?, reimbursementParties?, ai? }（均可 partial）",
    output: "AppSettings",
    note: "按块深合并后整体返回；webdav.intervalHours 范围 1-8760；改动 webdav 会立刻重排定时同步任务",
  },
];

type RestRow = {
  method: string;
  path: string;
  input: string;
  output: string;
  note: string;
};

const restEndpoints: RestRow[] = [
  {
    method: "POST",
    path: "/api/auth/login",
    input: '{ "password": "..." }',
    output: '{ "authenticated": true } + Set-Cookie',
    note: "Cookie 名 mav_session，HttpOnly / SameSite=Strict，有效期 8 小时。400 密码为空、非法 JSON 或超过 1024 字符；401 密码错误；429 同一 IP 15 分钟内超过 5 次（带 Retry-After）；503 服务端未配置 AUTH_PASSWORD_HASH",
  },
  {
    method: "GET",
    path: "/api/auth/session",
    input: "无",
    output: '{ "authenticated": boolean }',
    note: "前端用它判断是否需要跳登录页，是唯一不需要登录态的接口",
  },
  {
    method: "POST",
    path: "/api/auth/logout",
    input: "无（开发环境请带 {}）",
    output: '{ "authenticated": false } + 过期 Cookie',
    note: "会话在服务端内存里立即删除；重启服务会清空所有会话",
  },
  {
    method: "GET",
    path: "/api/webdav/status",
    input: "无",
    output: "同步状态对象（见下方响应示例）",
    note: "需要登录。会顺带刷新远端元信息；remoteStatus 取值 unconfigured / unknown / available / missing / unavailable",
  },
  {
    method: "POST",
    path: "/api/webdav/test",
    input: "无（开发环境请带 {}）",
    output: '{ "ok": true }',
    note: "对远端目录做 PROPFIND。失败返回 409 + { error }，例如“WebDAV 目录不存在，请先创建目录”",
  },
  {
    method: "POST",
    path: "/api/webdav/push",
    input: "无（开发环境请带 {}）",
    output: '{ "ok": true }',
    note: "上传当前 SQLite 快照。依赖强 ETag 做乐观并发：远端只有弱 ETag 或上传后字节不一致时会 409 拒绝，不会静默覆盖别人",
  },
  {
    method: "POST",
    path: "/api/webdav/pull",
    input: '{ "confirm": true }',
    output: '{ "ok": true }',
    note: "缺 confirm 返回 400“请确认覆盖本地数据库”。成功后本地库被远端替换，原库保留为备份（体现在 status 的 backupPath）",
  },
  {
    method: "GET",
    path: "/api/database/download",
    input: "无",
    output: "SQLite 二进制",
    note: '需要登录。响应头 Content-Type: application/vnd.sqlite3 与 Content-Disposition: attachment; filename="当前库文件名"',
  },
  {
    method: "POST",
    path: "/api/database/upload",
    input: "multipart/form-data，字段名 database",
    output: '{ "ok": true }',
    note: "需要登录。400 表示不是文件或校验/覆盖失败；替换在数据库锁内进行，校验失败时原库与备份都保留",
  },
];

const errorCodes = [
  {
    http: "400",
    code: "BAD_REQUEST",
    when: "zod 校验失败（缺字段、类型不对、越界）",
    tip: "error.json.message 是一段 JSON 字符串化的 zod issues，可直接逐条读",
  },
  {
    http: "401",
    code: "UNAUTHORIZED",
    when: "没有 Cookie、Cookie 过期或已登出",
    tip: "message 固定为“请先登录或重新登录”，重新调 /api/auth/login 即可",
  },
  {
    http: "404",
    code: "NOT_FOUND",
    when: "procedure 路径拼错，如 /api/trpc/nope.x",
    tip: 'message 为 No procedure found on path "..."；非 tRPC 的 /api/* 未命中路径返回 {"error":"Not Found"}',
  },
  {
    http: "405",
    code: "METHOD_NOT_SUPPORTED",
    when: "GET 调 mutation 或 POST 调 query",
    tip: "query 用 GET、mutation 用 POST，没有例外",
  },
  {
    http: "500",
    code: "INTERNAL_SERVER_ERROR",
    when: '业务规则拒绝，如“账单不存在”“分类 "三餐" 已存在”“系统分类“杂项”不能删除”',
    tip: "message 是可直接展示给用户的中文，但语义上是失败而非崩溃，客户端按 message 分支即可",
  },
];

const recognizeFields = [
  {
    name: "text",
    type: "string",
    required: "二选一",
    description: "待识别的文字，最长 5000 字符；与 imageDataUrls 至少提供一个",
  },
  {
    name: "imageDataUrls",
    type: "string[]",
    required: "二选一",
    description:
      "图片的 data URL，最多 10 张、单张最大 15MB（整请求还受 50MB 请求体上限约束）",
  },
  {
    name: "year",
    type: "number",
    required: "是",
    description: "当前表单年份，用于补全只写“6月22日”这类相对日期",
  },
  {
    name: "month",
    type: "number",
    required: "是",
    description: "当前表单月份，1-12",
  },
  {
    name: "categories",
    type: "string[]",
    required: "否",
    description: "可选分类白名单；给了就会约束 AI 只能选这些分类，默认空数组",
  },
  {
    name: "sources",
    type: "string[]",
    required: "否",
    description: "可选来源白名单，AI 会优先复用最匹配的已有来源，默认空数组",
  },
  {
    name: "reimbursementParties",
    type: "string[]",
    required: "否",
    description:
      "可选报销方白名单，通常取自 settings.reimbursementParties，默认空数组",
  },
];

const requestExample = `// 1) 先登录拿会话 Cookie（同源 fetch 靠 credentials 自动带上）
await fetch("/api/auth/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  credentials: "include",
  body: JSON.stringify({ password: "你的登录密码" })
});

// 2) 再新增账单：入参必须包在 json 字段里
await fetch("/api/trpc/bill.create", {
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

const curlExample = `# 1) 先登录，把会话 Cookie 存进 cookies.txt（有效期 8 小时）
curl -c cookies.txt -X POST "http://localhost:3000/api/auth/login" \\
  -H "content-type: application/json" \\
  --data-raw '{"password":"你的登录密码"}'

# 2) 再调用 bill.create
curl -b cookies.txt -X POST "http://localhost:3000/api/trpc/bill.create" \\
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

const protocolExample = `// query：GET，入参放在查询串 input 里
curl -b cookies.txt -G "http://localhost:3000/api/trpc/bill.list" \\
  --data-urlencode 'input={"json":{"year":2026,"month":6}}'

// 无入参的 query：可以完全不写 input
curl -b cookies.txt "http://localhost:3000/api/trpc/tag.list"

// mutation：POST，入参放在请求体里
curl -b cookies.txt -X POST "http://localhost:3000/api/trpc/bill.delete" \\
  -H "content-type: application/json" \\
  --data-raw '{"json":{"id":"账单 ID"}}'

// 批量：路径用逗号连接并加 ?batch=1（前端 httpBatchLink 就是这种格式）
curl -b cookies.txt "http://localhost:3000/api/trpc/ping,bill.filters?batch=1" \\
  --data-urlencode 'input={"ping":{"json":{}},"bill.filters":{"json":{}}}' -G`;

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

const errorResponseExample = `{
  "error": {
    "json": {
      "message": "请先登录或重新登录",
      "code": -32001,
      "data": {
        "code": "UNAUTHORIZED",
        "httpStatus": 401,
        "path": "bill.create"
      }
    }
  }
}`;

const undefinedResponseExample = `// bill.getById 查不到时不是 404，而是 200 + undefined 标记
{
  "result": {
    "data": {
      "json": null,
      "meta": { "values": ["undefined"], "v": 1 }
    }
  }
}`;

const recognizeExample = `curl -b cookies.txt -X POST "http://localhost:3000/api/trpc/bill.recognize" \\
  -H "content-type: application/json" \\
  --data-raw '{
    "json": {
      "text": "6月22日 支付宝 午餐 36.5",
      "imageDataUrls": [],
      "year": 2026,
      "month": 6,
      "categories": ["三餐", "零食", "云服务", "杂项"],
      "sources": ["支付宝", "微信"],
      "reimbursementParties": ["公司"]
    }
  }'

// 返回（字段可能缺失，缺失表示 AI 无法确定，不要当成 0）
{ "result": { "data": { "json": {
  "bills": [
    { "date": "2026-06-22", "category": "三餐", "name": "午餐", "source": "支付宝", "amount": 36.5, "isAmortized": false }
  ]
} } } }`;

const webdavStatusExample = `{
  "busy": false,
  "remoteUpdatedAt": "2026-06-22T01:00:00.000Z",
  "remoteStatus": "available",
  "remoteError": null,
  "lastAction": "push",
  "lastAttemptAt": "2026-06-22T01:00:00.000Z",
  "lastSuccessAt": "2026-06-22T01:00:01.000Z",
  "error": null,
  "backupPath": null,
  "nextRunAt": "2026-06-23T01:00:00.000Z"
}`;

const restExample = `# 下载当前数据库（需要登录）
curl -b cookies.txt -OJ "http://localhost:3000/api/database/download"

# 上传并替换数据库（multipart，字段名必须是 database）
curl -b cookies.txt -X POST "http://localhost:3000/api/database/upload" \\
  -F "database=@app.db"

# 手动触发一次拉取：必须显式确认覆盖
curl -b cookies.txt -X POST "http://localhost:3000/api/webdav/pull" \\
  -H "content-type: application/json" \\
  --data-raw '{"confirm":true}'`;

const authFlowExample = `# 取 Cookie
curl -c cookies.txt -X POST "http://localhost:3000/api/auth/login" \\
  -H "content-type: application/json" \\
  --data-raw '{"password":"你的登录密码"}'

# 检查登录态
curl -b cookies.txt "http://localhost:3000/api/auth/session"
# => { "authenticated": true }

# 退出
curl -b cookies.txt -X POST "http://localhost:3000/api/auth/logout" \\
  -H "content-type: application/json" --data-raw '{}'
# => { "authenticated": false }`;

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
    description: "来源或支付渠道，必须传但可以为空字符串",
  },
  {
    name: "amount",
    type: "number",
    required: "是",
    description: "支出金额，单位是元，必须大于等于 0；入库时换算为整数分",
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

type EndpointSample = { input?: string; response?: string; verified?: boolean };

const endpointSamples: Record<string, EndpointSample> = {
  ping: {
    response: `{
  "ok": true,
  "ts": 1793520033816
}`,
  },
  "bill.list": {
    input: `{"year":2026,"month":11}`,
    response: `[
  {
    "id": "c3e168c0-0659-404e-bf85-10f449ea0ce1",
    "date": "2026-11-05",
    "category": "三餐",
    "name": "午餐",
    "source": "支付宝",
    "amount": 36.5,
    "isAmortized": false,
    "amortizationMonths": 1,
    "monthlyAmount": 36.5,
    "reimbursementStatus": null,
    "reimbursementParty": null,
    "createdAt": "2026-11-01T08:01:51.931Z",
    "updatedAt": "2026-11-01T08:01:51.931Z"
  }
]`,
  },
  "bill.reimbursements": {
    response: `[]\n// 无报销账单时为空数组；元素结构与 bill.list 里的 Bill 相同`,
  },
  "bill.getById": {
    input: `{"id":"账单 ID"}`,
    response: `{"json":null,"meta":{"values":["undefined"],"v":1}}\n// 查不到时是 200 + undefined，命中时是单个 Bill 对象`,
  },
  "bill.create": {
    input: `{"date":"2026-06-22","category":"三餐","name":"午餐","source":"支付宝","amount":36.5}`,
    response: `{
  "date": "2026-06-22",
  "category": "三餐",
  "name": "午餐",
  "source": "支付宝",
  "amount": 36.5,
  "isAmortized": false,
  "amortizationMonths": 1,
  "id": "0339b21d-ba24-4e2f-9f0b-cb3d0b495c7a",
  "createdAt": "2026-11-01T08:01:51.931Z",
  "updatedAt": "2026-11-01T08:01:51.931Z"
}`,
  },
  "bill.recognize": {
    input: `{"text":"6月22日 支付宝 午餐 36.5","year":2026,"month":6,"categories":["三餐","杂项"],"sources":["支付宝"],"reimbursementParties":["公司"]}`,
    response: `{
  "bills": [
    { "date": "2026-06-22", "category": "三餐", "name": "午餐", "source": "支付宝", "amount": 36.5, "isAmortized": false }
  ]
}`,
    verified: false,
  },
  "bill.update": {
    input: `{"id":"账单 ID","amount":40,"isAmortized":true,"amortizationMonths":12}`,
    response: `{
  "id": "0339b21d-ba24-4e2f-9f0b-cb3d0b495c7a",
  "date": "2026-11-05",
  "category": "三餐",
  "name": "午餐",
  "source": "支付宝",
  "amount": 40,
  "isAmortized": true,
  "amortizationMonths": 12,
  "reimbursementStatus": null,
  "reimbursementParty": null,
  "createdAt": "2026-11-01T08:01:51.931Z",
  "updatedAt": "2026-11-01T08:01:52.034Z"
}`,
  },
  "bill.delete": {
    input: `{"id":"账单 ID"}`,
    response: `{ "success": true }`,
  },
  "bill.stats": {
    input: `{"year":2026,"month":11}`,
    response: `{
  "totalCount": 2,
  "totalExpense": 73,
  "totalReimbursable": 0,
  "totalReimbursed": 0,
  "byCategory": { "三餐": 36.5, "杂项": 36.5 },
  "bySource": { "支付宝": 36.5, "微信": 36.5 }
}`,
  },
  "bill.filters": {
    response: `{
  "categories": ["生活保障", "三餐", "零食", "…", "杂项"],
  "sources": ["支付宝", "微信"]
}`,
  },
  "tag.list": {
    response: `[
  {
    "id": "9b7186d6-5b3e-44e5-852a-45c9896d6e9e",
    "name": "三餐",
    "color": "#f97316",
    "parentId": "1b759c85-ab48-4224-ab3e-6ee867356a71",
    "icon": "Utensils",
    "sortOrder": 1001,
    "createdAt": "2026-11-01T07:55:46.941Z"
  }
]`,
  },
  "tag.getById": {
    input: `{"id":"分类 ID"}`,
    response: `{"json":null,"meta":{"values":["undefined"],"v":1}}\n// 查不到时是 200 + undefined，命中时是单个 Tag 对象`,
  },
  "tag.create": {
    input: `{"name":"宠物","color":"#22c55e","icon":"Cross","parentId":null}`,
    response: `{
  "name": "宠物",
  "color": "#22c55e",
  "icon": "Cross",
  "id": "2fc3cfc8-29e4-4268-beb6-01e46f87def4",
  "parentId": null,
  "sortOrder": 1793520936220,
  "createdAt": "2026-11-01T08:15:36.220Z"
}`,
  },
  "tag.infer": {
    input: `{"name":"宠物","parentCategories":[{"id":"分类 ID","name":"生活保障"}],"iconOptions":["House","Tag"]}`,
    response: `{ "parentId": null, "icon": "Tag", "color": "#ef4444" }`,
    verified: false,
  },
  "tag.update": {
    input: `{"id":"分类 ID","name":"宠物医疗","sortOrder":999999}`,
    response: `{
  "id": "f4dc3266-56c2-4917-ada8-f6b55444675a",
  "name": "宠物医疗",
  "color": "#f97316",
  "parentId": "94617929-4a2c-4663-a541-d21b5b83ebe8",
  "icon": "Tag",
  "sortOrder": 999999,
  "createdAt": "2026-11-01T08:16:07.341Z"
}`,
  },
  "tag.delete": {
    input: `{"id":"分类 ID"}`,
    response: `{ "success": true }\n// 失败时 500，如“分类“宠物”正在被 1 笔账单使用，无法删除：2026-11-06 测试 ¥1”`,
  },
  "tag.merge": {
    input: `{"sourceId":"源分类 ID","targetId":"目标分类 ID"}`,
    response: `{
  "success": true,
  "source": { "id": "…", "name": "临时乙", "…": "完整 Tag" },
  "target": { "id": "…", "name": "临时甲", "…": "完整 Tag" },
  "mergedBills": 3
}`,
  },
  "database.overview": {
    response: `{ "billCount": 0, "totalAmount": 0 }`,
  },
  "database.tables": {
    response: `[
  { "name": "bills", "label": "账单", "primaryKey": "id", "columns": ["id", "date", "…"] },
  { "name": "tags", "label": "分类", "primaryKey": "id", "columns": ["id", "name", "…"] },
  { "name": "settings", "label": "设置", "primaryKey": "key", "columns": ["key", "value", "updated_at"] }
]`,
  },
  "database.rows": {
    input: `{"table":"bills","page":1,"pageSize":20}`,
    response: `{
  "rows": [
    {
      "id": "0339b21d-…", "date": "2026-11-05", "category_id": "9b7186d6-…", "name": "午餐",
      "source": "支付宝", "amount": 3650, "is_amortized": 1, "amortization_months": 3,
      "reimbursement_status": null, "reimbursement_party": null,
      "created_at": "2026-11-01T08:01:51.931Z", "updated_at": "2026-11-01T08:01:52.034Z"
    }
  ],
  "totalCount": 2,
  "page": 1,
  "pageSize": 20
}`,
  },
  "settings.get": {
    response: `{
  "webdav": { "enabled": false, "endpoint": "", "username": "", "password": "", "intervalHours": 24 },
  "reimbursementParties": ["公司"],
  "ai": {
    "apiKey": "", "baseUrl": "https://api.openai.com/v1", "model": "gpt-5.5",
    "enableBillCategoryMatching": false,
    "billRecognitionPrompt": "…", "billCategoryMatchingPrompt": "…", "tagInferencePrompt": "…"
  }
}`,
  },
  "settings.update": {
    input: `{"webdav":{"enabled":true,"endpoint":"https://dav.example.com/mav","username":"u","password":"p","intervalHours":6},"reimbursementParties":["公司","房东"]}`,
    response: `// 与 settings.get 相同：返回合并后的完整 AppSettings`,
  },
};

function buildCurl(row: EndpointRow): string {
  const input = endpointSamples[row.path]?.input;
  const url = `http://localhost:3000/api/trpc/${row.path}`;

  if (row.kind === "mutation") {
    return `curl -b cookies.txt -X POST "${url}" \\\n  -H "content-type: application/json" \\\n  --data-raw '{"json":${input ?? "{}"}}'`;
  }
  if (!input) {
    return `curl -b cookies.txt "${url}"`;
  }
  return `curl -b cookies.txt -G "${url}" \\\n  --data-urlencode 'input={"json":${input}}'`;
}

const docSections = [
  { id: "auth", label: "认证与会话" },
  { id: "trpc", label: "tRPC 调用约定" },
  { id: "errors", label: "错误码对照" },
  { id: "bill", label: "bill 账单 ×9" },
  { id: "tag", label: "tag 分类 ×7" },
  { id: "database", label: "database 数据库 ×3" },
  { id: "settings", label: "settings + ping ×3" },
  { id: "bill-create", label: "bill.create 详解" },
  { id: "ai", label: "AI 识别接口" },
  { id: "rest", label: "独立 REST ×9" },
  { id: "agent", label: "Agent 上下文" },
];

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

function buildAgentFriendlyContext(categoryContext: string, tagCount: number) {
  return `[app] 账有数 MAV · 本地账单与分类管理。后端是 tRPC over HTTP，不是普通 REST。
[auth] POST /api/auth/login {"password":"..."} → Set-Cookie mav_session（HttpOnly，8h，重启服务即失效）。除 GET /api/auth/session 外，所有接口都要带该 Cookie；缺失 → 401「请先登录或重新登录」。fetch 用 credentials:"include"，curl 用 -c/-b cookies.txt。15 分钟内失败 5 次 → 429。
[call] /api/trpc/{ns.proc}，入参永远包成 {"json":{...}}。query 只能 GET（入参放 ?input=），mutation 只能 POST（入参放请求体），用反 → 405。无入参可直接 GET。批量：/api/trpc/a,b?batch=1&input={"a":...,"b":...}，响应为同序数组。
[shape] 成功 {"result":{"data":{"json":…}}}；失败 {"error":{"json":{"message","data.code","data.httpStatus"}}}。查不到记录是 200 + json:null + meta.values=["undefined"]，不是 404。业务规则被拒是 500，但 message 为可直接展示的中文（如「账单不存在」「分类"三餐"已存在」）。校验失败是 400 + zod issues。请求体上限 50MB。
[money] 接口层金额一律是元（number）；SQLite 与 database.rows 里是整数分。
[create] POST /api/trpc/bill.create：date=YYYY-MM-DD 必填；name 必填；amount 必填且 ≥0；source 必填可空串；category 必填，命中不了已有分类会被强制归为「杂项」；isAmortized 默认 false；摊销时 amortizationMonths 必填（1-360）；reimbursementStatus 只能 pending|approved|rejected，无报销就省略；reimbursementParty 可选。返回补 id/createdAt/updatedAt 的完整 Bill。
[read] bill.list{year,month,category?,source?,keyword?}（摊销账单按分摊月展开，附 monthlyAmount 与 amortizationMonthIndex）· bill.getById{id} · bill.reimbursements · bill.stats{year,month} · bill.filters · tag.list（两级分类树，parentId=null 为一级）· database.overview · settings.get（含明文 apiKey，勿外传）。
[update] bill.update{id,...字段} · bill.delete{id} → {success:true} · tag.create{name,color:#RRGGBB,icon,parentId?,sortOrder?} · tag.update{id,...} · tag.merge{sourceId,targetId} · tag.delete{id}（「杂项」不可改/删/作合并源；被账单占用或有子分类会被拒绝）。
[recognize] POST /api/trpc/bill.recognize {"text"?:≤5000字,"imageDataUrls"?:≤10张 data URL,"year","month","categories":[],"sources":[],"reimbursementParties":[]} → {"bills":[…]}，只给建议不写库；未配置 AI Key 时 500「请先在设置页面填写并保存 AI API Key」。tag.infer 同理用于推荐父分类/图标/颜色。
[sync] 独立 REST：GET /api/webdav/status · POST /api/webdav/{test,push,pull}（pull 需 {"confirm":true}，会覆盖本地库；POST 请始终带 JSON body，哪怕 {}）· GET /api/database/download · POST /api/database/upload（multipart，字段名 database）。
[rules] 分类优先匹配最具体的子分类，不确定用「杂项」，不要编造新分类；要建新分类先用 tag.create 并让用户确认。
[categories] 当前 ${tagCount} 个分类（本地数据库实时读取）：
${categoryContext}
[task] 从用户给的文字、截图、账单、发票或流水中逐笔识别交易。
[flow] 1) 先输出待确认内容，禁止直接写库；2) 每笔编号 N，命令与详情同号；3) 无法确定的字段标「待确认」，不要臆造；4) 原始材料里的负数金额按支出转正。
[output] 每笔两部分：A. 可直接执行的 fetch 或 curl（调 /api/trpc/bill.create，含登录后的 Cookie 用法）；B. 识别详情 {date, category, name, source, amount, isAmortized, amortizationMonths[, reimbursementStatus, reimbursementParty]}。
[example] fetch("/api/trpc/bill.create",{method:"POST",headers:{"content-type":"application/json"},credentials:"include",body:JSON.stringify({json:{date:"2026-06-22",category:"三餐",name:"午餐",source:"支付宝",amount:36.5,isAmortized:false,amortizationMonths:1}})})`;
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-md border bg-muted/40 p-4 text-sm leading-6">
      <code>{children}</code>
    </pre>
  );
}

function FieldTable({
  fields,
}: {
  fields: {
    name: string;
    type: string;
    required: string;
    description: string;
  }[];
}) {
  return (
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
          {fields.map(field => (
            <TableRow key={field.name}>
              <TableCell className="font-mono">{field.name}</TableCell>
              <TableCell className="font-mono text-xs">{field.type}</TableCell>
              <TableCell className="whitespace-nowrap">
                {field.required}
              </TableCell>
              <TableCell>{field.description}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function EndpointCard({
  id,
  title,
  icon,
  intro,
  rows,
}: {
  id: string;
  title: string;
  icon: ReactNode;
  intro: string;
  rows: EndpointRow[];
}) {
  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(label + " 已复制");
    } catch {
      toast.error("复制失败，请手动选择文本");
    }
  };

  return (
    <Card id={id} className="scroll-mt-24">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          {icon}
          {title}
        </CardTitle>
        <p className="text-sm text-muted-foreground">{intro}</p>
      </CardHeader>
      <CardContent className="pb-2">
        <Accordion type="multiple" className="rounded-md border">
          {rows.map(row => {
            const sample = endpointSamples[row.path];
            const curl = buildCurl(row);
            const response = sample?.response;

            return (
              <AccordionItem key={row.path} value={row.path}>
                <AccordionTrigger className="hover:no-underline">
                  <span className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="font-mono">{row.path}</span>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {row.kind === "query" ? "GET" : "POST"}
                    </Badge>
                    <span className="hidden truncate font-mono text-xs text-muted-foreground lg:inline">
                      {"→ " + row.output}
                    </span>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4 rounded-md border bg-muted/30 p-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div>
                        <div className="mb-1 text-xs text-muted-foreground">
                          入参（json 字段内容）
                        </div>
                        <pre className="overflow-x-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-3 font-mono text-xs leading-5">
                          {sample?.input ?? "无入参"}
                        </pre>
                      </div>
                      <div>
                        <div className="mb-1 text-xs text-muted-foreground">
                          返回类型
                        </div>
                        <pre className="overflow-x-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-3 font-mono text-xs leading-5">
                          {row.output}
                        </pre>
                      </div>
                    </div>

                    <p className="text-sm leading-6 text-muted-foreground">
                      {row.note}
                    </p>

                    {response ? (
                      <div>
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground">
                            {sample?.verified === false
                              ? "示例形状（需已配置 AI，本机未实测）"
                              : "实测返回（data.json 部分）"}
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => copy(response, "返回示例")}
                          >
                            <Copy className="mr-2 h-3.5 w-3.5" />
                            复制
                          </Button>
                        </div>
                        <pre className="overflow-x-auto rounded-md border bg-background p-3 font-mono text-xs leading-5">
                          {response}
                        </pre>
                      </div>
                    ) : null}

                    <div>
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">
                          可直接执行的 curl（需先登录拿 cookies.txt）
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => copy(curl, "curl 命令")}
                        >
                          <Copy className="mr-2 h-3.5 w-3.5" />
                          复制
                        </Button>
                      </div>
                      <CodeBlock>{curl}</CodeBlock>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </CardContent>
    </Card>
  );
}

export default function ApiDocsPage() {
  const { data: tags, isLoading: isTagsLoading } = trpc.tag.list.useQuery();
  const tagCount = tags?.length ?? 0;
  const categoryContext = useMemo(() => formatCategoryContext(tags), [tags]);
  const agentFriendlyContext = useMemo(
    () => buildAgentFriendlyContext(categoryContext, tagCount),
    [categoryContext, tagCount]
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
            后端由 {TRPC_PROCEDURE_COUNT} 个 tRPC procedure 和{" "}
            {REST_ENDPOINT_COUNT} 个独立 REST
            端点组成，全部需要先登录。业务接口清单里的每一项都可以展开，
            展开后能看到入参、返回类型、实测返回结果和可直接执行的 curl。
          </p>
        </div>
        <Badge variant="outline" className="gap-1">
          <BookOpen className="h-3.5 w-3.5" />
          tRPC HTTP + REST
        </Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ListTree className="h-4 w-4" />
            目录
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {docSections.map(section => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="rounded-md border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {section.label}
              </a>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card id="auth" className="scroll-mt-24">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <KeyRound className="h-4 w-4" />
            认证与会话
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            所有 <code className="font-mono">/api/trpc/*</code>、
            <code className="font-mono">/api/webdav/*</code> 和{" "}
            <code className="font-mono">/api/database/*</code>{" "}
            接口都要求已登录， 只有{" "}
            <code className="font-mono">GET /api/auth/session</code> 例外。
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            <li>
              登录成功后服务端下发{" "}
              <code className="font-mono">mav_session</code> Cookie：HttpOnly、
              SameSite=Strict、有效期 8 小时，会话保存在进程内存里，
              <strong className="text-foreground">重启服务即全部失效</strong>。
            </li>
            <li>
              口令不落地：服务器只保存 scrypt 哈希（
              <code className="font-mono">AUTH_PASSWORD_HASH</code>
              ），用 <code className="font-mono">npm run auth:hash</code> 生成。
              未配置时登录返回 503“服务端尚未配置 AUTH_PASSWORD_HASH”， 此时除
              session 外所有接口都不可用。
            </li>
            <li>
              登录限流：同一来源 IP 在 15 分钟窗口内最多 5 次尝试， 超出返回 429
              并带 <code className="font-mono">Retry-After</code> 秒数；
              密码长度上限 1024 字符。
            </li>
            <li>
              带 Cookie 的方式：浏览器 fetch 加{" "}
              <code className="font-mono">credentials: "include"</code>；
              命令行用 <code className="font-mono">curl -c/-b cookies.txt</code>
              。
            </li>
          </ul>
          <CodeBlock>{authFlowExample}</CodeBlock>
        </CardContent>
      </Card>

      <Card id="trpc" className="scroll-mt-24">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Code2 className="h-4 w-4" />
            tRPC 调用约定
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            <li>
              地址形式：
              <code className="font-mono">/api/trpc/{`{procedure}`}</code>
              ，命名空间用点号分隔，例如{" "}
              <code className="font-mono">/api/trpc/bill.create</code>。
            </li>
            <li>
              数据经过 superjson 转换：入参永远包在{" "}
              <code className="font-mono">json</code> 字段里，即{" "}
              <code className="font-mono">{'{"json":{"id":"..."}}'}</code>。
            </li>
            <li>
              <strong className="text-foreground">
                query 只能 GET，mutation 只能 POST
              </strong>
              ，用反了返回 405 METHOD_NOT_SUPPORTED。
            </li>
            <li>
              GET 的入参放在查询串 <code className="font-mono">input</code>；
              无入参的 procedure 可整个省略。有入参却不传会得到 400 的 zod
              报错。
            </li>
            <li>
              批量调用：<code className="font-mono">/api/trpc/a,b?batch=1</code>{" "}
              +{" "}
              <code className="font-mono">input={'{"a":{...},"b":{...}}'}</code>
              ，响应是顺序一致的数组。前端{" "}
              <code className="font-mono">httpBatchLink</code>{" "}
              用的就是这种格式，省略 <code className="font-mono">batch=1</code>{" "}
              会被当成单个 procedure 而 404。
            </li>
            <li>
              成功形状{" "}
              <code className="font-mono">
                {'{"result":{"data":{"json":…}}}'}
              </code>
              ；失败形状{" "}
              <code className="font-mono">{'{"error":{"json":…}}'}</code>
              ，开发环境会额外带 <code className="font-mono">stack</code>
              ，生产环境没有。
            </li>
            <li>
              请求体上限 50MB（<code className="font-mono">bodyLimit</code>）。
              除 <code className="font-mono">/api/webdav/*</code>{" "}
              外的接口都在数据库锁内串行执行，
              数据库被替换时不会有请求踩到旧连接。
            </li>
            <li>
              金额单位：tRPC 出入参都是
              <strong className="text-foreground">元</strong>
              （number），SQLite 与{" "}
              <code className="font-mono">database.rows</code> 里是
              <strong className="text-foreground">整数分</strong>。
            </li>
          </ul>
          <CodeBlock>{protocolExample}</CodeBlock>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <FileJson className="h-4 w-4" />
                成功 / 失败形状
              </div>
              <CodeBlock>{undefinedResponseExample}</CodeBlock>
            </div>
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <AlertTriangle className="h-4 w-4" />
                未登录时
              </div>
              <CodeBlock>{errorResponseExample}</CodeBlock>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card id="errors" className="scroll-mt-24">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ListTree className="h-4 w-4" />
            错误码对照
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>HTTP</TableHead>
                  <TableHead>data.code</TableHead>
                  <TableHead>触发条件</TableHead>
                  <TableHead>怎么处理</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {errorCodes.map(error => (
                  <TableRow key={error.code}>
                    <TableCell className="font-mono">{error.http}</TableCell>
                    <TableCell className="font-mono text-xs whitespace-nowrap">
                      {error.code}
                    </TableCell>
                    <TableCell className="text-xs">{error.when}</TableCell>
                    <TableCell className="text-xs">{error.tip}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <EndpointCard
        id="bill"
        title="bill 账单（9 个）"
        icon={<Receipt className="h-4 w-4" />}
        intro="账单的读写、统计与 AI 识别。摊销账单在 bill.list / bill.stats 里会按分摊月份展开出现。"
        rows={billEndpoints}
      />

      <EndpointCard
        id="tag"
        title="tag 分类（7 个）"
        icon={<Tags className="h-4 w-4" />}
        intro="两级分类树。颜色必须命中 #RRGGBB，图标用 lucide 名称；“杂项”是系统分类，不可改、不可删、不可作为合并源。"
        rows={tagEndpoints}
      />

      <EndpointCard
        id="database"
        title="database 数据库（3 个）"
        icon={<Database className="h-4 w-4" />}
        intro="直接读 SQLite 的表结构分页数据，供「数据库」页使用；返回的是原始行，不是领域对象。"
        rows={databaseEndpoints}
      />

      <EndpointCard
        id="settings"
        title="settings 设置与探活（3 个）"
        icon={<SlidersHorizontal className="h-4 w-4" />}
        intro="AI 配置、WebDAV 配置与报销方列表。AI 相关接口（bill.recognize / tag.infer）能否用，取决于这里是否配置了 apiKey。"
        rows={settingsEndpoints}
      />

      <Card id="bill-create" className="scroll-mt-24">
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
            字段中，并先完成登录。开发环境通常使用当前站点同源地址；生产环境把域名替换为部署后的域名即可。
          </p>
        </CardContent>
      </Card>

      <Card id="bill-fields" className="scroll-mt-24">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileJson className="h-4 w-4" />
            字段说明
          </CardTitle>
        </CardHeader>
        <CardContent>
          <FieldTable fields={createBillFields} />
        </CardContent>
      </Card>

      <Card id="js-example" className="scroll-mt-24">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Code2 className="h-4 w-4" />
            JavaScript 示例
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <CodeBlock>{requestExample}</CodeBlock>
          <p className="text-sm text-muted-foreground">
            浏览器里 <code className="font-mono">credentials: "include"</code>{" "}
            是必须的，否则 Cookie 不会随请求发出，第二步会拿到 401。
          </p>
        </CardContent>
      </Card>

      <Card id="curl-example" className="scroll-mt-24">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Terminal className="h-4 w-4" />
            cURL 示例
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <CodeBlock>{curlExample}</CodeBlock>
          <p className="text-sm text-muted-foreground">
            在 Windows / Git Bash 下请用文件传中文，例如{" "}
            <code className="font-mono">--data-raw @body.json</code>
            ：命令行参数经过 本地代码页转换会把 UTF-8
            汉字变成乱码，接口不会报错，而是静默把账单落进“杂项”。
          </p>
        </CardContent>
      </Card>

      <Card id="response-example" className="scroll-mt-24">
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

      <Card id="ai" className="scroll-mt-24">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-4 w-4" />
            AI 识别接口
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            <code className="font-mono">bill.recognize</code> 与{" "}
            <code className="font-mono">tag.infer</code>{" "}
            只给建议、不写数据库，落库仍需自己调用{" "}
            <code className="font-mono">bill.create</code>
            。两者都要求先在「设置」里填好{" "}
            <code className="font-mono">ai.apiKey</code>（以及可选的{" "}
            <code className="font-mono">ai.baseUrl</code>、
            <code className="font-mono">ai.model</code>
            ）；未配置时两者都返回 500，message 为“请先在设置页面填写并保存 AI
            API Key”——模型配置只读数据库设置，不会回退到环境变量。
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <FieldTable fields={recognizeFields} />
          <CodeBlock>{recognizeExample}</CodeBlock>
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            <li>
              返回的每笔账单字段都是可选的：缺字段表示 AI 无法确定，不要补 0，
              应标记为“待确认”再让用户决定。
            </li>
            <li>
              服务端会做兜底归一化：金额取绝对值、字符串去空白、非法的
              reimbursementStatus 直接丢弃、字符串金额与摊销月数会被解析成数字。
            </li>
            <li>
              若{" "}
              <code className="font-mono">ai.enableBillCategoryMatching</code>{" "}
              开启，识别结果还会用近 5
              个月的相似账单名做二次分类校准（相似度阈值 0.35， 最多取 3
              个候选），这一步会额外调用一次模型。
            </li>
            <li>
              一次最多识别 50 笔、最少 1 笔；模型输出不是合法 JSON 时返回“AI
              识别结果格式不正确，请调整输入后重试”。
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card id="rest" className="scroll-mt-24">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Server className="h-4 w-4" />
            独立 REST 接口
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            认证、WebDAV 同步与数据库导入导出走普通 REST，请求与响应都是直接
            JSON， 不需要包 <code className="font-mono">json</code> 字段。
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Method</TableHead>
                  <TableHead>Path</TableHead>
                  <TableHead>入参</TableHead>
                  <TableHead>返回</TableHead>
                  <TableHead>说明</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {restEndpoints.map(endpoint => (
                  <TableRow key={`${endpoint.method}-${endpoint.path}`}>
                    <TableCell className="font-mono whitespace-nowrap">
                      <Badge variant="outline" className="text-xs">
                        {endpoint.method}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs whitespace-nowrap">
                      {endpoint.path}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {endpoint.input}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {endpoint.output}
                    </TableCell>
                    <TableCell className="text-xs leading-5">
                      {endpoint.note}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <FileJson className="h-4 w-4" />
                GET /api/webdav/status 响应
              </div>
              <CodeBlock>{webdavStatusExample}</CodeBlock>
            </div>
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <Terminal className="h-4 w-4" />
                下载 / 上传 / 拉取
              </div>
              <CodeBlock>{restExample}</CodeBlock>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            其余 <code className="font-mono">/api/*</code> 路径统一返回 404{" "}
            <code className="font-mono">{'{"error":"Not Found"}'}</code>。
            注意一个开发环境的坑：<code className="font-mono">vite dev</code>{" "}
            下不带请求体的 POST 会被{" "}
            <code className="font-mono">bodyLimit</code> 中间件打断并返回 500
            “Internal Server Error”（生产环境实测正常），所以脚本里请始终发送
            JSON body，哪怕只是 <code className="font-mono">{"{}"}</code>。
          </p>
        </CardContent>
      </Card>

      <Card id="agent" className="scroll-mt-24">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Copy className="h-4 w-4" />
            Agent Friendly 上下文
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            一页结构化提示词，按{" "}
            <code className="font-mono">
              [auth] [call] [shape] [create] [read] [recognize] [sync] [task]
              [flow] [output]
            </code>{" "}
            分节，已内嵌当前分类清单。正文不在页面展示，直接复制给 AI Agent
            使用。
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            disabled={isTagsLoading}
            onClick={handleCopyAgentContext}
          >
            <Copy className="mr-2 h-4 w-4" />
            {isTagsLoading ? "正在读取分类…" : "复制到剪贴板"}
          </Button>
          <Badge variant="outline" className="font-mono text-xs">
            {agentFriendlyContext.length} 字符 · {tagCount} 个分类
          </Badge>
        </CardContent>
      </Card>
    </div>
  );
}
