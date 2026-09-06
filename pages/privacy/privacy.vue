<!-- pages/privacy/privacy.vue – 隐私授权申请 + 我的申请列表（Sprint R7/R10） -->
<template>
  <view class="privacy-apply-page">
    <BaseCard>
      <view class="head">
        <text class="title">资料授权申请</text>
        <text class="sub" v-if="targetName">目标：{{ targetName }}</text>
      </view>

      <!-- 未携带 memberId：直接访问提示 -->
      <EmptyState v-if="!memberId" desc="请从族人详情页的授权卡进入本页" />

      <template v-else>
        <text class="label">申请理由（≥5 字，≤500 字）</text>
        <textarea
          class="reason-input"
          v-model="reason"
          placeholder="例如：我是该支系后人，正在整理本支世系资料，需查看详细信息以便核对。"
          :maxlength="500"
        />
        <text class="counter">{{ reason.length }}/500</text>

        <view class="actions">
          <button class="btn-primary submit-btn" :disabled="reason.trim().length < 5 || submitting" @click="submit">
            {{ submitting ? '提交中…' : '提交申请' }}
          </button>
        </view>
        <text class="tip">提交后由族长（CHIEF）审批，审批通过即可查看该族人全部字段。</text>
      </template>
    </BaseCard>

    <!-- 我的申请历史（Sprint R10：申请人视角闭环） -->
    <BaseCard title="我的申请" v-if="myRequests.length">
      <view v-for="r in myRequests" :key="r._id" class="my-req">
        <view class="my-req-head">
          <text class="my-req-title">{{ r.targetName || r.target }}</text>
          <text class="my-req-status" :class="statusClass(r.status)">{{ statusLabel(r.status) }}</text>
        </view>
        <text class="my-req-reason">"{{ r.reason }}"</text>
        <text class="my-req-meta" v-if="r.comment">审批意见：{{ r.comment }}</text>
        <text class="my-req-meta">{{ formatTime(r.createdAt) }}</text>
      </view>
    </BaseCard>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { read } from '@/services/request';
import BaseCard from '@/components/common/BaseCard.vue';
import EmptyState from '@/components/common/EmptyState.vue';

const memberId = ref('');
const targetName = ref('');
const reason = ref('');
const submitting = ref(false);
const myRequests = ref<any[]>([]);

const STATUS_LABEL: Record<string, string> = { PENDING: '待审', APPROVED: '已通过', REJECTED: '已驳回' };

function statusLabel(s?: string): string {
  return STATUS_LABEL[s || 'PENDING'] || '待审';
}
function statusClass(s?: string): string {
  return s === 'APPROVED' ? 'st-approved' : s === 'REJECTED' ? 'st-rejected' : 'st-pending';
}
function formatTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** 拉取我的申请历史（Sprint R10；失败静默，不阻塞申请表单） */
async function loadMyRequests() {
  try {
    const res = await read('member', { action: 'listMyAuth' }, null, 0);
    if (res.success && res.data) {
      myRequests.value = res.data.requests || [];
    }
  } catch (e) { /* 静默 */ }
}

onLoad((q: any = {}) => {
  memberId.value = String(q.memberId || '');
  targetName.value = decodeURIComponent(String(q.name || ''));
  loadMyRequests(); // Sprint R10：我的申请列表
});

async function submit() {
  if (submitting.value) return;
  submitting.value = true;
  try {
    const res = await read(
      'member',
      { action: 'applyAuth', memberId: memberId.value, reason: reason.value.trim() },
      null, // 写操作不缓存
      0
    );
    if (res.success) {
      uni.showToast({
        title: res.data?.duplicate ? '已有待审申请' : '申请已提交',
        icon: 'success'
      });
      setTimeout(() => uni.navigateBack(), 800);
    } else {
      uni.showToast({ title: res.message || res.error?.message || '提交失败', icon: 'none' });
    }
  } catch (e: any) {
    uni.showToast({ title: e.message || '网络异常', icon: 'none' });
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.privacy-apply-page { min-height: 100vh; background: #F7F6F3; padding: 16px; }
.head { margin-bottom: 12px; }
.title { font-size: 18px; font-weight: 600; display: block; color: #2B2320; }
.sub { font-size: 13px; color: #8A8378; margin-top: 4px; display: block; }

.label { font-size: 14px; color: #2B2320; display: block; margin: 8px 0 6px; }
.reason-input { width: 100%; box-sizing: border-box; min-height: 120px; padding: 10px; border-radius: 8px; background: #EFECE4; font-size: 14px; }
.counter { font-size: 11px; color: #B0A99A; text-align: right; display: block; margin-top: 4px; }

.actions { margin-top: 16px; display: flex; justify-content: center; }
.tip { font-size: 12px; color: #8A8378; margin-top: 12px; display: block; text-align: center; }

/* 我的申请列表（Sprint R10） */
.my-req { padding: 10px 0; border-bottom: 1px solid #EAE4D6; }
.my-req:last-child { border-bottom: none; }
.my-req-head { display: flex; align-items: center; gap: 8px; }
.my-req-title { font-size: 14px; font-weight: 600; color: #2B2320; flex: 1; }
.my-req-status { font-size: 10px; padding: 2px 8px; border-radius: 10px; }
.st-pending { background: #FFF3D6; color: #B07B24; }
.st-approved { background: #E2F3E4; color: #2E7D32; }
.st-rejected { background: #FDE8E8; color: #C0392B; }
.my-req-reason { font-size: 12px; color: #6B6459; margin-top: 6px; display: block; font-style: italic; }
.my-req-meta { font-size: 11px; color: #B0A99A; margin-top: 4px; display: block; }
</style>
