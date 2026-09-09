/**
 * 前后端共享的协议类型（领域模型）。
 *
 * 会话状态完全在服务端：客户端不持有、也拿不到 LLM 消息原文，
 * 只凭 turnId（轮次 ID）+ answer 与服务端交互，可用 turnId 恢复现场。
 * 每一轮与每条消息原文由服务端持久化（见 storage.ts 的 SessionStore）。
 */

/** OpenAI 兼容的 tool_call 原始结构（仅服务端内部与存储层使用） */
export interface RawToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

/** OpenAI 兼容的消息结构（system/user/assistant/tool，仅服务端内部与存储层使用） */
export interface WireMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /**
   * 推理模型（deepseek-reasoner / GLM 思考模式 / Qwen 等）的思考过程。
   * 由 AI SDK 解析响应得到，随历史存入数据库；发送给 LLM 时会被剥离
   * （见 wire/model-messages.ts 的「reasoning 只进不出」）。
   */
  reasoning_content?: string;
  tool_calls?: RawToolCall[];
  tool_call_id?: string;
}

/** 问题的选项（用户也可以不选、自由输入） */
export interface QuestionOption {
  label: string;
  emoji: string;
}

/** 报告中的单个礼物推荐 */
export interface Gift {
  rank: number;
  name: string;
  emoji: string;
  price: string;
  reason: string;
  tip: string;
  match: number;
  tags: string[];
}

/** 最终礼物报告 */
export interface Report {
  intro: string;
  gifts: Gift[];
}

/** 挂起中的提问：等待用户选择选项或自由输入 */
export interface PendingQuestion {
  kind: 'question';
  /** 参谋的旁白（可以不说话） */
  narration: string;
  question: string;
  options: QuestionOption[];
  /** 这是第几个问题（1 起） */
  askedCount: number;
}

/** 挂起中的报告：流程结束 */
export interface PendingReport {
  kind: 'report';
  narration: string;
  report: Report;
  askedCount: number;
}

export type Pending = PendingQuestion | PendingReport;

/**
 * 客户端请求（POST /api/agent 与云函数 gift-agent 同构）：
 * - start：开始新会话，服务端发放 sessionId（空 body 视同 start）
 * - answer：凭 sessionId 提交用户回答，推进到下一轮
 * - resume：凭 sessionId 恢复现场（拿回当前问题/报告，刷新页面/重进小程序后接续）
 */
export type AgentRequest =
  | { action: 'start' }
  | { action: 'answer'; sessionId: string; answer: string }
  | { action: 'resume'; sessionId: string };

/** POST /api/agent（及云函数 gift-agent）的统一响应。不含任何 LLM 消息原文。 */
export interface AgentResponse {
  ok: boolean;
  /** 会话 ID（轮次 ID）：start 发放，客户端保存并凭它 answer / resume */
  sessionId?: string;
  /** 挂起内容：question = 等待回答，report = 流程已结束 */
  pending: PendingQuestion | PendingReport | null;
  /** 已提问轮数 */
  askedCount?: number;
  /** true = 演示模式（未配置 LLM_API_KEY，由内置剧本 agent 扮演参谋） */
  demo?: boolean;
  error?: string;
}

/** Agent 单次推进的内部结果：历史由服务端持有并入库，不直接下发给客户端 */
export interface AgentRunResult {
  demo: boolean;
  /** 推进后的完整消息历史（服务端保存） */
  messages: WireMessage[];
  /** 挂起点：question 或 report */
  pending: PendingQuestion | PendingReport | null;
}
