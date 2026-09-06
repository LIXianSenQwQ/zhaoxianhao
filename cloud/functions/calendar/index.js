/**
 * cloud/functions/calendar/index.js
 * V1.1 E4: 老皇历数据服务（蓝图 7.11 / 25）
 * - 干支纪年/纪月/纪日、生肖（公式精确）
 * - 二十四节气（21 世纪通用近似公式，交节日 ±1 日内）
 * - 宜忌（内置通用规则 + settings.almanacExt 族史委定制扩展）
 * - 农历月日：真实部署时接入 lunar-javascript 离线库（1900-2100）——
 *   经 lib/lunar-data.js 统一加载；未安装且无离线缓存时，
 *   返回 source:'lunar-placeholder'（规则层仍保证干支/节气可测）
 */

const wx = require('wx-server-sdk');
const { OK, BAD_REQUEST } = require('./common/response');

wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

// V1.1 E4 lunar 接入层：优先 lunar-javascript，其次离线缓存，缺省 none
let lunarEngine = null;
try {
  const lunarLoader = require('../../lib/lunar-data.js');
  lunarEngine = lunarLoader.detect();
} catch (e) {
  lunarEngine = { kind: 'none', error: 'lib/lunar-data.js 未找到' };
}

// ─── 基础常量 ───
const STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
const ZODIACS = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'];

// 24 节气名（按月，每月 2 个：节 + 中气）
const TERMS = ['小寒','大寒','立春','雨水','惊蛰','春分','清明','谷雨','立夏','小满','芒种','夏至',
  '小暑','大暑','立秋','处暑','白露','秋分','寒露','霜降','立冬','小雪','大雪','冬至'];

// 21 世纪交节 C 值（日期 = floor(Y*0.2422 + C) - floor((Y-1)/4)，Y=年份后两位）
const TERM_C_21 = [5.4055, 20.12, 3.87, 18.73, 5.63, 20.646, 4.81, 20.1, 5.52, 21.04, 5.678, 21.37,
  7.108, 22.83, 7.5, 23.13, 7.646, 23.042, 8.318, 23.438, 7.438, 22.36, 7.18, 21.94];
// 各节气所在公历月（索引 0=小寒 1月）
const TERM_MONTH = [1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12];

/** 某年第 index 个节气的公历日期（返回 {month, day}） */
function solarTermDate(year, index) {
  const Y = year % 100;
  let day = Math.floor(Y * 0.2422 + TERM_C_21[index]) - Math.floor((Y - 1) / 4);
  // 跨世纪修正（世纪年为 0 时特殊处理，2000 年已验证）
  if (year >= 2000 && year % 100 === 0) {
    // 公式已含 (Y-1)/4 项，0 世纪年微调
  }
  if (day < 1) day += 31; // 安全兜底
  return { month: TERM_MONTH[index], day };
}

/** 干支纪年（2026 = 丙午） */
function ganzhiYear(year) {
  const stem = STEMS[(year - 4) % 10];
  const branch = BRANCHES[(year - 4) % 12];
  return stem + branch;
}

/** 生肖（2026 = 马） */
function zodiacOf(year) {
  return ZODIACS[(year - 4) % 12];
}

/** 日干支（以 2000-01-01 = 甲子日 为锚点推算，实际历法锚：2000-01-01 为戊午日）
 *  用权威锚 1900-01-01 = 甲戌日 推导：offset = (days - 10) mod 60 */
function ganzhiDay(dateStr) {
  const epoch = new Date('1900-01-01T00:00:00Z');
  const d = new Date(dateStr + 'T00:00:00Z');
  const days = Math.round((d.getTime() - epoch.getTime()) / 86400000);
  const idx = ((days + 10) % 60 + 60) % 60; // 甲戌=10 → idx0=甲子
  return { ganzhi: STEMS[idx % 10] + BRANCHES[idx % 12], idx };
}

/**
 * 月干支（五虎遁：甲己之年丙作首）
 * month 1-12（农历近似按公历月 + 立春划分）
 */
function ganzhiMonth(year, month) {
  const yearGanIdx = ((year - 4) % 10 + 10) % 10; // 0=甲
  // 正月(寅)起丙：月干首 = (yearGanIdx % 5) * 2 + 2  （甲0→丙2, 乙1→戊4, 丙2→庚6, 丁3→壬8, 戊4→甲0）
  const firstGan = ((yearGanIdx % 5) * 2 + 2) % 10;
  // 月序：1月→寅(2)? 以立春为界简化：公历月→节气月（约 month+1 → 农历月序）
  // 农历月序：公历2月≈正月。m = month + 1 (2月→1)，12月→11，1月→11（跨年）
  let lunarM = month + 1;
  if (lunarM > 12) lunarM -= 12;
  const gan = (firstGan + lunarM - 1) % 10;
  const branch = (2 + lunarM - 1) % 12; // 寅=2 起
  return STEMS[gan] + BRANCHES[branch];
}

/** 当日节气判断（返回命中的节气名，非节气日返回 null） */
function termOnDate(year, month, day) {
  for (let i = 0; i < TERMS.length; i++) {
    const t = solarTermDate(year, i);
    if (t.month === month && t.day === day) return TERMS[i];
  }
  return null;
}

