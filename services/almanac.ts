/**
 * services/almanac.ts — 老皇历服务封装（蓝图 §9.4 R24 / V1.1 E4）
 * 对应云函数：calendar.almanac (action:'almanac', date:YYYY-MM-DD)
 */

import { read } from './request';

export interface AlmanacResult {
  ganzhi?: {
    year: string; // e.g. '丙午'
    month: string;
    day: string;
  };
  zodiac?: string; // e.g. '马'
  solarTerm?: string; // e.g. '清明'
  termsOfMonth?: string[]; // ['清明', '谷雨']
  yi?: string[]; // 宜
  ji?: string[]; // 忌
  lunar?: {
    source: 'lunar-javascript' | 'cache' | 'lunar-placeholder';
    lunarYear?: number;
    lunarMonth?: number;
    lunarDay?: number;
    isLeap?: boolean;
    monthName?: string;
    dayName?: string;
  } | null;
}

/**
 * 获取指定日期的老皇历数据
 * @param date YYYY-MM-DD 格式
 * @param cacheKey 缓存 key，默认启用 5min 本地缓存
 */
export async function getAlmanac(date: string, cacheKey?: string) {
  return read<AlmanacResult>(
    'calendar',
    { action: 'almanac', date },
    cacheKey || `almanac:${date}`,
    5 * 60 * 1000 // 5 分钟 TTL
  );
}

/**
 * 计算某月的节气列表（24 节气交节日期，不依赖 lunar-javascript）
 * @param year 公历年
 */
export function termsOfYear(year: number): {month:number;day:number;name:string}[] {
  // 21 世纪通用近似公式（交节日±1 日内），返回本月所有节气
  const TERM_C_21 = [5.4055, 20.12, 3.87, 18.73, 5.63, 20.646, 4.81, 20.1, 5.52, 21.04, 5.678, 21.37,
    7.108, 22.83, 7.5, 23.13, 7.646, 23.042, 8.318, 23.438, 7.438, 22.36, 7.18, 21.94];
  const TERMS = ['小寒','大寒','立春','雨水','惊蛰','春分','清明','谷雨','立夏','小满','芒种','夏至',
    '小暑','大暑','立秋','处暑','白露','秋分','寒露','霜降','立冬','小雪','大雪','冬至'];
  const TERM_MONTH = [1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12];

  const Y = year % 100;
  const result: {month:number;day:number;name:string}[] = [];
  for(let i=0;i<TERMS.length;i++){
    let day = Math.floor(Y * 0.2422 + TERM_C_21[i]) - Math.floor((Y - 1)/4);
    if(day < 1) day += 31;
    result.push({month: TERM_MONTH[i], day, name: TERMS[i]});
  }
  return result.sort((a,b)=> a.month - b.month || a.day - b.day);
}
