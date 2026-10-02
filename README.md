# 账有数｜让每一笔账都有价值

![账有数项目封面](assets/readme-hero.png)

这是一个2026年的个人财务账单记账小工具。

- 项目前后端分离，为AI提供友好接口。
- 使用成熟数据库系统存储所有重要数据，保证数据安全。
- 系统内嵌功能强大的AI助手，解放双手

## 设计哲学

在学习了《会计学原理》这门课后，我对记账这件事情有了更加深刻的认识。记账的最终目的，确实是为了更好地管理财务状况，提供可供决策的有用信息；但与此同时，记账本身不能消耗过高的时间和精力成本，否则就会本末倒置。

遗憾的是，在 2026 年做个人财务记账仍然困难重重。支付宝、微信、银行卡等复杂且互不兼容的账单来源，使得第一步的信息收集就足够让人焦头烂额。分期、贷款、赊账、大额均摊等非一次性交割钱款与货物的场景，需要一定的会计处理能力，但个人记账系统又必须避免直接引入繁复的“借贷”复式记账体系。

我们每个人在社会中都难免与商业系统打交道，报销也是不得不面对的一环。如何科学、高效地追踪报销流程，是个人财务管理中非常现实的需求。更进一步，如何从大量账单中一目了然地提炼出真正有用的信息，并服务于日常决策，是这个项目不应忘记的初心。

还有一点，一个在 2026 年开发的系统应该竭尽所能地利用 AI 大模型的能力。任何人工密集型的工作都应该尽量交由 AI 代劳，任何繁杂的人机交互操作都应该被减少、简化，或者交给 AI 完成。

## 功能概览

- 账单记录：新增、编辑、删除、筛选、排序账单。
- AI 识别：支持文字、上传图片、粘贴剪贴板图片识别账单，并支持一次识别多笔账单。
- 分类管理：支持二级分类、图标、颜色、分类合并，以及“杂项”兜底分类。
- 摊销：一笔账单可以按月摊销，月度统计按本月摊销金额计算。
- 报销管理：单独展示需要报销的账单，并支持导出 CSV。
- 统计图表：展示月度支出、实际支出、报销金额、分类统计和分类饼图。
- 数据库管理：查看和编辑原始数据表，支持下载 DB、上传 DB 并覆盖本地数据库。
- API 与文档：内置新增账单 API 示例，以及可复制给 AI Agent 的上下文说明。

## 技术栈

- 前端：React 19、Vite、React Router、Tailwind CSS、Radix UI、Recharts
- 后端：Hono、tRPC、Zod
- 数据库：SQLite/libSQL、Drizzle ORM、`@libsql/client`
- AI：OpenAI SDK，使用 OpenAI 兼容接口
- 构建：Vite + esbuild

## 运行要求

- Node.js
- npm

当前项目不是纯静态站点。生产环境需要 Node.js 进程同时提供静态资源、API 和本地数据库访问。

## 环境变量

复制 `.env.example` 为 `.env`：

```bash
cp .env.example .env
```

主要配置：

```env
DATABASE_URL=file:data/app.db
AUTH_PASSWORD_HASH=scrypt$...
```

说明：

- `DATABASE_URL` 默认使用本地 SQLite 文件 `data/app.db`。
- `AUTH_PASSWORD_HASH` 是必填的 scrypt 密码哈希，不要保存明文密码。运行 `npm run auth:hash`，按提示输入密码，再将输出复制到 `.env`。
- 登录会话只保存在服务进程内存中，服务重启会使所有会话失效；多实例部署时每个实例的会话不共享，需要粘性会话或改用共享会话存储。
- 生产环境必须使用 HTTPS；HttpOnly Cookie 可以防止前端 JavaScript 读取 token，但不能在明文 HTTP 中保护登录密码或 Cookie 传输。
- AI 配置只从数据库读取，请在前端“设置”页面维护 API Key、Base URL 和模型。
- 前端“设置”页面也可以维护报销方、分类匹配开关和数据库导入导出。

## 本地开发

安装依赖：

```bash
npm install
```

先生成并配置登录密码哈希：

```bash
npm run auth:hash
# 将输出的 AUTH_PASSWORD_HASH=scrypt$... 写入 .env
```

启动开发服务：

```bash
npm run dev
```

默认访问：

```text
http://localhost:3000
```

开发环境由 Vite 启动，并通过 `@hono/vite-dev-server` 挂载后端 API。

## 构建与生产运行

构建：

```bash
npm run build
```

生产运行：

```bash
npm run start
```

生产环境默认监听 `3000` 端口，也可以通过 `PORT` 指定：

