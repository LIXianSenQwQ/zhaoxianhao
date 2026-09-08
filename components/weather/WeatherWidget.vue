<!--
  components/weather/WeatherWidget.vue — 天气小组件（蓝图 V2.0 §23.1）
  展示：温度、天气状况图标、空气质量指数；首页问候区小件
  数据：weather.current(cityId) → { temperature, icon, condition, aqi, aqiLevel, cityName, updateAt }
-->
<template>
  <view class="ww" @click="$emit('detail')" v-if="data">
    <text class="ww-temp">{{ data.temperature }}°</text>
    <text class="ww-icon">{{ iconMap[data.condition] || '☀' }}</text>
    <text class="ww-aqi" :class="aqiClass">{{ data.aqi || '—' }}</text>
    <text class="ww-city">{{ cityLabel }}</text>
  </view>
  <view v-else class="ww loading">
    <text class="ww-temp">—°</text>
    <text class="ww-city">自动定位 · 点击查看详情</text>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { currentWeather } from '@/services/weather';

const props = defineProps<{ cityId?: string }>();
const emit = defineEmits<{ detail: [] }>();

const data = ref<any>(null);
let loadSeq = 0; // 竞态防护：仅采纳最后一次请求

// 云函数 weather.current 返回：{ city?, temperature, condition, aqi, ... }
const iconMap: Record<string, string> = {
  '晴':'☀','多云':'⛅','阴':'☁','小雨':'🌦','中雨':'🌧','大雨':'🌧','雷阵雨':'⛈',
  '雪':'❄','雾':'🌫','霾':'🌫','晴间多云':'🌤'
};

const cityLabel = computed(() => {
  if (data.value?.cityName) return data.value.cityName;
  if (data.value?.city && !/^\d+$/.test(String(data.value.city))) return data.value.city;
  return '自动';
});

const aqiClass = computed(() => {
  if (!data.value?.aqi) return '';
  if (data.value.aqi <= 50) return 'good';
  if (data.value.aqi <= 100) return 'fair';
  return 'poor';
});

async function load(cityId?: string) {
  const seq = ++loadSeq;
  const res = await currentWeather(cityId);
  if (seq !== loadSeq) return; // 已被更新的请求取代
  if (res.data) {
    data.value = res.data.data ?? res.data;
  }
}

onMounted(() => load(props.cityId));
// 城市切换时自动刷新（响应式 prop）
watch(() => props.cityId, (v) => { if (v !== undefined) load(v); });
</script>

<style scoped>
.ww{ display:flex; align-items:center; gap:6px; cursor:pointer; }
.loading{ opacity:0.6; }
.ww-temp{ font-size:18px; font-weight:700; color:#2B2723; }
.ww-icon{ font-size:18px; }
.ww-aqi{ font-size:11px; padding:2px 4px; border-radius:4px; background:#F0EFEA; color:#666; }
.ww-aqi.good{ background:#E8F5E9; color:#2E7D32; }
.ww-aqi.fair{ background:#FFF3E0; color:#E65100; }
.ww-aqi.poor{ background:#FFEBEE; color:#C62828; }
.ww-city{ font-size:12px; color:#6E6659; }
</style>