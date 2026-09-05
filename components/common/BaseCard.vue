<template>
  <view class="base-card" :class="[`type-${type}`, { 'elder': elderMode }]" @click="$emit('click')">
    <view v-if="type === 'ceremony'" class="accent-bar" />
    <view class="card-body">
      <text class="card-title">{{ title }}</text>
      <text class="card-desc" :class="{ clamp: clamp }">{{ desc }}</text>
    </view>
    <view v-if="$slots.right" class="card-right">
      <slot name="right" />
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useUserStore } from '@/stores/user';

const props = defineProps<{
  title: string;
  desc?: string;
  /** normal 默认 | ceremony 红白事朱砂边条 | motto 缃黄底 */
  type?: 'normal' | 'ceremony' | 'motto';
  /** 描述超 2 行截断 */
  clamp?: boolean;
}>();

defineEmits(['click']);

const userStore = useUserStore();
const elderMode = computed(() => userStore.elderMode);
</script>

<style lang="scss" scoped>
@import '@/styles/tokens.scss';

.base-card {
  position: relative;
  display: flex;
  align-items: center;
  background: var(--home-card, #fff);
  border-radius: var(--radius-card, 12px);
  padding: var(--home-card-pad, 12px);
  margin-bottom: var(--home-card-gap, 12px);
  box-shadow: var(--shadow-card, 0 1px 6px rgba(38, 34, 30, 0.06));
  overflow: hidden;
}

.type-ceremony .accent-bar {
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 4px;
  background: var(--cinnabar, #b03a2e);
}
.type-ceremony .card-body { padding-left: 6px; }

.type-motto { background: var(--home-card-2, #f7f4ec); }

.card-body { flex: 1; min-width: 0; }

.card-title {
  display: block;
  font-size: var(--font-base, 16px);
  font-weight: var(--weight-bold, 700);
  color: var(--home-text, #2b2723);
}

.card-desc {
  display: block;
  margin-top: 4px;
  font-size: var(--font-sm, 14px);
  color: var(--home-text-2, #6e6659);
  line-height: 1.5;
  &.clamp {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
}

.card-right { flex-shrink: 0; margin-left: 8px; }

/* 年长模式 ×1.4（文档 0.5） */
.elder .card-title { font-size: calc(var(--font-base, 16px) * 1.4); }
.elder .card-desc { font-size: calc(var(--font-sm, 14px) * 1.4); }
</style>
