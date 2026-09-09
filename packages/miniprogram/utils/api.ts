/**
 * 与服务端 Agent 的通信层（与 web 版 POST /api/agent 协议一致）。
 * 客户端只负责保存 messages 并原样回传，Agent 循环在服务端运行。
 *
 * 两条通道（config.ts 里切换 AGENT_BACKEND）：
 * - 'cloudbase'：wx.cloud.callFunction 调用云函数 gift-agent（推荐，免域名白名单）
 * - 'http'：wx.request 直连 Next.js 服务（本地开发）
 */

import { AGENT_BACKEND, BASE_URL, CLOUD_FUNCTION_NAME } from '../config';

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

interface AgentCallPayload {
  messages: unknown[];
  answer?: string;
}

/** 调用服务端 Agent：开始新会话传 messages=[]，回答问题带上完整历史 + answer */
export function callAgent(messages: unknown[], answer?: string): Promise<AgentResponse> {
  const data: AgentCallPayload = { messages, answer: answer || undefined };
  return AGENT_BACKEND === 'cloudbase' ? callViaCloudFunction(data) : callViaHttp(data);
}

/** CloudBase 通道：调用云函数，返回的 AgentResponse 与 HTTP 版同构 */
function callViaCloudFunction(data: AgentCallPayload): Promise<AgentResponse> {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: CLOUD_FUNCTION_NAME,
      data,
      success(res) {
        const payload = res.result as AgentResponse | null;
        if (payload && payload.ok) {
          resolve(payload);
        } else {
          reject(new Error((payload && payload.error) || '云函数调用失败'));
        }
      },
      fail(err) {
        reject(new Error(err.errMsg || '云函数调用失败'));
      },
    });
  });
}

/** HTTP 通道：直连 Next.js 的 POST /api/agent */
function callViaHttp(data: AgentCallPayload): Promise<AgentResponse> {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${BASE_URL}/api/agent`,
      method: 'POST',
      timeout: 120000,
      header: { 'content-type': 'application/json' },
      data,
      success(res) {
        const payload = res.data as AgentResponse | null;
        if (res.statusCode >= 200 && res.statusCode < 300 && payload && payload.ok) {
          resolve(payload);
        } else {
          reject(new Error((payload && payload.error) || `请求失败（${res.statusCode}）`));
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
  tool_calls?: { function?: { name?: string } }[];
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
