/**
 * services/atmosphere.ts — 首页氛围/今日要事 封装
 * 云函数：atmosphere
 */
import { call, read } from './request';

/** 首页聚合数据（氛围令牌 + 卡片流 + 节气） */
export function today() {
  return read('atmosphere', { action: 'today' }, 'atmos_today', 60000);
}

/** 首页骨架数据（给骨架屏用，更轻量） */
export function todaySkeleton() {
  return read('atmosphere', { action: 'today' }, 'atmos_today_skeleton', 60000);
}

/* 查询类型 */
export interface TodayData {
  solarTerm: string | null;
  festival: string | null;
  moodTheme: Record<string, string>;
  greeting: string;
  homeCards: Array<{
    type: 'ceremony' | 'reminder' | 'digest' | 'motto';
    title: string;
    desc: string;
    route?: string;
  }>;
}