/**
 * services/moment.ts — 家族动态服务封装（蓝图 V2.0 §29 模块三）
 * 对应云函数 plaza（已在 family_moments / moment_interactions / clan_notices 集合实现：
 *   list / detail / publish / like / comment / getNotices / announce / readReceipt / stick）
 * 契约：CallResult = { data, fromCache, latencyMs, error? }；data 已解包
 */

import { call, write } from './request';

export interface MomentComment {
  _id: string;
  userId: string;
  userName?: string;
  content: string;
  createdAt?: string;
}

export interface FamilyMoment {
  _id: string;
  authorId: string;
  authorName?: string;
  type?: string; // TEXT | IMAGE | VIDEO | MIXED
  content?: string;
  mediaIds?: string[];
  topicTags?: string[];
  mentions?: Array<{ userId: string; userName?: string }>;
  stats?: { like: number; comment: number; share: number };
  hotScore?: number;
  status?: string;
  publishAt?: string;
  updatedAt?: string;
}

export interface ClanNotice {
  _id: string;
  publisherId?: string;
  publisherName?: string;
  title?: string;
  content?: string;
  category?: string; // 族务/红白事/节庆/应急/公示
  priority?: string; // low/normal/high/urgent
  status?: string;
  publishAt?: string;
  expireAt?: string;
  stickingCountdown?: number;
  requiresReadReceipt?: boolean;
  readBy?: Array<{ userId: string; name?: string; readAt: string }>;
}

/** 动态类型（蓝图 C.3 多类型） */
export const MOMENT_TYPES = [
  { type: 'TEXT', label: '文字' },
  { type: 'IMAGE', label: '图片' },
  { type: 'MIXED', label: '图文' }
];

/** 动态/公告分类（蓝图 C.6 公告类型 + C.3 话题） */
export const MOMENT_TOPIC_SUGGESTS = ['族务', '红白事', '节庆', '添丁', '寿诞', '升学', '寻根', '老照片', '梨乡'];
export const NOTICE_CATEGORIES = ['族务', '红白事', '节庆', '应急', '公示'];

/** 动态时间线（MEMBER+；支持 status/topicTags/author 过滤；分页 20/页） */
export function listMoments(params: { page?: number; pageSize?: number; status?: string; topicTags?: string[]; author?: string } = {}) {
  return call<{ moments: FamilyMoment[]; page: number; hasMore: boolean }>(
    'plaza', { action: 'list', ...params }, { cacheKey: `moment:list:${JSON.stringify(params)}`, cacheTTL: 30 * 1000 });
}

/** 动态详情：单条 + 评论列表 + 我是否已赞 */
export function getMomentDetail(momentId: string) {
  return call<{ moment: FamilyMoment; comments: MomentComment[]; likedByMe: boolean }>(
    'plaza', { action: 'detail', momentId }, { cacheKey: `moment:detail:${momentId}`, cacheTTL: 15 * 1000 });
}

/** 发布动态（MEMBER+；文字≤5000 / 媒体≤9 / 标签≤10；secscan 门禁） */
export function publishMoment(payload: {
  type?: string; content: string; mediaIds?: string[];
  topicTags?: string[]; mentions?: Array<{ userId: string; userName?: string }>;
}) {
  return write('plaza', { action: 'publish', ...payload }, 'plaza', `pub_${Date.now()}`);
}

/** 点赞（原子 +1，幂等） */
export function likeMoment(momentId: string) {
  return write('plaza', { action: 'like', momentId }, 'plaza', `like_${momentId}`);
}

/** 评论（文字 ≤5000） */
export function commentMoment(momentId: string, content: string) {
  return write('plaza', { action: 'comment', momentId, content }, 'plaza', `cmt_${momentId}_${Date.now()}`);
}

/** 公告列表（含置顶倒计时；VISITOR+ 可读） */
export function listNotices(page: number = 1, pageSize: number = 10) {
  return call<{ notices: ClanNotice[]; page: number; hasMore: boolean }>(
    'plaza', { action: 'getNotices', page, pageSize }, { cacheKey: `moment:notices:${page}`, cacheTTL: 30 * 1000 });
}

/** 发布公告（CHIEF+；category/priority 枚举校验） */
export function publishAnnounce(payload: {
  title: string; content: string; category: string; priority?: string;
  stickingDays?: number; requiresReadReceipt?: boolean;
}) {
  return write('plaza', { action: 'announce', ...payload }, 'plaza', `ann_${Date.now()}`);
}

/** 公告已阅回执 */
export function readReceipt(noticeId: string) {
  return write('plaza', { action: 'readReceipt', noticeId }, 'plaza', `rr_${noticeId}`);
}

/** 公告置顶（CHIEF+；分钟） */
export function stickNotice(noticeId: string, stickyMinutes: number = 60) {
  return write('plaza', { action: 'stick', noticeId, stickyMinutes }, 'plaza', `stick_${noticeId}`);
}

/** 点击统计埋点（uni-stat 2.0 事件上报） */
export function reportClick(momentId: string) {
  try { uni.report?.('moment_click', { momentId }); } catch { /* stat 未初始化时静默 */ }
}
