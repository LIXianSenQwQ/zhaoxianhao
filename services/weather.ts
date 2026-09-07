/**
 * services/weather.ts — 天气服务封装（蓝图 V1.1 E3 + V2.0 详情页）
 * 对应云函数：weather.current / forecast7 / cities / switchCity（和风天气 API 代理，mock 占位）
 */

import { call, write } from './request';

export interface WeatherResult {
  city: string; // 城市 ID（如 101010100）
  cityName?: string; // 城市名
  temperature: number; // 温度（℃）
  condition: string; // 天气状况：晴/雨/雪等
  wind?: string; // 风向/风力
  humidity?: number; // 湿度%
  aqi?: number; // 空气质量指数
  aqiLevel?: string; // 质量等级：优/良/轻污染...
  updated?: string; // 更新时间 ISO
}

export interface ForecastDay {
  date: string; // MM月DD日
  weekday: string; // 今天/周一...
  tempMax: number;
  tempMin: number;
  condition: string;
}

export interface CityItem {
  id: string;
  name: string;
  parent?: string;
}

// ─── 查询类（读路径，缓存优先） ───

/**
 * 获取当前城市天气（自动定位优先，可手动切换城市）
 * @param cityId 城市 ID（选填，默认 IP 自动定位或上次选择）
 */
export async function currentWeather(cityId?: string, cacheKey?: string) {
  return call<WeatherResult>(
    'weather',
    { action: 'current', cityId },
    { cacheKey: cacheKey || `weather:${cityId || 'ip'}:current`, cacheTTL: 3 * 60 * 60 * 1000 } // 3h
  );
}

/**
 * 获取未来 7 日预报
 * @param cityId 城市 ID
 */
export async function forecast7Days(cityId?: string) {
  return call<{ city: string; cityName?: string; list: ForecastDay[] }>(
    'weather',
    { action: 'forecast7', cityId },
    { cacheKey: `weather:${cityId || 'ip'}:forecast7`, cacheTTL: 3 * 60 * 60 * 1000 }
  );
}

/**
 * 获取可切换城市清单
 */
export async function listCities() {
  return call<{ cities: CityItem[] }>(
    'weather',
    { action: 'cities' },
    { cacheKey: 'weather:cities', cacheTTL: 24 * 60 * 60 * 1000 } // 1 天
  );
}

// ─── 写操作（幂等） ───

/**
 * 切换偏好城市（users.weatherCityId 落库）
 * @param cityId 城市 ID
 * @param cityName 城市名
 */
export async function switchCity(cityId: string, cityName: string) {
  return write('weather', { action: 'switchCity', cityId, cityName }, 'weather', `switch_${cityId}`);
}
