import { generateText, isStepCount } from 'ai';
import { getModel } from './llm';
import { agentTools, askQuestionSchema, deliverReportSchema } from './tools';
import { webSearch } from './search';
import { appendAnswer, countAsked, initMessages } from './history';
import { MAX_QUESTIONS, SYSTEM_PROMPT, USER_OPENER } from './prompt';
import { fromModelMessages, toModelMessages } from './wire/model-messages';
import { sanitizeMessages } from './wire/messages';
import { normalizeOptions, normalizeReport } from './wire/normalize';
import type { AgentResponse, WireMessage } from './types';

const MAX_STEPS = 12;

/**
 * 服务端 Agent 主循环（无状态、按轮驱动，天然适配 Serverless）：
 * - 客户端回传完整 messages 历史 + 本轮回答
 * - generateText 负责单次运行内的多步循环（web_search 带 execute 自动回填），
 *   ask_user_question / deliver_report 不带 execute → 调用即挂起：
 *   要么把问题带回给用户，要么以报告收尾
 * - 外层 while 只处理需要重新引导模型的情况（参数不完整/闲聊/超提问上限），
 *   并负责 MAX_STEPS 总步数预算
 *
 * 本文件只做流程编排：历史进出走 wire/model-messages，
 * 工具参数校验由 tools.ts 的 zod schema 声明式承担（safeParse 窄化）。
 */
export async function runAgent(prevMessages: WireMessage[], answer?: string): Promise<AgentResponse> {
  const messages = sanitizeMessages(prevMessages);

  if (messages.length === 0) {
    initMessages(messages, SYSTEM_PROMPT, USER_OPENER);
  } else {
    await appendAnswer(messages, String(answer ?? ''), webSearch);
  }

  let usedSteps = 0;

  while (usedSteps < MAX_STEPS) {
    const asked = countAsked(messages);
    let nudge = '';
    if (asked >= MAX_QUESTIONS) {
      nudge = `（已问满 ${MAX_QUESTIONS} 个问题，禁止再调用 ask_user_question，必须立即调用 deliver_report！）`;
    } else if (asked >= 5) {
      nudge = `（你已经问了 ${asked} 个问题，信息足够时可以收尾：必要时先用 web_search 查证，然后调用 deliver_report 给出 3 个礼物。）`;
    }

    const prompt = toModelMessages(messages);
    if (nudge) prompt.instructions = prompt.instructions ? `${prompt.instructions}\n\n${nudge}` : nudge;

    const result = await generateText({
      model: getModel(),
      instructions: prompt.instructions || undefined,
      messages: prompt.messages,
      tools: agentTools,
      temperature: 0.9,
      stopWhen: isStepCount(MAX_STEPS - usedSteps),
    });

    usedSteps += result.steps.length;
    messages.push(...fromModelMessages(result.responseMessages));

    const finalStep = result.steps[result.steps.length - 1];
    const toolCalls = finalStep?.toolCalls ?? [];
    let retry = false; // 是否已注入纠错信息、需要重新引导模型

    for (const tc of toolCalls) {
      if (tc.toolName === 'ask_user_question') {
        const parsed = askQuestionSchema.safeParse(tc.input);
        const question = parsed.success ? parsed.data.question.trim() : '';
        const options = parsed.success ? normalizeOptions(parsed.data.options) : [];
        if (asked >= MAX_QUESTIONS) {
          messages.push({
            role: 'tool',
            tool_call_id: tc.toolCallId,
            content: `（已达提问上限 ${MAX_QUESTIONS} 个！不能再提问，立即调用 deliver_report。）`,
          });
          retry = true;
          break;
        }
        if (!question || options.length === 0) {
          messages.push({
            role: 'tool',
            tool_call_id: tc.toolCallId,
            content: '（参数不完整：需要 question 和至少 1 个 options。请重新调用 ask_user_question。）',
          });
          retry = true;
          break;
        }
        return {
          ok: true,
          demo: false,
          messages,
          pending: {
            kind: 'question',
            toolCallId: tc.toolCallId,
            narration: finalStep?.text ?? '',
            question,
            options,
            askedCount: asked + 1,
          },
        };
      }

      if (tc.toolName === 'deliver_report') {
        const parsed = deliverReportSchema.safeParse(tc.input);
        if (!parsed.success) {
          messages.push({
            role: 'tool',
            tool_call_id: tc.toolCallId,
            content: '（参数不完整：gifts 必须是恰好 3 个礼物的数组。请重新调用 deliver_report。）',
          });
          retry = true;
          break;
        }
        const report = normalizeReport(parsed.data);
        messages.push({ role: 'tool', tool_call_id: tc.toolCallId, content: '报告已送达用户' });
        return {
          ok: true,
          demo: false,
          messages,
          pending: { kind: 'report', narration: finalStep?.text ?? '', report, askedCount: asked },
        };
      }
    }

    if (!retry) {
      // 最终一步既没有提问也没有报告（纯闲聊）：推回工具流程
      messages.push({
        role: 'user',
        content: '（系统提示：请不要闲聊，调用工具继续流程：ask_user_question 提问，或 deliver_report 出报告。）',
      });
    }
  }

  throw new Error('参谋绕了太多圈（步数超限），请重试');
}
