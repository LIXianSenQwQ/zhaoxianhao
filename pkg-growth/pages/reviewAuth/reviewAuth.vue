<!-- pkg-growth/pages/reviewAuth/reviewAuth.vue – 授权审批工作台（CHIEF，Sprint R8） -->
<template>
  <view class="review-page">
    <!-- 加载骨架 -->
    <Skeleton v-if="loading" :rows="6" />

    <!-- 错误兜底 -->
    <ErrorPage v-else-if="error" :message="error" @retry="loadList" />

    <!-- 空态 -->
    <EmptyState v-else-if="!requests.length" desc="暂无待审授权申请" />

    <!-- 待审列表 -->
    <template v-else>
      <BaseCard v-for="r in requests" :key="r._id" hover-class="card-hover">
        <view class="req-head">
          <text class="req-title">{{ r.targetName || r.target }}</text>
          <text class="req-time">{{ formatTime(r.createdAt) }}</text>
        </view>
        <text class="req-reason">“{{ r.reason }}”</text>
        <text class="req-grantee">申请人：{{ r.grantee }}</text>

        <view class="req-actions">
          <Button class="act-btn" type="error" size="mini" :disabled="acting" @click="review(r, 'reject')">驳回</Button>
          <Button class="act-btn" type="primary" size="mini" :disabled="acting" @click="review(r, 'approve')">批准</Button>
        </view>
      </BaseCard>

      <View class="hint">批准后申请人即可查看该族人全部字段（授权记录落 authorizations）</View>
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
import Button from '@/uni_modules/uview-ui/components/u-button/u-button.vue';

const loading = ref(true);
const error = ref('');
const requests = ref<any[]>([]);
const acting = ref(false);

onShow(() => { loadList(); });

async function loadList() {
  loading.value = true;
  error.value = '';
  try {
    const res = await read('member', { action: 'reviewAuth', op: 'list' }, null, 0); // 审批列表不缓存
    if (res.success && res.data) {
      requests.value = res.data.requests || [];
    } else {
      error.value = res.error?.message || '加载失败';
    }
  } catch (e: any) {
    error.value = e.message || '网络异常';
  } finally {
    loading.value = false;
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
      // 从列表移除该申请
      requests.value = requests.value.filter((x) => x._id !== req._id);
    } else {
      uni.showToast({ title: res.error?.message || '操作失败', icon: 'none' });
    }
  } catch (e: any) {
    uni.showToast({ title: e.message || '网络异常', icon: 'none' });
  } finally {
    acting.value = false;
  }
}

function formatTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
</script>

<style scoped>
.review-page { min-height: 100vh; background: #F7F6F3; padding: 16px; }

.req-head { display: flex; align-items: center; justify-content: space-between; }
.req-title { font-size: 16px; font-weight: 600; color: #2B2320; }
.req-time { font-size: 11px; color: #B0A99A; }

.req-reason { font-size: 13px; color: #6B6459; margin-top: 8px; display: block; font-style: italic; }
.req-grantee { font-size: 11px; color: #8A8378; margin-top: 6px; display: block; }

.req-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 12px; }
.act-btn { min-width: 72px; }

.hint { text-align: center; padding: 16px; font-size: 11px; color: #B0A99A; }
</style>
