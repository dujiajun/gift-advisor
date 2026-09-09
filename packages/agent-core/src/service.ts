import { llmEnabled } from './llm';
import { runAgent } from './agent';
import { runMockAgent } from './mock-agent';
import { parseAgentRequest } from './wire/messages';
import type { AgentResponse } from './types';

/**
 * Agent 统一服务入口：Web API（POST /api/agent）与云函数（gift-agent）共用的调度层。
 * 请求体两个宿主同构：{ messages, answer }；返回 AgentResponse。
 *
 * 各宿主只保留薄适配：
 * - packages/web/app/api/agent/route.ts → HTTP/CORS/状态码映射
 * - cloudfunctions/gift-agent/src/index.ts → SCF 的 main 导出
 */
export async function handleAgentRequest(body: unknown): Promise<AgentResponse> {
  const { messages, answer } = parseAgentRequest(body);
  try {
    return llmEnabled() ? await runAgent(messages, answer) : await runMockAgent(messages, answer);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : '参谋开小差了，请重试',
      messages,
      pending: null,
    };
  }
}
