/**
 * 联网搜索工具（服务端执行）。
 * 默认对接 Tavily（https://tavily.com，有免费额度）；
 * 未配置 key 时优雅降级，让 agent 基于自身知识继续。
 *
 * 网页正文按码点截断（truncate）：emoji 密集的正文被 slice 切开会留下
 * 孤立代理项，导致整档会话写不进 CloudBase。
 */

import { truncate } from '@gift-advisor/agent-core/wire/text';

export async function webSearch(query: string): Promise<string> {
  const key = process.env.TAVILY_API_KEY || '';
  const q = truncate(String(query || ''), 200);

  if (!key) return '（未配置搜索服务 TAVILY_API_KEY，无法联网。请基于你自己的知识继续，不要因此卡住。）';
  if (!q.trim()) return '（搜索词为空，已跳过。）';

  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        query: q,
        max_results: 5,
        search_depth: 'basic',
        include_answer: true,
      }),
    });
    if (!res.ok) return `（搜索失败 ${res.status}，请基于已有知识继续。）`;

    const data = (await res.json()) as {
      answer?: string;
      results?: { title?: string; content?: string; url?: string }[];
    };

    const lines: string[] = [];
    if (data.answer) lines.push(`摘要：${data.answer}`);
    for (const r of (data.results ?? []).slice(0, 5)) {
      lines.push(
        `【${r.title ?? '无标题'}】${truncate(String(r.content ?? ''), 300)}（来源: ${r.url ?? ''}）`,
      );
    }
    return lines.length ? lines.join('\n') : '（没有搜到结果，请基于已有知识继续。）';
  } catch (e) {
    return `（搜索出错：${e instanceof Error ? e.message : '未知错误'}，请基于已有知识继续。）`;
  }
}
