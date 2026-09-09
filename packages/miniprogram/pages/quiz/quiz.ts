import { callAgent, clearSavedSession, savedSessionId, SESSION_KEY, type Report } from '../../utils/api';

const FINISH_EARLY_TEXT = '（用户不想再答更多问题了，请直接根据已有信息给出最终推荐）';

interface QuizData {
  loading: boolean;
  loadingText: string;
  narration: string;
  question: string;
  options: { label: string; emoji: string }[];
  askedCount: number;
  progress: number;
  inputValue: string;
  report: Report | null;
  error: string;
  demo: boolean;
}

Page({
  data: {
    loading: true,
    loadingText: '参谋正在赶来…',
    narration: '',
    question: '',
    options: [],
    askedCount: 0,
    progress: 0,
    inputValue: '',
    report: null,
    error: '',
    demo: false,
  } as QuizData,

  sessionId: '' as string,
  lastAnswer: '' as string,

  onLoad() {
    // 本地有保存的 sessionId 则恢复现场（当前问题或最终报告），否则开始新会话
    const saved = savedSessionId();
    if (saved) {
      this.sessionId = saved;
      this.lastAnswer = '';
      this.request({ action: 'resume', sessionId: saved }, '');
    } else {
      this.start();
    }
  },

  onUnload() {
    // 退出页面保留 sessionId（本地存储），下次进入可 resume 接续
  },

  start() {
    this.sessionId = '';
    this.lastAnswer = '';
    clearSavedSession();
    this.setData({
      loading: true,
      error: '',
      report: null,
      question: '',
      options: [],
      narration: '',
      askedCount: 0,
      progress: 0,
      inputValue: '',
      loadingText: '参谋正在赶来…',
    });
    this.request({ action: 'start' }, '');
  },

  /** 发起请求并把响应落到页面状态；resumeFail 为 true 时 resume 失败自动开新会话 */
  request(req: Parameters<typeof callAgent>[0], lastAnswer: string, resumeFail = false) {
    this.lastAnswer = lastAnswer;
    const canFinish = this.data.askedCount >= 5;
    this.setData({
      loading: true,
      error: '',
      loadingText: canFinish ? '参谋正在挑选压箱底的宝贝…' : '参谋思考中…',
    });

    callAgent(req)
      .then((data) => {
        if (data.sessionId) {
          this.sessionId = data.sessionId;
          wx.setStorageSync(SESSION_KEY, data.sessionId);
        }
        const askedCount = data.pending?.askedCount ?? data.askedCount ?? 0;
        const base = {
          demo: Boolean(data.demo),
          askedCount,
          progress: Math.min(100, (askedCount / 10) * 100),
          inputValue: '',
        };
        if (data.pending && data.pending.kind === 'question') {
          this.setData({
            ...base,
            loading: false,
            narration: data.pending.narration || '',
            question: data.pending.question || '',
            options: data.pending.options || [],
            report: null,
          });
        } else if (data.pending && data.pending.kind === 'report') {
          this.setData({
            ...base,
            loading: false,
            narration: data.pending.narration || '',
            question: '',
            options: [],
            report: data.pending.report as Report,
            progress: 100,
          });
        } else {
          throw new Error('参谋走神了，再试一次');
        }
      })
      .catch((err: unknown) => {
        // resume 的会话已失效：清掉本地记录，自动开始新会话
        if (resumeFail) {
          clearSavedSession();
          this.start();
          return;
        }
        const msg = err instanceof Error ? err.message : '网络开小差了，请重试';
        this.setData({ loading: false, error: msg });
      });
  },

  retry() {
    if (this.lastAnswer) {
      this.request({ action: 'answer', sessionId: this.sessionId, answer: this.lastAnswer }, this.lastAnswer);
    } else {
      this.start();
    }
  },

  pickOption(e: { currentTarget: { dataset: { value?: string } } }) {
    const value = e.currentTarget.dataset.value;
    if (value) this.submit(value);
  },

  onInput(e: { detail: { value: string } }) {
    this.setData({ inputValue: e.detail.value });
  },

  submitCustom() {
    const v = (this.data.inputValue || '').trim();
    if (v) this.submit(v);
  },

  submit(answer: string) {
    if (!this.sessionId) return;
    const a = answer.length > 200 ? answer.slice(0, 200) : answer;
    this.request({ action: 'answer', sessionId: this.sessionId, answer: a }, a);
  },

  finishEarly() {
    this.submit(FINISH_EARLY_TEXT);
  },

  goHome() {
    wx.navigateBack({
      fail: () => wx.reLaunch({ url: '/pages/index/index' }),
    });
  },

  copyReport() {
    const r = this.data.report;
    if (!r) return;
    const medals = ['🥇', '🥈', '🥉'];
    const text = [r.intro || '']
      .concat(
        (r.gifts || []).map(
          (g, i) =>
            `${medals[i] || '🎁'}${g.name}（${g.price || ''}｜匹配度${g.match ?? '--'}%）\n${g.reason || ''}${
              g.tip ? '\n💡 ' + g.tip : ''
            }`,
        ),
      )
      .filter(Boolean)
      .join('\n\n');
    wx.setClipboardData({ data: `${text}\n\n—— 由微信小程序「这次送什么礼物」生成` });
  },
});
