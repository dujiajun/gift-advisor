import { handleAgentRequest, MemorySessionStore, type SessionStore } from '@gift-advisor/agent-core';
import { CloudBaseSessionStore } from '@gift-advisor/session-store-cloudbase';

/**
 * 微信小程序「这次送什么礼物」的云函数入口（CloudBase Event Function）。
 *
 * 小程序端调用方式（与 Web 版 POST /api/agent 完全同构）：
 *   wx.cloud.callFunction({ name: 'gift-agent', data: { action, sessionId?, answer? } })
 *   → event 即 data，返回 AgentResponse（sessionId / pending / askedCount）
 *
 * 调度逻辑在 @gift-advisor/agent-core 的 handleAgentRequest；本文件只做
 * SCF 运行时适配 + 会话存储注入：
 * - 默认 CloudBase 文档数据库（云端生产；集合 agent_sessions）
 * - SESSION_STORE=memory：进程内存（不持久化）
 * - SESSION_STORE=sqlite：本地文件（本机联调，需 Node ≥24 运行时）
 *
 * 环境变量（CloudBase 控制台-云函数配置，见 docs/cloudbase.md）：
 *   LLM_BASE_URL / LLM_API_KEY / LLM_MODEL / TAVILY_API_KEY
 * 未配置 LLM_API_KEY 时自动进入演示模式（内置剧本），与 Web 版行为一致。
 */

let storePromise: Promise<SessionStore> | null = null;

function getStore(): Promise<SessionStore> {
  storePromise ??= (async () => {
    switch (process.env.SESSION_STORE) {
      case 'memory':
        return new MemorySessionStore();
      case 'sqlite': {
        const { createSqliteSessionStore } = await import('@gift-advisor/session-store-sqlite');
        return createSqliteSessionStore();
      }
      default:
        return new CloudBaseSessionStore();
    }
  })();
  return storePromise;
}

export const main = async (event: unknown) => handleAgentRequest(event, await getStore());
