<!--
  pkg-calendar/pages/notification/index.vue – 通知中心（蓝图 §8 notification/index「通知列表」+ §7.9 通知编排）
  契约（docs/API.md §notify）：
    · notify.list(page)      → { records[], page, hasMore }（个人通知 + 全员广播合并，createdAt 倒序）
    · notify.markRead(id)    → { marked }（后端属主校验：仅本人可标记个人通知）
  交互：
    · 紧急广播（type=EMERGENCY）红色左边条置顶分区，常驻醒目
    · 未读点击 → 乐观置已读 → 按 targetRoute 跳转（无路由仅已读）
    · 下拉刷新 + 加载更多（20/页）；空态不白屏
-->
<template>
  <view class="notify-page">
    <!-- 未读汇总条 -->
    <view class="summary">
      <text class="summary-num">{{ unreadCount }}</text>
      <text class="summary-text">条未读通知</text>
      <view v-if="hasMore || page > 1" class="summary-side">
        <text class="summary-page" @click="jumpTop">第 {{ page }} 页</text>
      </view>
    </view>

    <!-- 紧急广播区（常驻置顶，红卡醒目） -->
    <view v-if="emergencyList.length" class="emergency-section">
      <view
        v-for="n in emergencyList"
        :key="n._id"
        class="notify-item emergency"
        @click="openNotify(n)"
      >
        <view class="item-head">
          <text class="item-badge emg">急</text>
          <text class="item-title" :class="{ unread: !n.read }">{{ n.title || '紧急通知' }}</text>
          <text class="item-time">{{ relTime(n.createdAt) }}</text>
        </view>
        <text class="item-body">{{ n.body }}</text>
        <view v-if="n.level" class="item-tag-row">
          <text class="item-tag" :class="n.level === 'HIGH' ? 'lvl-hi' : 'lvl-md'">{{ n.level === 'HIGH' ? '高优先级' : '中优先级' }}</text>
        </view>
      </view>
    </view>

    <!-- 常规通知流 -->
    <view v-if="loading && page === 1" class="loading">通知载入中…</view>
    <template v-else-if="normalList.length">
      <view
        v-for="n in normalList"
        :key="n._id"
        class="notify-item"
        :class="{ read: n.read }"
        @click="openNotify(n)"
      >
        <view class="item-head">
          <text class="item-badge" :class="badgeClass(n.type)">{{ badgeText(n.type) }}</text>
          <text class="item-title" :class="{ unread: !n.read }">{{ n.title || '家族通知' }}</text>
          <text class="item-time">{{ relTime(n.createdAt) }}</text>
        </view>
        <text class="item-body">{{ n.body }}</text>
        <view class="item-meta">
          <text v-if="!n.read" class="item-dot" />
          <text class="item-type">{{ typeName(n.type) }}</text>
          <text v-if="n.targetRoute" class="item-goto">查看 ›</text>
        </view>
      </view>

      <!-- 加载更多 / 到底提示 -->
      <view v-if="hasMore" class="more-wrap">
        <button class="more-btn" :disabled="loadingMore" @click="loadMore">
          {{ loadingMore ? '加载中…' : '加载更多' }}
        </button>
      </view>
      <view v-else-if="page > 1 || normalList.length" class="more-wrap">
        <text class="no-more">— 已显示全部通知 —</text>
      </view>
    </template>

    <!-- 空态（不白屏） -->
    <view v-else-if="!loading" class="empty">
      <text class="empty-icon">☘</text>
      <text class="empty-title">暂无通知</text>
      <text class="empty-sub">忌日提醒、审核结果、家族公告会出现在这里</text>
      <button class="empty-refresh" @click="reload">刷新看看</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow, onPullDownRefresh } from '@dcloudio/uni-app';
import { read } from '@/services/request';

const PAGE_SIZE = 20;

