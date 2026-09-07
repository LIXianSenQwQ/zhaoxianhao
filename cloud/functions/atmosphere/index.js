/**
 * cloud/functions/atmosphere/index.js
 * Sprint R13 大修（蓝图 0.2 / 0.6 / 7.8 对齐）：节气氛围引擎 today 聚合
 * F12-F13 §7.8 P1 收口：24 节气逐节气全量端点色板 + 节日 festival 字段（公历节日 + 节气即节日 + 族议会年历扩展）
 *
 * 修复（原遗留桩不可运行缺陷）：
 *   - todayAtmososphere 与 todayAtmosphere 拼写不一致 → today 必崩 ReferenceError
 *   - context.openid 越界引用（todayAtmosphere 内无 context 形参）
 *   - 节气表仅 2 项 / findSolarTerm 月份未减一且无区间上限
 *   - getThemeColors 仅返回 top 单值、moodTheme 类型混乱（字符串 vs 对象）
 *   - 裸返回无统一响应格式
 *
 * 定案（蓝图 7.8）：
 *   - 内置 24 节气年度近似表（每年更新一次，不依赖第三方）；每节气带专属端点色板 palette 与节气笺 greeting
 *   - 返回 {solarTerm, season, moodTheme(端点色), greeting(节气笺), muted, festival, homeCards}
 *   - 白事静默：events 存在 ACTIVE 讣告 → 素色端点 + muted=true（素色令牌覆盖节气/节日令牌）
 *   - 节日解析：settings.festivalCalendar（族议会年历）优先 → 内置公历节日 → 节气即节日（清明）
 *   - atmosphere.today 公开接口（蓝图 9.1），无门禁
 */
const wx = require('wx-server-sdk');
const { OK } = require('./common/response');
const { buildHomeCards } = require('./common/homecards');

wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

/**
 * 24 节气年度近似起始表（公历近似值；族议会每年校准一次）
 * 每节气携带独立端点色板 palette（§7.8 全量端点色板：浅底暖系为主，相邻节气色阶微移）
 */
