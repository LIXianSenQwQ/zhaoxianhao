/**
 * cloud/functions/atmosphere/index.js
 * Sprint R13 大修（蓝图 0.2 / 0.6 / 7.8 对齐）：节气氛围引擎 today 聚合
 *
 * 修复（原遗留桩不可运行缺陷）：
 *   - todayAtmososphere 与 todayAtmosphere 拼写不一致 → today 必崩 ReferenceError
 *   - context.openid 越界引用（todayAtmosphere 内无 context 形参）
 *   - 节气表仅 2 项 / findSolarTerm 月份未减一且无区间上限
 *   - getThemeColors 仅返回 top 单值、moodTheme 类型混乱（字符串 vs 对象）
 *   - 裸返回无统一响应格式
 *
 * 定案（蓝图 7.8）：
 *   - 内置 24 节气年度近似表（每年更新一次，不依赖第三方）
 *   - 返回 {solarTerm, season, moodTheme(端点色), greeting(节气笺), muted, festival, homeCards}
 *   - 白事静默：events 存在 ACTIVE 讣告 → 素色端点 + muted=true
 *   - atmosphere.today 公开接口（蓝图 9.1），无门禁
 */
const wx = require('wx-server-sdk');
const { OK } = require('./common/response');

wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

/** 24 节气年度近似起始表（公历近似值；族议会每年校准一次） */
const SOLAR_TERMS = Object.freeze([
  { name: '小寒', month: 1, day: 6, season: '冬' },
  { name: '大寒', month: 1, day: 20, season: '冬' },
  { name: '立春', month: 2, day: 4, season: '春' },
  { name: '雨水', month: 2, day: 19, season: '春' },
  { name: '惊蛰', month: 3, day: 6, season: '春' },
  { name: '春分', month: 3, day: 21, season: '春' },
  { name: '清明', month: 4, day: 5, season: '春' },
  { name: '谷雨', month: 4, day: 20, season: '春' },
  { name: '立夏', month: 5, day: 6, season: '夏' },
  { name: '小满', month: 5, day: 21, season: '夏' },
  { name: '芒种', month: 6, day: 6, season: '夏' },
  { name: '夏至', month: 6, day: 21, season: '夏' },
  { name: '小暑', month: 7, day: 7, season: '夏' },
  { name: '大暑', month: 7, day: 23, season: '夏' },
  { name: '立秋', month: 8, day: 8, season: '秋' },
  { name: '处暑', month: 8, day: 23, season: '秋' },
  { name: '白露', month: 9, day: 8, season: '秋' },
  { name: '秋分', month: 9, day: 23, season: '秋' },
  { name: '寒露', month: 10, day: 8, season: '秋' },
  { name: '霜降', month: 10, day: 23, season: '秋' },
  { name: '立冬', month: 11, day: 7, season: '冬' },
  { name: '小雪', month: 11, day: 22, season: '冬' },
  { name: '大雪', month: 12, day: 7, season: '冬' },
  { name: '冬至', month: 12, day: 22, season: '冬' }
]);

/** 四季渐变端点色（文档 0.2.2 晨光渐变 / 7.8 四季版，仅换端点不换结构） */
const SEASON_THEMES = Object.freeze({
  春: { top: '#FAF7F0', mid: '#F5F1E6', bottom: '#EDF2EC' }, // 梨花白系
  夏: { top: '#F7F5F0', mid: '#EAF0EC', bottom: '#DCE8E2' }, // 青瓷系
  秋: { top: '#FBF6EA', mid: '#F5EDD8', bottom: '#EDDFC0' }, // 梨金系
  冬: { top: '#FDFBF5', mid: '#F7F0E0', bottom: '#EFE3CB' }  // 暖金系
});

const MUTED_THEME = Object.freeze({ top: '#F7F5F0', mid: '#F2EFE9', bottom: '#EDEAE3' }); // 白事素色

const TERM_GREETINGS = Object.freeze({
  清明: '梨花风起正清明，游子寻春半出城',
  冬至: '天时人事日相催，冬至阳生春又来',
  立春: '律回岁晚冰霜少，春到人间草木知',
  夏至: '昼晷已云极，宵漏自此长',
  秋分: '金气秋分，风清露冷秋期半',
  立秋: '一叶梧桐一报秋，稻花田里话丰收'
});
const SEASON_GREETINGS = Object.freeze({
  春: '春和景明，家风如缕，代代相承',
  夏: '夏木成荫，护佑满门，平安顺遂',
  秋: '秋收冬藏，家业绵长，人和家旺',
  冬: '岁暮天寒，围炉向暖，家风不熄'
});

async function main(params) {
  const { action } = params || {};
  switch (action) {
    case 'today':
      return await todayAtmosphere();
    default:
      return OK({ solarTerm: '', season: '', moodTheme: { ...SEASON_THEMES.冬 }, greeting: '', muted: false, festival: '', homeCards: [] });
  }
}

/** 今日氛围聚合（公开接口） */
async function todayAtmosphere() {
  const today = new Date();

  const term = findSolarTerm(today);
  const muted = await checkActiveFuneral();

  // 素色令牌覆盖节日令牌（蓝图 7.8 白事静默）
  const moodTheme = muted ? { ...MUTED_THEME } : { ...(SEASON_THEMES[term.season] || SEASON_THEMES.冬) };
  const greeting = muted
    ? '慎终追远，静默致哀'
    : (TERM_GREETINGS[term.name] || SEASON_GREETINGS[term.season] || '四季流转，家风永存');

  return OK({
    solarTerm: term.name,
    season: muted ? '' : term.season,
    moodTheme,
    greeting,
    muted,
    festival: '',          // 一期：传统节日随族议会年历更新
    homeCards: composeHomeCards(term, muted)
  });
}

/** 圆环匹配：取「起始日 ≤ 今日」的最近一个节气（1 月初回卷到冬至段） */
function findSolarTerm(date) {
  const code = (date.getMonth() + 1) * 100 + date.getDate();
  let hit = null;
  for (const t of SOLAR_TERMS) {
    const start = t.month * 100 + t.day;
    if (code >= start && (!hit || start > hit.month * 100 + hit.day)) hit = t;
  }
  if (!hit) hit = SOLAR_TERMS[SOLAR_TERMS.length - 1]; // 新年 1/1~1/5 → 冬至段
  return hit;
}

/** 白事静默：events 中存在 ACTIVE 讣告（蓝图 7.8） */
async function checkActiveFuneral() {
  try {
    const db = wx.getDatabase();
    const res = await db.collection('events').where({ status: 'ACTIVE', type: 'funeral' }).limit(1).get();
    return res.data.length > 0;
  } catch (e) {
    return false; // 查询异常不阻塞氛围下发
  }
}

/** 首页卡流占位：R14 接 notify.digest / 公告 / 仪式提醒（服务端配置驱动） */
function composeHomeCards(term, muted) {
  return [];
}

module.exports = { main, SOLAR_TERMS, resolveTerm: findSolarTerm };
