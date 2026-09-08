# 🎁 这次送什么礼物

游戏卡通风格的 AI 送礼顾问：参谋（服务端 LLM Agent）通过 **5~10 个单选题**（也可自由输入）了解送礼需求，自主决定何时收尾，最后献上 **3 个候选礼物**（价格 + 理由 + 仪式感小贴士 + 匹配度）。

仓库包含两端，共用同一个后端 Agent API：

| 目录 | 说明 | 技术栈 |
| --- | --- | --- |
| `web/` | Web 版，可部署到 Vercel | Next.js 16 · React 19 · TypeScript · pnpm |
| `miniprogram/` | 微信小程序版 | 微信原生 · TypeScript（`useCompilerPlugins`） |

## 🎮 玩法

1. 进入首页，点击 **「我要送礼」** 开始冒险
2. 参谋逐题提问：对象（年龄/性别/身份/收入）、关系亲密度、场合与时机、预算、性格喜好、送礼目的……每题 **1~4 个选项**，不满意可自由输入
3. 问满 10 题强制出报告；答满 5 题后也可以点「差不多了，直接看结果」提前收尾
4. 报告页：3 个礼物卡片（🥇🥈🥉）、匹配度进度条、推荐理由、加分小贴士，可一键复制

Agent 的所有决策（问什么、问几个、什么时候搜、什么时候出报告）都在 **服务端** 完成；前端只是「展示 + 收答案」。

## 🤖 Agent 设计

定义在 `web/lib/`，运行在 `POST /api/agent`（`web/app/api/agent/route.ts`）：

| 工具 | 作用 |
| --- | --- |
| `ask_user_question` | 向用户提一个问题（1~4 个选项，用户可自由输入） |
| `web_search` | 联网查最新礼物趋势 / 价格（Tavily，可选，最多用 2 次） |
| `deliver_report` | 提交 3 个礼物推荐，流程结束 |

**无状态循环**（天然适配 Serverless/多实例）：

```
客户端 POST { messages, answer }        ← messages 历史由客户端保存并逐轮回传
  → 服务端循环调用 LLM（最多 12 步）
      ├─ ask_user_question → 返回 pending.question，挂起等用户
      ├─ web_search        → 服务端执行搜索，结果回填继续循环
      └─ deliver_report    → 返回 pending.report，流程结束
客户端渲染 pending，把新 messages 存下来
```

- 问满 10 题后服务端会注入系统提醒强制收尾；信息足够（≥5 题）时 agent 也可自行提前结束
- **演示模式**：不配置 `LLM_API_KEY` 时由内置剧本 agent 按同样协议跑通全流程，方便零成本试用 UI

## 🚀 快速开始（Web 版）

```bash
cd web
pnpm install

# 配置 LLM（不配置也能跑，自动进入演示模式）
cp .env.example .env.local   # 编辑填入 LLM_API_KEY 等

pnpm dev                     # http://localhost:3000
```

冒烟测试（演示模式全流程，无需任何 key）：

```bash
pnpm build && pnpm start &   # 或 pnpm dev
node scripts/smoke-test.mjs http://localhost:3000
```

## ▲ 部署到 Vercel

1. 代码推到 GitHub，Vercel → **New Project** → Import
2. **Root Directory** 设置为 `web`
3. 配置环境变量（见下表），Deploy 即可

或用 CLI：`cd web && pnpm dlx vercel --prod`

### 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `LLM_BASE_URL` | 否 | OpenAI 兼容接口地址，默认 DeepSeek `https://api.deepseek.com/v1` |
| `LLM_API_KEY` | 建议 | 不配置 = 演示模式 |
| `LLM_MODEL` | 否 | 默认 `deepseek-chat` |
| `TAVILY_API_KEY` | 否 | 联网搜索（[tavily.com](https://tavily.com) 免费注册）；不配则参谋靠自身知识 |

其他可用的 OpenAI 兼容供应商：智谱 `https://open.bigmodel.cn/api/paas/v4`（`glm-4-flash`）、Kimi `https://api.moonshot.cn/v1`、OpenAI `https://api.openai.com/v1` —— 要求模型支持 function calling。

## 📱 微信小程序版

1. **微信开发者工具** → 导入项目 → 选择 `miniprogram/` 目录（appid 可先用测试号）
2. 先启动后端（Web 版的 `pnpm dev`，或部署后的线上地址），修改 `miniprogram/config.ts`：
   ```ts
   export const BASE_URL = 'http://localhost:3000';   // 本地开发
   // export const BASE_URL = 'https://your-api.example.com';  // 线上
   ```
3. 本地调试：开发者工具 → 详情 → 本地设置 → 勾选 **「不校验合法域名」**
4. 编译运行即可（TypeScript 由开发者工具通过 `useCompilerPlugins: ["typescript"]` 自动编译）

⚠️ **真机/上线注意**：小程序正式环境要求 request 域名为 **https 且已 ICP 备案**。`*.vercel.app` 无法配置为合法域名，正式发布需要自备备案域名（或在 requests 合法域名下加国内中转）；开发版/体验版用「不校验合法域名」+ 打开手机调试即可真机联调。

## 📁 目录结构

```
gift/
├─ web/                        # Web 版（Vercel）
│  ├─ app/
│  │  ├─ page.tsx              # 首页 + 问答 + 报告（单页状态机）
│  │  ├─ layout.tsx / globals.css  # 游戏卡通风样式
│  │  └─ api/agent/route.ts    # Agent API（CORS 已开，可供小程序直连）
│  ├─ lib/
│  │  ├─ agent.ts              # 服务端 Agent 主循环 + 参谋人设 SYSTEM_PROMPT
│  │  ├─ tools.ts              # ask_user_question / web_search / deliver_report
│  │  ├─ llm.ts                # OpenAI 兼容客户端（fetch）
│  │  ├─ search.ts             # Tavily 搜索（可替换）
│  │  ├─ agent-utils.ts        # 消息清洗 / 协议规整
│  │  ├─ mockAgent.ts          # 演示模式剧本 agent
│  │  └─ types.ts              # 前后端共享协议类型
│  └─ scripts/smoke-test.mjs   # 端到端冒烟测试
└─ miniprogram/                # 微信小程序版（TypeScript）
   ├─ config.ts                # 后端地址 BASE_URL
   ├─ utils/api.ts             # wx.request 封装 + 协议类型
   └─ pages/
      ├─ index/                # 首页（我要送礼）
      └─ quiz/                 # 问答 + 报告页
```

## 🎨 自定义

- **参谋人设 / 提问策略**：`web/lib/agent.ts` 的 `SYSTEM_PROMPT`
- **问题数量上限**：`web/lib/agent.ts` 的 `MAX_QUESTIONS`（默认 10）
- **主题配色 / 卡通风格**：`web/app/globals.css` 的 `:root` 变量；小程序端对应 `pages/*/*.wxss`
- **搜索供应商**：替换 `web/lib/search.ts`（输入 query，输出文字摘要即可）

## ⚠️ 已知限制

- 报告一轮可能包含多次模型调用 + 联网搜索，响应约 10~60s（前端有 loading 动画）；Vercel 函数 `maxDuration=120`，需 Fluid Compute 支持（新项目默认开启）
- messages 历史由客户端回传，便于 Serverless 部署但可被伪造；生产环境建议改存服务端（Redis/DB）并做会话签名
- 演示模式的报告是固定内容，仅用于跑通流程和 UI
