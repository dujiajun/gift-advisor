/**
 * wire 层共用的基础运行时判断与解析工具。
 * 输入一律视为不可信的 unknown，输出类型化结果。
 */

/** 是否为非空普通对象（排除 null / 数组） */
export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** 安全 JSON 解析：文本非法时返回 fallback */
export function safeJson<T>(text: unknown, fallback: T): T {
  if (typeof text !== 'string') return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}
