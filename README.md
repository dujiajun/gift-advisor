# 🎁 这次送什么礼物

游戏卡通风格的 AI 送礼顾问：参谋（服务端 LLM Agent）通过 **5~10 个单选题**（也可自由输入）了解送礼需求，自主决定何时收尾，最后献上 **3 个候选礼物**（价格 + 理由 + 仪式感小贴士 + 匹配度）。

pnpm monorepo，一套 Agent 核心，多个宿主/端共享：

| 目录                               | 说明                                                                   | 技术                                                  |
| ---------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------- |
| `packages/agent-core`              | **Agent 核心**：协议类型、LLM 接入、Agent 循环、统一服务入口、存储端口 | AI SDK 7（`ai` + `@ai-sdk/openai-compatible`）+ zod 4 |
| `packages/web`                     | Web 端（Vercel），`POST /api/agent` 宿主                               | Next.js 16 · React 19 · TypeScript 7                  |
| `packages/miniprogram`             | 微信小程序端（双通道：CloudBase 云函数 / HTTP 直连）                   | 微信原生 · TypeScript                                 |
| `packages/gift-agent`              | 云函数宿主（CloudBase，Vite 打包单文件）                               | Event Function                                        |
| `packages/session-store-cloudbase` | 会话存储 CloudBase 文档数据库实现（Web 线上与云函数共用）              | `@cloudbase/node-sdk`                                 |
| `packages/session-store-sqlite`    | 会话存储 SQLite 实现（Node 24 内置 `node:sqlite`，零依赖）             | 本机开发默认                                          |

工具链统一：**Node ≥ 24 · TypeScript 7 · ES2022 · Vite 8 · oxlint/oxfmt**（根 `engines` 约束，构建产物零运行时依赖）。

## 🎮 玩法

1. 进入首页，点击 **「我要送礼」** 开始冒险
2. 参谋逐题提问：对象（年龄/性别/身份/收入）、关系亲密度、场合与时机、预算、性格喜好、送礼目的……每题 **1~4 个选项**，不满意可自由输入
3. 问满 10 题强制出报告；答满 5 题后也可以点「差不多了，直接看结果」提前收尾
4. 报告页：3 个礼物卡片（🥇🥈🥉）、匹配度进度条、推荐理由、加分小贴士，可一键复制

Agent 的所有决策（问什么、问几个、什么时候搜、什么时候出报告）都在 **服务端** 完成；前端只是「展示 + 收答案」。

## 🤖 Agent 设计

核心在 `packages/agent-core/src/`，分层原则：**类型判断与业务代码分离**。

| 工具                | 作用                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------- |
| `ask_user_question` | 向用户提一个问题（1~4 个选项，用户可自由输入），不带 `execute` → 调用即挂起           |
| `web_search`        | 联网查最新礼物趋势 / 价格（Tavily，可选，最多用 2 次），带 `execute` → 循环内自动执行 |
| `deliver_report`    | 提交 3 个礼物推荐，流程结束                                                           |

**服务端会话协议**（LLM 消息原文不出服务端，客户端无法构造/伪造）：

```
POST {action:'start'}                        → 发放 sessionId（轮次 ID）+ 第 1 问
POST {action:'answer', sessionId, answer}    → 下一问 / 最终报告
POST {action:'resume', sessionId}            → 恢复现场（刷新页面/重进小程序后接续）

                   ┌─ packages/web ───── POST /api/agent（注入 SQLite 存储）
客户端（sessionId）─→ handleAgentRequest（agent-core 统一入口，SessionStore 外部注入）
                   └─ packages/gift-agent ─ wx.cloud.callFunction（注入 CloudBase 存储）
                            │
                       runAgent 主循环（AI SDK generateText + stopWhen 步数预算）
                            │
         wire/ 协议边界层：请求解析（unknown → AgentRequest）、WireMessage↔ModelMessage 转换、输出规整
         tools.ts zod schema：工具参数声明式校验（无手写类型判断）
         storage.ts SessionStore 端口：每一轮与每条消息原文持久化
```

- **持久化**（实现外部注入）：SQLite（本机默认，`.data/agent-sessions.db`）/ CloudBase 文档数据库（云函数默认，集合 `agent_sessions`）/ 内存（兜底）
- **推理模型兼容**（deepseek-reasoner / GLM 思考模式等）：响应里的 `reasoning_content` 由 AI SDK 解析为 reasoning，存入服务端会话历史；发给 LLM 前自动剥离（DeepSeek 等接口不接受入参携带，会 400）
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

