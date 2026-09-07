<!--
  pkg-home/pages/home/weather.vue — 天气详情页（蓝图 V1.1 §23.1 + V2.0）
  展示：当前天气（大字温度/状况/体感细节）、AQI 空气质量、
       7 日预报横滑卡、城市切换（手动）、缓存时间标注
  数据：weather.current + weather.forecast7 + weather.cities
-->
<template>
  <view class="wpage">
    <!-- 当前天气主卡 -->
    <view class="w-main" :class="bgClass">
      <text class="w-city" @click="showCityPicker">
        {{ cityName }} <text class="w-switch">切换 ▾</text>
      </text>
      <view class="w-temp-row">
        <text class="w-big-temp">{{ current?.temperature ?? '—' }}°</text>
        <text class="w-big-cond">{{ current?.condition || '加载中' }}</text>
      </view>
      <view class="w-detail-row">
        <text v-if="current?.wind">风：{{ current.wind }}</text>
        <text v-if="current?.humidity != null">湿度：{{ current.humidity }}%</text>
        <text v-if="current?.updated">更新于 {{ fmtTime(current.updated) }}</text>
      </view>
      <!-- AQI 空气质量条 -->
      <view v-if="current?.aqi != null" class="w-aqi" :class="aqiTone">
        <text class="w-aqi-label">空气质量</text>
        <text class="w-aqi-val">AQI {{ current.aqi }} · {{ aqiLevelText }}</text>
      </view>
    </view>

    <!-- 7 日预报 -->
    <view class="w-section">
      <text class="w-section-title">7 日预报</text>
      <scroll-view scroll-x class="w-f7-scroll" :show-scrollbar="false">
        <view v-for="(d, i) in forecast" :key="i" class="w-f7-card">
          <text class="w-f7-day">{{ d.weekday }}</text>
          <text class="w-f7-cond">{{ iconMap[d.condition] || '☀' }} {{ d.condition }}</text>
          <text class="w-f7-temp">{{ d.tempMax }}° / {{ d.tempMin }}°</text>
        </view>
        <view v-if="!forecast.length" class="w-empty-hint">预报加载中…</view>
      </scroll-view>
    </view>

    <!-- 城市选择弹层 -->
    <view v-if="showPicker" class="w-mask" @click="showPicker = false">
      <view class="w-picker" @click.stop>
        <text class="w-picker-title">选择城市</text>
        <scroll-view scroll-y class="w-city-list">
          <view
            v-for="c in cities"
            :key="c.id"
            class="w-city-item"
            :class="{ active: c.id === current?.city }"
            @click="chooseCity(c)"
          >
            <text>{{ c.name }}</text>
            <text v-if="c.parent" class="w-city-parent">{{ c.parent }}</text>
            <text v-if="c.id === current?.city" class="w-city-check">✓</text>
          </view>
        </scroll-view>
        <view class="w-picker-close" @click="showPicker = false">关闭</view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { currentWeather, forecast7Days, listCities, switchCity } from '@/services/weather';
import type { WeatherResult, ForecastDay, CityItem } from '@/services/weather';

const current = ref<WeatherResult | null>(null);
const forecast = ref<ForecastDay[]>([]);
const cities = ref<CityItem[]>([]);
const showPicker = ref(false);

const iconMap: Record<string, string> = {
  '晴':'☀','多云':'⛅','阴':'☁','小雨':'🌦','中雨':'🌧','大雨':'🌧',
  '雷阵雨':'⛈','雪':'❄','雾':'🌫','霾':'🌫','晴间多云':'🌤'
};

const cityName = computed(() => {
  if (current.value?.cityName) return current.value.cityName;
  const found = cities.value.find(c => c.id === current.value?.city);
  return found?.name || '自动定位';
});

// 主卡背景：按天气状况渐变（清新不俗，沿用青瓷/缃黄体系）
const bgClass = computed(() => {
  const c = current.value?.condition || '';
  if (c.includes('雨') || c.includes('雷')) return 'bg-rain';
  if (c.includes('雪')) return 'bg-snow';
  if (c.includes('阴') || c.includes('云')) return 'bg-cloudy';
  return 'bg-sunny';
});

const aqiTone = computed(() => {
  const a = current.value?.aqi ?? 0;
  if (a <= 50) return 'tone-good';
  if (a <= 100) return 'tone-fair';
  if (a <= 200) return 'tone-mild';
  return 'tone-poor';
});

const aqiLevelText = computed(() => {
  const a = current.value?.aqi ?? 0;
  if (a <= 50) return '优';
  if (a <= 100) return '良';
  if (a <= 200) return '轻度污染';
  return '中重度污染';
});

