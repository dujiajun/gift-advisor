import { chatCompletion } from './llm';
import { toolSchemas } from './tools';
import { webSearch } from './search';
import {
  appendAnswer,
  countAsked,
  initMessages,
  normalizeOptions,
  normalizeReport,
  sanitizeMessages,
} from './agent-utils';
import type { AgentResponse, WireMessage } from './types';

export const MAX_QUESTIONS = 10;
const MAX_STEPS = 12;

export const SYSTEM_PROMPT = `你是小程序「这次送什么礼物」里的核心角色——「礼物参谋」🧙。你古灵精怪、热情靠谱，说话像游戏里的 NPC，偶尔蹦出一句夸张的旁白。

【任务】
用户想送礼物但不知道送什么。你要用 ask_user_question 工具一次一个问题地了解情况（共 5~10 个问题），然后用 deliver_report 一次性给出 3 个礼物推荐。

【提问策略】（灵活调整顺序，别照本宣科）
1. 送礼对象是谁：年龄段、性别
2. 对象的身份 / 与用户的关系：朋友、恋人、长辈、同事、领导、客户、孩子……以及关系亲密度
3. 场合与时机：生日、节日、纪念日、道歉、感谢、表白、乔迁、探病、升职……
4. 预算区间（很重要，早点问）
5. 对象的性格与喜好：实用党 / 颜值党 / 某领域爱好者（游戏、健身、二次元、户外……）
6. 用户想传达的心意：惊喜、感动、实用、浪漫、搞笑整活
7. 补充约束：是否要能邮寄、是否要惊喜、有没有雷区/忌讳

【规则】
- 每次回复只调用一个工具，绝不在一次回复里调用多个工具。
- ask_user_question：问题要短、口语化、有梗；提供 2~4 个覆盖面广的选项；一次只问一个维度，不问复合问题。
- 根据已有回答动态追问，不要重复问同一维度。
- 至少问满 5 个问题才允许调用 deliver_report；问满 10 个问题后必须立即 deliver_report，不许再问。
- 可以用 web_search 查最新的流行礼物、爆款、价格（整个流程最多 2 次），让推荐更接地气；对价格没把握时也搜一搜。
- deliver_report 的 reason 必须具体呼应用户的回答，让用户觉得"它真的在听我说话"；tip 给一个加分小主意（包装/祝语/仪式感玩法）。
- 语气活泼但专业，旁白（content）不超过两句，多用具象 emoji。`;

/**
 * 服务端 Agent 主循环（无状态、按轮驱动，天然适配 Serverless）：
 * - 客户端回传完整 messages 历史 + 本轮回答
 * - 服务端循环执行 LLM 调用，直到 agent 要么 ask_user_question（挂起等用户）、
 *   要么 deliver_report（流程结束）
 */
export async function runAgent(prevMessages: WireMessage[], answer?: string): Promise<AgentResponse> {
  const messages = sanitizeMessages(prevMessages);

  if (messages.length === 0) {
    initMessages(messages, SYSTEM_PROMPT, '参谋你好！我要给人送礼物，快开始提问吧！');
  } else {
    await appendAnswer(messages, String(answer ?? ''), webSearch);
  }

  for (let step = 0; step < MAX_STEPS; step++) {
    const asked = countAsked(messages);
    let nudge = '';
    if (asked >= MAX_QUESTIONS) {
      nudge = `（已问满 ${MAX_QUESTIONS} 个问题，禁止再调用 ask_user_question，必须立即调用 deliver_report！）`;
    } else if (asked >= 5) {
      nudge = `（你已经问了 ${asked} 个问题，信息足够时可以收尾：必要时先用 web_search 查证，然后调用 deliver_report 给出 3 个礼物。）`;
    }

    const res = await chatCompletion({ messages, tools: toolSchemas, nudge });
    messages.push(res.raw);

    for (const tc of res.toolCalls) {
      if (tc.name === 'web_search') {
        const q = typeof tc.args?.query === 'string' ? tc.args.query : '';
        messages.push({ role: 'tool', tool_call_id: tc.id, content: await webSearch(q) });
        continue;
      }

      if (tc.name === 'deliver_report') {
        const report = tc.args && Array.isArray(tc.args.gifts) && tc.args.gifts.length ? normalizeReport(tc.args) : null;
        if (!report) {
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: '（参数不完整：gifts 必须是恰好 3 个礼物的数组。请重新调用 deliver_report。）',
          });
          continue;
        }
        messages.push({ role: 'tool', tool_call_id: tc.id, content: '报告已送达用户' });
        return {
          ok: true,
          demo: false,
          messages,
          pending: { kind: 'report', narration: res.content, report, askedCount: asked },
        };
      }

      if (tc.name === 'ask_user_question') {
        if (asked >= MAX_QUESTIONS) {
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: `（已达提问上限 ${MAX_QUESTIONS} 个！不能再提问，立即调用 deliver_report。）`,
          });
          continue;
        }
        const question = typeof tc.args?.question === 'string' ? tc.args.question.trim() : '';
        const options = normalizeOptions(tc.args?.options);
        if (!question || options.length === 0) {
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: '（参数不完整：需要 question 和至少 1 个 options。请重新调用 ask_user_question。）',
          });
          continue;
        }
        return {
          ok: true,
          demo: false,
          messages,
          pending: {
            kind: 'question',
            toolCallId: tc.id,
            narration: res.content,
            question,
            options,
            askedCount: asked + 1,
          },
        };
      }

      if (tc.name) {
        messages.push({ role: 'tool', tool_call_id: tc.id, content: `（未知工具 ${tc.name}，已忽略）` });
      }
    }

    if (res.toolCalls.length === 0) {
      messages.push({
        role: 'user',
        content: '（系统提示：请不要闲聊，调用工具继续流程：ask_user_question 提问，或 deliver_report 出报告。）',
      });
    }
  }

  throw new Error('参谋绕了太多圈（步数超限），请重试');
}
