<!-- pkg-calendar/pages/calendar/calendar.vue – 家族日历（Sprint R13：蓝图 calendar/index，月视图+农历+节气，接 atmosphere.today；老皇历切换 V1.1 v11Almanac 开关） -->
<template>
  <view class="calendar-page">
    <!-- 节气笺头部（蓝图 0.2.2 晨光渐变：moodTheme 端点色动态替换，结构不变） -->
    <view class="header" :style="{ background: headerBg }">
      <view class="term-row">
        <text class="term-name">{{ term }}</text>
        <text v-if="festival && !muted" class="term-festival">{{ festival }}</text>
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

    <!-- 选中日期详情（公历 / 老皇历 无缝切换 · V1.1 calendar.almanac） -->
    <view class="detail-card">
      <template v-if="selectedStr">
        <!-- 分段控件 -->
        <view class="seg">
          <view class="seg-item" :class="{ active: !almanacMode }" @click="almanacMode = false"><text>公历</text></view>
          <view class="seg-item" :class="{ active: almanacMode }" @click="switchAlmanac(true)"><text>老皇历</text></view>
        </view>

        <!-- 公历视图 -->
        <template v-if="!almanacMode">
          <text class="detail-title">{{ selectedStr }}</text>
          <text class="detail-sub">{{ weekdayOf(selectedStr) }}</text>
        </template>

        <!-- 老皇历视图 -->
        <template v-else>
          <text class="detail-title">{{ selectedStr }} · {{ weekdayOf(selectedStr) }}</text>
          <view v-if="almanacLoading" class="almanac-row"><text class="almanac-loading">推算中…</text></view>
          <view v-else-if="almanac" class="almanac-block">
            <view class="almanac-row"><text class="almanac-key">干支</text><text class="almanac-val">{{ almanac.ganzhi?.year }}年 {{ almanac.ganzhi?.month }}月 {{ almanac.ganzhi?.day }}日</text></view>
            <view class="almanac-row"><text class="almanac-key">生肖</text><text class="almanac-val">{{ almanac.zodiac }}</text></view>
            <view class="almanac-row"><text class="almanac-key">节气</text><text class="almanac-val">{{ almanac.solarTerm || '—' }}</text></view>
            <view v-if="almanac.termsOfMonth?.length" class="almanac-row"><text class="almanac-key">本月节气</text><text class="almanac-val">{{ almanac.termsOfMonth.join(' · ') }}</text></view>
            <view class="almanac-row"><text class="almanac-key">宜</text><text class="almanac-val yi">{{ (almanac.yi || []).join('、') || '—' }}</text></view>
            <view class="almanac-row"><text class="almanac-key">忌</text><text class="almanac-val ji">{{ (almanac.ji || []).join('、') || '—' }}</text></view>
            <view v-if="almanac.lunar?.source === 'lunar-placeholder'" class="almanac-foot">
              <text>农历详情随 lunar-javascript 接入后展示</text>
            </view>
          </view>
          <view v-else class="almanac-row"><text class="almanac-loading">暂无数据</text></view>
        </template>
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
const festival = ref('');
const muted = ref(false);
const theme = ref<{ top: string; mid: string; bottom: string } | null>(null);
// R24: 老皇历切换
const almanacMode = ref(false);
const almanac = ref<any>(null);
const almanacLoading = ref(false);

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
  if (almanacMode.value) loadAlmanac(cell.dateStr);
}

/** R24: 切换到老皇历并加载选中日 almanac */
function switchAlmanac(on: boolean) {
  almanacMode.value = on;
  if (on && selectedStr.value) loadAlmanac(selectedStr.value);
}

/** R24: 拉取老皇历数据（calendar.almanac，无本地缓存，轻量 ≤200ms） */
async function loadAlmanac(dateStr: string) {
  almanacLoading.value = true;
  almanac.value = null;
  try {
    const res = await read('calendar', { action: 'almanac', date: dateStr }, '', 0);
    // align with request.ts CallResult: no success field, data = body.data (already unpacked)
    const payload = res.data?.data ?? res.data;
    if (payload) almanac.value = payload;
  } catch (e) {
    almanac.value = null;
  } finally {
    almanacLoading.value = false;
  }
}

/** 氛围缓存优先渲染（蓝图 0.6.3：atmosphere.today 缓存 10 分钟静默刷新） */
read('atmosphere', { action: 'today' }, 'atmosphere.today', 600000).then(res => {
  // align with request.ts CallResult: no success field, data = body.data (already unpacked)
  const t = res.data?.data ?? res.data;
  if (t) {
    term.value = t.solarTerm || '';
    greeting.value = t.greeting || '';
    muted.value = !!t.muted;
    festival.value = t.festival || '';
    if (t.moodTheme && t.moodTheme.top) theme.value = t.moodTheme;
  }
});
</script>

<style scoped>
.calendar-page { min-height: 100vh; background: #F7F6F3; display: flex; flex-direction: column; }

.header { padding: 24px 16px 20px; }
.term-row { display: flex; align-items: center; gap: 8px; }
.term-name { font-size: 24px; font-weight: 700; color: #2B2723; }
.term-muted { font-size: 11px; color: #6E6659; background: #F0EEE8; border-radius: 4px; padding: 2px 6px; }
.term-festival { font-size: 11px; color: #7A4A2B; background: #F6E9DC; border-radius: 4px; padding: 2px 6px; }
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

.detail-card { margin: 12px 16px 16px; background: #FFFFFF; border-radius: 12px; padding: 14px; box-shadow: 0 2px 12px rgba(38, 34, 30, 0.06); display: flex; flex-direction: column; gap: 6px; }
.detail-title { font-size: 16px; font-weight: 600; color: #2B2723; }
.detail-sub { font-size: 13px; color: #6E6659; }
.detail-empty { font-size: 13px; color: #B0A99A; text-align: center; padding: 8px 0; }

/* R24: 老皇历分段控件 + almanac 面板 */
.seg { display: flex; background: #F7F6F3; border-radius: 8px; padding: 2px; margin-bottom: 6px; }
.seg-item { flex: 1; text-align: center; padding: 6px 0; border-radius: 6px; }
.seg-item text { font-size: 13px; color: #8A7B5A; }
.seg-item.active { background: #B03A2E; }
.seg-item.active text { color: #FFFFFF; font-weight: 600; }
.almanac-block { display: flex; flex-direction: column; gap: 4px; margin-top: 2px; }
.almanac-row { display: flex; align-items: baseline; gap: 10px; }
.almanac-key { font-size: 13px; color: #8A7B5A; width: 56px; flex-shrink: 0; }
.almanac-val { font-size: 14px; color: #2B2723; flex: 1; }
.almanac-val.yi { color: #2E6B46; }
.almanac-val.ji { color: #B03A2E; }
.almanac-loading { font-size: 13px; color: #B0A99A; padding: 8px 0; }
.almanac-foot { margin-top: 6px; border-top: 1px dashed #EAE4D6; padding-top: 6px; }
.almanac-foot text { font-size: 11px; color: #B0A99A; }
</style>
