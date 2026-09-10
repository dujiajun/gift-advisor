import { llmEnabled } from '@gift-advisor/agent-core/llm';
import { runAgent } from '@gift-advisor/agent-core/agent';
import { runMockAgent } from '@gift-advisor/agent-core/mock-agent';
import { parseAgentRequest } from '@gift-advisor/agent-core/wire/messages';
import { truncate } from '@gift-advisor/agent-core/wire/text';
import {
  isSessionId,
  MemorySessionStore,
  makeTurnRecord,
  newSessionId,
  type AgentSession,
  type SessionStore,
} from '@gift-advisor/agent-core/storage';
import type { AgentContext, AgentResponse } from '@gift-advisor/agent-core/types';

/**
 * Agent 统一服务入口：Web API（POST /api/agent）与云函数（gift-agent）共用的调度层。
 *
 * 会话状态完全在服务端：客户端只凭 sessionId（轮次 ID）+ answer 交互，
 * 拿不到也构造不了 LLM 消息原文；每一轮与每条消息由注入的 SessionStore 持久化。
 *
 * 存储为外部注入（端口见 storage.ts）：
 * - 缺省用进程内 MemorySessionStore（仅兜底，重启丢失）
 * - 本机开发：注入 @gift-advisor/session-store-sqlite（packages/session-store-sqlite）
 * - 云函数 / Web 线上：注入 @gift-advisor/session-store-cloudbase（CloudBase 文档数据库）
 *
 * 身份审计（AgentContext，由宿主提取）：start 时记录 userId（小程序 OPENID /
 * Web cookie 访客 id）与客户端 IP，随会话持久化。
 */
export async function handleAgentRequest(
  body: unknown,
  store: SessionStore = defaultStore,
  ctx?: AgentContext,
): Promise<AgentResponse> {
  const req = parseAgentRequest(body);
  if (!req) {
    return { ok: false, pending: null, error: '请求格式不正确（支持 action: start / answer / resume）' };
  }

  try {
    if (req.action === 'start') {
      const now = new Date().toISOString();
      const session: AgentSession = {
        id: newSessionId(),
        demo: !llmEnabled(),
        userId: truncate((ctx?.userId ?? '').trim(), 128),
        ip: truncate((ctx?.ip ?? '').trim(), 64),
        messages: [],
        turns: [],
        current: null,
        createdAt: now,
        updatedAt: now,
      };
      await advance(session, undefined);
      await store.create(session);
      return sessionResponse(session);
    }

    // sessionId 是存储主键，形状不合法直接当「不存在」处理（客户端会自行清掉本地记录重开）
    if (!isSessionId(req.sessionId)) return { ok: false, pending: null, error: '会话不存在或已过期' };

    const session = await store.find(req.sessionId);
    if (!session) return { ok: false, pending: null, error: '会话不存在或已过期' };

    if (req.action === 'resume') {
      if (!session.current) return { ok: false, pending: null, error: '会话尚未就绪，请重新开始' };
      return sessionResponse(session);
    }

    if (session.current?.kind !== 'question') {
      return {
        ok: false,
        pending: null,
        error: session.current?.kind === 'report' ? '本轮流程已结束，请重新开始' : '没有待回答的问题',
      };
    }
    await advance(session, req.answer);
    // 用户回答补记到被回答的那一轮（advance 已 push 新一轮，故取倒数第二条）
    const answered = session.turns[session.turns.length - 2];
    if (answered) answered.answer = req.answer;
    await store.save(session);
    return sessionResponse(session);
  } catch (e) {
    return {
      ok: false,
      pending: null,
      error: e instanceof Error ? e.message : '参谋开小差了，请重试',
    };
  }
}

/** 进程内兜底存储（外部注入时不会用到） */
const defaultStore = new MemorySessionStore();

/** 推进一轮（runner 抛错时 session 不落任何变更） */
async function advance(session: AgentSession, answer: string | undefined): Promise<void> {
  const runner = session.demo ? runMockAgent : runAgent;
  const result = await runner(session.messages, answer);
  session.messages = result.messages;
  session.current = result.pending;
  if (result.pending) session.turns.push(makeTurnRecord(result.pending, session.turns.length + 1));
}

function sessionResponse(session: AgentSession): AgentResponse {
  return {
    ok: true,
    sessionId: session.id,
    pending: session.current,
    askedCount: session.current?.askedCount ?? 0,
    demo: session.demo,
  };
}
