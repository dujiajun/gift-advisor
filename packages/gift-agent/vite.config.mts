import { defineConfig } from 'vite';

/**
 * 云函数构建：library mode 把入口 + @gift-advisor/agent-core（含 AI SDK / zod）
 * 打成单文件 CJS，产物 index.js 落在函数根目录、零运行时依赖，可直接上传。
 */
export default defineConfig({
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
      // 打包全部依赖（agent-core / ai / zod）：云函数运行时不装 node_modules
      external: [],
    },
  },
});
