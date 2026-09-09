import { appendAnswer, countAsked, initMessages } from '@gift-advisor/agent-core/history';
import { sanitizeMessages } from '@gift-advisor/agent-core/wire/messages';
import { normalizeReport } from '@gift-advisor/agent-core/wire/normalize';
import { safeJson } from '@gift-advisor/agent-core/wire/json';
import type { AgentRunResult, WireMessage } from '@gift-advisor/agent-core/types';

/**
 * 演示模式 Agent：未配置 LLM_API_KEY 时使用。
 * 与真 agent 完全同协议（OpenAI messages + 工具调用），
 * 方便本地/部署后零成本跑通 UI 与全流程。
 */

const DEMO_NOTE = '【演示模式：未配置 LLM_API_KEY，由内置剧本扮演参谋。配置后即可启用真 AI。】';

const SCRIPT = [
  {
    narration: '叮咚！🎁 送礼大冒险开始！参谋我先摸个底——',
    question: '这份礼物要送给谁呀？',
    options: [
      { label: '女生', emoji: '👩' },
      { label: '男生', emoji: '👨' },
      { label: '长辈', emoji: '🧓' },
      { label: '小朋友', emoji: '🧒' },
    ],
  },
  {
    narration: '哦豁，原来是 TA！那 TA 是你的……？',
    question: 'TA 和你的关系是？',
    options: [
      { label: '恋人/对象', emoji: '💕' },
      { label: '好朋友', emoji: '🤝' },
      { label: '同事/领导', emoji: '💼' },
      { label: '家人', emoji: '🏡' },
    ],
  },
  {
    narration: '关系搞清楚了！什么场合送出呢～',
    question: '送礼的场合/时机是？',
    options: [
      { label: '生日', emoji: '🎂' },
      { label: '节日', emoji: '🎄' },
      { label: '纪念日/表白', emoji: '💘' },
      { label: '感谢/道歉', emoji: '🙏' },
    ],
  },
  {
    narration: '场面了解了！接下来谈谈钱袋子 💰',
    question: '预算大概在什么区间？',
    options: [
      { label: '¥50-100', emoji: '🪙' },
      { label: '¥100-300', emoji: '💵' },
      { label: '¥300-800', emoji: '💎' },
      { label: '¥800 以上', emoji: '👑' },
    ],
  },
  {
    narration: '收到！最后两个灵魂拷问——',
    question: 'TA 更像哪种类型的人？',
    options: [
      { label: '实用主义', emoji: '🧰' },
      { label: '颜值控', emoji: '🎀' },
      { label: '兴趣狂热者', emoji: '🎮' },
      { label: '佛系随缘', emoji: '🧘' },
    ],
  },
  {
    narration: '最后一问！答完就开宝箱——',
    question: '你最想传达什么心意？',
    options: [
      { label: '惊喜感动', emoji: '🎁' },
      { label: '实用贴心', emoji: '🫖' },
      { label: '浪漫心动', emoji: '💝' },
      { label: '搞笑整活', emoji: '🤪' },
    ],
  },
];

export async function runMockAgent(prevMessages: WireMessage[], answer?: string): Promise<AgentRunResult> {
  const messages = sanitizeMessages(prevMessages);

  if (messages.length === 0) {
    initMessages(messages, '演示模式剧本 agent', '我要送礼！请开始提问～');
  } else {
    await appendAnswer(messages, String(answer ?? ''), null);
  }

  const asked = countAsked(messages);

  if (asked < SCRIPT.length) {
    const q = SCRIPT[asked];
    const id = `mock_q_${asked + 1}`;
    messages.push({
      role: 'assistant',
      content: q.narration,
      tool_calls: [
        {
          id,
          type: 'function',
          function: {
            name: 'ask_user_question',
            arguments: JSON.stringify({ question: q.question, options: q.options }),
          },
        },
      ],
    });
    return {
      demo: true,
      messages,
      pending: {
        kind: 'question',
        narration: q.narration,
        question: q.question,
        options: q.options,
        askedCount: asked + 1,
      },
    };
  }

  // 收集用户此前依次提交的回答
  const answers: string[] = [];
  for (const m of messages) {
    if (m.role !== 'tool') continue;
    const parsed = safeJson<{ user_answer?: string } | null>(m.content, null);
    if (parsed?.user_answer) answers.push(parsed.user_answer);
  }

  const [
    who = '那位重要的人',
    rel = '好朋友',
    occasion = '特别的日子',
    budget = '¥100-300',
    style = '有品位',
    wish = '惊喜',
  ] = answers;

  const report = normalizeReport({
    intro: `${DEMO_NOTE} 根据你的描述：送给${who}（${rel}），${occasion}，预算 ${budget}，TA 是「${style}」，你想传达「${wish}」。参谋从百宝袋里掏出了这 3 件宝贝：`,
    gifts: [
      {
        name: '定制星空投影灯',
        emoji: '🌌',
        price: '¥80-150',
        match: 88,
        tags: ['氛围感', '惊喜感'],
        reason: `${style}的${who}收到它，${occasion}的夜晚立刻变得浪漫。把想说的话刻在底座上，「${wish}」值直接拉满。`,
        tip: '关灯再让 TA 拆开，星空亮起的一瞬间说出祝语，仪式感翻倍。',
      },
      {
        name: '手作心意礼盒（零食+手账+合照）',
        emoji: '📦',
        price: budget,
        match: 82,
        tags: ['高性价比', '独一无二'],
        reason: '成本可控又走心：零食按 TA 的口味挑，手账里贴你们的合照，全世界只此一份。',
        tip: '每层包装里藏一张小纸条，让 TA 拆出寻宝的感觉。',
      },
      {
        name: '体验类礼物（陶艺/密室/展览双人票）',
        emoji: '🎫',
        price: '¥150-400',
        match: 76,
        tags: ['制造回忆', '不易撞款'],
        reason: `东西会旧，回忆不会。作为${rel}，一起动手做件陶艺，比物件更能拉近你们的距离。`,
        tip: '提前手写一张「体验券」放进信封，正式感拉满。',
      },
    ],
  });

  const id = 'mock_report';
  const narration = '叮！图鉴集齐 ✨ 这是参谋的压箱底推荐：';
  messages.push({
    role: 'assistant',
    content: narration,
    tool_calls: [
      {
        id,
        type: 'function',
        function: { name: 'deliver_report', arguments: JSON.stringify(report) },
      },
    ],
  });
  messages.push({ role: 'tool', tool_call_id: id, content: 'ok' });

  return {
    demo: true,
    messages,
    pending: { kind: 'report', narration, report, askedCount: asked },
  };
}
