/**
 * cloud/functions/weather/index.js
 * V1.1 E3: 和风天气查询 + 城市切换 + 3h 缓存
 * V2.0 扩展: forecast7（7日预报）/ cities（可切换城市列表）
 * TODO: 真实环境配置 API_KEY（和风天气开发者平台申请）
 */

const wx = require('wx-server-sdk');
const { OK, BAD_REQUEST } = require('./common/response');

wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

const CACHE_DURATION_MS = 3 * 60 * 60 * 1000; // 3h
const HOT_CITIES_CACHE = {}; // { cityId: { data, ttl } }

/** 可切换城市清单（常用，mock；真实接入后可按省市区检索） */
const SUPPORTED_CITIES = [
  { id: '101010100', name: '北京' },
  { id: '101020100', name: '上海' },
  { id: '101030100', name: '天津' },
  { id: '101040100', name: '重庆' },
  { id: '101090101', name: '石家庄' },
  { id: '101091001', name: '邢台' },
  { id: '101090501', name: '邯郸' },
  { id: '101090201', name: '保定' },
  { id: '101090102', name: '赵县', parent: '石家庄' }, // 蓝本属地优先
  { id: '101280101', name: '广州' },
  { id: '101280601', name: '深圳' },
  { id: '101110101', name: '西安' },
  { id: '101210101', name: '杭州' },
  { id: '101190101', name: '南京' },
  { id: '101270101', name: '成都' },
  { id: '101230201', name: '厦门' },
  { id: '101180101', name: '郑州' },
  { id: '101120101', name: '济南' },
  { id: '101160101', name: '兰州' },
  { id: '101240101', name: '南昌' }
];

/**
 * R22: 查询当前天气（从缓存或 API）
 * 入参：{ cityId? } - 不传则用默认城市（北京）
 */
async function getCurrentWeather(cityId = '101010100') { // default 北京
  const cached = HOT_CITIES_CACHE[cityId];
  if (cached && Date.now() < cached.ttl) {
    return cached.data;
  }

  // 真实 API 占位（和风天气 https://dev.heweather.com/)
  // const res = await wx.cloud.callFunction({
  //   name: 'http',
  //   data: { url: `https://devapi.qweather.com/v7/weather/3d?location=${cityId}&key=${API_KEY}` }
  // });

  const cityInfo = SUPPORTED_CITIES.find(c => c.id === cityId) || { name: cityId };
  const mockData = {
    city: cityId,
    cityName: cityInfo.name || cityId,
    temperature: Math.floor(20 + Math.random() * 15),
    condition: ['晴', '多云', '阴', '小雨'][Math.floor(Math.random() * 4)],
    wind: ['东北风 2级', '东南风 3级', '西北风 4级'][Math.floor(Math.random() * 3)],
    humidity: Math.floor(40 + Math.random() * 40),
    aqi: Math.floor(40 + Math.random() * 60),
    aqiLevel: '良',
    updated: new Date().toISOString()
  };

  HOT_CITIES_CACHE[cityId] = {
    data: mockData,
    ttl: Date.now() + CACHE_DURATION_MS
  };
  return mockData;
}

/**
 * V2.0: 7 日预报（mock，基于当前天气叠加日差）
 * 入参：{ cityId? }
 */
async function getForecast7(cityId = '101010100') {
  const today = await getCurrentWeather(cityId);
  const days = ['今天', '明天', '后天'];
  const week = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  const base = new Date();
  const conds = ['晴', '多云', '阴', '小雨', '雷阵雨'];

  const list = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(base.getTime() + i * 86400000);
    const dayDelta = Math.floor(Math.random() * 3);
    list.push({
      date: `${d.getMonth() + 1}月${d.getDate()}日`,
      weekday: i === 0 ? '今天' : week[d.getDay()],
      tempMax: today.temperature + dayDelta + Math.floor(Math.random() * 3),
      tempMin: today.temperature - 8 + Math.floor(Math.random() * 3),
      condition: conds[Math.floor(Math.random() * conds.length)]
    });
  }
  return { city: cityId, cityName: today.cityName, list, updated: new Date().toISOString() };
}

/**
 * R22: 切换城市并缓存
 */
async function switchCity(userId, cityId, cityName) {
  // 写入 users.weatherCityId
  const db = wx.getDatabase();
  const now = new Date();

  await db.collection('users').where({ openid: userId }).update({
    data: {
      weatherCityId: cityId,
      weatherCityName: cityName,
      weatherUpdatedAt: now
    }
  });

  // 预加载该城市天气到缓存
  await getCurrentWeather(cityId);

  return OK({ cityId, cityName, updated: now });
}

module.exports = { main: async (params, context) => {
  const { action } = params || {};
  const userId = context.openid;
  const ctx = { OPENID: context.OPENID || context.openid, openid: context.openid };
  
  switch (action) {
    case 'current':
      const weather = await getCurrentWeather(params.cityId);
      return OK(weather);
    case 'forecast7':
      const f7 = await getForecast7(params.cityId);
      return OK(f7);
    case 'cities':
      return OK({ cities: SUPPORTED_CITIES });
    case 'switchCity':
      if (!params.cityId || !params.cityName) {
        return BAD_REQUEST('cityId and cityName required');
      }
      return await switchCity(userId, params.cityId, params.cityName);
    default:
      return BAD_REQUEST(`unknown action: ${action}`);
  }
}};
