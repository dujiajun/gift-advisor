import { tool } from 'ai';
import { z } from 'zod';
import { webSearch } from '@gift-advisor/agent-core/search';

/**
 * 暴露给 LLM Agent 的工具集（AI SDK tool + zod schema）。
 * schema 单独导出，供 agent 循环对挂起的工具调用做声明式窄化（safeParse），
 * 参数合法性全部由 zod 声明式约束，业务代码不手写类型判断：
 * - ask_user_question / deliver_report 不带 execute → 调用即挂起，交回给用户/流程收尾
 * - web_search 带 execute → 在 generateText 循环内自动执行并回填结果
 */

export const askQuestionSchema = z.object({
  question: z.string().describe('问题文本，一句话，不要复合提问'),
  options: z
    .array(
      z.object({
        label: z.string().describe('选项文字，例如：30-40岁的女性'),
        emoji: z.string().optional().describe('代表该选项的一个 emoji'),
      }),
    )
    .min(1)
    .max(4)
    .describe('1~4 个选项，尽量覆盖最常见的回答'),
});

export const webSearchSchema = z.object({
  query: z.string().describe('搜索词，例如：2026 送给 30 岁女生 生日礼物 推荐'),
});

export const deliverReportSchema = z.object({
  intro: z.string().describe('一句话总结你对收礼人的理解，让用户感到被倾听'),
  gifts: z
    .array(
      z.object({
        name: z.string().describe('礼物名称，具体到品类/款式'),
        emoji: z.string().describe('代表该礼物的 emoji'),
        price: z.string().describe('预估价格区间，如 ¥100-200'),
        reason: z.string().describe('为什么适合 TA，2~3 句，必须呼应用户前面的回答'),
        tip: z.string().optional().describe('加分小贴士：包装/祝语/仪式感玩法'),
        match: z.number().int().describe('匹配度 0-100'),
        tags: z.array(z.string()).max(4).optional().describe('2~4 个标签，如：氛围感、实用'),
      }),
    )
    .length(3)
    .describe('恰好 3 个礼物，按推荐度排序'),
});

export const agentTools = {
  ask_user_question: tool({
    description:
      '向用户提出一个选择题。每次只问一个问题，提供 1~4 个覆盖面广的选项；用户也可以忽略选项自由输入。问题要短、口语化、有趣。',
    inputSchema: askQuestionSchema,
  }),

  web_search: tool({
    description:
      '联网搜索送礼灵感、流行礼物、价格行情等。对最新趋势/价格没把握时使用；整个流程最多用 2 次，不要滥用。',
    inputSchema: webSearchSchema,
    execute: async ({ query }) => webSearch(query),
  }),

  deliver_report: tool({
    description:
      '收集到足够信息（至少问 5 个问题，最多 10 个）后调用，一次性提交最终报告：3 个候选礼物。调用后流程即结束，用户只会看到这 3 个礼物。',
    inputSchema: deliverReportSchema,
  }),
};

export type AgentTools = typeof agentTools;
