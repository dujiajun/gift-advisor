/**
 * 与后端 POST /api/agent 的协议类型（与 web/lib/types.ts 对应）。
 * 客户端只负责保存 messages 并原样回传，Agent 循环在服务端运行。
 */

import { BASE_URL } from '../config';

export interface QuestionOption {
  label: string;
  emoji: string;
}

export interface Gift {
  rank?: number;
  name: string;
  emoji?: string;
  price?: string;
  reason?: string;
  tip?: string;
  match?: number;
  tags?: string[];
}

export interface Report {
  intro?: string;
  gifts: Gift[];
}

export interface Pending {
  kind: 'question' | 'report';
  toolCallId?: string;
  narration?: string;
  question?: string;
  options?: QuestionOption[];
  askedCount?: number;
  report?: Report;
}

export interface AgentResponse {
  ok: boolean;
  demo?: boolean;
  error?: string;
  messages: unknown[];
  pending: Pending | null;
}

interface RawToolCall {
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
}

/** 调用服务端 Agent：开始新会话传 messages=[]，回答问题带上完整历史 + answer */
export function callAgent(messages: unknown[], answer?: string): Promise<AgentResponse> {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${BASE_URL}/api/agent`,
      method: 'POST',
      timeout: 120000,
      header: { 'content-type': 'application/json' },
      data: { messages, answer: answer || undefined },
      success(res) {
        const data = res.data as AgentResponse | null;
        if (res.statusCode >= 200 && res.statusCode < 300 && data && data.ok) {
          resolve(data);
        } else {
          reject(new Error((data && data.error) || `请求失败（${res.statusCode}）`));
        }
      },
      fail(err) {
        reject(new Error(err.errMsg || '网络请求失败'));
      },
    });
  });
}

interface AssistantLike {
  role?: string;
  tool_calls?: RawToolCall[];
}

/** 统计已提问次数（assistant 发出过 ask_user_question 的轮数） */
export function countAsked(messages: unknown[]): number {
  let n = 0;
  for (const m of messages as AssistantLike[]) {
    if (m && m.role === 'assistant' && Array.isArray(m.tool_calls)) {
      if (m.tool_calls.some((tc) => tc && tc.function && tc.function.name === 'ask_user_question')) n++;
    }
  }
  return n;
}
