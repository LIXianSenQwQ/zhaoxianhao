/**
 * lib/lunar-data.js — lunar-javascript 接入层（V1.1 老皇历 · 蓝图 7.11）
 *
 * 用途：统一「离线历法库」的加载入口。运行时按以下优先级取数据源：
 *   1. 已安装 lunar-javascript（npm i lunar-javascript，1900–2100 全量）
 *   2. 已生成离线缓存 lib/lunar-data.json（scripts/lunar-import.js 预生成）
 *   3. 均不可用 → 返回 null，由调用方（calendar 云函数）走公式层占位
 *
 * 本文件被客户端与云函数共同复用，保持零依赖（只 require 缓存 JSON 或按需 require npm 包）。
 */
'use strict';

/**
 * 探测并返回可用的农历引擎句柄
 * @returns {{ kind: 'lunar-javascript'|'cache'|'none', Lunar?: any, cache?: object, error?: string }}
 */
function detect() {
  // 1) lunar-javascript（真实部署环境）
  try {
    const pkg = require('lunar-javascript');
    if (pkg && pkg.Solar && typeof pkg.Solar.fromYmd === 'function') {
      return { kind: 'lunar-javascript', Solar: pkg.Solar };
    }
  } catch (e) {
    // 未安装 → 继续
  }
  // 2) 离线缓存（本仓库预生成，供弱网/CI 使用；minimal-anchor 或 full 两种格式）
  try {
    const cache = require('./lunar-data.json');
    const hasData = cache && cache.generated &&
      ((Array.isArray(cache.years) && cache.years.length > 0) ||
       (Array.isArray(cache.anchors) && cache.anchors.length > 0));
    if (hasData) {
      return { kind: 'cache', cache };
    }
  } catch (e) {
    // 无缓存 → 继续
  }
  return { kind: 'none', error: 'lunar-javascript 未安装且无离线缓存' };
}

/**
 * 用引擎计算某日期的农历信息（统一返回结构，屏蔽两套数据源差异）
 * @param {object} engine detect() 的返回值
 * @param {number} y 公历年
 * @param {number} m 公历月（1–12）
 * @param {number} d 公历日
 */
function lunarOf(engine, y, m, d) {
  if (!engine || engine.kind === 'none') return null;
  try {
    if (engine.kind === 'lunar-javascript') {
      // 使用 Solar → Lunar 转换（Solar.fromYmd 接受公历日期）
      const solar = engine.Solar.fromYmd(y, m, d);
      if (!solar) return null;
      const L = solar.getLunar();
      // 闰月判断：lunar-javascript 中 getMonth() < 0 表示闰月
      const isLeap = L.getMonth() < 0;
      const monthName = L.getMonthInChinese();
      const dayName = L.getDayInChinese();
      
      // 节气处理：可能返回 SolarTerm 对象，需要取其名称
      let solarTerm = null;
      try {
        const jt = L.getJieQi();
        if (jt && typeof jt.getName === 'function') {
          solarTerm = jt.getName();
        } else if (typeof jt === 'string') {
          solarTerm = jt;
        }
      } catch (e) {}
      
      return {
        source: 'lunar-javascript',
        lunarYear: L.getYear(),
        lunarMonth: Math.abs(L.getMonth()), // 绝对值用于显示
        lunarDay: L.getDay(),
        isLeap,
        monthName: isLeap ? `闰${monthName}` : monthName,
        dayName,
        yearGanZhi: L.getYearInGanZhi(),
        monthGanZhi: L.getMonthInGanZhi(),
        dayGanZhi: L.getDayInGanZhi(),
        zodiac: L.getShengxiao(),
        solarTerm
      };
    }
    if (engine.kind === 'cache') {
      const c = engine.cache;
      // full 格式：lookup[`y-m-d`]
      if (c.lookup) {
        const row = c.lookup[`${y}-${m}-${d}`];
        if (row) return {
          source: 'cache', lunarYear: row.ly, lunarMonth: row.lm, lunarDay: row.ld,
          isLeap: row.leap, yearGanZhi: row.ganZhiY, monthGanZhi: row.ganZhiM,
          dayGanZhi: row.ganZhiD, zodiac: row.zodiac, solarTerm: row.term || null
        };
      }
      // minimal-anchor 格式：按日期精确匹配可确证锚点
      if (Array.isArray(c.anchors)) {
        const key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const a = c.anchors.find(x => x.date === key);
        if (a) return {
          source: 'cache', lunarYear: null, lunarMonth: null, lunarDay: null,
          isLeap: false, yearGanZhi: a.year || null, dayGanZhi: a.ganZhiDay || null,
          zodiac: null, solarTerm: a.term || null, anchor: true
        };
      }
      return { source: 'cache', note: '缓存未覆盖该日期（minimal 表仅含锚点，请全量生成）' };
    }
  } catch (e) {
    return { source: engine.kind, error: e.message };
  }
  return null;
}

module.exports = { detect, lunarOf };
