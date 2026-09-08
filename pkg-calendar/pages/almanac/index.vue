<!--
  pkg-calendar/pages/almanac/index.vue – 老皇历整屏日页（蓝图 25 / 7.11：黄历牌样式·朱丝栏+干支大字+宜忌双色签）
  数据（docs/API.md §9.4 R24）：
    · calendar.almanac(date) → ganzhi{year,month,day} / zodiac / solarTerm / termsOfMonth[] / yi[] / ji[] / lunar
    · 农历字段在 lunar-javascript 未部署时返回 source:'lunar-placeholder'，页面隐藏并给占位说明（不报错）
  交互：
    · 上/下一日切换 + 回今天；URL ?date= 直达；数据带 5 分钟本地缓存
    · 顶部晨光渐变端点由 atmosphere.today 下发（失败用默认晨光，白事自动素色）
-->
<template>
  <view class="almanac-page">
    <!-- ① 晨光渐变头：公历大日期 -->
    <view class="head" :style="{ background: headerBg }">
      <view class="head-nav">
        <view class="nav-btn" @click="shiftDay(-1)"><text>‹</text></view>
        <view class="head-date-wrap" @click="goToday">
          <text class="head-date">{{ dateText }}</text>
          <text class="head-week">{{ weekdayText }}<text v-if="!isToday" class="back-today"> · 回今天</text></text>
        </view>
        <view class="nav-btn" @click="shiftDay(1)"><text>›</text></view>
      </view>
    </view>

    <!-- ② 黄历牌（朱丝栏视觉） -->
    <view class="card almanac-board">
      <view v-if="loading" class="board-loading">
        <view class="sk sk-line1" /><view class="sk sk-line2" /><view class="sk sk-line3" />
      </view>
      <template v-else-if="data">
        <!-- 干支大字 -->
        <view class="ganzhi">
          <text class="gz-seg">{{ data.ganzhi?.year || '—' }}</text>
          <text class="gz-seg">{{ data.ganzhi?.month || '—' }}</text>
          <text class="gz-seg">{{ data.ganzhi?.day || '—' }}</text>
          <text class="gz-suffix">年 月 日</text>
        </view>

        <!-- 农历月日（lunar-javascript 接入后展示） -->
        <view v-if="lunarMain" class="lunar-line">
          <text class="lunar-text">{{ lunarMain }}</text>
          <text v-if="data.zodiac" class="chip zodiac">生肖 · {{ data.zodiac }}</text>
        </view>
        <view v-else class="lunar-line">
          <text class="lunar-text">农历</text>
          <text class="chip zodiac">生肖 · {{ data.zodiac || '—' }}</text>
        </view>

        <!-- 当日节气徽标 -->
        <view v-if="data.solarTerm" class="term-banner">
          <text class="term-flag">今逢节气</text>
          <text class="term-name">{{ data.solarTerm }}</text>
        </view>

        <!-- 宜 / 忌 双色签（黛青宜 · 朱砂忌，蓝图 25 视觉） -->
        <view class="yi-ji">
          <view class="yi-block">
            <text class="yi-ji-title yi-t">宜</text>
            <view class="chips">
              <text v-for="(y, i) in (data.yi || [])" :key="i" class="tag tag-yi">{{ y }}</text>
              <text v-if="!(data.yi || []).length" class="tag tag-yi dim">—</text>
            </view>
          </view>
          <view class="ji-block">
            <text class="yi-ji-title ji-t">忌</text>
            <view class="chips">
              <text v-for="(j, i) in (data.ji || [])" :key="i" class="tag tag-ji">{{ j }}</text>
              <text v-if="!(data.ji || []).length" class="tag tag-ji dim">—</text>
            </view>
          </view>
        </view>

        <!-- 本月节气 -->
        <view v-if="data.termsOfMonth?.length" class="month-terms">
          <text class="mt-label">本月节气</text>
          <view class="chips">
            <text
              v-for="(t, i) in data.termsOfMonth"
              :key="i"
              class="tag tag-term"
              :class="{ 'term-active': t === data.solarTerm }"
            >{{ t }}</text>
          </view>
        </view>

        <view v-if="data.lunar?.source === 'lunar-placeholder'" class="board-foot">
          <text>农历详情随 lunar-javascript 离线历法接入后展示（1900–2100）</text>
        </view>
      </template>
      <template v-else>
        <view class="board-empty">
          <text class="board-empty-t">黄历数据暂不可用</text>
          <button class="retry-btn" @click="load(data.date || dateStr)">重试</button>
        </view>
      </template>
    </view>

    <!-- ③ 操作：去日历 -->
    <view class="actions">
      <button class="go-calendar" @click="goCalendar">返回日历视图</button>
    </view>

    <!-- ④ 数据来源标注（蓝图 25：来源在页面底部标注） -->
    <view class="source-note">
      <text>数据来源：历法算法库（1900–2100）与族史委定制宜忌扩展；黄历内容仅供参考。</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { read } from '@/services/request';

