# ☁️ 小程序接入腾讯云 CloudBase

把原来跑在 Next.js 里的服务端 Agent（`POST /api/agent`）迁移为 CloudBase 云函数，小程序通过 `wx.cloud.callFunction` 直连。

**收益**：

- 免 request 合法域名白名单、免 ICP 备案（云函数通道不走 `wx.request`）
- 免登录：调用自动携带微信身份（云函数内可从 `cloud.getWXContext()` 拿 OPENID）
- 与 Web 版**共用同一份 Agent 核心**（`packages/agent-core` 的 `handleAgentRequest`），协议完全同构
- 会话状态持久化在 CloudBase 文档数据库（每轮与每条消息原文都落库），用户重进小程序可 `resume` 恢复现场

```
wx.cloud.callFunction({ name: 'gift-agent', data: { action, sessionId?, answer? } })
  → packages/gift-agent/index.js（Vite 单文件产物，运行时零依赖）
    → handleAgentRequest（packages/agent-core，注入 CloudBaseSessionStore）
      → 集合 agent_sessions（一个会话一条文档：messages / turns / current）
```

---

## 1. 开通 CloudBase 环境

- 前往 [CloudBase 控制台](https://tcb.cloud.tencent.com/) → 创建环境（每账号有 1 个免费额度环境）
- 记下**环境 ID**（形如 `gift-advisor-3g1a2b`，环境概览页可见）

## 2. 创建会话集合

云函数默认把会话存到文档数据库集合 **`agent_sessions`**（无需建索引，`_id` = sessionId）：

- 控制台：数据库 → 新建集合 `agent_sessions`
- 或 MCP：`writeNoSqlDatabaseStructure(action="createCollection", collectionName="agent_sessions")`

## 3. 构建云函数产物

```bash
pnpm install
pnpm build:function        # → packages/gift-agent/index.js（单文件 CJS，含 AI SDK/zod/CloudBase SDK）
```

## 4. 部署函数

### 方式 A：CloudBase MCP（推荐）

```text
1. auth(action="start_auth", authMode="device")   # 设备码登录（首次）
2. auth(action="set_env", envId="<你的环境ID>")
3. manageFunctions(action="createFunction", functionRootPath="<仓库>/packages",
   func={
     name: "gift-agent",
     runtime: "Nodejs20.19",          # 环境可用的最高 Node 运行时（本地开发用 Node 24）
     handler: "index.main",
     timeout: 120,                    # 报告轮含多次 LLM 调用+搜索，别用默认 3s
     envVariables: { LLM_BASE_URL, LLM_API_KEY, LLM_MODEL, TAVILY_API_KEY },
     ignore: ["src/**", "node_modules/**", "vite.config.mts", "tsconfig.json", "*.mts"]
   })
```

> `functionRootPath` 指向 `packages/`，函数名 `gift-agent` 对应 `packages/gift-agent/` 子目录；上传内容以构建产物 `index.js` + `package.json` 为准（`ignore` 排除源码与构建工具）。

### 方式 B：控制台手动上传

云函数控制台 → 新建函数（运行时 Node.js 20+，超时 ≥120s，内存 256MB）→ 本地 `pnpm build:function` 后，把 `packages/gift-agent/` 下的 `index.js` 与 `package.json` 打 zip 上传 → 在函数配置里添加环境变量（同上）。

### 环境变量

| 变量             | 必填 | 说明                                                                                                                             |
| ---------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------- |
| `LLM_BASE_URL`   | 否   | OpenAI 兼容接口，默认 DeepSeek                                                                                                   |
| `LLM_API_KEY`    | 建议 | 不配置 = 演示模式（内置剧本，可先跑通链路再配）                                                                                  |
| `LLM_MODEL`      | 否   | 默认 `deepseek-chat`；推理模型自动兼容 `reasoning_content`                                                                       |
| `TAVILY_API_KEY` | 否   | 联网搜索（可选）                                                                                                                 |
| `SESSION_STORE`  | 否   | 默认 `cloudbase`（文档数据库）；`memory` 进程内存（不持久化）；`sqlite` 本地联调（需 Node ≥24 运行时，文件由 `SESSION_DB` 指定） |

## 5. 绑定小程序 AppID

CloudBase 控制台 → 环境 → **授权管理** → 添加微信公众号/小程序 → 填入小程序 AppID（本项目为 `wx2bfc338b9f53ac4e`，`packages/miniprogram/project.config.json` 可查）。

## 6. 切换小程序通道

编辑 `packages/miniprogram/config.ts`：

```ts
export const AGENT_BACKEND: AgentBackend = 'cloudbase';
export const CLOUD_ENV_ID = '<你的环境ID>'; // 第 1 步记下的
```

`app.ts` 会在启动时 `wx.cloud.init({ env: CLOUD_ENV_ID, traceUser: true })`，`utils/api.ts` 自动改走 `wx.cloud.callFunction`。`sessionId` 保存在本地，重进问答页会自动 `resume` 恢复现场。

## 7. 验证

- 微信开发者工具打开 `packages/miniprogram/`，编译预览：能正常提问/出报告即通
- 未配 `LLM_API_KEY` 时首屏回答带「演示模式」字样，说明链路已通、只差 key
- 本地（不经云端）试跑：`pnpm test:function`（SQLite 存储，验证 start/answer/resume 全协议）
- 排查：CloudBase 控制台 → 云函数 → `gift-agent` → 日志查询（或 MCP `queryFunctions(action="listFunctionLogs", functionName="gift-agent")`）
- 会话数据：控制台 → 数据库 → `agent_sessions` 集合（`messages` 每条消息原文、`turns` 逐轮问答记录）

## 常见问题

- **调用报 `-404013 / env not found`**：`CLOUD_ENV_ID` 填错，或环境未绑定该小程序 AppID（回看第 5 步）
- **超时（状态码 433 / `function timeout`）**：报告轮较慢，确认函数超时已设为 ≥120s
- **数据库报 collection 不存在**：先完成第 2 步创建 `agent_sessions` 集合
- **想改回 HTTP 直连**：`AGENT_BACKEND = 'http'` 并配好 `BASE_URL`（正式环境需 https + 备案域名）
- **更新函数**：改完代码后 `pnpm build:function`，再 `manageFunctions(action="updateFunctionCode", ...)`
- **Web 版（Vercel）用 CloudBase 存储**：已内置（`packages/session-store-cloudbase`，Web 与云函数共用）。在 Vercel 环境变量里配 `CLOUD_ENV_ID` + `TCB_SECRET_ID` + `TCB_SECRET_KEY` 即自动启用（云函数外调用需要密钥，函数内免密钥）
