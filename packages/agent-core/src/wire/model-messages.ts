import type { ModelMessage } from 'ai';
import type { RawToolCall, WireMessage } from '../types';
import { isRecord, safeJson } from './json';

/**
 * 我们的对外的消息协议（OpenAI wire 风格，客户端只存储原样回传）
 * 与 AI SDK ModelMessage 之间的转换边界。
 *
 * reasoning 只进不出：responseMessages 里的 reasoning parts 会存成
 * WireMessage.reasoning_content 回传给客户端；toModelMessages 组装请求时
 * 不生成 reasoning parts，因此发往 LLM 的入参永远不带思考过程
 * （DeepSeek 等推理接口不接受入参携带 reasoning_content，会返回 400）。
 */

/** toModelMessages 的产物：v7 要求 system 内容走 instructions，不能混在 messages 里 */
export interface ModelPrompt {
  /** 历史里所有 system 消息按序合并（系统提示词 + 每轮 nudge） */
  instructions: string;
  messages: ModelMessage[];
}

/** WireMessage[] → generateText 入参（发给 AI SDK / LLM） */
export function toModelMessages(messages: WireMessage[]): ModelPrompt {
  const system: string[] = [];
  const out: ModelMessage[] = [];
  // tool 消息只带 tool_call_id，toolName 需要从最近一条 assistant 的 tool_calls 里找
  let toolNames = new Map<string, string>();

  for (const m of messages) {
    if (m.role === 'system') {
      if (m.content.trim()) system.push(m.content);
      continue;
    }
    if (m.role === 'user') {
      out.push({ role: 'user', content: m.content });
    } else if (m.role === 'assistant') {
      const calls = m.tool_calls ?? [];
      const content = [
        { type: 'text' as const, text: m.content },
        ...calls.map(
          (tc): { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown } => ({
            type: 'tool-call',
            toolCallId: tc.id,
            toolName: tc.function.name,
            input: safeJson<Record<string, unknown>>(tc.function.arguments, {}),
          }),
        ),
      ];
      out.push({ role: 'assistant', content });
      toolNames = new Map(calls.map((tc) => [tc.id, tc.function.name]));
    } else {
      const toolName = toolNames.get(m.tool_call_id ?? '');
      // 悬空的 tool 结果（找不到对应的 assistant 工具调用）直接丢弃，保证 OpenAI 协议合法
      if (!toolName) continue;
      out.push({
        role: 'tool',
        content: [
          { type: 'tool-result', toolCallId: m.tool_call_id ?? '', toolName, output: { type: 'text', value: m.content } },
        ],
      });
    }
  }
  return { instructions: system.join('\n\n'), messages: out };
}

/** ToolResultOutput（text/json 判别结构，或历史遗留的裸值）→ 字符串 */
function toolOutputToString(output: unknown): string {
  if (typeof output === 'string') return output;
  if (isRecord(output) && 'value' in output) {
    const value = output.value;
    return output.type === 'text' && typeof value === 'string' ? value : JSON.stringify(value ?? {});
  }
  return JSON.stringify(output ?? {});
}

/** ModelMessage[]（generateText 的 responseMessages）→ WireMessage[]（存历史并回传客户端） */
export function fromModelMessages(msgs: ModelMessage[]): WireMessage[] {
  const out: WireMessage[] = [];
  for (const m of msgs) {
    if (m.role === 'system' || m.role === 'user') {
      out.push({ role: m.role, content: typeof m.content === 'string' ? m.content : '' });
      continue;
    }

    if (m.role === 'assistant') {
      if (typeof m.content === 'string') {
        out.push({ role: 'assistant', content: m.content });
        continue;
      }
      let text = '';
      let reasoning = '';
      const calls: RawToolCall[] = [];
      for (const part of m.content) {
        if (part.type === 'text') {
          text += part.text;
        } else if (part.type === 'reasoning') {
          reasoning += part.text;
        } else if (part.type === 'tool-call') {
          calls.push({
            id: part.toolCallId,
            type: 'function',
            function: { name: part.toolName, arguments: JSON.stringify(part.input ?? {}) },
          });
        }
      }
      const wire: WireMessage = { role: 'assistant', content: text };
      if (reasoning) wire.reasoning_content = reasoning;
      if (calls.length) wire.tool_calls = calls;
      out.push(wire);
      continue;
    }

    for (const part of m.content) {
      if (part.type !== 'tool-result') continue;
      out.push({
        role: 'tool',
        tool_call_id: part.toolCallId,
        content: toolOutputToString(part.output),
      });
    }
  }
  return out;
}
