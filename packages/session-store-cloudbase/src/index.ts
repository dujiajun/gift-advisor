import { isRecord, type AgentSession, type SessionStore } from '@gift-advisor/agent-core';

/**
 * AgentSession 的 CloudBase 文档数据库实现：集合 agent_sessions，
 * 一个会话一条文档（_id = sessionId，整档读写，last-write-wins）。
 *
 * 宿主（packages/web 在 Vercel、packages/gift-agent 云函数）注入使用。
 * 初始化（首个请求时惰性加载 @cloudbase/node-sdk）：
 * - 云函数内：免密钥，env 用 SYMBOL_CURRENT_ENV（平台注入身份）
 * - 云函数外（如 Vercel）：需配置 CLOUD_ENV_ID + TCB_SECRET_ID + TCB_SECRET_KEY
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
    const col = await this.collection();
    const res = await col.doc(sessionId).get();
    const data = Array.isArray(res.data) ? res.data[0] : res.data;
    if (!isRecord(data)) return null;
    // 文档主键 _id 必须剔除：留在 rest 里会随会话对象在下次 save 时写回，
    // 服务端拒绝更新已存在文档的 _id（"不能更新 _id 的值"）
    const { _id, id, userId, ip, ...rest } = data as Record<string, unknown>;
    return {
      ...(rest as unknown as Omit<AgentSession, 'id' | 'userId' | 'ip'>),
      userId: typeof userId === 'string' ? userId : '',
      ip: typeof ip === 'string' ? ip : '',
      id: typeof id === 'string' ? id : sessionId,
    };
  }

  async save(session: AgentSession): Promise<void> {
    const col = await this.collection();
    // _id 与 id 都不能进载荷：文档主键由 doc(id) 指定，携带 _id 更新已存在文档会被
    // 服务端拒绝。find() 已在上游剥离 _id，这里防御性再剥一次（类型上如实标注）
    const { _id, id, ...doc } = {
      ...session,
      updatedAt: new Date().toISOString(),
    } as AgentSession & { _id?: unknown };
    await col.doc(id).set(doc);
  }
}
