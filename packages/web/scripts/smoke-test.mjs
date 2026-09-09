#!/usr/bin/env node
/**
 * 冒烟测试：用内置"演示模式"完整跑通 Agent 流程（无需任何 API key）。
 * 协议：start 发放 sessionId → answer 凭 sessionId 回答 → report 收尾；
 * 额外验证 resume（恢复现场）、会话结束后重复 answer、非法会话的边界行为。
 *
 * 用法：
 *   1. 启动服务：pnpm dev  （或 pnpm build && pnpm start）
 *   2. 运行：    node scripts/smoke-test.mjs [baseUrl]
 */
const BASE = process.argv[2] || process.env.BASE_URL || 'http://localhost:3000';

async function call(body) {
  const res = await fetch(`${BASE}/api/agent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function mustOk(body) {
  const { status, data } = await call(body);
  if (status !== 200 || !data.ok) throw new Error(data.error || `HTTP ${status}`);
  return data;
}

function assert(cond, msg) {
  if (!cond) throw new Error(`断言失败: ${msg}`);
  console.log(`✓ ${msg}`);
}

async function main() {
  console.log(`▶ 冒烟测试目标: ${BASE}/api/agent\n`);

  // ── start：新会话 ──
  const first = await mustOk({ action: 'start' });
  const sessionId = first.sessionId;
  assert(sessionId, `start 发放 sessionId（${sessionId.slice(0, 8)}…）`);
  assert(first.pending?.kind === 'question', 'start 挂起第一问');
  assert(!('messages' in first), '响应不含 LLM 消息原文（messages 不下发）');

  // ── resume：恢复现场，应拿回同一道题 ──
  const resumed = await mustOk({ action: 'resume', sessionId });
  assert(
    resumed.pending?.kind === 'question' && resumed.pending.question === first.pending.question,
    'resume 恢复同一道题',
  );

  // ── 逐轮回答直到报告 ──
  let current = first;
  let turns = 1;
  for (;;) {
    if (current.pending?.kind === 'report') break;
    const { pending } = current;
    console.log(`Q${pending.askedCount}: ${pending.question}`);
    for (const opt of pending.options) console.log(`   ${opt.emoji} ${opt.label}`);
    const answer = pending.options[0]?.label ?? '都行';
    console.log(`→ 自动回答: ${answer}\n`);
    current = await mustOk({ action: 'answer', sessionId, answer });
    turns++;
    if (turns > 15) throw new Error('超过 15 轮仍未出报告，流程异常');
  }

  const { report } = current.pending;
  console.log(
    `✅ 报告生成（${turns} 轮请求，${current.pending.askedCount} 个问题，演示模式=${Boolean(current.demo)}）`,
  );
  console.log(`   导语: ${report.intro}`);
  for (const g of report.gifts) {
    console.log(`   ${g.rank}. ${g.emoji} ${g.name}（${g.price}，匹配度 ${g.match}%）`);
  }
  assert(report.gifts.length === 3, '报告恰好 3 个礼物');

  // ── 边界：报告后再 answer 应被拒绝 ──
  const afterEnd = await call({ action: 'answer', sessionId, answer: '再来一份' });
  assert(!afterEnd.data.ok && /结束/.test(afterEnd.data.error || ''), '流程结束后 answer 被拒绝');
  // ── 边界：报告后 resume 仍可回看 ──
  const replay = await mustOk({ action: 'resume', sessionId });
  assert(
    replay.pending?.kind === 'report' && replay.pending.report.gifts.length === 3,
    '结束后 resume 可回看报告',
  );
  // ── 边界：非法会话 ──
  const ghost = await call({ action: 'answer', sessionId: 's-not-exist', answer: '测试' });
  assert(!ghost.data.ok, '不存在的会话被拒绝');
  // ── 边界：非法请求体 ──
  const bad = await call({ action: 'wat' });
  assert(!bad.data.ok, '非法 action 被拒绝');

  console.log('\n✅ 冒烟测试通过');
}

main().catch((e) => {
  console.error(`\n❌ 冒烟测试失败: ${e.message}`);
  process.exit(1);
});
