<!-- pkg-calendar/pages/calendar/calendar.vue – 家族日历（Sprint R13：蓝图 calendar/index，月视图+农历+节气，接 atmosphere.today；老皇历切换 V1.1 v11Almanac 开关） -->
<template>
  <view class="calendar-page">
    <!-- 节气笺头部（蓝图 0.2.2 晨光渐变：moodTheme 端点色动态替换，结构不变） -->
    <view class="header" :style="{ background: headerBg }">
      <view class="term-row">
        <text class="term-name">{{ term }}</text>
        <text v-if="muted" class="term-muted">静默期</text>
      </view>
      <text class="term-greeting">{{ greeting }}</text>
    </view>

    <!-- 月视图（8px 网格，今日朱砂描边，选中填充） -->
    <view class="calendar-card">
      <view class="month-bar">
        <view class="month-nav" @click="changeMonth(-1)"><text>‹</text></view>
        <text class="month-title">{{ year }} 年 {{ month + 1 }} 月</text>
        <view class="month-nav" @click="changeMonth(1)"><text>›</text></view>
      </view>
      <view class="week-row">
        <text v-for="w in WEEKS" :key="w" class="week-cell">{{ w }}</text>
      </view>
      <view class="grid">
        <view
          v-for="(cell, i) in cells"
          :key="i"
          class="day-cell"
          :class="{ blank: !cell.day, today: cell.isToday, selected: cell.isSelected }"
          @click="cell.day && selectDay(cell)"
        >
          <text class="day-num">{{ cell.day || '' }}</text>
        </view>
      </view>
    </view>

    <!-- 选中日期详情（农历/宜忌走 V1.1 calendar.almanac，开关 v11Almanac） -->
    <view class="detail-card">
      <template v-if="selectedStr">
        <text class="detail-title">{{ selectedStr }}</text>
        <text class="detail-sub">{{ weekdayOf(selectedStr) }}</text>
        <view class="detail-hint">
          <text>农历与宜忌（老皇历）随 V1.1 上线，本页与日历组件无缝切换</text>
        </view>
      </template>
      <template v-else>
        <text class="detail-empty">点选日期查看详情</text>
      </template>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { read } from '@/services/request';

const WEEKS = ['一', '二', '三', '四', '五', '六', '日'];

const today = new Date();
const year = ref(today.getFullYear());
const month = ref(today.getMonth());
const selectedStr = ref('');
const term = ref('');
const greeting = ref('');
const muted = ref(false);
const theme = ref<{ top: string; mid: string; bottom: string } | null>(null);

/** 晨光渐变端点色由 atmosphere.moodTheme 下发（蓝图 0.6.1：只换端点，不重绘结构） */
const headerBg = computed(() => {
  const t = theme.value || { top: '#FDFCF8', mid: '#F5F1E6', bottom: '#EDF2EC' };
  return `linear-gradient(165deg, ${t.top} 0%, ${t.mid} 45%, ${t.bottom} 100%)`;
});

interface DayCell { day: number; dateStr: string; isToday: boolean; isSelected: boolean }

function pad(n: number) { return String(n).padStart(2, '0'); }
function dateStrOf(y: number, m: number, d: number) { return `${y}-${pad(m + 1)}-${pad(d)}`; }
function weekdayOf(s: string) {
  const d = new Date(`${s}T12:00:00`);
  return isNaN(d.getTime()) ? '' : `星期${WEEKS[(d.getDay() + 6) % 7]}`;
}

const cells = computed<DayCell[]>(() => {
  const y = year.value, m = month.value;
  const first = new Date(y, m, 1);
  const offset = (first.getDay() + 6) % 7; // 周一为首
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const list: DayCell[] = [];
  for (let i = 0; i < offset; i++) {
    list.push({ day: 0, dateStr: '', isToday: false, isSelected: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = dateStrOf(y, m, d);
    list.push({
      day: d,
      dateStr: ds,
      isToday: ds === `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`,
      isSelected: ds === selectedStr.value
    });
  }
  while (list.length % 7 !== 0) {
    list.push({ day: 0, dateStr: '', isToday: false, isSelected: false });
  }
  return list;
});

function changeMonth(delta: number) {
  const next = new Date(year.value, month.value + delta, 1);
  year.value = next.getFullYear();
  month.value = next.getMonth();
}

function selectDay(cell: DayCell) {
  selectedStr.value = cell.dateStr;
}

/** 氛围缓存优先渲染（蓝图 0.6.3：atmosphere.today 缓存 10 分钟静默刷新） */
read('atmosphere', { action: 'today' }, 'atmosphere.today', 600000).then(res => {
  if (res.success && res.data) {
    term.value = res.data.solarTerm || '';
    greeting.value = res.data.greeting || '';
    muted.value = !!res.data.muted;
    if (res.data.moodTheme && res.data.moodTheme.top) theme.value = res.data.moodTheme;
  }
});
</script>

<style scoped>
.calendar-page { min-height: 100vh; background: #F7F6F3; display: flex; flex-direction: column; }

.header { padding: 24px 16px 20px; }
.term-row { display: flex; align-items: center; gap: 8px; }
.term-name { font-size: 24px; font-weight: 700; color: #2B2723; }
.term-muted { font-size: 11px; color: #6E6659; background: #F0EEE8; border-radius: 4px; padding: 2px 6px; }
.term-greeting { font-size: 14px; color: #6E6659; margin-top: 6px; display: block; }

.calendar-card { margin: 12px 16px 0; background: #FFFFFF; border-radius: 12px; padding: 12px; box-shadow: 0 2px 12px rgba(38, 34, 30, 0.06); }
.month-bar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.month-nav { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 8px; background: #F7F6F3; }
.month-nav text { font-size: 18px; color: #6E6659; }
.month-title { font-size: 16px; font-weight: 600; color: #2B2723; }
.week-row { display: flex; }
.week-cell { flex: 1; text-align: center; font-size: 12px; color: #B0A99A; padding: 6px 0; }
.grid { display: flex; flex-wrap: wrap; }
.day-cell { width: calc(100% / 7); height: 44px; display: flex; align-items: center; justify-content: center; box-sizing: border-box; }
.day-num { font-size: 14px; color: #2B2723; width: 32px; height: 32px; line-height: 32px; text-align: center; border-radius: 50%; }
.day-cell.today .day-num { border: 1.5px solid #B03A2E; color: #B03A2E; font-weight: 700; }
.day-cell.selected .day-num { background: #B03A2E; color: #FFFFFF; }

.detail-card { margin: 12px 16px 16px; background: #FFFFFF; border-radius: 12px; padding: 14px; box-shadow: 0 2px 12px rgba(38, 34, 30, 0.06); display: flex; flex-direction: column; gap: 4px; }
.detail-title { font-size: 16px; font-weight: 600; color: #2B2723; }
.detail-sub { font-size: 13px; color: #6E6659; }
.detail-hint { margin-top: 8px; background: #F7F1E3; border-radius: 8px; padding: 8px 10px; }
.detail-hint text { font-size: 12px; color: #8A7B5A; }
.detail-empty { font-size: 13px; color: #B0A99A; text-align: center; padding: 8px 0; }
</style>