| 命令                  | 说明                                                        |
| --------------------- | ----------------------------------------------------------- |
| `pnpm dev`            | 启动 Web 开发服务器（自动预载根 `.env.local`）              |
| `pnpm build`          | 构建全部产物（Web + 云函数 `packages/gift-agent/index.js`） |
| `pnpm start`          | 启动 Web 生产服务器（预载根 `.env.local`）                  |
| `pnpm typecheck`      | 五个包全量类型检查                                          |
| `pnpm lint`           | oxlint 校验（`pnpm fmt` 格式化 / `pnpm fmt:check` 只校验）  |
| `pnpm build:function` | 只构建云函数（Vite 单文件）                                 |
| `pnpm smoke`          | Web 端演示模式端到端冒烟（需先 `pnpm dev` 或 `pnpm start`） |
| `pnpm test:function`  | 云函数本地试跑（SQLite 持久化；未配 key 走演示模式）        |

冒烟测试（演示模式全流程，无需任何 key）：

```bash
pnpm build && pnpm start &
pnpm smoke
```

### 环境变量

| 变量                               | 必填 | 说明                                                                                        |
| ---------------------------------- | ---- | ------------------------------------------------------------------------------------------- |
| `LLM_BASE_URL`                     | 否   | OpenAI 兼容接口地址，默认 DeepSeek `https://api.deepseek.com/v1`                            |
| `LLM_API_KEY`                      | 建议 | 不配置 = 演示模式                                                                           |
| `LLM_MODEL`                        | 否   | 默认 `deepseek-chat`；推理模型（如 `deepseek-reasoner`）自动兼容 `reasoning_content`        |
| `TAVILY_API_KEY`                   | 否   | 联网搜索（[tavily.com](https://tavily.com) 免费注册）；不配则参谋靠自身知识                 |
| `SESSION_STORE`                    | 否   | Web 端存储：默认「有 `CLOUD_ENV_ID` 用 cloudbase，否则 sqlite」；可显式 `memory`            |
| `SESSION_DB`                       | 否   | SQLite 文件路径，默认 `.data/agent-sessions.db`                                             |
| `CLOUD_ENV_ID`                     | 否   | CloudBase 环境 ID；配置后 Web 端（Vercel 线上）走 CloudBase 文档数据库                      |
| `TCB_SECRET_ID` / `TCB_SECRET_KEY` | 否   | CloudBase 密钥（云函数外调用需要，函数内免密钥），见 [docs/cloudbase.md](docs/cloudbase.md) |

其他 OpenAI 兼容供应商：智谱 `https://open.bigmodel.cn/api/paas/v4`（`glm-4-flash`）、Kimi `https://api.moonshot.cn/v1`、OpenAI `https://api.openai.com/v1` —— 要求模型支持 function calling。

## ▲ 部署 Web 版到 Vercel

1. 代码推到 GitHub，Vercel → **New Project** → Import
2. **Root Directory** 设置为 `packages/web`（monorepo，依赖经根 `pnpm-workspace.yaml` 解析）
3. 配置环境变量（见上表），Deploy 即可

线上会话存储用 CloudBase 文档数据库（与小程序云函数共用同一套数据与免费额度）：先按 [docs/cloudbase.md](docs/cloudbase.md) 创建环境与 `agent_sessions` 集合，再在 Vercel 配 `CLOUD_ENV_ID` + `TCB_SECRET_ID` + `TCB_SECRET_KEY`（检测到 `CLOUD_ENV_ID` 会自动切换）。什么都不配则退化为内存存储（冷启动丢会话）。

## 📱 微信小程序

1. **微信开发者工具** → 导入项目 → 选择 `packages/miniprogram/` 目录（appid 可先用测试号）
2. 选一条后端通道（`packages/miniprogram/config.ts` 的 `AGENT_BACKEND`）：
   - **`'cloudbase'`（推荐，免域名白名单/免备案）**：部署 `packages/gift-agent` 云函数，步骤见 **[docs/cloudbase.md](docs/cloudbase.md)**
   - **`'http'`（本地联调）**：先启动 Web 版 `pnpm dev`，`BASE_URL` 保持 `http://localhost:3000`；开发者工具勾选「不校验合法域名」
3. 编译运行即可（TypeScript 由开发者工具 `useCompilerPlugins: ["typescript"]` 自动编译）

会话接续：小程序自动在本地保存 `sessionId`，重进问答页会用 `resume` 恢复现场（服务端持久化），答完的轮次不会丢。

⚠️ HTTP 通道正式环境要求 request 域名 **https 且已 ICP 备案**（`*.vercel.app` 无法配置为合法域名）；CloudBase 云函数通道无此限制，正式发布建议走云函数。

## ☁️ 小程序接入腾讯云 CloudBase

把「Next.js 服务器部分」跑成云函数：`packages/gift-agent` 与 Web 版共用 `handleAgentRequest`，小程序 `wx.cloud.callFunction` 直连，免域名白名单、免登录（自动带 OPENID）。完整步骤见 **[docs/cloudbase.md](docs/cloudbase.md)**，概览：

```bash
pnpm build:function    # Vite 打包云函数 → packages/gift-agent/index.js（单文件）
# 用 CloudBase MCP（manageFunctions）或控制台上传，函数名 gift-agent
# 创建 agent_sessions 集合（会话持久化）→ 控制台绑定小程序 AppID
# miniprogram/config.ts 切 AGENT_BACKEND='cloudbase'
# 本地试跑：pnpm test:function
```

## 📁 目录结构

```
gift-advisor/
├─ .env.example                   # 环境变量模板（复制为根 .env.local，Web/云函数本地调试共用）
├─ .npmrc / .oxlintrc.json / .oxfmtrc.json   # 依赖布局 / lint / 格式化配置
├─ scripts/
│  ├─ load-env.cjs                # 根 .env.local 预载器（next.config / 云函数试跑共用）
│  └─ test-function.mjs           # pnpm test:function 入口（新协议全流程断言）
├─ packages/
│  ├─ agent-core/                  # @gift-advisor/agent-core：Agent 核心（多宿主共用）
│  │  └─ src/
│  │     ├─ service.ts             # handleAgentRequest：start/answer/resume + 存储注入
│  │     ├─ storage.ts             # SessionStore 端口 + 内存实现（AgentSession/TurnRecord）
│  │     ├─ agent.ts               # runAgent 主循环（纯编排）
│  │     ├─ llm.ts                 # AI SDK openai-compatible 模型工厂（env 切换供应商）
│  │     ├─ tools.ts               # zod schema 工具定义（声明式参数校验）
│  │     ├─ history.ts             # 消息历史业务操作
│  │     ├─ mock-agent.ts          # 演示模式剧本
│  │     ├─ prompt.ts / search.ts  # 系统提示词 / Tavily 搜索
│  │     ├─ types.ts               # 共享协议类型（AgentRequest/AgentResponse…）
│  │     └─ wire/                  # 协议边界层（所有运行时类型判断集中于此）
│  │        ├─ messages.ts         # 请求解析 unknown → AgentRequest；历史清洗
│  │        ├─ model-messages.ts   # WireMessage ↔ AI SDK ModelMessage（reasoning 只进不出）
│  │        ├─ normalize.ts        # 模型输出规整（选项/报告兜底）
│  │        └─ json.ts             # isRecord / safeJson
│  ├─ web/                         # Web 端（Next.js，Vercel）
│  │  ├─ app/api/agent/route.ts    # 宿主适配：HTTP/CORS/状态码 + 注入 SQLite 存储
│  │  └─ app/page.tsx              # sessionId 状态机 + localStorage resume
│  ├─ miniprogram/                 # 微信小程序端（微信工具链不支持 paths，保留相对导入）
│  │  ├─ config.ts                 # AGENT_BACKEND 通道切换（cloudbase / http）
│  │  ├─ app.ts                    # wx.cloud.init
│  │  └─ utils/api.ts              # 双通道封装 + sessionId 本地存储/resume
│  ├─ gift-agent/                  # 云函数宿主（CloudBase）
│  │  ├─ src/index.ts              # SCF main + 存储注入（默认 CloudBase，可切 memory/sqlite）
│  │  ├─ vite.config.mts           # Vite library mode 打包单文件 CJS
│  │  └─ index.js                  # 构建产物（pnpm build:function，勿手改）
│  ├─ session-store-cloudbase/     # CloudBase 文档数据库实现（Web 线上与云函数共用）
│  └─ session-store-sqlite/        # SQLite 存储实现（node:sqlite，惰性加载）
└─ docs/cloudbase.md               # CloudBase 接入与部署步骤
```

## 🎨 自定义

- **参谋人设 / 提问策略**：`packages/agent-core/src/prompt.ts` 的 `SYSTEM_PROMPT`
- **问题数量上限**：`packages/agent-core/src/prompt.ts` 的 `MAX_QUESTIONS`（默认 10）
- **主题配色 / 卡通风格**：`packages/web/app/globals.css` 的 `:root` 变量；小程序端对应 `pages/*/*.wxss`
- **搜索供应商**：替换 `packages/agent-core/src/search.ts`（输入 query，输出文字摘要即可）
- **换存储**：实现 `SessionStore` 接口（`packages/agent-core/src/storage.ts`）并在宿主注入即可

## ⚠️ 已知限制

- 报告一轮可能包含多次模型调用 + 联网搜索，响应约 10~60s（前端有 loading 动画）；Web 版 `maxDuration=120`（Vercel 需 Fluid Compute），云函数请把超时设为 ≥120s
- **Vercel 文件系统只读**：线上 Web 版配 `CLOUD_ENV_ID` + `TCB_SECRET_ID/KEY` 走 CloudBase 文档数据库（推荐，与小程序共用免费额度）；都不配时为内存存储，冷启动丢会话；SQLite 仅本机/自托管可用
- `node:sqlite` 在 Node 24 标记为 experimental（可用，仅启动时有警告）
- 演示模式的报告是固定内容，仅用于跑通流程和 UI
