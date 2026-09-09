import type { AgentRequest, WireMessage } from '@gift-advisor/agent-core/types';
import { isRecord } from '@gift-advisor/agent-core/wire/json';

/**
 * 客户端请求的入口边界：
 * - sanitizeMessages：服务端内部持有的历史在 runner 之间传递时的清洗（幂等）
 * - parseAgentRequest：解析客户端请求体（POST /api/agent 的 body / 云函数 event）
 *   → start | answer | resume；格式非法返回 null（由 service 转成错误响应）
 */

/** 清洗消息历史：只保留合法字段，防止脏数据进入 LLM 请求（幂等，可重复调用） */
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
                arguments:
                  typeof fn.arguments === 'string' ? fn.arguments : JSON.stringify(fn.arguments ?? {}),
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

/**
 * 解析客户端请求体：
 * - 空 body（null/undefined/{}）视同 { action: 'start' }
 * - answer 需要 sessionId + 非空 answer（trim，截断 200 字符）
 * - resume 需要 sessionId
 * - 其余（未知 action / 缺字段 / 类型不对）返回 null
 */
export function parseAgentRequest(body: unknown): AgentRequest | null {
  if (body === null || body === undefined) return { action: 'start' };
  if (!isRecord(body)) return null;
  if (body.action === undefined) {
    return Object.keys(body).length === 0 ? { action: 'start' } : null;
  }
  if (body.action === 'start') return { action: 'start' };
  if (body.action === 'answer' || body.action === 'resume') {
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
    if (!sessionId) return null;
    if (body.action === 'resume') return { action: 'resume', sessionId };
    const answer = typeof body.answer === 'string' ? body.answer.trim().slice(0, 200) : '';
    if (!answer) return null;
    return { action: 'answer', sessionId, answer };
  }
  return null;
}
