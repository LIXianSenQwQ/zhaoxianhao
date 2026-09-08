<!--
  @description 错误提示组件（行内显示，支持关闭）
  @usage: <ErrorToast v-if="error" message="错误内容" />
-->
<template>
  <view class="error-toast">
    <view class="error-header">
      <text class="error-icon">⚠️</text>
      <text class="error-title">{{ title }}</text>
      <text class="close-btn" @click="$emit('hide')">✕</text>
    </view>
    <text class="error-message">{{ message }}</text>
  </view>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string;
    message?: string;
  }>(),
  {
    title: '出错了',
    message: '操作未成功，请检查后再试'
  }
);
defineEmits(['hide']);
</script>

<style scoped lang="scss">
.error-toast {
  background: #fff3cd;
  border: 1px solid #ffc107;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 12px;
}

.error-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.error-icon {
  font-size: 16px;
}

.error-title {
  font-weight: bold;
  color: #856404;
  font-size: 14px;
}

.close-btn {
  margin-left: auto;
  font-size: 14px;
  color: #856404;
  opacity: 0.7;
}

.error-message {
  font-size: 13px;
  color: #856404;
  line-height: 1.5;
  word-wrap: break-word;
}
</style>
