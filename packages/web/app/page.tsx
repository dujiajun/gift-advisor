'use client';

import { useEffect, useRef, useState } from 'react';
import {
  truncate,
  type AgentResponse,
  type Gift,
  type PendingQuestion,
  type Report,
} from '@gift-advisor/agent-core';

const MAX_Q = 10;
const MEDALS = ['🥇 首推', '🥈 备选', '🥉 备选'];
const CONFETTI_EMOJIS = ['🎉', '✨', '🎊', '💛', '⭐', '💖'];
const CONFETTI = Array.from({ length: 16 }, (_, i: number) => ({
  emoji: CONFETTI_EMOJIS[i % CONFETTI_EMOJIS.length],
  left: ((i * 61) % 94) + 3,
  delay: (i % 8) * 0.7,
  duration: 5 + (i % 5),
  size: 14 + ((i * 7) % 14),
}));
const STORAGE_KEY = 'gift-advisor:session-id';

type ClientRequest = { action: 'start' } | { action: 'answer'; sessionId: string; answer: string };

export default function Page() {
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [pending, setPending] = useState<PendingQuestion | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [narration, setNarration] = useState('');
  const [custom, setCustom] = useState('');
  const [error, setError] = useState('');
  const [demo, setDemo] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const lastReqRef = useRef<ClientRequest | null>(null);
  /** 请求代次：重新开始时自增，让在途响应回来时自动作废（避免旧轮次覆盖新状态） */
  const reqSeqRef = useRef(0);

  async function post(body: ClientRequest | { action: 'resume'; sessionId: string }): Promise<void> {
    const seq = ++reqSeqRef.current;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as AgentResponse;
      if (seq !== reqSeqRef.current) return;
      if (!res.ok || !data.ok) throw new Error(data.error || `请求失败（${res.status}）`);
      applyResponse(data);
    } catch (e) {
      if (seq !== reqSeqRef.current) return;
      setError(e instanceof Error ? e.message : '网络开小差了，请重试');
    } finally {
      if (seq === reqSeqRef.current) setLoading(false);
    }
  }

  function applyResponse(data: AgentResponse): void {
    setStarted(true);
    setDemo(Boolean(data.demo));
    if (data.sessionId) {
      setSessionId(data.sessionId);
      window.localStorage.setItem(STORAGE_KEY, data.sessionId);
    }
    setNarration(data.pending?.narration ?? '');
    if (data.pending?.kind === 'report') {
      setReport(data.pending.report);
      setPending(null);
    } else if (data.pending?.kind === 'question') {
      setPending(data.pending);
      setReport(null);
      setCustom('');
    } else {
      throw new Error('参谋走神了，再试一次');
    }
  }

  // 进入页面：本地有保存的 sessionId 则恢复现场（当前问题或最终报告）
  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    post({ action: 'resume', sessionId: saved }).catch(() => window.localStorage.removeItem(STORAGE_KEY));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 「确认重新开始」的待确认状态 3 秒后自动撤销
  useEffect(() => {
    if (!confirmRestart) return;
    const timer = setTimeout(() => setConfirmRestart(false), 3000);
    return () => clearTimeout(timer);
  }, [confirmRestart]);

  function start(): void {
    window.localStorage.removeItem(STORAGE_KEY);
    lastReqRef.current = { action: 'start' };
    setStarted(true);
    setSessionId('');
    setPending(null);
    setReport(null);
    setNarration('');
    setError('');
    post({ action: 'start' });
  }

  function goHome(): void {
    if (loading) return;
    setStarted(false);
    setPending(null);
    setReport(null);
    setError('');
  }

  /** 重新开始：顶栏常驻（不必等到报告页）。先点一下变「确认？」防误触，3 秒后自动复原 */
  function onRestartClick(): void {
    if (!confirmRestart) {
      setConfirmRestart(true);
      return;
    }
    setConfirmRestart(false);
    start();
  }

  function answer(text: string): void {
    const t = text.trim();
    if (!t || loading || !sessionId) return;
    lastReqRef.current = { action: 'answer', sessionId, answer: truncate(t, 200) };
    post(lastReqRef.current);
  }

  function retry(): void {
    if (lastReqRef.current) post(lastReqRef.current);
  }

  async function copyReport(): Promise<void> {
    if (!report) return;
    const text = [
      report.intro,
      ...report.gifts.map(
        (g: Gift, i: number) =>
          `${MEDALS[i] ?? ''}${g.name}（${g.price}｜匹配度${g.match}%）\n${g.reason}${g.tip ? `\n💡 ${g.tip}` : ''}`,
      ),
    ]
      .filter(Boolean)
      .join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 剪贴板不可用时静默失败
    }
  }

  if (!started) {
    return (
      <main className="app">
        <div className="deco cloud-1" aria-hidden>
          ☁️
        </div>
        <div className="deco cloud-2" aria-hidden>
          ☁️
        </div>
        <div className="deco star-1" aria-hidden>
          ⭐
        </div>
        <div className="deco star-2" aria-hidden>
          ✨
        </div>

        <section className="hero">
          <div className="hero-gift">🎁</div>
          <h1 className="logo">
            {'这次送什么礼物'.split('').map((ch: string, i: number) => (
              <span key={i} className={`logo-chip c${i % 5}`} style={{ animationDelay: `${i * 0.09}s` }}>
                {ch}
              </span>
            ))}
          </h1>
          <p className="tagline">🎮 送礼大冒险 · AI 参谋陪你选出好礼</p>
        </section>

        <button className="btn-start" onClick={start}>
          🎮 我要送礼
        </button>
        <p className="note">回答 5~10 个问题，参谋献上 3 份好礼</p>
        <p className="footer">AI 生成结果仅供参考 · 最珍贵的是心意 💖</p>
      </main>
    );
  }

  const askedCount = pending?.askedCount ?? (report ? MAX_Q : 0);
  const progress = report ? 100 : Math.min(100, (askedCount / MAX_Q) * 100);

  return (
    <main className="app">
      <header className="topbar">
        <button className="btn-back" onClick={goHome} aria-label="返回首页">
          🏠
        </button>
        <div className="progress-wrap">
          <div className="progress-label">
            <span>{report ? '🏆 任务完成！' : `任务进度 第 ${askedCount} / ${MAX_Q} 问`}</span>
            {demo && <span className="demo-badge">演示模式</span>}
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <button
          className={`btn-restart${confirmRestart ? ' confirming' : ''}`}
          onClick={onRestartClick}
          title={confirmRestart ? '再点一下确认重新开始' : '重新开始（当前进度会清空）'}
          aria-label={confirmRestart ? '确认重新开始' : '重新开始'}
        >
          {confirmRestart ? '确认？' : '🔁'}
        </button>
      </header>

      <div className="npc">
        <div className="npc-avatar">🧙</div>
        <div className={`npc-bubble${loading ? ' thinking' : ''}`}>
          {loading ? '参谋翻阅礼物图鉴中' : narration || '参谋已就位！'}
          {loading && <span className="dots" />}
        </div>
      </div>

      {error && (
        <div className="error-box">
          <span>⚠️ {error}</span>
          <button className="retry-btn" onClick={retry}>
            重试
          </button>
        </div>
      )}

      {!report && !loading && pending && (
        <>
          <section className="quest-card" key={`${sessionId}-${pending.askedCount}`}>
            <span className="quest-tag">第 {pending.askedCount} 问</span>
            <p className="quest-text">{pending.question}</p>
          </section>

          <div className={`options${pending.options.length <= 2 ? ' single' : ''}`}>
            {pending.options.map((opt, i) => (
              <button
                key={`${opt.label}-${i}`}
                disabled={loading}
                className={`option-btn opt-${i % 4}`}
                onClick={() => answer(opt.label)}
              >
                <span className="opt-emoji">{opt.emoji}</span> {opt.label}
              </button>
            ))}
          </div>

          <div className="custom-box">
            <input
              className="custom-input"
              value={custom}
              placeholder="都不满意？自己说说看…"
              maxLength={100}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') answer(custom);
              }}
            />
            <button className="send-btn" disabled={!custom.trim() || loading} onClick={() => answer(custom)}>
              送出
            </button>
          </div>

          {askedCount >= 5 && (
            <button
              className="finish-early"
              disabled={loading}
              onClick={() => answer('（用户不想再答更多问题了，请直接根据已有信息给出最终推荐）')}
            >
              🎉 差不多了，直接看结果
            </button>
          )}
        </>
      )}

      {loading && (
        <div className="loading-card">
          <div className="loading-gift">🎁</div>
          <div className="loading-text">
            参谋思考中
            <span className="dots" />
          </div>
        </div>
      )}

      {report && (
        <>
          <div className="confetti" aria-hidden>
            {CONFETTI.map((p, i) => (
              <span
                key={i}
                style={{
                  left: `${p.left}%`,
                  animationDelay: `${p.delay}s`,
                  animationDuration: `${p.duration}s`,
                  fontSize: p.size,
                }}
              >
                {p.emoji}
              </span>
            ))}
          </div>

          <h2 className="report-title">🏆 参谋的礼物图鉴</h2>
          {report.intro && <p className="report-intro">{report.intro}</p>}

          {report.gifts.map((g: Gift, i: number) => (
            <section className="gift-card" key={g.name} style={{ animationDelay: `${i * 0.12}s` }}>
              <div className="gift-rank">{MEDALS[i] ?? '🎁 备选'}</div>
              <div className="gift-head">
                <span className="gift-emoji">{g.emoji}</span>
                <div>
                  <div className="gift-name">{g.name}</div>
                  <span className="gift-price">💰 {g.price}</span>
                </div>
              </div>
              <div className="match-row">
                <span className="match-label">匹配度</span>
                <div className="match-track">
                  <div className="match-fill" style={{ width: `${g.match}%` }} />
                </div>
                <span className="match-num">{g.match}%</span>
              </div>
              {g.reason && <p className="gift-reason">{g.reason}</p>}
              {g.tip && <p className="gift-tip">💡 {g.tip}</p>}
              {g.tags.length > 0 && (
                <div className="gift-tags">
                  {g.tags.map((t, j) => (
                    <span key={j} className="tag">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </section>
          ))}

          <div className="report-actions">
            <button className="btn-again" onClick={start}>
              🔁 再问一次
            </button>
            <button className="btn-copy" onClick={copyReport}>
              {copied ? '✅ 已复制' : '📋 复制报告'}
            </button>
          </div>
        </>
      )}

      <p className="footer">AI 生成结果仅供参考 · 送出心意最珍贵 💖</p>
    </main>
  );
}
