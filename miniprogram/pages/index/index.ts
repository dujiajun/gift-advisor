Page({
  data: {
    chars: ['这', '次', '送', '什', '么', '礼', '物'],
  },

  start() {
    wx.navigateTo({ url: '/pages/quiz/quiz' });
  },
});
