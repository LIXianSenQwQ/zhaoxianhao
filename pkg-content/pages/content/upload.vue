<template>
  <view class="upload-page">
    <view class="page-header"><text class="page-title">上传内容</text></view>
    <view class="empty-state">
      <text class="empty-icon">📤</text>
      <text class="empty-text">照片 / 视频 / 记录 上传功能开发中</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app';
onLoad((q: any) => {
  console.log('[Upload] type:', q?.type);
});
</script>

<style scoped lang="scss">
.upload-page { padding: 16px; min-height: 100vh; background: var(--home-bg); }
.page-header .page-title { font-size: 20px; font-weight: bold; color: var(--home-text); }
.empty-state { text-align: center; margin-top: 80px; }
.empty-icon { font-size: 48px; }
.empty-text { display: block; margin-top: 12px; color: var(--home-text-2); }
</style>