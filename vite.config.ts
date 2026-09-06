/**
 * vite.config.ts
 * 「好诚事家风」uni-app 构建配置。
 *
 * ⚠️ 请勿重命名/删除本文件（历史上两次被误改为 .bak/.disabled 导致构建回归）：
 * uni CLI 不会自动注入插件，本文件的 plugins: [uni()] 是 CLI 构建的唯一插件入口；
 * 同时 package.json 必须声明 @dcloudio/uni-h5（H5 平台插件注册包，apply: h5）。
 *
 * H5 本地开发服务器：npm run dev:h5 → http://localhost:5173
 */
import { defineConfig } from 'vite';
import uni from '@dcloudio/vite-plugin-uni';
import fs from 'node:fs';
import path from 'node:path';

/**
 * ⚠️ 过渡性版本对齐（详见 docs/ENVIRONMENT.md FAQ-4 / FAQ-5）：
 *
 * 背景：node_modules 中 hoisted 的 @vue/shared 是 3.4.21（@dcloudio 编译链
 * 所依赖），而 hoisted 的 vue/@vue/runtime-core 是 3.5.42，后者 import
 * '@vue/shared' 需要 3.5 新增导出 normalizeCssVarValue，小程序端构建即报
 * MISSING_EXPORT；同理 @dcloudio/uni-app 需要从 'vue' 获取 isInSSRComponentSetup，
 * 小程序端必须由 @dcloudio/uni-mp-vue（uni 的 vue 运行时分支）提供。
 *
 * 形态约束（实测结论）：uni:mp 插件以「对象」形态返回 resolve.alias，用户侧
 * 若用「数组」形态会整体覆盖丢掉 vue → uni-mp-vue 映射（vite mergeAlias
 * 对 object×array 走 concat，数组项在前仍可能被 normalize 后的顺序影响）；
 * 必须同为对象、且把 'vue' 一并在用户侧显式声明，才能保证键序与优先级。
 *
 * 自愈性：开发机执行 npm install 将 vue 精确对齐 3.4.21（package.json 已
 * 锁定）后，嵌套 3.5 副本不复存在，@vue/shared 重定向自动失效；vue →
 * uni-mp-vue 为小程序端固定需求，始终保留。
 */
function mpAliasFix(): Record<string, string> {
  const platform = process.env.UNI_PLATFORM || '';
  if (!platform.startsWith('mp-')) {
    return {};
  }
  const alias: Record<string, string> = {
    // 小程序端 vue 运行时 = uni 的分支（提供 isInSSRComponentSetup 等 uni 扩展导出）
    vue: path.resolve(__dirname, 'node_modules/@dcloudio/uni-mp-vue/dist/vue.runtime.esm.js')
  };
  const nestedShared = path.resolve(
    __dirname,
    'node_modules/@vue/runtime-core/node_modules/@vue/shared'
  );
  if (fs.existsSync(path.join(nestedShared, 'package.json'))) {
    // 3.5.x 运行时内核与 3.4.21 hoisted shared 的版本错配修补（见上）
    alias['@vue/shared'] = nestedShared;
  }
  return alias;
}

export default defineConfig({
  plugins: [uni()],
  resolve: {
    alias: mpAliasFix()
  },
  server: {
    host: '0.0.0.0', // 允许真机/局域网访问（微信开发者工具联调、手机浏览器体验）
    port: 5173,
    strictPort: false, // 端口被占自动 +1，避免开发中断
    open: false
  },
  build: {
    sourcemap: false, // 生产不出口 map，控制包体与安全
    chunkSizeWarningLimit: 1024
  }
});
