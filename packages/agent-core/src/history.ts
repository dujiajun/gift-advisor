import type { RawToolCall, WireMessage } from './types';
import { safeJson } from './wire/json';

/**
 * 消息历史的业务操作：初始化会话、统计提问数、回写用户回答。
 * 只操作已解析好的 WireMessage[]，不接触 unknown。
 */

type SearchFn = (query: string) => Promise<string>;

/** 新会话：注入系统提示词 + 用户开场白 */
export function initMessages(messages: WireMessage[], systemPrompt: string, opener: string): void {
  messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: opener });
}

/** 统计已提问的次数（assistant 发出过 ask_user_question 的轮数） */
export function countAsked(messages: WireMessage[]): number {
  return messages.filter(
    (m) => m.role === 'assistant' && (m.tool_calls ?? []).some((tc) => tc.function?.name === 'ask_user_question'),
  ).length;
}

/**
 * 用户回答后，把它作为 ask_user_question 的 tool 结果写回历史，
 * 并为同一轮里其它未应答的工具调用补上占位结果（保证 OpenAI 协议合法）。
 */
export async function appendAnswer(messages: WireMessage[], answer: string, executeSearch: SearchFn | null): Promise<void> {
  const lastAssistant = [...messages]
    .reverse()
    .find((m) => m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length > 0);
  if (!lastAssistant) throw new Error('没有待回答的问题');

  const unanswered = (): RawToolCall[] =>
    (lastAssistant.tool_calls ?? []).filter((tc) => !messages.some((m) => m.role === 'tool' && m.tool_call_id === tc.id));

  const pendingQ = unanswered().find((tc) => tc.function?.name === 'ask_user_question');
  if (!pendingQ) throw new Error('没有待回答的问题');

  messages.push({
    role: 'tool',
    tool_call_id: pendingQ.id,
    content: JSON.stringify({ user_answer: answer }),
  });

  for (const tc of unanswered()) {
    if (tc.function?.name === 'ask_user_question') {
      messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify({ skipped: '一次只回答一个问题' }) });
    } else if (tc.function?.name === 'web_search' && executeSearch) {
      const q = safeJson<{ query?: string }>(tc.function?.arguments, {}).query ?? '';
      messages.push({ role: 'tool', tool_call_id: tc.id, content: await executeSearch(q) });
    } else {
      messages.push({ role: 'tool', tool_call_id: tc.id, content: 'ignored' });
    }
  }
}