const WEEKS = ['一', '二', '三', '四', '五', '六', '日'];

const dateStr = ref('');
const data = ref<any>(null);
const loading = ref(true);
const muted = ref(false);
const theme = ref<{ top: string; mid: string; bottom: string } | null>(null);

function pad(n: number) { return String(n).padStart(2, '0'); }
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function isValid(s: string) { return /^\d{4}-\d{2}-\d{2}$/.test(s || ''); }

onLoad((query: any = {}) => {
  dateStr.value = isValid(query.date) ? query.date : todayStr();
  load(dateStr.value);
  // 氛围：白事素色 + 节气渐变端点（失败静默走默认晨光；request 契约无 success 字段，以 data 为准）
  read('atmosphere', { action: 'today' }, 'atmosphere.today', 600000).then(res => {
    const t = res.data?.data ?? res.data;
    if (t) {
      muted.value = !!t.muted;
      if (t.moodTheme?.top) theme.value = t.moodTheme;
    }
  }).catch(() => {});
});

const headerBg = computed(() => {
  const t = theme.value || { top: '#FDFCF8', mid: '#F5F1E6', bottom: '#EDF2EC' };
  return muted.value
    ? 'linear-gradient(165deg, #F7F5F0 0%, #F0EEE8 100%)'
    : `linear-gradient(165deg, ${t.top} 0%, ${t.mid} 45%, ${t.bottom} 100%)`;
});

async function load(d: string) {
  loading.value = true;
  data.value = null;
  const res = await read('calendar', { action: 'almanac', date: d }, `almanac:${d}`, 5 * 60 * 1000);
  loading.value = false;
  if (res.data) data.value = res.data.data ?? res.data;
}

function shiftDay(delta: number) {
  const [y, m, d] = dateStr.value.split('-').map(Number);
  const dt = new Date(y, m - 1, d + delta);
  dateStr.value = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  load(dateStr.value);
}

function goToday() {
  dateStr.value = todayStr();
  load(dateStr.value);
}

/** 农历主显示：月 + 日 +（闰） */
const lunarMain = computed(() => {
  const L = data.value?.lunar;
  if (!L || L.source === 'lunar-placeholder') return '';
  const month = L.monthName || '';
  const day = L.dayName || '';
  return month && day ? `${month}${day}` : '';
});

const dateText = computed(() => {
  const [y, m, d] = dateStr.value.split('-');
  return `${y}年${Number(m)}月${Number(d)}日`;
});
const weekdayText = computed(() => {
  const dt = new Date(`${dateStr.value}T12:00:00`);
  return isNaN(dt.getTime()) ? '' : `星期${WEEKS[(dt.getDay() + 6) % 7]}`;
});
const isToday = computed(() => dateStr.value === todayStr());

function goCalendar() {
  uni.navigateTo({ url: '/pkg-calendar/pages/calendar/calendar' });
}
</script>

<style lang="scss" scoped>
.almanac-page {
  min-height: 100vh;
  background: #FAF8F2;
  padding-bottom: 32px;
  box-sizing: border-box;
}

