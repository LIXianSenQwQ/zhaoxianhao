<!-- pkg-growth/pages/reviewAuth/reviewAuth.vue – 授权审批工作台（CHIEF，Sprint R8/R9 筛选+分页） -->
<template>
  <view class="review-page">
    <!-- 状态筛选 Tabs（Sprint R9） -->
    <view class="tabs">
      <view
        v-for="t in TABS"
        :key="t.value"
        class="tab"
        :class="{ active: currentTab === t.value }"
        @tap="switchTab(t.value)"
      >
        <text>{{ t.label }}</text>
      </view>
    </view>

    <!-- 加载骨架 -->
    <Skeleton v-if="loading" :rows="6" />

    <!-- 错误兜底 -->
    <ErrorPage v-else-if="error" :message="error" @retry="loadList" />

    <!-- 空态 -->
    <EmptyState v-else-if="!requests.length" :motto="emptyMotto" motto-from="郝氏祖训" />

    <!-- 审批列表 -->
    <template v-else>
      <BaseCard v-for="r in requests" :key="r._id" hover-class="card-hover">
        <view class="req-head">
          <text class="req-title">{{ r.targetName || r.target }}</text>
          <text class="status-badge" :class="statusClass(r.status)">{{ statusLabel(r.status) }}</text>
          <text class="req-time">{{ formatTime(r.createdAt) }}</text>
        </view>
        <text class="req-reason">“{{ r.reason }}”</text>
        <text class="req-grantee">申请人：{{ r.grantee }}</text>

        <view class="req-actions" v-if="r.status === 'PENDING'">
          <button class="act-btn btn-error" size="mini" :disabled="acting" @click="review(r, 'reject')">驳回</button>
          <button class="act-btn btn-primary" size="mini" :disabled="acting" @click="review(r, 'approve')">批准</button>
        </view>
        <view class="reviewed-line" v-else>
          <text class="reviewed-text">{{ r.reviewedAt ? formatTime(r.reviewedAt) + ' 已处理' : '' }}</text>
        </view>
      </BaseCard>

      <!-- 分页续载（Sprint R9） -->
      <view v-if="hasMore && !loadingMore" class="more-btn" @tap="loadMore">
        <text class="more-text">加载更多</text>
      </view>
      <View v-if="loadingMore" class="hint">加载中...</View>
      <View v-if="!hasMore && requests.length" class="hint">没有更多了</View>
    </template>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { read } from '@/services/request';
import BaseCard from '@/components/common/BaseCard.vue';
import Skeleton from '@/components/common/Skeleton.vue';
import ErrorPage from '@/components/common/ErrorPage.vue';
import EmptyState from '@/components/common/EmptyState.vue';

const TABS = [
  { value: 'PENDING', label: '待审' },
  { value: 'APPROVED', label: '已批准' },
  { value: 'REJECTED', label: '已驳回' }
];

const STATUS_LABEL: Record<string, string> = { PENDING: '待审', APPROVED: '已批准', REJECTED: '已驳回' };

const loading = ref(true);
const error = ref('');
const requests = ref<any[]>([]);
const acting = ref(false);
const currentTab = ref('PENDING');
const page = ref(1);
const hasMore = ref(false);
const loadingMore = ref(false);

const emptyMotto = ref('存以甘棠，去而益咏');

onShow(() => { loadList(); });

function switchTab(tab: string) {
  if (currentTab.value === tab) return;
  currentTab.value = tab;
  loadList();
}

async function loadList() {
  loading.value = true;
  error.value = '';
  page.value = 1;
  try {
    const res = await read(
      'member',
      { action: 'reviewAuth', op: 'list', status: currentTab.value, filterPage: 1 },
      null,
      0 // 审批列表不缓存
    );
    if (res.success && res.data) {
      requests.value = res.data.requests || [];
      hasMore.value = !!res.data.hasMore;
    } else {
      error.value = res.error?.message || '加载失败';
    }
  } catch (e: any) {
    error.value = e.message || '网络异常';
  } finally {
    loading.value = false;
  }
}

