/**
 * services/opera.ts — 梨园小筑服务封装（云函数：opera）
 * V2.0 F11：票友卡池 / 登台表演 / 每日签到 / 演出记录
 * 页面统一走本层调用云函数，业务引擎在服务端（utils/opera-engine.js 同源）。
 */
import { call, write } from './request';

export type OperaRole = '生' | '旦' | '净' | '末' | '丑';

/** 创建票友卡片（幂等：同名返回已有卡片） */
export function rosterCreate(params: { name: string; role?: OperaRole }) {
  return write('opera', { action: 'roster.create', ...params }, 'opera', `roster_${params.name}_${Date.now()}`);
}

/** 我的票友卡片列表 */
export function rosterList() {
  return call('opera', { action: 'roster.list' }, 'opera_roster', 30000);
}

/** 登台表演（唱念做打随机演出事件 → 评分/反馈/成长） */
export function stagePerform(rosterId: string) {
  return write('opera', { action: 'stage.perform', rosterId }, 'opera', `perf_${Date.now()}`);
}

/** 每日签到（联动积分，当日幂等） */
export function dailyCheckin() {
  const today = new Date().toISOString().slice(0, 10);
  return write('opera', { action: 'daily.checkin' }, 'opera', `checkin_${today}`);
}

/** 历史演出记录（分页，倒序） */
export function recordsList(page = 1) {
  return call('opera', { action: 'records.list', page }, `opera_records_${page}`, 30000);
}
