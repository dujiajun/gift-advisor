import { AGENT_BACKEND, CLOUD_ENV_ID } from './config';

App({
  onLaunch() {
    if (AGENT_BACKEND === 'cloudbase') {
      // 接入腾讯云 CloudBase：云函数调用免登录、免域名白名单，详见 docs/cloudbase.md
      wx.cloud.init({ env: CLOUD_ENV_ID, traceUser: true });
    }
  },
});
