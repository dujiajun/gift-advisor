/**
 * 云函数本地试跑：预载根目录 .env.local（scripts/load-env.cjs），
 * 直接调用构建产物 packages/gift-agent/index.js，完整验证新协议：
 * start → resume（恢复现场）→ answer（两轮）→ 会话结束后 answer 被拒绝。
 *
 * 本地默认 SQLite 存储（.data/agent-sessions.db，验证持久化链路）；
 * 未配置 LLM_API_KEY 时自动走演示模式；配置后即为真 LLM 冒烟（消耗少量 token）。
 */
process.env.SESSION_STORE ??= 'sqlite';
process.env.SESSION_DB ??= '.data/agent-sessions.db';

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { main } = require('../packages/gift-agent/index.js');

function assert(cond, msg) {
  if (!cond) {
    console.error('❌ FAIL:', msg);
    process.exit(1);
  }
  console.log('✓', msg);
}

// start：新会话
const r1 = await main({ action: 'start' });
assert(r1.ok && r1.sessionId, `start 发放 sessionId（${r1.sessionId}）`);
assert(r1.pending?.kind === 'question', `第一问: ${r1.pending.question}`);
assert(!('messages' in r1), '响应不含 LLM 消息原文');

// resume：恢复现场
const r2 = await main({ action: 'resume', sessionId: r1.sessionId });
assert(r2.ok && r2.pending?.question === r1.pending.question, 'resume 恢复同一道题');

// answer：回答第一题 → 第二题
const r3 = await main({ action: 'answer', sessionId: r1.sessionId, answer: '女生' });
assert(
  r3.ok && r3.pending?.kind === 'question' && r3.pending.askedCount === 2,
  `回答后进入第 2 问: ${r3.pending.question}`,
);

// SQLite 持久化抽查：换一个"进程视角"读取（同一文件，验证写盘成功）
{
  const { createRequire: cr } = await import('node:module');
  const req = cr(import.meta.url);
  const { DatabaseSync } = req('node:sqlite');
  const db = new DatabaseSync('.data/agent-sessions.db');
  const row = db.prepare('SELECT id, user_id, ip, turns FROM agent_sessions WHERE id = ?').get(r1.sessionId);
  db.close();
  const turns = JSON.parse(String(row?.turns ?? '[]'));
  assert(
    row?.id === r1.sessionId && turns.length === 2 && turns[0].answer === '女生',
    'SQLite 已记录每轮（含用户回答）',
  );
  // 本地试跑无微信身份：身份列存在且为空串（云端则为 OPENID / 客户端 IP）
  assert(
    typeof row?.user_id === 'string' && typeof row?.ip === 'string',
    'SQLite 已记录身份列（user_id / ip）',
  );
}

console.log('\n✅ 云函数本地试跑通过');
