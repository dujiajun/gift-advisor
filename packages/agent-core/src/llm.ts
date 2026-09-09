import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';

/**
 * LLM 接入：基于 AI SDK 的 OpenAI 兼容供应商工厂。
 * 通过环境变量切换供应商：LLM_BASE_URL / LLM_API_KEY / LLM_MODEL。
 *
 * 推理模型（deepseek-reasoner / GLM 思考模式等）的 reasoning_content
 * 由 @ai-sdk/openai-compatible 自动解析为 reasoning parts；
 * 回传给 LLM 时是否携带思考过程由 wire/model-messages.ts 控制（默认剥离）。
 */

export function llmEnabled(): boolean {
  return Boolean(process.env.LLM_API_KEY);
}

/** 惰性创建模型实例（每次调用读取环境变量，适配云函数/测试动态配置） */
export function getModel(): LanguageModel {
  const baseURL = (process.env.LLM_BASE_URL || 'https://api.deepseek.com/v1').replace(/\/+$/, '');
  const provider = createOpenAICompatible({
    name: 'gift-advisor-llm',
    baseURL,
    apiKey: process.env.LLM_API_KEY,
  });
  return provider.chatModel(process.env.LLM_MODEL || 'deepseek-chat');
}
