/**
 * 礼物参谋 Agent 核心的公共出口。
 * 被 web（Next.js API Route）与 cloudfunctions/gift-agent（CloudBase 云函数）共同引用。
 *
 * 分层约定（类型判断与业务代码分离）：
 * - src/wire/   协议边界层：集中所有运行时类型判断与协议转换
 *     - messages.ts       客户端请求体/消息历史的清洗（unknown → WireMessage[]）
 *     - model-messages.ts WireMessage[] ↔ AI SDK ModelMessage[]（reasoning 只进不出）
 *     - normalize.ts      模型输出的展示规整（选项/礼物报告的兜底与截断）
 *     - json.ts           基础判断与安全 JSON 解析
 * - 工具参数校验  由 tools.ts 的 zod schema 声明式承担（AI SDK 自动校验）
 * - 其余文件      业务层：模型工厂、Agent 循环、历史操作、演示剧本、搜索工具
 */

// 业务层
export { handleAgentRequest } from './service';
export { runAgent } from './agent';
export { runMockAgent } from './mock-agent';
export { getModel, llmEnabled } from './llm';
export { agentTools } from './tools';
export { webSearch } from './search';
export { MAX_QUESTIONS, SYSTEM_PROMPT, USER_OPENER } from './prompt';
export { appendAnswer, countAsked, initMessages } from './history';

// 协议边界层（入口解析供 API 宿主使用，其余多为内部实现）
export { parseAgentRequest, sanitizeMessages } from './wire/messages';
export { safeJson } from './wire/json';

// 领域类型
export type {
  AgentResponse,
  Gift,
  Pending,
  PendingQuestion,
  PendingReport,
  QuestionOption,
  RawToolCall,
  Report,
  WireMessage,
} from './types';
export type { AgentRequest } from './wire/messages';
export type { AgentTools } from './tools';
