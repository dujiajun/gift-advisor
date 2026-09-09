import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * 云函数构建：library mode 把入口 + @gift-advisor/agent-core（含 AI SDK / zod）+
 * CloudBase node-sdk 打成单文件 CJS，产物 index.js 落在函数根目录、可直接上传。
 */
const nodeBuiltins = new Set([
  'assert',
  'async_hooks',
  'buffer',
  'child_process',
  'cluster',
  'constants',
  'crypto',
  'diagnostics_channel',
  'dgram',
  'dns',
  'events',
  'fs',
  'http',
  'http2',
  'https',
  'inspector',
  'module',
  'net',
  'os',
  'path',
  'perf_hooks',
  'process',
  'punycode',
  'querystring',
  'readline',
  'repl',
  'stream',
  'string_decoder',
  'timers',
  'tls',
  'trace_events',
  'tty',
  'url',
  'util',
  'v8',
  'vm',
  'wasi',
  'worker_hooks',
  'worker_threads',
  'zlib',
]);

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(here, 'src'),
    },
  },
  build: {
    lib: {
      entry: 'src/index.ts',
      formats: ['cjs'],
      fileName: () => 'index.js',
    },
    outDir: '.',
    emptyOutDir: false, // 产物直接落在函数根目录，严禁清空（src/ 就在这里）
    target: 'node24',
    minify: true,
    rollupOptions: {
      // 内置模块保持 require（node: 前缀 + 依赖里的裸名如 jwa 的 'crypto'），
      // 其余依赖（agent-core / ai / zod / @cloudbase/node-sdk）全部打包：
      // 云函数运行时不装 node_modules；codeSplitting:false 保证动态 import
      // （storage-cloudbase / sqlite 分支）内联进单文件
      external: (id: string) => id.startsWith('node:') || nodeBuiltins.has(id),
      output: { codeSplitting: false },
    },
  },
});
