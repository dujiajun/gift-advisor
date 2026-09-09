import { handleAgentRequest } from '@gift-advisor/agent-core';

/**
 * 微信小程序「这次送什么礼物」的云函数入口（CloudBase Event Function）。
 *
 * 小程序端调用方式（与 Web 版 POST /api/agent 完全同构）：
 *   wx.cloud.callFunction({ name: 'gift-agent', data: { messages, answer } })
 *   → event 即 data，返回 AgentResponse
 *
 * 调度逻辑（真/演示 Agent 分发、错误兜底）在 @gift-advisor/agent-core 的
 * handleAgentRequest，与 Web 版共用；本文件只是 SCF 运行时的薄适配。
 *
 * 环境变量（在 CloudBase 控制台-云函数配置里设置，见 docs/cloudbase.md）：
 *   LLM_BASE_URL / LLM_API_KEY / LLM_MODEL / TAVILY_API_KEY
 * 未配置 LLM_API_KEY 时自动进入演示模式（内置剧本），与 Web 版行为一致。
 */
export const main = (event: unknown) => handleAgentRequest(event);
