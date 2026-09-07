<!--
  pkg-calendar/pages/detail/detail.vue – 日程/提醒详情（蓝图 §8 calendar/detail「提醒详情与跳转」）
  数据源（均为既有云函数契约，见 docs/API.md）：
    · kind=event  → event.detail(eventId)   家族大事/史记条目
    · kind=remind → 由日历/通知点入的提醒（date+type+title+body 参数），可携带 notificationId 自动已读
    · 任意场景    → calendar.almanac(date)  当日黄历卡（干支/农历/宜忌）
  降级策略：接口失败不白屏（区块级兜底文案 + 重试按钮）；未登录时仅黄历卡可读（公开）。
-->
<template>
  <view class="detail-page">
    <!-- 大事记（kind=event） -->
    <view v-if="kind === 'event'" class="card event-card">
      <view v-if="eventLoading" class="placeholder">大事载入中…</view>
      <template v-else-if="event">
        <text class="event-year">{{ event.year || '' }}</text>
        <text class="event-title">{{ event.title }}</text>
        <text class="event-content">{{ event.content }}</text>
        <text v-if="event.status" class="event-meta">状态：{{ event.status === 'PUBLISHED' ? '已发布' : event.status }}</text>
      </template>
      <template v-else>
        <text class="placeholder">大事详情暂不可用</text>
        <button class="mini-retry" @click="loadEvent">重试</button>
      </template>
    </view>

    <!-- 提醒卡（kind=remind / date） -->
    <view v-if="remind" class="card remind-card" :class="remindClass">
      <view class="remind-head">
        <text class="remind-badge">{{ remindBadge }}</text>
        <text class="remind-title">{{ remind.title || '日程提醒' }}</text>
      </view>
      <text v-if="remind.body" class="remind-body">{{ remind.body }}</text>
      <view class="remind-foot">
        <text class="remind-date">{{ dateText }}</text>
        <text class="remind-week">{{ weekdayText }}</text>
      </view>
    </view>

    <!-- 当日黄历卡（calendar.almanac） -->
    <view class="card almanac-card">
      <view class="almanac-head">
        <text class="almanac-hd">当日黄历</text>
        <text class="almanac-date">{{ dateText }}</text>
      </view>
      <view v-if="almanacLoading" class="placeholder">推算中…</view>
      <template v-else-if="almanac">
        <view class="almanac-ganzhi">
          {{ almanac.ganzhi?.year || '' }}年
          {{ almanac.ganzhi?.month || '' }}月
          {{ almanac.ganzhi?.day || '' }}日
          <text v-if="almanac.zodiac" class="zodiac-chip">{{ almanac.zodiac }}</text>
        </view>
        <view v-if="almanac.solarTerm" class="solar-chip">{{ almanac.solarTerm }}</view>
        <view class="almanac-row"><text class="almanac-key">农历</text><text class="almanac-val">{{ lunarText }}</text></view>
        <view class="almanac-row"><text class="almanac-key">宜</text><text class="almanac-val yi">{{ (almanac.yi || []).join('、') || '—' }}</text></view>
        <view class="almanac-row"><text class="almanac-key">忌</text><text class="almanac-val ji">{{ (almanac.ji || []).join('、') || '—' }}</text></view>
        <view v-if="almanac.lunar?.source === 'lunar-placeholder'" class="almanac-foot">
          <text>农历详情随 lunar-javascript 接入后展示</text>
        </view>
      </template>
      <template v-else>
        <text class="placeholder">黄历数据暂不可用</text>
        <button class="mini-retry" @click="loadAlmanac">重试</button>
      </template>
    </view>

    <!-- 操作区：前往日历 / 完整老皇历 -->
    <view class="actions">
      <button class="act-btn primary" @click="goCalendar">前往日历</button>
      <button class="act-btn ghost" @click="goAlmanac">完整老皇历</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { read } from '@/services/request';

const WEEKS = ['一', '二', '三', '四', '五', '六', '日'];

const kind = ref<'event' | 'remind' | 'date'>('date');
const dateStr = ref('');
const remind = ref<{ title?: string; body?: string; type?: string } | null>(null);
const notificationId = ref('');

const event = ref<any>(null);
const eventLoading = ref(false);
const almanac = ref<any>(null);
const almanacLoading = ref(false);

function pad(n: number) { return String(n).padStart(2, '0'); }
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

onLoad((query: any = {}) => {
  kind.value = query.kind === 'event' || query.kind === 'remind' ? query.kind : 'date';
  dateStr.value = query.date || todayStr();
  notificationId.value = query.nid || '';
  if (kind.value === 'remind') {
    remind.value = { title: query.title, body: query.body, type: query.type };
  }
  if (kind.value === 'event' && query.id) loadEvent(query.id);
  loadAlmanac();
  // 携带通知 ID：进入即标记已读（静默，失败不打扰）
  if (notificationId.value) markNotificationRead();
});

/** 大事记加载（event.detail） */
async function loadEvent(eventId?: string) {
  if (!eventId) return;
  eventLoading.value = true;
  const res = await read('event', { action: 'detail', eventId }, undefined);
  eventLoading.value = false;
  if (res.data?.event) event.value = res.data.event;
}

/** 当日黄历（calendar.almanac，公开接口） */
async function loadAlmanac() {
  almanacLoading.value = true;
  const res = await read('calendar', { action: 'almanac', date: dateStr.value }, `almanac:${dateStr.value}`, 5 * 60 * 1000);
  almanacLoading.value = false;
  if (res.data) almanac.value = res.data;
}

