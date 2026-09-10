/**
 * 文本边界的回归测试：任何进入会话存储的字符串都不允许含「孤立代理项」（半个 emoji）。
 *
 * 背景：CloudBase 文档数据库会整档拒绝含孤立代理项的文档，服务端只回
 * `INVALID_PARAM「Check request parameter fail」`，一条脏字符串就让整轮会话写不进去。
 * 典型来源是按长度截断带 emoji 的文本（LLM 旁白/选项、联网搜到的网页正文、用户输入）。
 *
 * 判据用「UTF-8 往返是否失真」来判定脏字符串：孤立代理项编码成 UTF-8 会变成
 * U+FFFD（和 TCB 服务端落库时看到的一样），比复刻一份 stripLoneSurrogates 更独立。
 *
 * 直接跑 Node 24 的原生 TS（type stripping），无需构建：
 *   node packages/agent-core/scripts/test-text.mjs
 */

import { sanitizeDeep, stripLoneSurrogates, truncate } from '@gift-advisor/agent-core/wire/text';
import { normalizeOptions, normalizeReport } from '@gift-advisor/agent-core/wire/normalize';
import { parseAgentRequest, sanitizeMessages } from '@gift-advisor/agent-core/wire/messages';
import { isSessionId, newSessionId } from '@gift-advisor/agent-core/storage';

function assert(cond, msg) {
  if (!cond) {
    console.error('❌ FAIL:', msg);
    process.exit(1);
  }
  console.log('✓', msg);
}

/** UTF-8 往返是否无失真（孤立代理项会在往返中变成 U+FFFD） */
function clean(text) {
  return Buffer.from(text, 'utf8').toString('utf8') === text;
}

const EMOJI = '🎁';
const LONE_HIGH = 'x\uD83C';

// ---------- truncate：按码点切，绝不切开 emoji ----------
{
  let allClean = true;
  let lengthHeld = true;
  for (let n = 0; n <= 12; n++) {
    const out = truncate(EMOJI.repeat(6), n); // 6 个 emoji = 12 个 UTF-16 单元
    if (!clean(out)) allClean = false;
    if ((n <= 6 ? out.length !== n * 2 : out.length !== 12) || out.length > 12) lengthHeld = false;
  }
  assert(allClean && lengthHeld, 'truncate 对 emoji 串任意长度截断都不产生孤立代理项');

  const mixed = truncate(`${EMOJI.repeat(3)}中文测试`, 5);
  assert(clean(mixed) && [...mixed].length === 5, `truncate 按码点计长（${JSON.stringify(mixed)}）`);

  assert(truncate('abc', 0) === '' && truncate('abc', -1) === '', 'truncate 的 0/负数上限返回空串');
  assert(truncate('短', 10) === '短', 'truncate 未超长时原样返回');
}

// ---------- stripLoneSurrogates / sanitizeDeep ----------
{
  assert(!clean(LONE_HIGH) && clean(stripLoneSurrogates(LONE_HIGH)), 'stripLoneSurrogates 剔除落单代理项');
  assert(
    stripLoneSurrogates(`${EMOJI}\uD83C${EMOJI}`) === `${EMOJI}${EMOJI}`,
    'stripLoneSurrogates 只剔半个、不伤正常 emoji',
  );

  const dirty = { a: LONE_HIGH, b: [EMOJI, `尾${'\uD83C'}`], c: 3, d: true, e: null, f: { g: LONE_HIGH } };
  const out = sanitizeDeep(dirty);
  const flat = JSON.stringify(out);
  assert(clean(flat), 'sanitizeDeep 递归清洗嵌套对象/数组里的孤立代理项');
  assert(
    out.a === 'x' && out.b[0] === EMOJI && out.b[1] === '尾' && out.c === 3 && out.d === true &&
      out.e === null && out.f.g === 'x',
    'sanitizeDeep 保留其它类型与结构',
  );
}

// ---------- LLM 输出规整：超长 emoji 文本截断后仍干净 ----------
{
  const options = normalizeOptions([
    { label: EMOJI.repeat(40), emoji: `${EMOJI}${LONE_HIGH}` },
    EMOJI.repeat(30),
  ]);
  assert(
    options.length === 2 && [...options[0].label].length === 30 && clean(JSON.stringify(options)),
    'normalizeOptions 截断超长 emoji 选项后无非法字符',
  );

  const report = normalizeReport({
    intro: EMOJI.repeat(50),
    gifts: [
      {
        name: EMOJI.repeat(60),
        emoji: `${EMOJI}${LONE_HIGH}`,
        price: EMOJI.repeat(30),
        reason: LONE_HIGH,
        tip: '',
        tags: ['a'],
      },
    ],
  });
  assert(
    [...report.gifts[0].price].length === 20 && clean(JSON.stringify(report)),
    'normalizeReport 截断价格/emoji 字段后无非法字符',
  );
}

// ---------- 用户输入：截断到 200 码点仍干净 ----------
{
  const req = parseAgentRequest({
    action: 'answer',
    sessionId: newSessionId(),
    answer: `${EMOJI.repeat(300)}${LONE_HIGH}`,
  });
  assert(req?.action === 'answer' && clean(req.answer), '答案截断到 200 码点后无非法字符');
  assert([...req.answer].length === 200, '答案截断到 200 码点（不是 200 个 UTF-16 单元）');

  const req2 = parseAgentRequest({
    action: 'answer',
    sessionId: newSessionId(),
    answer: `  ${EMOJI}送给妈妈  `,
  });
  assert(req2?.answer === `${EMOJI}送给妈妈`, '答案去空白但保留 emoji');
}

// ---------- 消息历史清洗保留 emoji ----------
{
  const messages = sanitizeMessages([
    { role: 'user', content: `${EMOJI}${LONE_HIGH}` },
    {
      role: 'assistant',
      content: '旁白💛',
      tool_calls: [{ id: 'c1', function: { name: 'f', arguments: '{"q":"🎀"}' } }],
    },
    { role: 'tool', tool_call_id: 'c1', content: '【标题】正文🎊（来源: https://x）' },
  ]);
  assert(
    messages.length === 3 && clean(JSON.stringify(messages)),
    'sanitizeMessages 全量保留 emoji 且无非法字符',
  );
}

// ---------- sessionId 形状校验 ----------
{
  const id = newSessionId();
  assert(isSessionId(id), `isSessionId 接受本服务发放的 id（${id}）`);
  const bad = [
    '',
    's-',
    's-short',
    'abc-12345678',
    's-带中文的id',
    `s-${'a'.repeat(70)}`,
    `s-${'a'.repeat(8)} `,
    null,
    42,
  ];
  assert(bad.every((v) => !isSessionId(v)), 'isSessionId 拒绝空串/前缀不符/过短/过长/非法字符/非字符串');
  assert(
    isSessionId(`s-${'A'.repeat(8)}`) && isSessionId(`s-${'a'.repeat(64)}`),
    'isSessionId 接受边界长度 8 与 64',
  );
}

// ---------- 兜底：docId 类脏值不会误判为合法 ----------
{
  const req = parseAgentRequest({ action: 'resume', sessionId: '  ' });
  assert(req === null, '空白 sessionId 在协议层就被拒（不会走到存储）');
}

console.log('\n✅ 文本边界回归测试通过');