interface NotifyItem {
  _id: string;
  userId?: string;
  type?: string;
  title?: string;
  body?: string;
  scope?: string;
  read?: boolean;
  readAt?: string;
  level?: string;
  targetRoute?: string;
  createdAt?: string;
}

const records = ref<NotifyItem[]>([]);
const page = ref(1);
const hasMore = ref(false);
const loading = ref(true);
const loadingMore = ref(false);

/** 紧急广播独立置顶（EMERGENCY，常驻最前） */
const emergencyList = computed(() =>
  records.value.filter(n => (n.type || '').toUpperCase() === 'EMERGENCY' || n.level === 'HIGH')
);
const normalList = computed(() =>
  records.value.filter(n => (n.type || '').toUpperCase() !== 'EMERGENCY' && n.level !== 'HIGH')
);
const unreadCount = computed(() => records.value.filter(n => !n.read).length);

onShow(() => { reload(); });

/** 下拉刷新 */
async function onPullDownRefresh() {
  await reload();
  uni.stopPullDownRefresh();
}

async function reload() {
  loading.value = true;
  const res = await read('notify', { action: 'list', page: 1 }, `notify:list:1`, 60 * 1000);
  loading.value = false;
  if (res.data) {
    records.value = res.data.records || [];
    page.value = res.data.page || 1;
    hasMore.value = !!res.data.hasMore;
  }
}

async function loadMore() {
  if (loadingMore.value || !hasMore.value) return;
  loadingMore.value = true;
  const next = page.value + 1;
  const res = await read('notify', { action: 'list', page: next }, undefined);
  loadingMore.value = false;
  if (res.data?.records?.length) {
    // 按 _id 去重合并（避免广播/个人重叠）
    const seen = new Set(records.value.map(n => n._id));
    const fresh = (res.data.records as NotifyItem[]).filter(n => !seen.has(n._id));
    records.value = records.value.concat(fresh);
    page.value = res.data.page || next;
    hasMore.value = !!res.data.hasMore;
  } else {
    hasMore.value = false;
  }
}

/** 点击：未读先已读（乐观），再按 targetRoute 跳转 */
async function openNotify(n: NotifyItem) {
  if (!n.read) {
    n.read = true;
    await read('notify', { action: 'markRead', notificationId: n._id }, undefined);
  }
  const route = n.targetRoute;
  if (route) {
    uni.navigateTo({ url: route, fail: () => uni.showToast({ title: '页面暂不可达', icon: 'none' }) });
  } else {
    uni.showToast({ title: typeName(n.type), icon: 'none' });
  }
}

function jumpTop() {
  uni.pageScrollTo({ scrollTop: 0, duration: 200 });
}

/** ── 展示辅助 ── */
function pad(n: number) { return String(n).padStart(2, '0'); }

function relTime(iso?: string) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '';
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min}分钟前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}小时前`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}天前`;
  const d = new Date(t);
  const ymd = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return d.getFullYear() === new Date().getFullYear() ? ymd.slice(5) : ymd;
}

const TYPE_NAME: Record<string, string> = {
  EMERGENCY: '紧急通知', REMIND: '日程提醒', JIRI: '忌日提醒', BIRTH: '生辰祝福',
  AUDIT: '审核结果', ANNOUNCEMENT: '家族公告', MOMENT: '家族动态', SYSTEM: '系统消息'
};
function typeName(t?: string) { return TYPE_NAME[t || ''] || '家族通知'; }

const BADGE: Record<string, { text: string; cls: string }> = {
  EMERGENCY: { text: '急', cls: 'bd-emg' },
  JIRI: { text: '祭', cls: 'bd-river' },
  BIRTH: { text: '寿', cls: 'bd-cinnabar' },
  AUDIT: { text: '审', cls: 'bd-spectrum' },
  REMIND: { text: '醒', cls: 'bd-spectrum' },
  ANNOUNCEMENT: { text: '告', cls: 'bd-gold' },
  MOMENT: { text: '动', cls: 'bd-fresh' }
};
function badgeText(t?: string) { return (BADGE[t || ''] || { text: '信' }).text; }
function badgeClass(t?: string) { return (BADGE[t || ''] || { cls: 'bd-plain' }).cls; }
</script>