const SOLAR_TERMS = Object.freeze([
  { name: '小寒', month: 1, day: 6, season: '冬', palette: { top: '#FBFBF9', mid: '#F1F2EC', bottom: '#E2E6DC' } },   // 瓦白清寒
  { name: '大寒', month: 1, day: 20, season: '冬', palette: { top: '#FDFBF6', mid: '#F6F0E4', bottom: '#E9E0CC' } }, // 岁末暖白
  { name: '立春', month: 2, day: 4, season: '春', palette: { top: '#FBFBF6', mid: '#F1F6EE', bottom: '#DDEBE0' } },   // 新柳初绿
  { name: '雨水', month: 2, day: 19, season: '春', palette: { top: '#FAFBF7', mid: '#EEF4EE', bottom: '#D8E7E3' } }, // 雨润青瓷
  { name: '惊蛰', month: 3, day: 6, season: '春', palette: { top: '#FBF9F2', mid: '#F0F3E3', bottom: '#DCE9CF' } },   // 惊蛰新绿
  { name: '春分', month: 3, day: 21, season: '春', palette: { top: '#FDF6F1', mid: '#F6E9E0', bottom: '#EFD9CE' } }, // 桃夭淡粉
  { name: '清明', month: 4, day: 5, season: '春', palette: { top: '#FAF8F1', mid: '#EFF4EF', bottom: '#DCEAE2' } },   // 梨花青（清思）
  { name: '谷雨', month: 4, day: 20, season: '春', palette: { top: '#FBFDF8', mid: '#EAF3E8', bottom: '#D4E7DA' } }, // 谷雨润泽
  { name: '立夏', month: 5, day: 6, season: '夏', palette: { top: '#FBFBF4', mid: '#EFF6EA', bottom: '#DCEBDD' } },   // 夏木初荫
  { name: '小满', month: 5, day: 21, season: '夏', palette: { top: '#FCFBF2', mid: '#F2F5DF', bottom: '#E2EBC2' } }, // 麦浪青黄
  { name: '芒种', month: 6, day: 6, season: '夏', palette: { top: '#FBF9EC', mid: '#F1F0D6', bottom: '#E2E6B4' } },   // 梅子黄淡
  { name: '夏至', month: 6, day: 21, season: '夏', palette: { top: '#FAF6F1', mid: '#F2EBDD', bottom: '#E9DBC4' } }, // 荷香暖白
  { name: '小暑', month: 7, day: 7, season: '夏', palette: { top: '#FAFBF8', mid: '#EBF4EE', bottom: '#D5E8DF' } },   // 清暑竹青
  { name: '大暑', month: 7, day: 23, season: '夏', palette: { top: '#FCFAF3', mid: '#F3F0E2', bottom: '#E6E3C9' } }, // 暑气金白
  { name: '立秋', month: 8, day: 8, season: '秋', palette: { top: '#FDFBF3', mid: '#F7EFD9', bottom: '#EFDFB4' } },   // 早稻金
  { name: '处暑', month: 8, day: 23, season: '秋', palette: { top: '#FBF9F0', mid: '#F5ECD3', bottom: '#E8DBB0' } }, // 禾熟暖
  { name: '白露', month: 9, day: 8, season: '秋', palette: { top: '#FBF8EF', mid: '#F4EBD8', bottom: '#E5D6B0' } },   // 白露金
  { name: '秋分', month: 9, day: 23, season: '秋', palette: { top: '#FDF8E8', mid: '#F6E8C4', bottom: '#EACF8E' } }, // 金桂
  { name: '寒露', month: 10, day: 8, season: '秋', palette: { top: '#FCF6EA', mid: '#F3E6CE', bottom: '#E4CCA6' } }, // 菊黄淡
  { name: '霜降', month: 10, day: 23, season: '秋', palette: { top: '#FBF3E6', mid: '#F0E0C6', bottom: '#DCC49E' } },// 霜柿杏
  { name: '立冬', month: 11, day: 7, season: '冬', palette: { top: '#FCF9F1', mid: '#F5EEDC', bottom: '#EAE0C6' } }, // 初冬暖
  { name: '小雪', month: 11, day: 22, season: '冬', palette: { top: '#FBF8F2', mid: '#F4EDE2', bottom: '#E7DCCB' } },// 雪前暖白
  { name: '大雪', month: 12, day: 7, season: '冬', palette: { top: '#FDFCF8', mid: '#F6F1E8', bottom: '#EBE4D6' } }, // 雪光
  { name: '冬至', month: 12, day: 22, season: '冬', palette: { top: '#FDFAF2', mid: '#F7EFDD', bottom: '#EDE0C2' } } // 阳生暖金
]);

const MUTED_THEME = Object.freeze({ top: '#F7F5F0', mid: '#F2EFE9', bottom: '#EDEAE3' }); // 白事素色

/** 全量 24 节气笺（§7.8：由 6 条扩展为 24 条，每节气一条） */
const TERM_GREETINGS = Object.freeze({
  小寒: '小寒连大吕，欢鹊垒新巢',
  大寒: '岁晏大寒至，阳回春可期',
  立春: '律回岁晚冰霜少，春到人间草木知',
  雨水: '好雨知时节，润物细无声',
  惊蛰: '微雨众卉新，一雷惊蛰始',
  春分: '昼夜均而寒暑平，玄鸟至',
  清明: '梨花风起正清明，游子寻春半出城',
  谷雨: '雨生百谷，春色将阑',
  立夏: '槐柳阴初密，帘栊暑尚微',
  小满: '物致于此，小得盈满',
  芒种: '时雨及芒种，四野皆插秧',
  夏至: '昼晷已云极，宵漏自此长',
  小暑: '倏忽温风至，因循小暑来',
  大暑: '赤日几时过，清风无处寻',
  立秋: '一叶梧桐一报秋，稻花田里话丰收',
  处暑: '离离暑云散，袅袅凉风起',
  白露: '露从今夜白，月是故乡明',
  秋分: '金气秋分，风清露冷秋期半',
  寒露: '萧疏桐叶上，月白露初团',
  霜降: '霜降水返壑，风落木归山',
  立冬: '天水清相入，秋冬气始交',
  小雪: '莫怪虹无影，如今小雪时',
  大雪: '夜深知雪重，时闻折竹声',
  冬至: '天时人事日相催，冬至阳生春又来'
});
const SEASON_GREETINGS = Object.freeze({
  春: '春和景明，家风如缕，代代相承',
  夏: '夏木成荫，护佑满门，平安顺遂',
  秋: '秋收冬藏，家业绵长，人和家旺',
  冬: '岁暮天寒，围炉向暖，家风不熄'
});

