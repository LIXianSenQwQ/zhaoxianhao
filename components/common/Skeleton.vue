<template>
  <!-- 骨架屏：目标 ≤300ms 出现（文档 2.2 性能预算） -->
  <view v-if="visible" class="skeleton" aria-hidden="true">
    <view v-for="i in rows" :key="i" class="sk-card">
      <view class="sk-line sk-title" />
      <view class="sk-line sk-desc" />
      <view class="sk-line sk-desc short" />
    </view>
  </view>
</template>

<script setup lang="ts">
defineProps<{
  visible: boolean;
  /** 骨架卡片行数，默认 3 */
  rows?: number;
}>();
</script>

<style lang="scss" scoped>
.skeleton { padding: 12px 0; }

.sk-card {
  background: #fff;
  border-radius: 12px;
  padding: 12px;
  margin-bottom: 12px;
}

.sk-line {
  border-radius: 4px;
  background: linear-gradient(90deg, #f0ede4 25%, #f7f4ec 50%, #f0ede4 75%);
  background-size: 400% 100%;
  animation: shimmer 1.2s ease infinite;
}

.sk-title { height: 18px; width: 40%; margin-bottom: 10px; }
.sk-desc { height: 14px; width: 100%; margin-bottom: 8px; }
.sk-desc.short { width: 60%; margin-bottom: 0; }

@keyframes shimmer {
  0% { background-position: 100% 0; }
  100% { background-position: -100% 0; }
}
</style>
