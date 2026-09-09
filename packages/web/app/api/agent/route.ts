import { NextResponse } from 'next/server';
import { handleAgentRequest } from '@gift-advisor/agent-core';

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

/** POST /api/agent —— Agent 的 Web 宿主：HTTP/CORS/状态码适配，调度逻辑在 agent-core */
export async function POST(req: Request): Promise<Response> {
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    // 允许空 body（视为开始新会话）
  }

  const result = await handleAgentRequest(body);
  return NextResponse.json(result, { status: result.ok ? 200 : 500, headers: CORS });
}
