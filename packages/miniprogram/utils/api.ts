/**
 * 与服务端 Agent 的通信层（与 web 版 POST /api/agent 协议一致）。
 * 会话状态在服务端：客户端只保存 sessionId（轮次 ID），凭它 answer / resume，
 * 不接触 LLM 消息原文。
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

export interface PendingQuestion {
  kind: 'question';
  narration?: string;
  question: string;
  options: QuestionOption[];
  askedCount: number;
}

export interface PendingReport {
  kind: 'report';
  narration?: string;
  report: Report;
  askedCount: number;
}

export type Pending = PendingQuestion | PendingReport;

export interface AgentResponse {
  ok: boolean;
  sessionId?: string;
  pending: Pending | null;
  askedCount?: number;
  demo?: boolean;
  error?: string;
}

/** 客户端请求：开始新会话 / 凭 sessionId 回答 / 凭 sessionId 恢复现场 */
export type ClientRequest =
  | { action: 'start' }
  | { action: 'answer'; sessionId: string; answer: string }
  | { action: 'resume'; sessionId: string };

/** 本地保存 sessionId 的 key（恢复现场用） */
export const SESSION_KEY = 'gift-advisor:session-id';

export function savedSessionId(): string {
  return (wx.getStorageSync(SESSION_KEY) as string) || '';
}

export function clearSavedSession(): void {
  wx.removeStorageSync(SESSION_KEY);
}

/** 调用服务端 Agent */
export function callAgent(data: ClientRequest): Promise<AgentResponse> {
  return AGENT_BACKEND === 'cloudbase' ? callViaCloudFunction(data) : callViaHttp(data);
}

/** CloudBase 通道：调用云函数，返回的 AgentResponse 与 HTTP 版同构 */
function callViaCloudFunction(data: ClientRequest): Promise<AgentResponse> {
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
function callViaHttp(data: ClientRequest): Promise<AgentResponse> {
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
