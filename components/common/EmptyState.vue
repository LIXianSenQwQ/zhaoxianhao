<template>
  <!-- 空态：要事卡流为空时降级为祖训今日卡（文档 0.3.3） -->
  <view class="empty-state">
    <slot>
      <!-- 默认空态：祖训卡（不空屏） -->
      <view class="motto-card">
        <text class="motto-label">祖训今日</text>
        <text class="motto-text">{{ motto }}</text>
        <text class="motto-sub">—— {{ mottoFrom }}</text>
      </view>
      <text class="empty-tip">暂无今日要事</text>
    </slot>
  </view>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    /** 空态展示的祖训；不传用默认 */
    motto?: string;
    mottoFrom?: string;
  }>(),
  {
    motto: '孝悌忠信，礼义廉耻',
    mottoFrom: '郝氏祖训'
  }
);
</script>

<style lang="scss" scoped>
.empty-state { padding: 8px 0 16px; }

.motto-card {
  background: var(--home-card-2, #f7f4ec);
  border: 1px dashed var(--home-line, #eae4d6);
  border-radius: 12px;
  padding: 20px 16px;
  text-align: center;
}

.motto-label {
  display: block;
  font-size: 12px;
  letter-spacing: 4px;
  color: var(--gold, #c9a063);
  margin-bottom: 12px;
}

.motto-text {
  display: block;
  font-size: 17px;
  font-weight: 600;
  color: var(--home-text, #2b2723);
  line-height: 1.7;
}

.motto-sub {
  display: block;
  margin-top: 8px;
  font-size: 12px;
  color: var(--home-text-2, #6e6659);
}

.empty-tip {
  display: block;
  margin-top: 12px;
  font-size: 12px;
  color: var(--text-aux, #999);
  text-align: center;
}
</style>
