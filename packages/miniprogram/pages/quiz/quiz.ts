import { callAgent, countAsked } from '../../utils/api';
import type { QuestionOption, Report } from '../../utils/api';

const FINISH_EARLY_TEXT = '（用户不想再答更多问题了，请直接根据已有信息给出最终推荐）';

interface QuizData {
  loading: boolean;
  loadingText: string;
  narration: string;
  question: string;
  options: QuestionOption[];
  askedCount: number;
  progress: number;
  inputValue: string;
  report: Report | null;
  error: string;
  demo: boolean;
  messages: unknown[];
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
    messages: [],
  } as QuizData,

  lastAnswer: '' as string,

  onLoad() {
    this.start();
  },

  start() {
    this.lastAnswer = '';
    this.setData({
      loading: true,
      error: '',
      report: null,
      question: '',
      options: [],
      narration: '',
      messages: [],
      askedCount: 0,
      progress: 0,
      inputValue: '',
      loadingText: '参谋正在赶来…',
    });
    this.request([], undefined);
  },

  request(messages: unknown[], answer?: string) {
    this.lastAnswer = answer || '';
    const canFinish = this.data.askedCount >= 5;
    this.setData({
      loading: true,
      error: '',
      loadingText: canFinish ? '参谋正在挑选压箱底的宝贝…' : '参谋思考中…',
    });

    callAgent(messages, answer)
      .then((data) => {
        const askedCount = countAsked(data.messages);
        const base = {
          messages: data.messages,
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
        const msg = err instanceof Error ? err.message : '网络开小差了，请重试';
        this.setData({ loading: false, error: msg });
      });
  },

  retry() {
    this.request(this.data.messages, this.lastAnswer || undefined);
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
    this.request(this.data.messages, answer);
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
    wx.setClipboardData({ data: text });
  },
});
