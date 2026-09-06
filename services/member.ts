/**
 * services/member.ts — 成员查询/搜索 统一封装
 * 云函数：member
 */
import { call, write } from './request';

/** 家谱树（五世视图） */
export function tree(focusId: string, depth = 2) {
  return call('member', { action: 'tree', focusId, depth }, `tree_${focusId}`);
}

/** 成员详情 */
export function getDetail(memberId: string, fields?: string[]) {
  return call('member', { action: 'getDetail', memberId, fields }, `member_${memberId}`, 60000);
}

/** 全局搜索 */
export function search(keyword: string, category?: string) {
  return call('member', { action: 'search', keyword, category }, `search_${keyword}`, 30000);
}

/** 家族统计 */
export function stats() {
  return call('member', { action: 'stats' }, 'member_stats', 60000);
}

/** 英烈列表 */
export function heroList() {
  return call('member', { action: 'heroList' }, 'hero_list', 60000);
}

/** 申请查看限制级信息 */
export function applyAuth(targetMemberId: string, reason: string) {
  return write('member', { action: 'applyAuth', targetMemberId, reason }, 'member', `apply_${targetMemberId}`);
}