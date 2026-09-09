# 🎁 这次送什么礼物

游戏卡通风格的 AI 送礼顾问：参谋（服务端 LLM Agent）通过 **5~10 个单选题**（也可自由输入）了解送礼需求，自主决定何时收尾，最后献上 **3 个候选礼物**（价格 + 理由 + 仪式感小贴士 + 匹配度）。

pnpm monorepo，一套 Agent 核心，三个宿主/端共享：

| 目录 | 说明 | 技术 |
| --- | --- | --- |
| `packages/agent-core` | **Agent 核心**：协议类型、LLM 接入、Agent 循环、统一服务入口 | AI SDK 7（`ai` + `@ai-sdk/openai-compatible`）+ zod 4 |
| `packages/web` | Web 端（Vercel），`POST /api/agent` 宿主 | Next.js 16 · React 19 · TypeScript 7 |
| `packages/miniprogram` | 微信小程序端（双通道：CloudBase 云函数 / HTTP 直连） | 微信原生 · TypeScript |
| `packages/gift-agent` | 云函数宿主（腾讯云 CloudBase，Vite 打包单文件） | Event Function |

工具链统一：**Node ≥ 24 · TypeScript 7 · ES2022 · Vite 8**（根 `engines` 约束，构建产物零运行时依赖）。

## 🎮 玩法

1. 进入首页，点击 **「我要送礼」** 开始冒险
2. 参谋逐题提问：对象（年龄/性别/身份/收入）、关系亲密度、场合与时机、预算、性格喜好、送礼目的……每题 **1~4 个选项**，不满意可自由输入
3. 问满 10 题强制出报告；答满 5 题后也可以点「差不多了，直接看结果」提前收尾
4. 报告页：3 个礼物卡片（🥇🥈🥉）、匹配度进度条、推荐理由、加分小贴士，可一键复制

Agent 的所有决策（问什么、问几个、什么时候搜、什么时候出报告）都在 **服务端** 完成；前端只是「展示 + 收答案」。

## 🤖 Agent 设计

核心在 `packages/agent-core/src/`，分层原则：**类型判断与业务代码分离**。

| 工具 | 作用 |
| --- | --- |
| `ask_user_question` | 向用户提一个问题（1~4 个选项，用户可自由输入），不带 `execute` → 调用即挂起 |
| `web_search` | 联网查最新礼物趋势 / 价格（Tavily，可选，最多用 2 次），带 `execute` → 循环内自动执行 |
| `deliver_report` | 提交 3 个礼物推荐，流程结束 |

```
                 ┌─ packages/web ────── POST /api/agent（CORS/状态码适配）
未知请求体 ──→ handleAgentRequest（agent-core 统一入口）
                 └─ packages/gift-agent ─ wx.cloud.callFunction（SCF main 适配）
                          │
                     runAgent 主循环（AI SDK generateText + stopWhen 步数预算）
                          │
       wire/ 协议边界层：消息清洗、WireMessage↔ModelMessage 转换、输出规整
       tools.ts zod schema：工具参数声明式校验（无手写类型判断）
```

- **无状态循环**（天然适配 Serverless/多实例）：`messages` 历史由客户端保存并逐轮回传
- **推理模型兼容**（deepseek-reasoner / GLM 思考模式等）：响应里的 `reasoning_content` 由 AI SDK 解析为 reasoning，存入 `WireMessage.reasoning_content` 随历史**回传客户端**；发给 LLM 前自动剥离（DeepSeek 等接口不接受入参携带，会 400）
- 问满 10 题注入系统提醒强制收尾；信息足够（≥5 题）时 agent 也可自行提前结束
- **演示模式**：不配置 `LLM_API_KEY` 时由内置剧本 agent 按同样协议跑通全流程，零成本试用 UI

## 🚀 快速开始（Web 版）

```bash
pnpm install                          # 根目录安装（pnpm workspace）

# 配置 LLM（不配置也能跑，自动进入演示模式）
# 环境变量统一放仓库根目录，Web dev/start 与云函数本地调试共用一份
cp .env.example .env.local            # 编辑填入 LLM_API_KEY 等

pnpm dev                              # http://localhost:3000
```

常用命令（都在根目录执行，无需 `--filter`）：

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 启动 Web 开发服务器（自动预载根 `.env.local`） |
| `pnpm build` | 构建全部产物（Web + 云函数 `packages/gift-agent/index.js`） |
| `pnpm start` | 启动 Web 生产服务器（预载根 `.env.local`） |
| `pnpm typecheck` | 四个包全量类型检查 |
| `pnpm build:function` | 只构建云函数（Vite 单文件） |
| `pnpm smoke` | Web 端演示模式端到端冒烟（需先 `pnpm dev` 或 `pnpm start`） |
| `pnpm test:function` | 云函数本地试跑一轮（预载根 `.env.local`；未配 key 走演示模式） |

冒烟测试（演示模式全流程，无需任何 key）：

```bash
pnpm build && pnpm start &
pnpm smoke
```