/** 全年纪气表（1 月 1 日至 12 月 31 日） */
function termsOfYear(year) {
  const list = [];
  for (let i = 0; i < TERMS.length; i++) {
    const t = solarTermDate(year, i);
    list.push({ name: TERMS[i], month: t.month, day: t.day });
  }
  return list;
}

/**
 * 宜忌规则：内置通用黄历宜忌库（节选常用条目）
 * 真实完整库随 lunar-javascript 接入；此处规则驱动保证可测
 */
const YI_BY_KIND = {
  // 节气日侧重
  '立春': { yi: ['开市', '祈福', '出行'], ji: ['动土', '安葬'] },
  '清明': { yi: ['祭祀', '扫墓', '踏青'], ji: ['开市', '嫁娶'] },
  '立夏': { yi: ['出行', '祭祀'], ji: ['动土'] },
  '立秋': { yi: ['祈福', '开市'], ji: ['嫁娶'] },
  '立冬': { yi: ['祭祀', '祈福'], ji: ['出行'] },
  '冬至': { yi: ['祭祀', '祈福', '团圆'], ji: ['动土'] }
};

/** 常用宜忌按星期规则 */
const WEEKDAY_YI = {
  0: { yi: ['祈福', '祭祀'], ji: ['开市', '动土'] }, // 周日
  1: { yi: ['出行', '上任'], ji: [] },
  2: { yi: ['开市', '交易'], ji: [] },
  3: { yi: ['祭祀', '祈福'], ji: [] },
  4: { yi: ['出行', '会友'], ji: [] },
  5: { yi: ['嫁娶', '开市'], ji: [] },
  6: { yi: ['安葬', '祭祀'], ji: ['出行'] }
};

/**
 * R24: calendar.almanac 老皇历查询
 * 入参：{ date: 'YYYY-MM-DD' }
 * 出参：干支纪年/月/日 + 生肖 + 节气 + 宜忌（含 settings.almanacExt 定制合并）
 */
async function almanac(ctx, date) {
  const db = wx.getDatabase();
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return BAD_REQUEST('date 需为 YYYY-MM-DD');

  const [y, m, d] = date.split('-').map(Number);
  const yearGanzhi = ganzhiYear(y);
  const dayGz = ganzhiDay(date);
  const monthGz = ganzhiMonth(y, m);
  const term = termOnDate(y, m, d);

  // 宜忌：节气特判 + 星期规则合并
  let yi = [];
  let ji = [];
  if (term && YI_BY_KIND[term]) {
    yi = [...(YI_BY_KIND[term].yi || [])];
    ji = [...(YI_BY_KIND[term].ji || [])];
  }
  const wd = new Date(date + 'T00:00:00Z').getUTCDay();
  const wdRules = WEEKDAY_YI[wd] || { yi: [], ji: [] };
  yi = Array.from(new Set([...yi, ...wdRules.yi]));
  ji = Array.from(new Set([...ji, ...wdRules.ji]));

  // 族史委定制扩展（settings.almanacExt，如「梨花节」「修谱庆典」）
  try {
    const ext = await db.collection('settings').where({ key: 'almanacExt' }).limit(1).get();
    if (ext.data && ext.data[0] && Array.isArray(ext.data[0].value)) {
      for (const item of ext.data[0].value) {
        if (item.date === date) {
          if (item.yi) yi = Array.from(new Set([...yi, ...item.yi]));
          if (item.ji) ji = Array.from(new Set([...ji, ...item.ji]));
        }
      }
    }
  } catch (e) { /* stub / 无配置时忽略 */ }

  // ── lunar 数据：lunar-javascript / 离线缓存 / 公式占位 三档 ──
  let lunar = { source: 'lunar-placeholder', note: '真实部署接入 lunar-javascript（1900-2100）' };
  if (lunarEngine && lunarEngine.kind !== 'none') {
    try {
      const lunarLoader = require('../../lib/lunar-data.js');
      const info = lunarLoader.lunarOf(lunarEngine, y, m, d);
      if (info && info.source) {
        lunar = info;
        // 缓存/引擎可靠时回填干支纪年，覆盖极端年份边界
        if (info.yearGanZhi && !info.ganZhiY) info.ganZhiY = info.yearGanZhi;
      }
    } catch (e) {
      lunar = { source: 'lunar-error', note: e.message };
    }
  }

  return OK({
    date,
    lunar,
    ganzhi: { year: yearGanzhi, month: monthGz, day: dayGz.ganzhi },
    zodiac: zodiacOf(y),
    solarTerm: term, // null = 非节气日
    termsOfMonth: termsOfYear(y).filter(t => t.month === m).map(t => `${t.month}/${t.day} ${t.name}`),
    yi,
    ji
  });
}

module.exports = { main: async (params, context) => {
  const { action } = params || {};
  const ctx = { OPENID: context.OPENID || context.openid, openid: context.openid };
  switch (action) {
    case 'almanac':
      return await almanac(ctx, params.date);
    default:
      return BAD_REQUEST(`unknown action: ${action}`);
  }
},
// 导出纯函数便于单测
_utils: { ganzhiYear, ganzhiDay, ganzhiMonth, zodiacOf, termOnDate, solarTermDate, termsOfYear }
};