```bash
PORT=3001 npm run start
```

构建产物：

- `dist/public`：前端静态资源
- `dist/boot.js`：Node.js 后端入口，同时托管静态资源和 `/api/*`

认证接口：

- `POST /api/auth/login`：提交 `{ "password": "..." }`，服务端通过 HttpOnly、SameSite=Strict cookie 建立临时会话。
- `GET /api/auth/session`：查询当前会话。
- `POST /api/auth/logout`：清除当前会话。

除认证接口外，tRPC 过程和数据库下载/上传接口都需要登录。浏览器端只使用 cookie，不会将密码或会话 token 写入 localStorage/sessionStorage。

### 登录认证原理

登录认证的密码传递和会话建立流程如下：

```text
浏览器密码
    ↓ HTTPS 请求
后端 scrypt 验证
    ↓
HttpOnly 临时 Cookie
```

具体说明：

1. 用户在登录页面输入密码，前端仅通过同源 HTTPS 请求将密码提交给后端，不在浏览器中保存密码，也不在前端自行判断密码是否正确。
2. 后端使用环境变量 `AUTH_PASSWORD_HASH` 中保存的 scrypt 哈希验证密码。服务端不保存明文密码。
3. 密码正确后，后端生成密码学安全的随机临时 token，并通过 `Set-Cookie` 写入 `HttpOnly` Cookie。token 不会出现在 JSON 响应中，也不会写入 `localStorage` 或 `sessionStorage`。
4. 后续请求由浏览器自动携带该 Cookie，后端验证 token 是否有效以及是否过期。当前临时会话有效期为 8 小时。
5. `HttpOnly` 防止前端 JavaScript 读取 token，`SameSite=Strict` 降低跨站请求伪造风险；生产环境还会启用 `Secure`，因此必须使用 HTTPS。

> 生产环境必须使用 HTTPS。`HttpOnly` 只能防止 JavaScript 读取 Cookie，不能保护明文 HTTP 传输中的密码和 Cookie。当前会话只保存在 Node.js 进程内存中，服务重启会使会话失效，多实例部署需要共享会话存储或粘性会话。

## 常用脚本

```bash
npm run dev        # 启动开发服务
npm run build      # 构建前端和后端
npm run start      # 启动生产服务
npm run check      # TypeScript 类型检查
npm run lint       # ESLint 检查
npm run test       # 运行测试
npm run format     # Prettier 格式化
```

数据库相关脚本：

```bash
npm run db:generate
npm run db:migrate
npm run db:push
```

当前应用启动时也会自动确保基础表结构存在。

## 页面说明

- `概览`：月度统计、分类统计、账单明细、新增账单。
- `报销管理`：按时间展示需要报销的账单，支持导出 CSV。
- `分类管理`：维护二级分类、图标、颜色，支持 AI 推断分类属性和合并分类。
- `数据库`：查看、编辑原始数据库表内容。
- `API与文档`：展示新增账单的 tRPC HTTP 调用方式和 Agent Friendly 上下文。
- `设置`：维护报销方、AI 配置、分类匹配开关，以及 DB 下载/上传覆盖。

## 数据与备份

默认数据库文件：

```text
data/app.db
```

建议定期使用“设置 -> 数据概览 -> 下载 DB”导出备份。上传 DB 覆盖会替换当前本地数据库文件，操作前应用会要求确认。

## API 示例：新增账单

接口是 tRPC HTTP，不是普通 REST。新增账单使用：

```text
POST /api/trpc/bill.create
```

请求示例：

```bash
curl -X POST "http://localhost:3000/api/trpc/bill.create" \
  -H "content-type: application/json" \
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
  }'
```

字段要点：

- `date`：`YYYY-MM-DD`
- `category`：分类名称；如果未命中现有分类，后端会强制归为“杂项”
- `name`：账单名称
- `source`：来源，可以为空字符串
- `amount`：支出金额，必须大于等于 0
- `isAmortized`：是否摊销
- `amortizationMonths`：摊销月数，范围 1 到 360
- `reimbursementStatus`：可选，`pending`、`approved`、`rejected`
- `reimbursementParty`：可选，报销方

## 部署注意事项

- 不能只部署 `dist/public` 到纯静态托管，否则 `/api/*`、数据库和 AI 识别不可用。
- 需要持久化 `data/app.db`，否则重启或重新部署可能丢失数据。
- 如果使用反向代理，确保 `/api/*` 和前端页面都转发到同一个 Node.js 服务。
- 如果使用远程 libSQL，需要调整 `DATABASE_URL`，并确认 DB 上传/下载功能是否符合部署方式。
