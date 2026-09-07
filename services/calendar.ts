/**
 * services/calendar.ts — 日历服务封装（蓝图 V1.1 E4 / §8 calendar/detail）
 * 对应云函数：calendar.almanac, event.detail
 */

import { call } from './request';
import { getAlmanacByDate, AlmanacResult } from './almanac';

export interface CalendarEvent {
  _id?: string;
  date: string; // YYYY-MM-DD
  type?: '生辰' | '忌日' | '祭日' | '节气' | '自定义' | '仪式' | '红事' | '白事';
  title: string;
  body?: string;
  personId?: string;
  notificationId?: string; // 关联通知 ID（进入详情页自动 markRead）
  createdAt?: string;
}

/**
 * 获取某月所有事件列表（简化版，实际可调用 calendar.listEvents 或从 members/events 聚合）
 * @param year 年
 * @param month 月（1-12）
 */
export async function eventsInMonth(year: number, month: number): Promise<CalendarEvent[]> {
  return []; // TODO: 可扩展为调用 calendar.listEvents action
}

/**
 * 根据 date 查询该日期的事件（提醒/日程详情用）
 * @param date YYYY-MM-DD
 */
export async function eventsOnDate(date: string): Promise<CalendarEvent[]> {
  return []; // TODO: 可扩展为调用 calendar.events action
}

/**
 * 获取单条大事记详情（event.detail）
 * @param eventId
 */
export async function eventDetail(eventId: string) {
  return call<any>('event', { action: 'detail', eventId });
}

// 导出 almanac 相关（统一入口）
export const getAlmanac = getAlmanacByDate;
export type { AlmanacResult };