<style lang="scss" scoped>
.notify-page {
  min-height: 100vh;
  background: #FAF8F2;
  padding: 12px;
  box-sizing: border-box;
}

/* 汇总条 */
.summary {
  display: flex; align-items: baseline; gap: 6px;
  padding: 4px 4px 12px;
}
.summary-num { font-size: 22px; font-weight: 700; color: #B03A2E; }
.summary-text { font-size: 13px; color: #6E6659; flex: 1; }
.summary-side { flex-shrink: 0; }
.summary-page { font-size: 12px; color: #B0A99A; text-decoration: underline; }

/* 通知卡 */
.notify-item {
  background: #FFFFFF;
  border-radius: 12px;
  padding: 12px 14px;
  margin-bottom: 10px;
  box-shadow: 0 2px 12px rgba(38, 34, 30, 0.06);
  transition: opacity 120ms ease;
}
.notify-item.emergency {
  border-left: 4px solid #B03A2E;
  background: #FDF6F4;
}
.notify-item.read { opacity: 0.62; }

.item-head { display: flex; align-items: center; gap: 8px; }
.item-badge {
  width: 22px; height: 22px; line-height: 22px; text-align: center;
  border-radius: 50%; font-size: 11px; color: #FFF; flex-shrink: 0;
}
.bd-emg { background: #B03A2E; }
.bd-river { background: #3A4A56; }
.bd-cinnabar { background: #C96A5E; }
.bd-spectrum { background: #C9A063; }
.bd-gold { background: #C9A063; }
.bd-fresh { background: #7FA8A0; }
.bd-plain { background: #9B968C; }
.notify-item.emergency .item-badge { background: #B03A2E; }

.item-title {
  flex: 1; font-size: 15px; color: #2B2723; font-weight: 500;
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
}
.item-title.unread { font-weight: 700; }
.item-time { font-size: 11px; color: #B0A99A; flex-shrink: 0; }
.item-body {
  display: block; margin-top: 6px; font-size: 13px; color: #6E6659; line-height: 1.6;
  max-height: 3.2em; overflow: hidden;
}
.item-meta { display: flex; align-items: center; gap: 6px; margin-top: 8px; }
.item-dot { width: 6px; height: 6px; border-radius: 50%; background: #B03A2E; }
.item-type { font-size: 11px; color: #B0A99A; flex: 1; }
.item-goto { font-size: 12px; color: #8A7B5A; }
.item-tag-row { margin-top: 6px; }
.item-tag { font-size: 11px; border-radius: 4px; padding: 1px 6px; }
.lvl-hi { color: #B03A2E; background: #F6E0DC; }
.lvl-md { color: #8A6D3B; background: #F4EDDD; }

/* 加载/更多 */
.loading { text-align: center; color: #B0A99A; font-size: 13px; padding: 40px 0; }
.more-wrap { text-align: center; padding: 8px 0 20px; }
.more-btn {
  width: 160px; height: 38px; line-height: 38px; font-size: 13px;
  background: #F7F4EC; color: #8A7B5A; border-radius: 8px; padding: 0;
}
.no-more { font-size: 12px; color: #C9C4B8; }

/* 空态 */
.empty { text-align: center; padding: 80px 24px; }
.empty-icon { font-size: 40px; display: block; }
.empty-title { display: block; margin-top: 12px; font-size: 16px; font-weight: 600; color: #2B2723; }
.empty-sub { display: block; margin-top: 6px; font-size: 13px; color: #B0A99A; }
.empty-refresh {
  margin: 20px auto 0; width: 140px; height: 40px; line-height: 40px; font-size: 14px;
  background: #B03A2E; color: #FFF; border-radius: 8px; padding: 0;
}
</style>
