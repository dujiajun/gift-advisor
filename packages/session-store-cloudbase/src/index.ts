import {
  isRecord,
  isSessionId,
  sanitizeDeep,
  type AgentSession,
  type Pending,
  type SessionStore,
  type TurnRecord,
  type WireMessage,
} from '@gift-advisor/agent-core';

/**
 * AgentSession 的 CloudBase 文档数据库实现：集合 agent_sessions，
 * 一个会话一条文档，**文档主键 _id 就是 sessionId**（也就是 AgentSession.id，
 * 不存在第二个 id 字段）——整档读写，last-write-wins。
 *
 * 读写都在这里显式映射，不做「整档 spread」：
 * - 写入 toDoc()：AgentSession → 文档字段。id 不进载荷，主键由 doc(id) 指定；
 *   node-sdk 的 set() 见到载荷里有 _id 会直接抛 INVALID_PARAM（「不能更新_id的值」）。
 * - 读取 fromDoc()：_id 即 id；字段逐个兜底，旧版可能残留的 id 字段一律忽略。
 *
 * 写入前整档清洗字符串里的孤立代理项（sanitizeDeep）：TCB 服务端会拒绝含
 * 半个 emoji 的文档（INVALID_PARAM「Check request parameter fail」），
 * 一条脏字符串就让整轮会话写不进去。见 agent-core 的 wire/text.ts。
 *
 * 宿主（packages/web 在 Vercel、packages/gift-agent 云函数）注入使用。
 * 初始化（首个请求时惰性加载 @cloudbase/node-sdk）：
 * - 云函数内：免密钥，env 用 SYMBOL_CURRENT_ENV（平台注入身份）
 * - 云函数外（如 Vercel）：需配置 CLOUD_ENV_ID + TCB_SECRET_ID + TCB_SECRET_KEY
 *   （临时密钥另需 TCB_SESSION_TOKEN）
 *
 * 集合创建见 docs/cloudbase.md（控制台或 MCP writeNoSqlDatabaseStructure）。
 */

/** node-sdk 集合操作的最小结构类型（避免静态依赖 SDK 的类型细节） */
interface TcbDocRef {
  set(data: unknown): Promise<unknown>;
  get(): Promise<{ data?: unknown }>;
}

interface TcbCollection {
  doc(id: string): TcbDocRef;
}

/** 文档字段：AgentSession 去掉 id（id 由 _id 承载），updatedAt 写入时刷新 */
type SessionDoc = Omit<AgentSession, 'id' | 'updatedAt'> & { updatedAt: string };

export class CloudBaseSessionStore implements SessionStore {
  private collectionPromise: Promise<TcbCollection> | null = null;

  private collection(): Promise<TcbCollection> {
    this.collectionPromise ??= (async () => {
      // node-sdk 是 CJS 具名导出（无 default）——经打包器处理后 .default 为 undefined，
      // 必须按具名解构（本地 tsx/Next 的 ESM 互操作掩盖过这个问题）
      const { init, SYMBOL_CURRENT_ENV } = await import('@cloudbase/node-sdk');
      const app = init({
        // 云函数内免密钥（SYMBOL_CURRENT_ENV = 当前函数所在环境）；跨端部署需显式 CLOUD_ENV_ID
        env: process.env.CLOUD_ENV_ID || SYMBOL_CURRENT_ENV,
        secretId: process.env.TCB_SECRET_ID || undefined,
        secretKey: process.env.TCB_SECRET_KEY || undefined,
        // 临时密钥（如 CI / 本地联调）必须携带 token，长期密钥留空即可
        sessionToken: process.env.TCB_SESSION_TOKEN || undefined,
      });
      return app.database().collection('agent_sessions') as unknown as TcbCollection;
    })();
    return this.collectionPromise;
  }

  async create(session: AgentSession): Promise<void> {
    await this.save(session);
  }

  async find(sessionId: string): Promise<AgentSession | null> {
    // 形状不对的 id 不必去问数据库（也让空串这类值到不了 SDK 的参数校验）
    if (!isSessionId(sessionId)) return null;
    const col = await this.collection();
    const res = await col.doc(sessionId).get();
    const data = Array.isArray(res.data) ? res.data[0] : res.data;
    if (!isRecord(data)) return null;
    return fromDoc(sessionId, data);
  }

  async save(session: AgentSession): Promise<void> {
    if (!isSessionId(session.id)) throw new Error('会话 ID 不合法，请重新开始');
    const col = await this.collection();
    await col.doc(session.id).set(toDoc(session));
  }
}

/** AgentSession → 文档字段（载荷里不出现 id / _id；写入前剔除孤立代理项） */
function toDoc(session: AgentSession): SessionDoc {
  const { id: _primaryKey, ...fields } = session;
  return sanitizeDeep<SessionDoc>({ ...fields, updatedAt: new Date().toISOString() });
}

/** 文档字段 → AgentSession：_id 即 id，其余字段逐个兜底（旧文档 / 脏数据不让它进来） */
function fromDoc(id: string, data: Record<string, unknown>): AgentSession {
  const createdAt = str(data.createdAt) || new Date().toISOString();
  return {
    id,
    demo: data.demo === true,
    userId: str(data.userId),
    ip: str(data.ip),
    messages: Array.isArray(data.messages) ? (data.messages as WireMessage[]) : [],
    turns: Array.isArray(data.turns) ? (data.turns as TurnRecord[]) : [],
    current: asPending(data.current),
    createdAt,
    updatedAt: str(data.updatedAt) || createdAt,
  };
}

/** 只收 kind 合法且形状是对象的挂起快照（旧版文档残留的 id 等字段天然被排除） */
function asPending(value: unknown): Pending | null {
  if (!isRecord(value)) return null;
  if (value.kind !== 'question' && value.kind !== 'report') return null;
  return value as unknown as Pending;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