/** 分页续载（Sprint R9） */
async function loadMore() {
  if (loadingMore.value || !hasMore.value) return;
  loadingMore.value = true;
  try {
    const res = await read(
      'member',
      { action: 'reviewAuth', op: 'list', status: currentTab.value, filterPage: page.value + 1 },
      null,
      0
    );
    if (res.success && res.data) {
      requests.value = requests.value.concat(res.data.requests || []);
      hasMore.value = !!res.data.hasMore;
      page.value += 1;
    } else {
      uni.showToast({ title: res.error?.message || '加载失败', icon: 'none' });
    }
  } catch (e: any) {
    uni.showToast({ title: e.message || '网络异常', icon: 'none' });
  } finally {
    loadingMore.value = false;
  }
}

async function review(req: any, op: 'approve' | 'reject') {
  if (acting.value) return;

  // 驳回需确认
  if (op === 'reject') {
    const ok = await new Promise<boolean>((resolve) => {
      uni.showModal({
        title: '驳回申请',
        content: `确认驳回「${req.targetName || req.target}」的授权申请？`,
        success: (r) => resolve(!!r.confirm)
      });
    });
    if (!ok) return;
  }

  acting.value = true;
  try {
    const res = await read(
      'member',
      { action: 'reviewAuth', op, requestId: req._id },
      null, // 写操作不缓存
      0
    );
    if (res.success) {
      uni.showToast({
        title: op === 'approve' ? '已批准并授权' : '已驳回',
        icon: 'success'
      });
      // PENDING 视图直接移除；非 PENDING 视图就地更新状态
      if (currentTab.value === 'PENDING') {
        requests.value = requests.value.filter((x) => x._id !== req._id);
      } else {
        req.status = op === 'approve' ? 'APPROVED' : 'REJECTED';
      }
    } else {
      uni.showToast({ title: res.error?.message || '操作失败', icon: 'none' });
    }
  } catch (e: any) {
    uni.showToast({ title: e.message || '网络异常', icon: 'none' });
  } finally {
    acting.value = false;
  }
}

function statusLabel(s?: string): string {
  return STATUS_LABEL[s || 'PENDING'] || '待审';
}
function statusClass(s?: string): string {
  return s === 'APPROVED' ? 'status-approved' : s === 'REJECTED' ? 'status-rejected' : 'status-pending';
}

function formatTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
</script>

<style scoped>
.review-page { min-height: 100vh; background: #F7F6F3; padding: 16px; }

/* Tabs（Sprint R9） */
.tabs { display: flex; background: #EFECE4; border-radius: 10px; padding: 4px; margin-bottom: 12px; }
.tab { flex: 1; text-align: center; padding: 8px 0; font-size: 13px; color: #6B6459; border-radius: 8px; }
.tab.active { background: #FFFFFF; color: #2B2320; font-weight: 600; }

.req-head { display: flex; align-items: center; gap: 8px; }
.req-title { font-size: 16px; font-weight: 600; color: #2B2320; flex: 1; }
.status-badge { font-size: 10px; padding: 2px 8px; border-radius: 10px; }
.status-pending { background: #FFF3D6; color: #B07B24; }
.status-approved { background: #E2F3E4; color: #2E7D32; }
.status-rejected { background: #FDE8E8; color: #C0392B; }
.req-time { font-size: 11px; color: #B0A99A; }

.req-reason { font-size: 13px; color: #6B6459; margin-top: 8px; display: block; font-style: italic; }
.req-grantee { font-size: 11px; color: #8A8378; margin-top: 6px; display: block; }

.req-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 12px; }
.act-btn { min-width: 72px; }
.reviewed-line { margin-top: 10px; }
.reviewed-text { font-size: 11px; color: #B0A99A; }

.more-btn { text-align: center; padding: 12px; }
.more-text { font-size: 13px; color: #2E7D32; }
.hint { text-align: center; padding: 12px 16px 16px; font-size: 11px; color: #B0A99A; }
</style>