function fmtTime(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

onMounted(async () => {
  // 并行请求：当前天气 + 预报 + 城市清单（各带缓存，避免重复请求）
  const [wRes, fRes, cRes] = await Promise.all([
    currentWeather(),
    forecast7Days(),
    listCities()
  ]);
  if (wRes.data) current.value = wRes.data;
  if (fRes.data) forecast.value = fRes.data.list || [];
  if (cRes.data) cities.value = cRes.data.cities || [];
});

async function chooseCity(c: CityItem) {
  showPicker.value = false;
  // 乐观更新当前城市天气（后台切换后重新拉取）
  await switchCity(c.id, c.name);
  uni.showLoading({ title: '切换中' });
  const [wRes, fRes] = await Promise.all([currentWeather(c.id), forecast7Days(c.id)]);
  uni.hideLoading();
  if (wRes.data) current.value = wRes.data;
  if (fRes.data) forecast.value = fRes.data.list || [];
}
</script>

<style scoped>
.wpage { min-height: 100vh; background: #FAF8F2; padding: 16px; }

/* 当前天气主卡 */
.w-main { border-radius: 16px; padding: 24px 20px; color: #2B2723; box-shadow: 0 2px 12px rgba(38,34,30,0.06); }
.bg-sunny { background: linear-gradient(165deg, #FDF6E3 0%, #F5E9C8 100%); }
.bg-cloudy { background: linear-gradient(165deg, #EDF2EC 0%, #E2EAE7 100%); }
.bg-rain { background: linear-gradient(165deg, #E8EEF2 0%, #D7E2E8 100%); }
.bg-snow { background: linear-gradient(165deg, #F4F6F8 0%, #E6EDF1 100%); }

.w-city { font-size: 16px; font-weight: 700; }
.w-switch { font-size: 12px; font-weight: 400; color: #6E6659; margin-left: 4px; }
.w-temp-row { display: flex; align-items: baseline; gap: 12px; margin: 8px 0 4px; }
.w-big-temp { font-size: 56px; font-weight: 700; line-height: 1.1; }
.w-big-cond { font-size: 18px; }
.w-detail-row { display: flex; gap: 16px; flex-wrap: wrap; font-size: 12px; color: #6E6659; margin: 8px 0; }
.w-aqi { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; padding: 10px 12px; border-radius: 10px; font-size: 13px; }
.tone-good { background: #E8F5E9; color: #2E7D32; }
.tone-fair { background: #FFF8E1; color: #F57F17; }
.tone-mild { background: #FFF3E0; color: #E65100; }
.tone-poor { background: #FFEBEE; color: #C62828; }
.w-aqi-label { font-weight: 500; }
.w-aqi-val { font-weight: 700; }

/* 7 日预报 */
.w-section { margin-top: 16px; }
.w-section-title { font-size: 16px; font-weight: 700; display: block; margin-bottom: 8px; }
.w-f7-scroll { white-space: nowrap; }
.w-f7-card { display: inline-flex; flex-direction: column; gap: 6px; width: 120px; margin-right: 8px; padding: 12px; background: #FFF; border-radius: 12px; box-shadow: 0 2px 12px rgba(38,34,30,0.06); }
.w-f7-day { font-size: 13px; font-weight: 600; }
.w-f7-cond { font-size: 12px; color: #6E6659; }
.w-f7-temp { font-size: 13px; font-weight: 500; }
.w-empty-hint { padding: 24px 0; text-align: center; color: #999; font-size: 13px; }

/* 城市选择弹层 */
.w-mask { position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 99; display: flex; align-items: flex-end; }
.w-picker { width: 100%; background: #FFF; border-radius: 16px 16px 0 0; padding: 16px 16px calc(16px + env(safe-area-inset-bottom)); max-height: 70vh; display: flex; flex-direction: column; }
.w-picker-title { font-size: 16px; font-weight: 700; text-align: center; margin-bottom: 12px; }
.w-city-list { flex: 1; overflow-y: auto; }
.w-city-item { display: flex; align-items: center; gap: 8px; padding: 14px 4px; border-bottom: 1px solid #F0EDE4; font-size: 15px; }
.w-city-item.active { color: #B03A2E; font-weight: 700; }
.w-city-parent { font-size: 11px; color: #999; }
.w-city-check { margin-left: auto; color: #B03A2E; }
.w-picker-close { margin-top: 12px; text-align: center; padding: 12px; color: #6E6659; border-top: 1px solid #F0EDE4; }
</style>
