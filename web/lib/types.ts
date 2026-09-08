/**
 * 前后端共享的协议类型。
 * 客户端只负责存储 messages 并原样回传，真正的 Agent 循环在服务端运行。
 */

/** OpenAI 兼容的 tool_call 原始结构 */
export interface RawToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

/** OpenAI 兼容的消息结构（system/user/assistant/tool） */
export interface WireMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
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
  toolCallId: string;
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

/** POST /api/agent 的统一响应 */
export interface AgentResponse {
  ok: boolean;
  /** true = 演示模式（未配置 LLM_API_KEY，由内置剧本 agent 扮演参谋） */
  demo?: boolean;
  /** 累计的完整消息历史，客户端需要保存并在下一轮回传 */
  messages: WireMessage[];
  pending: Pending | null;
  error?: string;
}
