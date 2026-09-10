import { isRecord } from '@gift-advisor/agent-core/wire/json';

/**
 * 文本边界处理：LLM 输出、联网搜到的网页正文、用户输入都常带 emoji，
 * 任何「按长度截断」都必须按码点切，否则会把代理对从中间切开，
 * 留下一个孤立代理项（半个 emoji）。
 *
 * 为什么必须避免：CloudBase 文档数据库会整档拒绝含孤立代理项的文档
 * （服务端 INVALID_PARAM「Check request parameter fail」），
 * 一条脏字符串就会让整轮会话写不进去。见 session-store-cloudbase 的 save()。
 */

/** 按码点截断（不会切开 emoji，与 slice 行为一致、不加省略号） */
export function truncate(input: string, max: number): string {
  if (max <= 0) return '';
  if (input.length <= max) return input;
  const points = Array.from(input);
  return points.length <= max ? input : points.slice(0, max).join('');
}

/** 剔除孤立代理项：成对的（正常 emoji）保留，落单的那一半丢掉 */
export function stripLoneSurrogates(input: string): string {
  let out = '';
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = input.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += input[i] + input[i + 1];
        i++;
      }
      continue; // 落单的高位代理项：丢弃
    }
    if (code >= 0xdc00 && code <= 0xdfff) continue; // 落单的低位代理项：丢弃
    out += input[i];
  }
  return out;
}

/**
 * 递归清洗：对象/数组里所有字符串的孤立代理项一律剔除，其它类型原样保留。
 * 存储边界的兜底（截断点已按码点切，这里是防将来别处再引入脏字符串）。
 */
export function sanitizeDeep<T>(value: T): T {
  if (typeof value === 'string') return stripLoneSurrogates(value) as unknown as T;
  if (Array.isArray(value)) return value.map((item) => sanitizeDeep(item)) as unknown as T;
  if (isRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) out[key] = sanitizeDeep(item);
    return out as unknown as T;
  }
  return value;
}
