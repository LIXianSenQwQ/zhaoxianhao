/**
 * services/notification.ts — 通知服务封装（蓝图 §7.9）
 * 对应云函数：notify (action: list/markRead/broadcast/digest/etc.)
 */

import { call, write } from './request';

export interface NotificationRecord {
  _id?: string;
  userId?: string;
  type?: 'JIRI' | 'BIRTH' | 'AUDIT' | 'ANNOUNCEMENT' | 'MOMENT' | 'SYSTEM' | 'EMERGENCY';
  title?: string;
  body?: string;
  scope?: string;
  read?: boolean;
  readAt?: string;
  level?: 'HIGH' | 'MEDIUM' | 'LOW';
  targetRoute?: string;
  createdAt?: string;
}

interface ListResult {
  records: NotificationRecord[];
  page: number;
  hasMore: boolean;
}

/**
 * 获取我的通知列表（个人通知 + 全员广播合并，按 createdAt 倒序）
 * @param page 页码（从 1 开始）
 * @param cacheKey 可选缓存 key，默认启用 60s 缓存
 */
export async function listNotifications(page: number = 1, cacheKey?: string) {
  return call<ListResult>('notify', { action: 'list', page }, cacheKey || `notify:list:${page}`, 60 * 1000);
}

/**
 * 标记通知已读（仅本人可标记，后端属主校验）
 * @param notificationId
 */
export async function markNotificationRead(notificationId: string) {
  return call('notify', { action: 'markRead', notificationId });
}

/**
 * 发布紧急广播（管理员专属，EDITOR+ 权限）
 * @param content 广播内容
 * @param level 优先级 HIGH/MEDIUM/LOW
 */
export async function broadcast(content: string, level: 'HIGH' | 'MEDIUM' = 'HIGH') {
  return write('notify', { action: 'broadcast', content, level }, 'notify', `broadcast_${Date.now()}`);
}

/**
 * 首页摘要（getHomeDigest）：仪式卡→提醒→个人通知→动态→祖训兜底
 */
export async function homeDigest() {
  return call<{ cards: any[] }>('notify', { action: 'digest' });
}
