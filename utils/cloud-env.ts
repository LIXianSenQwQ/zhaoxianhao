/**
 * utils/cloud-env.ts
 * 云开发环境 ID 读取（集中封装）。
 *
 * ⚠️ 工程约定：不要在 .vue SFC 文件内直接书写 import.meta.env 表达式。
 * 原因：vite:define 预转换器（build 阶段）只排除 html/css/json，会在 .vue
 * 原始代码上执行 import.meta.env 替换，进而触发 esbuild 对原始 SFC 的语法
 * 解析（报「JSX syntax extension is not currently enabled」构建失败）。
 * 统一从本模块读取，SFC 只 import 变量。
 */
export const CLOUD_ENV_ID: string =
  import.meta.env?.VITE_CLOUD_ENV_ID
  || (typeof uni !== 'undefined' && typeof uni.getStorageSync === 'function'
    ? uni.getStorageSync('cloudEnvId')
    : '')
  || 'YOUR_CLOUD_ENV_ID';
