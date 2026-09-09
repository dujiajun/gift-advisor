// Agent 后端通道：
// - 'http'      直连自建服务（默认，本地开发用；真机/上线需在小程序后台配置 request 合法域名）
// - 'cloudbase' 腾讯云 CloudBase 云函数（免域名白名单、免备案，接入步骤见 docs/cloudbase.md）
export type AgentBackend = 'http' | 'cloudbase';
export const AGENT_BACKEND: AgentBackend = 'cloudbase';

// ===== AGENT_BACKEND = 'cloudbase' 时生效 =====
// CloudBase 环境 ID（形如 gift-advisor-3g1a2b，控制台环境概览页可查）
export const CLOUD_ENV_ID = 'cloudbase-d2gj1s3wycd98354c';
// 部署的云函数名（cloudfunctions/gift-agent）
export const CLOUD_FUNCTION_NAME = 'gift-agent';

// ===== AGENT_BACKEND = 'http' 时生效 =====
// - 本地开发：微信开发者工具里保持「不校验合法域名」即可访问 localhost
// - 真机/上线：改成你的 https 域名，并在小程序后台配置 request 合法域名
export const BASE_URL = 'http://localhost:3000';
