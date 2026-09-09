/**
 * 云函数本地试跑：读取根目录 .env.local（--env-file-if-exists 预载），
 * 直接调用构建产物 packages/gift-agent/index.js，验证一轮「新会话 → 提问」。
 * 未配置 LLM_API_KEY 时自动走演示模式；配置后即为真 LLM 冒烟（消耗少量 token）。
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { main } = require('../packages/gift-agent/index.js');

const r = await main({ messages: [], answer: undefined });
if (!r.ok) {
  console.error('❌ 失败:', r.error);
  process.exit(1);
}
console.log(`✓ ok=${r.ok} demo=${r.demo} pending=${r.pending.kind}`);
console.log(`  问题: ${r.pending.question ?? '(报告已生成)'}`);
console.log(`  历史: ${r.messages.length} 条消息`);