/**
 * 内置公历节日（族议会年历 settings.festivalCalendar 可覆盖/追加）
 * 农历传统节日（春节/元宵/端午/中秋/重阳等）随族议会年历下发（需农历换算，服务端不内置近似）
 */
const SOLAR_FESTIVALS = Object.freeze([
  { month: 1, day: 1, name: '元旦' },
  { month: 3, day: 8, name: '妇女节' },
  { month: 5, day: 1, name: '劳动节' },
  { month: 5, day: 4, name: '青年节' },
  { month: 6, day: 1, name: '儿童节' },
  { month: 7, day: 1, name: '建党节' },
  { month: 8, day: 1, name: '建军节' },
  { month: 9, day: 10, name: '教师节' },
  { month: 10, day: 1, name: '国庆节' }
]);

async function main(params, context) {
  const { action } = params || {};
  switch (action) {
    case 'today':
      return await todayAtmosphere(context);
    default:
      return OK({ solarTerm: '', season: '', moodTheme: { ...SOLAR_TERMS[SOLAR_TERMS.length - 1].palette }, greeting: '', muted: false, festival: '', homeCards: [] });
  }
}

/** 今日氛围聚合（公开接口；携带 openid 时下发个性化首页卡流，匿名走祖训兜底） */
async function todayAtmosphere(context) {
  const openid = (context && (context.OPENID || context.openid)) || '';
  const db = wx.getDatabase();
  const today = new Date();

  const term = findSolarTerm(today);
  const muted = await checkActiveFuneral();

  // 素色令牌覆盖节气/节日令牌（蓝图 7.8 白事静默）
  const moodTheme = muted ? { ...MUTED_THEME } : { ...(term.palette || {}) };
  const greeting = muted
    ? '慎终追远，静默致哀'
    : (TERM_GREETINGS[term.name] || SEASON_GREETINGS[term.season] || '四季流转，家风永存');

  // 节日解析：族议会年历优先 → 内置公历节日 → 节气即节日（清明）；静默期不下发节日
  const festival = muted ? '' : await resolveFestivalOf(today, term.name, db);

  // 首页卡流（蓝图 0.3.2）：与 notify.digest 同口径（common/homecards）；
  // 失败降级祖训兜底卡，不阻塞氛围下发
  let homeCards = [];
  try {
    homeCards = await buildHomeCards(db, openid);
  } catch (e) {
    console.warn('[atmosphere] homeCards fallback:', e.message);
    homeCards = [{ type: 'motto', id: 'daily-motto', title: '祖训今日', desc: '敬宗睦族，诗礼传家' }];
  }

  return OK({
    solarTerm: term.name,
    season: muted ? '' : term.season,
    moodTheme,
    greeting,
    muted,
    festival,
    homeCards
  });
}

/** 节日解析（纯函数，可单测）：族议会年历 custom 优先，其次内置公历节日，最后节气即节日（清明） */
function resolveFestival(date, termName, customList) {
  const code = (date.getMonth() + 1) * 100 + date.getDate();
  const list = Array.isArray(customList) && customList.length ? customList : SOLAR_FESTIVALS;
  for (const f of list) {
    if (f && f.month && f.day && code === f.month * 100 + f.day) return f.name;
  }
  if (termName === '清明') return '清明节'; // 节气即节日（寒食/清明）
  return '';
}

/** 读取 settings.festivalCalendar（族议会年历，数组 [{month, day, name}]），失败回退内置表 */
async function resolveFestivalOf(date, termName, db) {
  try {
    const res = await db.collection('settings').where({ key: 'festivalCalendar' }).limit(1).get();
    if (res.data && res.data.length) {
      let list = res.data[0].value;
      if (typeof list === 'string') { // 兼容 JSON 字符串存储
        try { list = JSON.parse(list); } catch (e) { list = null; }
      }
      if (Array.isArray(list)) return resolveFestival(date, termName, list);
    }
  } catch (e) {
    // settings 读取异常不阻塞氛围下发
  }
  return resolveFestival(date, termName);
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

module.exports = { main, SOLAR_TERMS, TERM_GREETINGS, resolveTerm: findSolarTerm, resolveFestival };
