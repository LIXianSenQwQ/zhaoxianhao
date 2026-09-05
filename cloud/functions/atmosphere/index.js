/**
 * cloud/functions/atmosphere/index.js
 * MVP Core: 节气计算 + 氛围令牌下发 + 首页卡流聚合
 */
const wx = require('wx-server-sdk');
wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

// 24 节气数据表（每年复用，简化版）
const solarTerms = [
  { name: '立春', startMonth: 1, startDay: 4, endMonth: 2, endDay: 3 },
  { name: '雨水', startMonth: 2, startDay: 19, endMonth: 2, endDay: 18 },
  // ... 完整需 24 项
];

async function main(params, context) {
  const { action } = params;
  
  if (action === 'today') {
    return await todayAtmosphere();
  }
}

async function todayAtmososphere() {
  const today = new Date();
  
  // Step 1: 查找今日节气
  const currentTerm = findSolarTerm(today);
  
  // Step 2: 加载白事静默状态
  const hasMutedPeriod = await checkActiveFuneral(context.openid);
  
  // Step 3: 根据节气确定主题色
  const themeColors = getThemeColors(currentTerm?.name);
  
  // Step 4: 生成节气笺文案（预设库）
  const greetings = {
    '清明': '梨花风起正清明，游子寻春半出城',
    '冬至': '天时人事日相催，冬至阳生春又来',
    'default': '四季流转，家风永存'
  };
  
  // Step 5: 聚合首页卡片数据
  const homeCards = await composeHomeCards(
    currentTerm?.name, 
    hasMutedPeriod
  );
  
  return {
    solarTerm: currentTerm?.name || '',
    festival: '', // 扩展：传统节日
    moodTheme: hasMutedPeriod ? 'muted' : themeColors,
    greeting: greetings[currentTerm?.name] || greetings.default,
    homeCards,
    mutedPeriod: hasMutedPeriod
  };
}

function findSolarTerm(date) {
  for (const term of solarTerms) {
    if (date.getMonth() >= term.startMonth && date.getDate() >= term.startDay) {
      return { name: term.name, colors: getTermColors(term.name) };
    }
  }
  return null;
}

function getThemeColors(termName) {
  // 四季渐变端点色
  const palette = {
    '清明': { top: '#FAF7F0', mid: '#E8D5A3', bottom: '#7FA8A0' }, // 梨花白系
    '立秋': { top: '#D9A441', mid: '#C9A063', bottom: '#B8924F' }, // 梨金系
    'default': { top: '#FDFCF8', mid: '#F5F1E6', bottom: '#EDF2EC' } // 晨光系
  };
  return palette[termName]?.top || palette.default;
}

async function checkActiveFuneral(openid) {
  // 检查是否有 ACTIVE 状态的讣告
  const db = wx.getDatabase();
  const res = await db.collection('events')
    .where({ status: 'ACTIVE', type: 'funeral' }).get();
  return res.data.length > 0;
}

async function composeHomeCards(term, muted) {
  // 返回优先级排序的今日要事
  return [];
}

module.exports = { main };
