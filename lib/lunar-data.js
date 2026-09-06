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
    if (pkg && pkg.Lunar && typeof pkg.Lunar.fromYmd === 'function') {
      return { kind: 'lunar-javascript', Lunar: pkg.Lunar };
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
      const L = engine.Lunar.fromYmd(y, m, d);
      return {
        source: 'lunar-javascript',
        lunarYear: L.getYear(),
        lunarMonth: L.getMonth(),        // 负数表示闰月（lunar-javascript 约定：闰月返回负值）
        lunarDay: L.getDay(),
        isLeap: L.getMonth() < 0,
        monthName: L.getMonthInChinese(),
        dayName: L.getDayInChinese(),
        yearGanZhi: L.getYearInGanZhi(),
        monthGanZhi: L.getMonthInGanZhi(),
        dayGanZhi: L.getDayInGanZhi(),
        zodiac: L.getYearShengXiao(),
        solarTerm: (() => { try { return L.getJieQi() || null; } catch (e) { return null; } })()
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
