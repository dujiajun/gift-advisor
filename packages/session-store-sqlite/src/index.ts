import type { AgentSession, SessionStore } from '@gift-advisor/agent-core';

/**
 * AgentSession 的 SQLite 持久化实现（本机开发默认）。
 * 零依赖：使用 Node 24 内置的 node:sqlite（DatabaseSync）。
 *
 * 所有 node: 内置模块在 open() 时才动态 import：
 * - 避免被不支持它的运行时（如 CloudBase 的低版本 Node）在模块加载期加载
 * - 兼容打包器（vite/rolldown、Next）对内置模块的惰性引用
 *
 * 表结构：一行一个会话，messages / turns / current 整体以 JSON 列存储。
 */

// node:sqlite 的最小结构类型
interface SqliteStatement {
  run(...params: unknown[]): { changes: number | bigint };
  get(...params: unknown[]): unknown;
}
interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
}

export function createSqliteSessionStore(
  file = process.env.SESSION_DB ?? '.data/agent-sessions.db',
): SessionStore {
  return new SqliteSessionStore(file);
}

class SqliteSessionStore implements SessionStore {
  private readonly file: string;
  private dbPromise: Promise<SqliteDatabase> | null = null;

  constructor(file: string) {
    this.file = file;
  }

  private open(): Promise<SqliteDatabase> {
    this.dbPromise ??= (async () => {
      const [{ mkdirSync }, { dirname, resolve }, { DatabaseSync }] = await Promise.all([
        import('node:fs'),
        import('node:path'),
        import('node:sqlite'),
      ]);
      const file = resolve(this.file);
      mkdirSync(dirname(file), { recursive: true });
      const db = new DatabaseSync(file);
      db.exec(`
        CREATE TABLE IF NOT EXISTS agent_sessions (
          id         TEXT PRIMARY KEY,
          demo       INTEGER NOT NULL,
          user_id    TEXT NOT NULL DEFAULT '',
          ip         TEXT NOT NULL DEFAULT '',
          current    TEXT,
          messages   TEXT NOT NULL,
          turns      TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);
      return db;
    })();
    return this.dbPromise;
  }

  async create(session: AgentSession): Promise<void> {
    await this.save(session);
  }

  async find(sessionId: string): Promise<AgentSession | null> {
    const db = await this.open();
    const row = db.prepare('SELECT * FROM agent_sessions WHERE id = ?').get(sessionId) as
      | Record<string, unknown>
      | undefined;
    if (!row) return null;
    return {
      id: String(row.id),
      demo: Boolean(row.demo),
      userId: String(row.user_id ?? ''),
      ip: String(row.ip ?? ''),
      current: row.current ? (JSON.parse(String(row.current)) as AgentSession['current']) : null,
      messages: JSON.parse(String(row.messages)) as AgentSession['messages'],
      turns: JSON.parse(String(row.turns)) as AgentSession['turns'],
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  async save(session: AgentSession): Promise<void> {
    const db = await this.open();
    const updatedAt = new Date().toISOString();
    session.updatedAt = updatedAt;
    db.prepare(
      `INSERT INTO agent_sessions (id, demo, user_id, ip, current, messages, turns, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         demo = excluded.demo,
         user_id = excluded.user_id,
         ip = excluded.ip,
         current = excluded.current,
         messages = excluded.messages,
         turns = excluded.turns,
         updated_at = excluded.updated_at`,
    ).run(
      session.id,
      session.demo ? 1 : 0,
      session.userId,
      session.ip,
      session.current ? JSON.stringify(session.current) : null,
      JSON.stringify(session.messages),
      JSON.stringify(session.turns),
      session.createdAt,
      updatedAt,
    );
  }
}
