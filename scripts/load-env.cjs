/**
 * 预载仓库根目录的环境变量文件（.env.local，其次 .env）到 process.env。
 * 供 `node -r` 预加载：Next 的 dev/start、云函数本地试跑共用，
 * 避开 next 把 execArgv 转发进 NODE_OPTIONS 时对 --env-file* 的限制。
 * 文件不存在时静默跳过（保持演示模式零配置可用），已有变量不覆盖。
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

for (const file of ['.env.local', '.env']) {
  const file_path = path.join(root, file);
  if (!fs.existsSync(file_path)) continue;
  const lines = fs.readFileSync(file_path, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let value = m[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}
