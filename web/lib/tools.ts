/** 暴露给 LLM Agent 的工具定义（OpenAI function calling 格式） */

export interface ToolSchema {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export const toolSchemas: ToolSchema[] = [
  {
    type: 'function',
    function: {
      name: 'ask_user_question',
      description:
        '向用户提出一个选择题。每次只问一个问题，提供 1~4 个覆盖面广的选项；用户也可以忽略选项自由输入。问题要短、口语化、有趣。',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: '问题文本，一句话，不要复合提问' },
          options: {
            type: 'array',
            minItems: 1,
            maxItems: 4,
            description: '1~4 个选项，尽量覆盖最常见的回答',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string', description: '选项文字，例如：30-40岁的女性' },
                emoji: { type: 'string', description: '代表该选项的一个 emoji' },
              },
              required: ['label'],
            },
          },
        },
        required: ['question', 'options'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description:
        '联网搜索送礼灵感、流行礼物、价格行情等。对最新趋势/价格没把握时使用；整个流程最多用 2 次，不要滥用。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索词，例如：2026 送给 30 岁女生 生日礼物 推荐' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'deliver_report',
      description:
        '收集到足够信息（至少问 5 个问题，最多 10 个）后调用，一次性提交最终报告：3 个候选礼物。调用后流程即结束，用户只会看到这 3 个礼物。',
      parameters: {
        type: 'object',
        properties: {
          intro: { type: 'string', description: '一句话总结你对收礼人的理解，让用户感到被倾听' },
          gifts: {
            type: 'array',
            minItems: 3,
            maxItems: 3,
            description: '恰好 3 个礼物，按推荐度排序',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: '礼物名称，具体到品类/款式' },
                emoji: { type: 'string', description: '代表该礼物的 emoji' },
                price: { type: 'string', description: '预估价格区间，如 ¥100-200' },
                reason: { type: 'string', description: '为什么适合 TA，2~3 句，必须呼应用户前面的回答' },
                tip: { type: 'string', description: '加分小贴士：包装/祝语/仪式感玩法' },
                match: { type: 'integer', description: '匹配度 0-100' },
                tags: { type: 'array', items: { type: 'string' }, description: '2~4 个标签，如：氛围感、实用' },
              },
              required: ['name', 'emoji', 'price', 'reason', 'match'],
            },
          },
        },
        required: ['intro', 'gifts'],
      },
    },
  },
];
