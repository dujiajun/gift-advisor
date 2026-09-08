import type { RawToolCall, WireMessage } from './types';

/**
 * OpenAI 兼容（DeepSeek / GLM / Kimi / OpenAI ...）的极简客户端。
 * 通过环境变量切换供应商：LLM_BASE_URL / LLM_API_KEY / LLM_MODEL
 */

const BASE_URL = (process.env.LLM_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/+$/, '');
const API_KEY = process.env.LLM_API_KEY || '';
const MODEL = process.env.LLM_MODEL || 'deepseek-chat';

export function llmEnabled(): boolean {
  return Boolean(API_KEY);
}

export function safeJson<T>(text: unknown, fallback: T): T {
  if (typeof text !== 'string') return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

interface RawChoiceMessage {
  content?: string | null;
  tool_calls?: RawToolCall[];
}

interface ChatApiResponse {
  choices?: { message?: RawChoiceMessage }[];
}

export interface ParsedToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ChatResult {
  /** 可直接放回 messages 的 assistant 消息 */
  raw: WireMessage;
  /** assistant 的文字内容（参谋的"旁白"） */
  content: string;
  /** 解析后的工具调用列表 */
  toolCalls: ParsedToolCall[];
}

export async function chatCompletion(opts: {
  messages: WireMessage[];
  tools?: unknown[];
  temperature?: number;
  /** 每轮追加的系统提醒（如"问满10题必须出报告"） */
  nudge?: string;
}): Promise<ChatResult> {
  const { messages, tools, temperature = 0.9, nudge = '' } = opts;
  const finalMessages: WireMessage[] = nudge ? [...messages, { role: 'system', content: nudge }] : messages;

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: finalMessages,
      ...(tools ? { tools, tool_choice: 'auto' } : {}),
      temperature,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`LLM 接口错误 ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as ChatApiResponse;
  const msg = data?.choices?.[0]?.message;
  if (!msg) throw new Error('LLM 返回格式异常');

  const raw: WireMessage = {
    role: 'assistant',
    content: typeof msg.content === 'string' ? msg.content : '',
  };
  const rawCalls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
  if (rawCalls.length) raw.tool_calls = rawCalls;

  const toolCalls: ParsedToolCall[] = rawCalls.map((tc) => ({
    id: tc.id || `call_${Math.random().toString(36).slice(2, 10)}`,
    name: tc?.function?.name || '',
    args: safeJson<Record<string, unknown>>(tc?.function?.arguments, {}),
  }));

  return { raw, content: raw.content, toolCalls };
}