### 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `LLM_BASE_URL` | 否 | OpenAI 兼容接口地址，默认 DeepSeek `https://api.deepseek.com/v1` |
| `LLM_API_KEY` | 建议 | 不配置 = 演示模式 |
| `LLM_MODEL` | 否 | 默认 `deepseek-chat`；推理模型（如 `deepseek-reasoner`）自动兼容 `reasoning_content` |
| `TAVILY_API_KEY` | 否 | 联网搜索（[tavily.com](https://tavily.com) 免费注册）；不配则参谋靠自身知识 |

其他 OpenAI 兼容供应商：智谱 `https://open.bigmodel.cn/api/paas/v4`（`glm-4-flash`）、Kimi `https://api.moonshot.cn/v1`、OpenAI `https://api.openai.com/v1` —— 要求模型支持 function calling。

## ▲ 部署 Web 版到 Vercel

1. 代码推到 GitHub，Vercel → **New Project** → Import
2. **Root Directory** 设置为 `packages/web`（monorepo，依赖经根 `pnpm-workspace.yaml` 解析）
3. 配置环境变量（见上表），Deploy 即可

## 📱 微信小程序

1. **微信开发者工具** → 导入项目 → 选择 `packages/miniprogram/` 目录（appid 可先用测试号）
2. 选一条后端通道（`packages/miniprogram/config.ts` 的 `AGENT_BACKEND`）：
   - **`'cloudbase'`（推荐，免域名白名单/免备案）**：部署 `packages/gift-agent` 云函数，步骤见 **[docs/cloudbase.md](docs/cloudbase.md)**
   - **`'http'`（本地联调）**：先启动 Web 版 `pnpm --filter gift-quest-web dev`，`BASE_URL` 保持 `http://localhost:3000`；开发者工具勾选「不校验合法域名」
3. 编译运行即可（TypeScript 由开发者工具 `useCompilerPlugins: ["typescript"]` 自动编译）

⚠️ HTTP 通道正式环境要求 request 域名 **https 且已 ICP 备案**（`*.vercel.app` 无法配置为合法域名）；CloudBase 云函数通道无此限制，正式发布建议走云函数。

## ☁️ 小程序接入腾讯云 CloudBase

把「Next.js 服务器部分」跑成云函数：`packages/gift-agent` 与 Web 版共用 `handleAgentRequest`，小程序 `wx.cloud.callFunction` 直连，免域名白名单、免登录（自动带 OPENID）。完整步骤见 **[docs/cloudbase.md](docs/cloudbase.md)**，概览：

```bash
pnpm build:function    # Vite 打包云函数 → packages/gift-agent/index.js（零依赖单文件）
# 用 CloudBase MCP（manageFunctions）或控制台上传，函数名 gift-agent
# 控制台绑定小程序 AppID → miniprogram/config.ts 切 AGENT_BACKEND='cloudbase'
# 本地试跑（预载根 .env.local）：pnpm test:function
```

## 📁 目录结构

```
gift-advisor/
├─ .env.example                   # 环境变量模板（复制为根 .env.local，Web/云函数本地调试共用）
├─ .npmrc                         # node-linker=hoisted（统一依赖布局）
├─ scripts/
│  ├─ load-env.cjs                # 根 .env.local 预载器（next.config / 云函数试跑共用）
│  └─ test-function.mjs           # pnpm test:function 入口
├─ packages/
│  ├─ agent-core/                  # @gift-advisor/agent-core：Agent 核心（两端共用）
│  │  └─ src/
│  │     ├─ service.ts             # handleAgentRequest：统一服务入口（真/演示分发+兜底）
│  │     ├─ agent.ts               # runAgent 主循环（纯编排）
│  │     ├─ llm.ts                 # AI SDK openai-compatible 模型工厂（env 切换供应商）
│  │     ├─ tools.ts               # zod schema 工具定义（声明式参数校验）
│  │     ├─ history.ts             # 消息历史业务操作
│  │     ├─ mock-agent.ts          # 演示模式剧本
│  │     ├─ prompt.ts / search.ts  # 系统提示词 / Tavily 搜索
│  │     ├─ types.ts               # 前后端共享协议类型
│  │     └─ wire/                  # 协议边界层（所有运行时类型判断集中于此）
│  │        ├─ messages.ts         # 请求体清洗 unknown → WireMessage[]
│  │        ├─ model-messages.ts   # WireMessage ↔ AI SDK ModelMessage（reasoning 只进不出）
│  │        ├─ normalize.ts        # 模型输出规整（选项/报告兜底）
│  │        └─ json.ts             # isRecord / safeJson
│  ├─ web/                         # Web 端（Next.js，Vercel）
│  │  └─ app/api/agent/route.ts    # 宿主适配：HTTP/CORS/状态码
│  ├─ miniprogram/                 # 微信小程序端
│  │  ├─ config.ts                 # AGENT_BACKEND 通道切换（cloudbase / http）
│  │  ├─ app.ts                    # wx.cloud.init
│  │  └─ utils/api.ts              # 双通道封装（callFunction / wx.request）
│  └─ gift-agent/                  # 云函数宿主（CloudBase）
│     ├─ src/index.ts              # 宿主适配：SCF main 导出
│     ├─ vite.config.mts           # Vite library mode 打包单文件 CJS
│     └─ index.js                  # 构建产物（pnpm build:function，勿手改）
└─ docs/cloudbase.md               # CloudBase 接入与部署步骤
```

## 🎨 自定义

- **参谋人设 / 提问策略**：`packages/agent-core/src/prompt.ts` 的 `SYSTEM_PROMPT`
- **问题数量上限**：`packages/agent-core/src/prompt.ts` 的 `MAX_QUESTIONS`（默认 10）
- **主题配色 / 卡通风格**：`packages/web/app/globals.css` 的 `:root` 变量；小程序端对应 `pages/*/*.wxss`
- **搜索供应商**：替换 `packages/agent-core/src/search.ts`（输入 query，输出文字摘要即可）

## ⚠️ 已知限制

- 报告一轮可能包含多次模型调用 + 联网搜索，响应约 10~60s（前端有 loading 动画）；Web 版 `maxDuration=120`（Vercel 需 Fluid Compute），云函数请把超时设为 ≥120s
- messages 历史由客户端回传，便于 Serverless 部署但可被伪造；生产环境建议改存服务端（Redis/DB）并做会话签名
- 演示模式的报告是固定内容，仅用于跑通流程和 UI
