<template>
  <view class="detail-page">
    <view class="page-header"><text class="page-title">内容详情</text></view>
    <view class="empty-state">
      <text class="empty-icon">📄</text>
      <text class="empty-text">内容详情页面开发中</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onLoad } from '@dcloudio/uni-app';
const id = ref('');
onLoad((q: any) => { id.value = q?.id || ''; console.log('[Detail] id:', id.value); });
</script>

<style scoped lang="scss">
.detail-page { padding: 16px; min-height: 100vh; background: var(--home-bg); }
.page-header .page-title { font-size: 20px; font-weight: bold; color: var(--home-text); }
.empty-state { text-align: center; margin-top: 80px; }
.empty-icon { font-size: 48px; }
.empty-text { display: block; margin-top: 12px; color: var(--home-text-2); }
</style>