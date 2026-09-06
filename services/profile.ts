/**
 * services/profile.ts — V1.1 个人资料扩展服务
 * 
 * 覆盖：介绍视频（MPS 转码 ≤60s）/ 问候语 / 家风家训 / 字辈展示
 * 详见开发框架 V1.1 第八部分
 */
import { call, write } from './request';

// ═══════════ 介绍视频 ═══════════
const MAX_DURATION_SEC = 60; // V1.1 22.2：服务端强校验 ≤60 秒

/** 上传介绍视频（时长≤60s，MPS 转码 H.264/MP4） */
export function saveIntroVideo(params: {
  fileId: string;
  duration: number;         // 秒，服务端强校验
  editMeta?: {
    trimStart?: number;
    trimEnd?: number;
    bgmId?: string;
    watermarkText?: string;
  };
  visibility?: 'PRIVATE' | 'PUBLIC' | 'GROUP';
}) {
  if (params.duration > MAX_DURATION_SEC) {
    return Promise.reject(new Error(`介绍视频时长不得超过 ${MAX_DURATION_SEC} 秒`));
  }
  return write('profile', { action: 'saveIntroVideo', ...params }, 'intro', `intro_${Date.now()}`);
}

/** 获取我的介绍视频 */
export function getMyIntroVideo() {
  return call('profile', { action: 'getIntroVideo' }, 'intro:mine', 60000);
}

// ═══════════ 家庭问候语 ═══════════
export function saveGreeting(params: {
  templateId: string;       // 晨安/晚安/节日/节气/家书
  content: { text: string; font: 'song' | 'kai'; size: 14 | 16 | 18 | 20; color: string; align: 'left' | 'center' | 'right' };
  schedule?: { time: string; weekdays: number[]; enabled: boolean };
  visibility?: 'FAMILY' | 'CLAN';
}) {
  return write('profile', { action: 'greeting.save', ...params }, 'greet', `greet_${Date.now()}`);
}

/** 获取当前有效的问候语（首页问候区展示） */
export function getActiveGreeting() {
  return call('profile', { action: 'greeting.active' }, 'greet:active', 60000);
}

// ═══════════ 家风家训 ═══════════
export function submitMotto(content: { text: string; align: 'left' | 'center' | 'right'; lineHeight: 1.5 | 1.8 | 2.0 }) {
  return write('profile', { action: 'motto.submit', content }, 'motto', `motto_${Date.now()}`);
}

/** 审核家训（族史委+） */
export function reviewMotto(id: string, action: 'APPROVED' | 'REJECTED', comment?: string) {
  return write('profile', { action: 'motto.review', id, action, comment }, 'motto', `review_${id}`);
}

/** 获取推荐家训（首页卡） */
export function getRecommendedMotto() {
  return call('profile', { action: 'motto.recommended' }, 'motto:rec', 60000);
}

// ═══════════ 字辈展示 ═══════════
/** 字辈序列列表 */
export function listGenerations(branchId?: string) {
  return call('profile', { action: 'generation.list', branchId }, `gen:${branchId || 'all'}`, 60000);
}

/** 定位我的字辈 */
export function locateMyGeneration() {
  return call('profile', { action: 'generation.locate' }, 'gen:mine', 60000);
}