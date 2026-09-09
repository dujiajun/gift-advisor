import type { WireMessage } from '../types';
import { isRecord } from './json';

/**
 * 客户端请求的入口边界：
 * - sanitizeMessages：把客户端回传的 unknown 消息历史清洗成 WireMessage[]
 *   （reasoning_content 会保留，供历史完整回传）
 * - parseAgentRequest：解析请求体（POST /api/agent 的 body，或云函数的 event）
 */

/** 清洗客户端回传的消息历史：只保留合法字段，防止注入垃圾数据 */
export function sanitizeMessages(input: unknown): WireMessage[] {
  if (!Array.isArray(input)) return [];
  const out: WireMessage[] = [];
  for (const m of input.slice(-80)) {
    if (!isRecord(m)) continue;
    if (m.role === 'system' || m.role === 'user' || m.role === 'assistant') {
      const wire: WireMessage = { role: m.role, content: typeof m.content === 'string' ? m.content : '' };
      if (m.role === 'assistant' && typeof m.reasoning_content === 'string' && m.reasoning_content) {
        wire.reasoning_content = m.reasoning_content;
      }
      if (Array.isArray(m.tool_calls) && m.tool_calls.length) {
        wire.tool_calls = m.tool_calls
          .filter((tc): tc is Record<string, unknown> => isRecord(tc) && isRecord(tc.function))
          .map((tc) => {
            const fn = tc.function as Record<string, unknown>;
            return {
              id: String(tc.id ?? ''),
              type: 'function',
              function: {
                name: String(fn.name),
                arguments: typeof fn.arguments === 'string' ? fn.arguments : JSON.stringify(fn.arguments ?? {}),
              },
            };
          });
      }
      out.push(wire);
    } else if (m.role === 'tool') {
      out.push({
        role: 'tool',
        tool_call_id: String(m.tool_call_id ?? ''),
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? {}),
      });
    }
  }
  return out;
}

export interface AgentRequest {
  messages: WireMessage[];
  answer?: string;
}

/**
 * 解析客户端请求体（Web 版 POST /api/agent 的 body，或云函数的 event）：
 * - messages 经 sanitizeMessages 只保留合法字段
 * - answer 为非空字符串时 trim 并截断到 200 字符，否则视为 undefined
 */
export function parseAgentRequest(body: unknown): AgentRequest {
  const req = isRecord(body) ? body : {};
  const rawAnswer = typeof req.answer === 'string' ? req.answer.trim().slice(0, 200) : '';
  return {
    messages: sanitizeMessages(req.messages),
    answer: rawAnswer || undefined,
  };
}
