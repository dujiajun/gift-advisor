import type { Gift, QuestionOption, Report } from '../types';
import { isRecord } from './json';

/**
 * 规整 agent（LLM）给出的业务数据：选项与礼物报告。
 * 输入来自模型的 JSON 参数，形状不可信，这里负责兜底、截断、补默认值。
 */

/** 规整 agent 给出的选项：1~4 个，补齐 emoji，截断过长文本 */
export function normalizeOptions(raw: unknown): QuestionOption[] {
  const list = Array.isArray(raw) ? raw : [];
  const emojiPool = ['🎁', '✨', '🎀', '⭐'];
  const out: QuestionOption[] = [];
  for (const o of list.slice(0, 4)) {
    if (typeof o === 'string') {
      if (o.trim()) out.push({ label: o.trim().slice(0, 30), emoji: emojiPool[out.length % 4] });
    } else if (isRecord(o)) {
      if (typeof o.label === 'string' && o.label.trim()) {
        out.push({
          label: o.label.trim().slice(0, 30),
          emoji: typeof o.emoji === 'string' && o.emoji ? o.emoji.slice(0, 4) : emojiPool[out.length % 4],
        });
      }
    }
  }
  return out;
}

function str(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.trim() ? v.trim() : fallback;
}

/** deliver_report 已通过 zod 校验的参数形状（宽松结构，兼容 mock 数据） */
export type ReportInput = { intro?: unknown; gifts?: unknown };

/** 规整 agent 给出的报告：最多 3 个礼物，字段兜底 */
export function normalizeReport(args: ReportInput): Report {
  const rawGifts = Array.isArray(args.gifts) ? args.gifts : [];
  const gifts: Gift[] = rawGifts.slice(0, 3).map((g, i) => {
    const obj = isRecord(g) ? g : {};
    const matchNum = Number(obj.match);
    return {
      rank: i + 1,
      name: str(obj.name, `神秘礼物 ${i + 1}`),
      emoji: str(obj.emoji, '🎁').slice(0, 4),
      price: str(obj.price, '价格未知').slice(0, 20),
      reason: str(obj.reason, ''),
      tip: str(obj.tip, ''),
      match: Number.isFinite(matchNum) ? Math.max(1, Math.min(100, Math.round(matchNum))) : 80,
      tags: Array.isArray(obj.tags) ? obj.tags.map((t) => String(t)).slice(0, 4) : [],
    };
  });
  return { intro: str(args.intro, ''), gifts };
}
