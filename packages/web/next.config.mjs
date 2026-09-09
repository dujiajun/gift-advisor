import { createRequire } from 'node:module';

// 预载仓库根目录的 .env.local / .env（见根 scripts/load-env.cjs）。
// next.config 在主进程最早加载，注入 process.env 后 dev/start 的所有子进程自动继承；
// 不占用 node 启动参数，避开 Next 把 execArgv 转发进 NODE_OPTIONS 的限制。
createRequire(import.meta.url)('../../scripts/load-env.cjs');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // agent-core 以 TS 源码形式作为 workspace 包被引用，需要 Next 一并转译
  transpilePackages: ['@gift-advisor/agent-core'],
};

export default nextConfig;
