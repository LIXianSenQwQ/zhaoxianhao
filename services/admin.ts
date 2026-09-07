/**
 * services/admin.ts — 后台管理/功能开关封装
 * 对应云函数：admin
 * 动作对齐：getFeatureFlags / featureFlag / auditList（见 cloud/functions/admin/index.js）
 */
import { call, write } from './request';

/** 获取功能开关表 (admin.getFeatureFlags → OK({flags})) */
export function getFeatureFlags() {
  return call('admin', { action: 'getFeatureFlags' }, {});
}

/** 设置功能开关 (admin.featureFlag，CHIEF 专属，后端写 audit_logs) */
export function updateFeatureFlag(key: string, enabled: boolean, scope?: string) {
  return write('admin', { action: 'featureFlag', key, value: { enabled }, scope }, 'admin.featureFlag', key);
}

/** 审计列表查询 (admin.auditList，HISTORIAN 及以上) */
export function auditList(params?: Record<string, any>) {
  return call('admin', { action: 'auditList', ...params }, {});
}
