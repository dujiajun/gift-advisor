import {
  handleAgentRequest,
  isRecord,
  MemorySessionStore,
  type AgentContext,
  type SessionStore,
} from '@gift-advisor/agent-core';
import { CloudBaseSessionStore } from '@gift-advisor/session-store-cloudbase';

/**
 * 微信小程序「这次送什么礼物」的云函数入口（CloudBase Event Function）。
 *
 * 小程序端调用方式（与 Web 版 POST /api/agent 完全同构）：
 *   wx.cloud.callFunction({ name: 'gift-agent', data: { action, sessionId?, answer? } })
 *   → event 即 data，返回 AgentResponse（sessionId / pending / askedCount）
 *
 * 调度逻辑在 @gift-advisor/agent-core 的 handleAgentRequest；本文件只做三件事：
 * - SCF 运行时适配（main 导出）
 * - 会话存储注入：默认 CloudBase 文档数据库（云端生产；集合 agent_sessions）；
 *   SESSION_STORE=memory 进程内存 / sqlite 本地文件（本机联调）
 * - 身份提取注入（AgentContext）：小程序调用 → 微信 OPENID + 客户端 IP
 *   （@cloudbase/node-sdk 从函数环境解析）；本地/非微信调用环境为空
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

/** 提取调用者身份：云函数内由平台注入（小程序调用带微信身份）；本地试跑返回空 */
async function getAgentContext(): Promise<AgentContext> {
  try {
    // CJS 具名导出，不能用 .default（见 session-store-cloudbase 同款注释）
    const { init, SYMBOL_CURRENT_ENV } = await import('@cloudbase/node-sdk');
    const app = init({ env: process.env.CLOUD_ENV_ID || SYMBOL_CURRENT_ENV });
    const auth = app.auth();
    const info = auth.getUserInfo() as unknown;
    const openId = isRecord(info) && typeof info.openId === 'string' ? info.openId : '';
    const ip = auth.getClientIP();
    return { userId: openId || undefined, ip: ip || undefined };
  } catch {
    return {};
  }
}

export const main = async (event: unknown) =>
  handleAgentRequest(event, await getStore(), await getAgentContext());
