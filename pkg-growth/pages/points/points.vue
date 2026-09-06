<!-- pkg-growth/pages/points/points.vue – 积分中心（Sprint R12：蓝图 points/index，四池余额+流水，接 points.get/list） -->
<template>
  <view class="points-page">
    <!-- 四池余额（蓝图 5.6：孝亲/功德/福运/普通） -->
    <BaseCard title="我的积分">
      <view class="pools">
        <view v-for="p in POOLS" :key="p.key" class="pool" :style="{ background: p.bg }">
          <text class="pool-num">{{ account[p.key] ?? 0 }}</text>
          <text class="pool-name">{{ p.name }}</text>
        </view>
      </view>
    </BaseCard>

    <!-- 流水（分页 20/页，time 倒序） -->
    <BaseCard title="积分流水">
      <view v-if="logs.length === 0 && !loading" class="log-empty">
        <text>暂无流水记录</text>
      </view>
      <view v-for="l in logs" :key="l._id" class="log-row">
        <view class="log-left">
          <text class="log-biz">{{ bizLabel(l.bizType) }}</text>
          <text class="log-time">{{ fmtTime(l.time) }}</text>
        </view>
        <text class="log-delta" :class="{ neg: (l.delta || 0) < 0 }">{{ (l.delta || 0) > 0 ? '+' : '' }}{{ l.delta }}</text>
      </view>
      <view v-if="hasMore" class="load-more" @click="loadMore">
        <text>{{ loading ? '加载中…' : '加载更多' }}</text>
      </view>
    </BaseCard>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { read } from '@/services/request';
import BaseCard from '@/components/common/BaseCard.vue';

const POOLS = [
  { key: 'xiaoqin', name: '孝亲', bg: '#F9EDEB' },
  { key: 'gongde', name: '功德', bg: '#F7F1E3' },
  { key: 'fuyun', name: '福运', bg: '#EDF2EC' },
  { key: 'normal', name: '普通', bg: '#F0EEE8' }
];

const account = ref<Record<string, number>>({ xiaoqin: 0, gongde: 0, fuyun: 0, normal: 0 });
const logs = ref<any[]>([]);
const loading = ref(false);
const page = ref(1);
const hasMore = ref(true);

const BIZ_LABELS: Record<string, string> = {
  checkin: '每日打卡',
  worship: '祭祀礼拜',
  task_complete: '任务完成',
  family_post: '家族发布'
};
function bizLabel(t: string) { return BIZ_LABELS[t] || (t || '其他'); }

function fmtTime(t: string) {
  if (!t) return '';
  const d = new Date(t);
  return isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function fetchAccount() {
  const res = await read('points', { action: 'get' }, 'points.account', 30000);
  if (res.success && res.data?.account) account.value = res.data.account;
}

async function fetchLogs(p = 1) {
  loading.value = true;
  try {
    const res = await read('points', { action: 'list', filterPage: p }, null, 0);
    if (res.success && res.data) {
      const list = res.data.logs || [];
      logs.value = p === 1 ? list : logs.value.concat(list);
      hasMore.value = !!res.data.hasMore;
      page.value = p;
    }
  } finally {
    loading.value = false;
  }
}

function loadMore() {
  if (loading.value || !hasMore.value) return;
  fetchLogs(page.value + 1);
}

fetchAccount();
fetchLogs(1);
</script>

<style scoped>
.points-page { min-height: 100vh; background: #F7F6F3; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.pools { display: flex; gap: 8px; }
.pool { flex: 1; border-radius: 10px; padding: 14px 0; text-align: center; }
.pool-num { font-size: 20px; font-weight: 700; color: #B03A2E; display: block; }
.pool-name { font-size: 12px; color: #6E6659; margin-top: 2px; display: block; }

.log-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #EAE4D6; }
.log-row:last-of-type { border-bottom: none; }
.log-left { display: flex; flex-direction: column; gap: 2px; }
.log-biz { font-size: 14px; color: #2B2320; }
.log-time { font-size: 11px; color: #B0A99A; }
.log-delta { font-size: 16px; font-weight: 700; color: #7FA8A0; }
.log-delta.neg { color: #B03A2E; }
.log-empty { text-align: center; color: #B0A99A; font-size: 13px; padding: 20px 0; }
.load-more { text-align: center; padding: 10px; font-size: 13px; color: #8A8378; }
</style>
