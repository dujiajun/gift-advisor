#!/usr/bin/env node
/**
 * 冒烟测试：用内置"演示模式"完整跑通 Agent 流程（无需任何 API key）。
 *
 * 用法：
 *   1. 启动服务：pnpm dev  （或 pnpm build && pnpm start）
 *   2. 运行：    node scripts/smoke-test.mjs [baseUrl]
 */
const BASE = process.argv[2] || process.env.BASE_URL || 'http://localhost:3000';

async function call(messages, answer) {
  const res = await fetch(`${BASE}/api/agent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, answer }),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function main() {
  console.log(`▶ 冒烟测试目标: ${BASE}/api/agent`);
  let messages = [];
  let answer;
  let turns = 0;

  for (;;) {
    const data = await call(messages, answer);
    messages = data.messages;
    turns++;

    if (data.pending?.kind === 'question') {
      console.log(`\nQ${data.pending.askedCount}: ${data.pending.question}`);
      for (const opt of data.pending.options) console.log(`   ${opt.emoji} ${opt.label}`);
      answer = data.pending.options[0]?.label ?? '都行';
      console.log(`→ 自动回答: ${answer}`);
    } else if (data.pending?.kind === 'report') {
      const { report } = data.pending;
      console.log(`\n✅ 报告生成（${turns} 轮请求，${data.pending.askedCount} 个问题，演示模式=${Boolean(data.demo)}）`);
      console.log(`   导语: ${report.intro}`);
      for (const g of report.gifts) {
        console.log(`   ${g.rank}. ${g.emoji} ${g.name}（${g.price}，匹配度 ${g.match}%）`);
      }
      console.log('\n✅ 冒烟测试通过');
      return;
    } else {
      throw new Error('响应中没有待处理的问题或报告');
    }

    if (turns > 15) throw new Error('超过 15 轮仍未出报告，流程异常');
  }
}

main().catch((e) => {
  console.error(`\n❌ 冒烟测试失败: ${e.message}`);
  process.exit(1);
});
