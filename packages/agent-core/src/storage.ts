import { randomBytes } from 'node:crypto';
import type { Pending, QuestionOption, Report, WireMessage } from '@gift-advisor/agent-core/types';

/**
 * 会话持久化端口 + 默认内存实现。
 * 服务端负责记录每一轮次与每条消息原文；agent-core 只定义端口，
 * 具体基础设施实现由各宿主注入（如 packages/gift-agent 的 CloudBase 文档数据库实现）：
 * - MemorySessionStore：默认，零配置（本地开发/演示；重启丢失）
 * - CloudBase：见 packages/gift-agent/src/storage-cloudbase.ts
 */

/** 一轮的记录：问了什么 / 用户答了什么 / 或最终报告（审计用） */
export interface TurnRecord {
  /** 第几轮（1 起） */
  seq: number;
  kind: 'question' | 'report';
  narration: string;
  /** kind = question 时 */
  question?: string;
  options?: QuestionOption[];
  askedCount: number;
  /** kind = question 且已被回答时补记 */
  answer?: string;
  /** kind = report 时 */
  report?: Report;
  createdAt: string;
}

/** 服务端持有的完整会话状态（一个会话一条存储记录；sessionId 即对外轮次 ID） */
export interface AgentSession {
  /** 会话 ID：start 时发放，客户端凭它 answer / resume */
  id: string;
  /** 是否演示模式（决定续聊用哪个 runner，持久化保证 resume 行为一致） */
  demo: boolean;
  /** 完整消息历史（含 tool_calls / reasoning_content，即每条消息原文） */
  messages: WireMessage[];
  /** 逐轮记录（审计） */
  turns: TurnRecord[];
  /** 当前挂起快照：question 待答 / report 已结束 / null 尚未产生 */
  current: Pending | null;
  createdAt: string;
  updatedAt: string;
}

export interface SessionStore {
  create(session: AgentSession): Promise<void>;
  find(sessionId: string): Promise<AgentSession | null>;
  save(session: AgentSession): Promise<void>;
}

const rand = (n = 12): string => randomBytes(n).toString('base64url');

export function newSessionId(): string {
  return `s-${rand()}`;
}

/** 把 agent 挂起结果落成一轮记录 */
export function makeTurnRecord(pending: Pending, seq: number): TurnRecord {
  const record: TurnRecord = {
    seq,
    kind: pending.kind,
    narration: pending.narration,
    askedCount: pending.askedCount,
    createdAt: new Date().toISOString(),
  };
  if (pending.kind === 'question') {
    record.question = pending.question;
    record.options = pending.options;
  } else {
    record.report = pending.report;
  }
  return record;
}

/** 内存实现：进程内 Map，容量上限 FIFO 淘汰，仅用于本地开发/演示 */
export class MemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, AgentSession>();
  private readonly cap: number;

  constructor(cap = 2000) {
    this.cap = cap;
  }

  private evict(): void {
    while (this.sessions.size > this.cap) {
      const oldest = this.sessions.keys().next().value;
      if (oldest === undefined) break;
      this.sessions.delete(oldest);
    }
  }

  async create(session: AgentSession): Promise<void> {
    this.sessions.set(session.id, session);
    this.evict();
  }

  async find(sessionId: string): Promise<AgentSession | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async save(session: AgentSession): Promise<void> {
    session.updatedAt = new Date().toISOString();
    this.sessions.set(session.id, session);
  }
}
