/**
 * cloud/functions/weather/index.js
 * V1.1 E3: 和风天气查询 + 城市切换 + 3h 缓存
 * TODO: 真实环境配置 API_KEY（和风天气开发者平台申请）
 */

const wx = require('wx-server-sdk');
const { OK, BAD_REQUEST } = require('./common/response');

wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

const CACHE_DURATION_MS = 3 * 60 * 60 * 1000; // 3h
const HOT_CITIES_CACHE = {}; // { cityId: { data, ttl } }

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

  const mockData = {
    city: cityId,
    temperature: Math.floor(20 + Math.random() * 15),
    condition: ['晴', '多云', '阴'][Math.floor(Math.random() * 3)],
    aqi: Math.floor(40 + Math.random() * 60),
    updated: new Date().toISOString()
  };

  HOT_CITIES_CACHE[cityId] = {
    data: mockData,
    ttl: Date.now() + CACHE_DURATION_MS
  };
  return mockData;
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
    case 'switchCity':
      if (!params.cityId || !params.cityName) {
        return BAD_REQUEST('cityId and cityName required');
      }
      return await switchCity(userId, params.cityId, params.cityName);
    default:
      return BAD_REQUEST(`unknown action: ${action}`);
  }
}};
