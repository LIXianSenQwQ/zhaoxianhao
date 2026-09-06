/**
 * vite.config.ts
 * uni-app CLI 会自动注入 @dcloudio/vite-plugin-uni，此处只做开发服务器与构建微调。
 * H5 本地开发服务器：npm run dev:h5 → http://localhost:5173
 */
import { defineConfig } from 'vite';

export default defineConfig({
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