/* 晨光渐变头 */
.head { padding: 20px 16px 24px; border-radius: 0 0 12px 12px; }
.head-nav { display: flex; align-items: center; justify-content: space-between; }
.nav-btn {
  width: 40px; height: 40px; display: flex; align-items: center; justify-content: center;
  border-radius: 50%; background: rgba(255, 255, 255, 0.7);
}
.nav-btn text { font-size: 22px; color: #6E6659; line-height: 1; }
.head-date-wrap { text-align: center; flex: 1; }
.head-date { display: block; font-size: 24px; font-weight: 700; color: #2B2723; letter-spacing: 1px; }
.head-week { font-size: 13px; color: #6E6659; margin-top: 2px; display: block; }
.back-today { color: #B03A2E; }

/* 黄历牌 */
.card {
  margin: 12px;
  background: #FFFFFF;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(38, 34, 30, 0.06);
}
.almanac-board {
  padding: 18px 16px;
  border-top: 2px solid #C9A063;              /* 朱丝栏（上） */
  border-bottom: 2px solid #C9A063;            /* 朱丝栏（下） */
  position: relative;
}
.almanac-board::before, .almanac-board::after {
  content: '';
  position: absolute; left: 16px; right: 16px; height: 1px;
  background: #EAE4D6;
}
.almanac-board::before { top: 4px; }
.almanac-board::after { bottom: 4px; }

/* 干支大字 */
.ganzhi { display: flex; align-items: baseline; justify-content: center; gap: 6px; flex-wrap: wrap; }
.gz-seg { font-size: 26px; font-weight: 700; color: #2B2723; letter-spacing: 2px; }
.gz-suffix { font-size: 12px; color: #B0A99A; margin-left: 2px; }

.lunar-line { display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: 10px; }
.lunar-text { font-size: 20px; font-weight: 600; color: #8A6D3B; }
.chip {
  font-size: 11px; color: #6E6659; background: #F4F1E8;
  border-radius: 4px; padding: 2px 8px;
}
.chip.zodiac { color: #3A4A56; background: #EDF0F1; }

.term-banner {
  margin: 12px auto 0; display: inline-flex; align-items: center; gap: 6px;
  background: #F4EDDD; border: 1px solid #E3C9A0; border-radius: 6px; padding: 4px 12px;
}
.term-banner, .term-banner > view, .term-banner > text { display: inline-block; }
.term-flag { font-size: 11px; color: #8A6D3B; }
.term-name { font-size: 15px; font-weight: 700; color: #7A4A2B; }

/* 宜忌双色签 */
.yi-ji { display: flex; gap: 16px; margin-top: 14px; padding-top: 12px; border-top: 1px dashed #EAE4D6; }
.yi-block, .ji-block { flex: 1; }
.yi-ji-title {
  display: inline-block; width: 28px; height: 28px; line-height: 28px; text-align: center;
  border-radius: 50%; font-size: 15px; font-weight: 700; color: #FFF; margin-bottom: 8px;
}
.yi-t { background: #3A4A56; }   /* 宜 = 黛青 */
.ji-t { background: #B03A2E; }   /* 忌 = 朱砂 */
.chips { display: flex; flex-wrap: wrap; gap: 6px; }
.tag {
  font-size: 12px; border-radius: 4px; padding: 2px 8px; line-height: 1.8;
}
.tag-yi { color: #3A4A56; background: #ECF0F1; }
.tag-ji { color: #B03A2E; background: #F8ECEA; }
.tag.dim { color: #C9C4B8; background: #F7F6F3; }

/* 本月节气 */
.month-terms { margin-top: 14px; padding-top: 10px; border-top: 1px dashed #EAE4D6; }
.mt-label { font-size: 12px; color: #8A7B5A; margin-right: 8px; }
.tag-term { color: #8A6D3B; background: #F4F1E8; }
.tag-term.term-active { color: #7A4A2B; background: #F4E3C9; font-weight: 600; }

.board-foot { margin-top: 12px; padding-top: 8px; border-top: 1px dashed #EAE4D6; }
.board-foot text { font-size: 11px; color: #B0A99A; }

/* 骨架/空态 */
.board-loading { padding: 8px 0 4px; }
.sk { border-radius: 4px; background: linear-gradient(90deg, #F0EDE4 25%, #F7F4EC 50%, #F0EDE4 75%); background-size: 400% 100%; animation: shimmer 1.2s ease infinite; }
.sk-line1 { height: 24px; width: 70%; margin: 0 auto 14px; }
.sk-line2 { height: 16px; width: 45%; margin: 0 auto 10px; }
.sk-line3 { height: 40px; width: 100%; }
@keyframes shimmer { 0% { background-position: 100% 0; } 100% { background-position: -100% 0; } }

.board-empty { text-align: center; padding: 24px 0 8px; }
.board-empty-t { display: block; font-size: 13px; color: #B0A99A; }
.retry-btn {
  margin: 14px auto 0; width: 120px; height: 36px; line-height: 36px; font-size: 13px;
  background: #F7F4EC; color: #8A7B5A; border-radius: 8px; padding: 0;
}

/* 操作与来源 */
.actions { margin: 4px 12px 0; }
.go-calendar {
  height: 44px; line-height: 44px; font-size: 14px; font-weight: 600;
  background: #B03A2E; color: #FFF; border-radius: 8px; padding: 0;
}
.source-note { margin: 14px 20px 0; }
.source-note text { font-size: 11px; color: #C9C4B8; line-height: 1.7; }
</style>
