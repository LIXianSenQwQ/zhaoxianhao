/**
 * scripts/uni-run.js
 * 跨平台 uni CLI 启动器。
 *
 * 背景：本工程为 HBuilderX 平铺布局（pages/、App.vue、manifest.json 位于仓库根），
 * 而 @dcloudio/vite-plugin-uni 的 CLI 默认要求 src/ 布局（缺 src/manifest.json 即 ENOENT）。
 * 插件源码（dist/cli/utils.js initEnv）显式支持环境变量 UNI_INPUT_DIR 覆盖输入目录，
 * 故此处注入 UNI_INPUT_DIR = 仓库根，实现「CLI 命令行 + HBuilderX」双工作流兼容。
 *
 * 用法（npm scripts 已封装）：
 *   npm run dev:h5            → node scripts/uni-run.js dev:h5
 *   npm run build:h5          → node scripts/uni-run.js build:h5
 *   npm run dev:mp-wechat     → node scripts/uni-run.js dev:mp-wechat
 *   npm run build:mp-wechat   → node scripts/uni-run.js build:mp-wechat
 */
const { spawn } = require('child_process');
const path = require('path');

const presets = {
  // uni CLI：不带子命令 = dev（H5）；build = 生产构建；-p 指定平台
  'dev:h5': [],
  'build:h5': ['build'],
  'dev:mp-wechat': ['-p', 'mp-wechat'],
  'build:mp-wechat': ['build', '-p', 'mp-wechat']
};

const mode = process.argv[2];
const cliArgs = presets[mode];
if (!cliArgs) {
  console.error(`未知模式：${mode}（可选：${Object.keys(presets).join(' | ')}）`);
  process.exit(1);
}

const ROOT = path.resolve(__dirname, '..');
// 平铺布局：输入目录 = 仓库根（uni 插件据此查找 manifest.json / pages.json）
process.env.UNI_INPUT_DIR = ROOT;

const uniBin = require.resolve('@dcloudio/vite-plugin-uni/bin/uni.js');
const child = spawn(process.execPath, [uniBin, ...cliArgs], {
  stdio: 'inherit', // 透传日志与交互；沙箱内 inherit 可用
  env: process.env,
  cwd: ROOT
});

child.on('exit', (code) => process.exit(code === null || code === undefined ? 0 : code));
child.on('error', (e) => {
  console.error('uni CLI 启动失败：', e && e.message);
  process.exit(1);
});
