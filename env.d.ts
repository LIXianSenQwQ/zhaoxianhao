/**
 * 环境变量类型声明
 * .env 中 VITE_ 前缀变量会经 vite 注入 import.meta.env
 */
/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 微信云开发环境 ID（见 .env.example） */
  readonly VITE_CLOUD_ENV_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
