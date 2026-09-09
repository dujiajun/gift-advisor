# ☁️ 小程序接入腾讯云 CloudBase

把原来跑在 Next.js 里的服务端 Agent（`POST /api/agent`）迁移为 CloudBase 云函数，小程序通过 `wx.cloud.callFunction` 直连。

**收益**：

- 免 request 合法域名白名单、免 ICP 备案（云函数通道不走 `wx.request`）
- 免登录：调用自动携带微信身份（云函数内可从 `cloud.getWXContext()` 拿 OPENID，本项目无状态暂不需要）
- 与 Web 版**共用同一份 Agent 核心**（`packages/agent-core` 的 `handleAgentRequest`），协议完全同构

```
wx.cloud.callFunction({ name: 'gift-agent', data: { messages, answer } })
  → packages/gift-agent/index.js（Vite 单文件产物，零运行时依赖）
    → handleAgentRequest（packages/agent-core）
```

---

## 1. 开通 CloudBase 环境

- 前往 [CloudBase 控制台](https://tcb.cloud.tencent.com/) → 创建环境（每账号有 1 个免费额度环境）
- 记下**环境 ID**（形如 `gift-advisor-3g1a2b`，环境概览页可见）

## 2. 构建云函数产物

```bash
pnpm install
pnpm build:function        # → packages/gift-agent/index.js（单文件 CJS，含 AI SDK/zod）
```

## 3. 部署函数

### 方式 A：CloudBase MCP（推荐，本仓库已配置 cloudbase skills）

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
     ignore: ["src/**", "node_modules/**", "vite.config.mts", "tsconfig.json", "*.ts"]
   })
```

> `functionRootPath` 指向 `packages/`，函数名 `gift-agent` 对应 `packages/gift-agent/` 子目录；上传内容以构建产物 `index.js` + `package.json` 为准（`ignore` 排除源码与构建工具）。

### 方式 B：控制台手动上传

云函数控制台 → 新建函数（运行时 Node.js 20+，超时 ≥120s，内存 256MB）→ 本地 `pnpm build:function` 后，把 `packages/gift-agent/` 下的 `index.js` 与 `package.json` 打 zip 上传 → 在函数配置里添加环境变量（同上）。

### 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `LLM_BASE_URL` | 否 | OpenAI 兼容接口，默认 DeepSeek |
| `LLM_API_KEY` | 建议 | 不配置 = 演示模式（内置剧本，可先跑通链路再配） |
| `LLM_MODEL` | 否 | 默认 `deepseek-chat`；推理模型自动兼容 `reasoning_content` |
| `TAVILY_API_KEY` | 否 | 联网搜索（可选） |

## 4. 绑定小程序 AppID

CloudBase 控制台 → 环境 → **授权管理** → 添加微信公众号/小程序 → 填入小程序 AppID（本项目为 `wx2bfc338b9f53ac4e`，`packages/miniprogram/project.config.json` 可查）。

## 5. 切换小程序通道

编辑 `packages/miniprogram/config.ts`：

```ts
export const AGENT_BACKEND: AgentBackend = 'cloudbase';
export const CLOUD_ENV_ID = '<你的环境ID>';   // 第 1 步记下的
```

`app.ts` 会在启动时 `wx.cloud.init({ env: CLOUD_ENV_ID, traceUser: true })`，`utils/api.ts` 自动改走 `wx.cloud.callFunction`。

## 6. 验证

- 微信开发者工具打开 `packages/miniprogram/`，编译预览：能正常提问/出报告即通
- 未配 `LLM_API_KEY` 时首屏回答带「演示模式」字样，说明链路已通、只差 key
- 排查：CloudBase 控制台 → 云函数 → `gift-agent` → 日志查询（或 MCP `queryFunctions(action="listFunctionLogs", functionName="gift-agent")`）

## 常见问题

- **调用报 `-404013 / env not found`**：`CLOUD_ENV_ID` 填错，或环境未绑定该小程序 AppID（回看第 4 步）
- **超时（状态码 433 / `function timeout`）**：报告轮较慢，确认函数超时已设为 ≥120s
- **想改回 HTTP 直连**：`AGENT_BACKEND = 'http'` 并配好 `BASE_URL`（正式环境需 https + 备案域名）
- **更新函数**：改完代码后 `pnpm build:function`，再 `manageFunctions(action="updateFunctionCode", ...)`