/** 通知已读（notify.markRead，仅本人可标记——后端属主校验） */
async function markNotificationRead() {
  await read('notify', { action: 'markRead', notificationId: notificationId.value }, undefined);
}

const dateText = computed(() => {
  if (!dateStr.value) return '';
  const [y, m, d] = dateStr.value.split('-');
  return `${y}年${Number(m)}月${Number(d)}日`;
});

const weekdayText = computed(() => {
  const dt = new Date(`${dateStr.value}T12:00:00`);
  if (isNaN(dt.getTime())) return '';
  return `星期${WEEKS[(dt.getDay() + 6) % 7]}`;
});

/** 农历显示：lunar-javascript 接入后为真实月日；占位期隐藏（卡片不空） */
const lunarText = computed(() => {
  const L = almanac.value?.lunar;
  if (!L || L.source === 'lunar-placeholder') return '—';
  return L.monthName && L.dayName ? `${L.monthName}${L.dayName}` : '—';
});

/** 提醒类型 → 徽标字（朱砂/黛青双色，蓝图视觉纪律） */
const remindBadge = computed(() => {
  const t = remind.value?.type || '';
  if (t === '忌日') return '祭';
  if (t === '生辰') return '寿';
  if (t === '节气') return '节';
  if (t === '仪式' || t === '红事' || t === '白事') return '事';
  return '醒';
});
const remindClass = computed(() => {
  const t = remind.value?.type || '';
  return (t === '白事' || t === '忌日') ? 'muted-card' : '';
});

function goCalendar() {
  uni.navigateTo({ url: '/pkg-calendar/pages/calendar/calendar' });
}
function goAlmanac() {
  uni.navigateTo({ url: `/pkg-calendar/pages/almanac/index?date=${dateStr.value}` });
}
</script>

<style lang="scss" scoped>
.detail-page {
  min-height: 100vh;
  background: #FAF8F2;
  padding: 16px 12px 32px;
  box-sizing: border-box;
}

.card {
  background: #FFFFFF;
  border-radius: 12px;
  padding: 14px 16px;
  margin-bottom: 12px;
  box-shadow: 0 2px 12px rgba(38, 34, 30, 0.06);
}

/* ── 大事记 ── */
.event-card { display: flex; flex-direction: column; gap: 8px; border-left: 4px solid #B03A2E; }
.event-year { font-size: 12px; color: #B03A2E; font-weight: 600; letter-spacing: 1px; }
.event-title { font-size: 18px; font-weight: 700; color: #2B2723; line-height: 1.4; }
.event-content { font-size: 14px; color: #4A443C; line-height: 1.8; white-space: pre-wrap; }
.event-meta { font-size: 12px; color: #B0A99A; }

/* ── 提醒卡 ── */
.remind-card { border-left: 4px solid #C9A063; }
.remind-card.muted-card { border-left-color: #3A4A56; background: #F7F5F0; }
.remind-head { display: flex; align-items: center; gap: 8px; }
.remind-badge {
  width: 24px; height: 24px; line-height: 24px; text-align: center;
  border-radius: 50%; background: #B03A2E; color: #FFF; font-size: 12px; flex-shrink: 0;
}
.muted-card .remind-badge { background: #3A4A56; }
.remind-title { font-size: 16px; font-weight: 600; color: #2B2723; flex: 1; }
.remind-body { margin-top: 6px; font-size: 14px; color: #6E6659; line-height: 1.6; }
.remind-foot { margin-top: 8px; display: flex; gap: 10px; }
.remind-date { font-size: 12px; color: #8A7B5A; }
.remind-week { font-size: 12px; color: #B0A99A; }

/* ── 黄历卡 ── */
.almanac-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
.almanac-hd { font-size: 14px; font-weight: 600; color: #8A7B5A; letter-spacing: 2px; }
.almanac-date { font-size: 12px; color: #B0A99A; }
.almanac-ganzhi {
  font-size: 18px; font-weight: 700; color: #2B2723; letter-spacing: 1px;
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
}
.zodiac-chip {
  font-size: 11px; font-weight: 400; color: #B03A2E;
  border: 1px solid #E5C5C0; border-radius: 4px; padding: 1px 6px;
}
.solar-chip {
  display: inline-block; margin: 6px 0 2px;
  font-size: 12px; color: #2E6B46; background: #E9F2EC;
  border-radius: 4px; padding: 2px 8px;
}
.almanac-row { display: flex; align-items: baseline; gap: 10px; margin-top: 6px; }
.almanac-key { font-size: 13px; color: #8A7B5A; width: 40px; flex-shrink: 0; }
.almanac-val { font-size: 14px; color: #2B2723; flex: 1; line-height: 1.6; }
.almanac-val.yi { color: #2E6B46; }
.almanac-val.ji { color: #B03A2E; }
.almanac-foot { margin-top: 8px; border-top: 1px dashed #EAE4D6; padding-top: 6px; }
.almanac-foot text { font-size: 11px; color: #B0A99A; }

.placeholder { font-size: 13px; color: #B0A99A; padding: 6px 0; display: block; }
.mini-retry {
  margin-top: 8px; width: 96px; height: 32px; line-height: 32px; font-size: 12px;
  background: #F7F4EC; color: #8A7B5A; border-radius: 8px; padding: 0; text-align: center;
}

.actions { display: flex; gap: 12px; margin-top: 8px; }
.act-btn {
  flex: 1; height: 44px; line-height: 44px; font-size: 14px; border-radius: 8px; padding: 0; text-align: center;
}
.act-btn.primary { background: #B03A2E; color: #FFF; font-weight: 600; }
.act-btn.ghost { background: #FFFFFF; color: #8A7B5A; border: 1px solid #EAE4D6; }
</style>
