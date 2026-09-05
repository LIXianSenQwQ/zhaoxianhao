<!-- pages/privacy/privacy.vue – 隐私授权申请（Sprint R7：needAuthCard 授权卡闭环） -->
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
          <Button type="primary" :disabled="reason.trim().length < 5 || submitting" @click="submit">
            {{ submitting ? '提交中…' : '提交申请' }}
          </Button>
        </view>
        <text class="tip">提交后由族长（CHIEF）审批，审批通过即可查看该族人全部字段。</text>
      </template>
    </BaseCard>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { read } from '@/services/request';
import BaseCard from '@/components/common/BaseCard.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import Button from '@/uni_modules/uview-ui/components/u-button/u-button.vue';

const memberId = ref('');
const targetName = ref('');
const reason = ref('');
const submitting = ref(false);

onLoad((q: any = {}) => {
  memberId.value = String(q.memberId || '');
  targetName.value = decodeURIComponent(String(q.name || ''));
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
</style>
