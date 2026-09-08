import type { Gift, QuestionOption, RawToolCall, Report, WireMessage } from './types';
import { safeJson } from './llm';

type SearchFn = (query: string) => Promise<string>;

/** 清洗客户端回传的消息历史：只保留合法字段，防止注入垃圾数据 */
export function sanitizeMessages(input: unknown): WireMessage[] {
  if (!Array.isArray(input)) return [];
  const out: WireMessage[] = [];
  for (const m of (input as unknown[]).slice(-80)) {
    if (!m || typeof m !== 'object') continue;
    const msg = m as Record<string, unknown>;
    const role = msg.role;
    if (role === 'system' || role === 'user' || role === 'assistant') {
      const wire: WireMessage = { role, content: typeof msg.content === 'string' ? msg.content : '' };
      if (Array.isArray(msg.tool_calls) && msg.tool_calls.length) {
        wire.tool_calls = (msg.tool_calls as Record<string, unknown>[])
          .filter((tc) => tc && typeof tc === 'object' && tc.function && typeof (tc.function as Record<string, unknown>).name === 'string')
          .map((tc): RawToolCall => {
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
    } else if (role === 'tool') {
      out.push({
        role: 'tool',
        tool_call_id: String(msg.tool_call_id ?? ''),
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content ?? {}),
      });
    }
  }
  return out;
}

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

/** 规整 agent 给出的选项：1~4 个，补齐 emoji，截断过长文本 */
export function normalizeOptions(raw: unknown): QuestionOption[] {
  const list = Array.isArray(raw) ? (raw as unknown[]) : [];
  const emojiPool = ['🎁', '✨', '🎀', '⭐'];
  const out: QuestionOption[] = [];
  for (const o of list.slice(0, 4)) {
    if (typeof o === 'string') {
      if (o.trim()) out.push({ label: o.trim().slice(0, 30), emoji: emojiPool[out.length % 4] });
    } else if (o && typeof o === 'object') {
      const obj = o as Record<string, unknown>;
      if (typeof obj.label === 'string' && obj.label.trim()) {
        out.push({
          label: obj.label.trim().slice(0, 30),
          emoji: typeof obj.emoji === 'string' && obj.emoji ? obj.emoji.slice(0, 4) : emojiPool[out.length % 4],
        });
      }
    }
  }
  return out;
}

function str(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.trim() ? v.trim() : fallback;
}

/** 规整 agent 给出的报告：恰好 3 个礼物，字段兜底 */
export function normalizeReport(args: Record<string, unknown>): Report {
  const rawGifts = Array.isArray(args.gifts) ? (args.gifts as unknown[]) : [];
  const gifts: Gift[] = rawGifts.slice(0, 3).map((g, i) => {
    const obj = g && typeof g === 'object' ? (g as Record<string, unknown>) : {};
    const matchNum = Number(obj.match);
    return {
      rank: i + 1,
      name: str(obj.name, `神秘礼物 ${i + 1}`),
      emoji: str(obj.emoji, '🎁').slice(0, 4),
      price: str(obj.price, '价格未知').slice(0, 20),
      reason: str(obj.reason, ''),
      tip: str(obj.tip, ''),
      match: Number.isFinite(matchNum) ? Math.max(1, Math.min(100, Math.round(matchNum))) : 80,
      tags: Array.isArray(obj.tags) ? (obj.tags as unknown[]).map((t) => String(t)).slice(0, 4) : [],
    };
  });
  return { intro: str(args.intro, ''), gifts };
}
