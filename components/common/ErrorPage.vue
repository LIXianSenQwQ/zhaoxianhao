<template>
  <!-- 统一错误兜底（文档十一章：可重试、不白屏） -->
  <view class="error-page">
    <text class="err-icon">⚠️</text>
    <text class="err-title">{{ title }}</text>
    <text class="err-msg">{{ message }}</text>
    <view class="err-actions">
      <button v-if="showRetry" class="retry-btn" @click="$emit('retry')">重试</button>
      <button class="home-btn" @click="goHome">回首页</button>
    </view>
  </view>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string;
    message?: string;
    showRetry?: boolean;
  }>(),
  {
    title: '页面加载失败',
    message: '网络似乎不太好，请稍后重试',
    showRetry: true
  }
);

defineEmits(['retry']);

function goHome() {
  // 项目未配置 tabBar，switchTab 会失败；reLaunch 可跳转任意页面并清空页面栈
  uni.reLaunch({ url: '/pages/index/index' });
}
</script>

<style lang="scss" scoped>
.error-page {
  padding: 80px 24px;
  text-align: center;
}

.err-icon { font-size: 48px; display: block; }

.err-title {
  display: block;
  margin-top: 16px;
  font-size: 18px;
  font-weight: 700;
  color: var(--home-text, #2b2723);
}

.err-msg {
  display: block;
  margin-top: 8px;
  font-size: 14px;
  color: var(--home-text-2, #6e6659);
}

.err-actions {
  margin-top: 24px;
  display: flex;
  justify-content: center;
  gap: 12px;
}

.retry-btn {
  min-width: 120px;
  height: 40px;
  line-height: 40px;
  background: var(--cinnabar, #b03a2e);
  color: #fff;
  border-radius: 8px;
  font-size: 14px;
}

.home-btn {
  min-width: 120px;
  height: 40px;
  line-height: 40px;
  background: var(--home-card-2, #f7f4ec);
  color: var(--home-text-2, #6e6659);
  border-radius: 8px;
  font-size: 14px;
}
</style>
