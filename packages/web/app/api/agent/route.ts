import { NextResponse } from 'next/server';
import {
  handleAgentRequest,
  MemorySessionStore,
  type AgentResponse,
  type SessionStore,
} from '@gift-advisor/agent-core';
import { CloudBaseSessionStore } from '@gift-advisor/session-store-cloudbase';
import { createSqliteSessionStore } from '@gift-advisor/session-store-sqlite';

export const runtime = 'nodejs';
/** 报告轮可能包含多次 LLM 调用 + 联网搜索，放宽函数超时（Vercel 需套餐支持） */
export const maxDuration = 120;

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/**
 * 会话存储（外部注入，首个请求时惰性初始化）：
 * - SESSION_STORE 显式指定：cloudbase / sqlite / memory
 * - 未指定时：配置了 CLOUD_ENV_ID（如 Vercel 线上）→ CloudBase 文档数据库；
 *   否则本机 SQLite（仓库根 .data/agent-sessions.db，跨重启持久）
 * CloudBase 跨端调用需 CLOUD_ENV_ID + TCB_SECRET_ID + TCB_SECRET_KEY（云函数内则免密钥）。
 */
let store: SessionStore | null = null;

function getStore(): SessionStore {
  if (store) return store;
  const mode = process.env.SESSION_STORE ?? (process.env.CLOUD_ENV_ID ? 'cloudbase' : 'sqlite');
  if (mode === 'cloudbase') {
    store = new CloudBaseSessionStore();
  } else if (mode === 'memory') {
    store = new MemorySessionStore();
  } else {
    store = createSqliteSessionStore('../../.data/agent-sessions.db');
  }
  return store;
}

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

  const result: AgentResponse = await handleAgentRequest(body, getStore());
  return NextResponse.json(result, { status: result.ok ? 200 : 500, headers: CORS });
}
