import { NextResponse } from 'next/server';
import { runAgent } from '@/lib/agent';
import { runMockAgent } from '@/lib/mockAgent';
import { llmEnabled } from '@/lib/llm';
import type { AgentResponse, WireMessage } from '@/lib/types';

export const runtime = 'nodejs';
/** 报告轮可能包含多次 LLM 调用 + 联网搜索，放宽函数超时（Vercel 需套餐支持） */
export const maxDuration = 120;

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

interface AgentRequestBody {
  messages?: unknown;
  answer?: unknown;
}

export async function POST(req: Request): Promise<Response> {
  let body: AgentRequestBody = {};
  try {
    body = (await req.json()) as AgentRequestBody;
  } catch {
    // 允许空 body（视为开始新会话）
  }

  const messages = Array.isArray(body.messages) ? (body.messages as WireMessage[]) : [];
  const answer =
    typeof body.answer === 'string' && body.answer.trim() ? body.answer.trim().slice(0, 200) : undefined;

  try {
    const result: AgentResponse = llmEnabled()
      ? await runAgent(messages, answer)
      : await runMockAgent(messages, answer);
    return NextResponse.json(result, { headers: CORS });
  } catch (e) {
    const payload: AgentResponse = {
      ok: false,
      error: e instanceof Error ? e.message : '服务器开小差了',
      messages,
      pending: null,
    };
    return NextResponse.json(payload, { status: 500, headers: CORS });
  }
}
