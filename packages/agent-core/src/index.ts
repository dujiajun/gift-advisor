/**
 * 礼物参谋 Agent 核心的公共出口。
 * 被 packages/web（Next.js API Route）与 packages/gift-agent（CloudBase 云函数）共同引用。
 *
 * 分层约定（类型判断与业务代码分离）：
 * - src/wire/   协议边界层：集中所有运行时类型判断
 *     - messages.ts       客户端请求体解析（unknown → AgentRequest）与历史清洗
 *     - model-messages.ts WireMessage[] ↔ AI SDK ModelMessage[]（reasoning 只进不出）
 *     - normalize.ts      模型输出的展示规整（选项/礼物报告的兜底与截断）
 *     - json.ts           基础判断与安全 JSON 解析
 *     - text.ts           按码点截断 + 孤立代理项清洗（emoji 不能被 slice 切开）
 * - 工具参数校验  由 tools.ts 的 zod schema 声明式承担（AI SDK 自动校验）
 * - 会话持久化    只有端口（SessionStore）在 core；实现外部注入：
 *     - 本机开发：@gift-advisor/session-store-sqlite（packages/session-store-sqlite）
 *     - 云函数：packages/gift-agent/src/storage-cloudbase.ts（CloudBase 文档数据库）
 * - 其余文件      业务层：模型工厂、Agent 循环、历史操作、演示剧本、搜索工具、服务入口
 */

// 服务入口与业务层
export { handleAgentRequest } from '@gift-advisor/agent-core/service';
export { runAgent } from '@gift-advisor/agent-core/agent';
export { runMockAgent } from '@gift-advisor/agent-core/mock-agent';
export { getModel, llmEnabled } from '@gift-advisor/agent-core/llm';
export { agentTools } from '@gift-advisor/agent-core/tools';
export { webSearch } from '@gift-advisor/agent-core/search';
export { MAX_QUESTIONS, SYSTEM_PROMPT, USER_OPENER } from '@gift-advisor/agent-core/prompt';
export { appendAnswer, countAsked, initMessages } from '@gift-advisor/agent-core/history';

// 会话持久化端口与内存兜底实现
export {
  MemorySessionStore,
  isSessionId,
  makeTurnRecord,
  newSessionId,
} from '@gift-advisor/agent-core/storage';
export type { AgentSession, SessionStore, TurnRecord } from '@gift-advisor/agent-core/storage';

// 协议边界层
export { parseAgentRequest, sanitizeMessages } from '@gift-advisor/agent-core/wire/messages';
export { isRecord, safeJson } from '@gift-advisor/agent-core/wire/json';
export { sanitizeDeep, stripLoneSurrogates, truncate } from '@gift-advisor/agent-core/wire/text';

// 领域类型
export type {
  AgentContext,
  AgentRequest,
  AgentResponse,
  AgentRunResult,
  Gift,
  Pending,
  PendingQuestion,
  PendingReport,
  QuestionOption,
  RawToolCall,
  Report,
  WireMessage,
} from '@gift-advisor/agent-core/types';
export type { AgentTools } from '@gift-advisor/agent-core/tools';
