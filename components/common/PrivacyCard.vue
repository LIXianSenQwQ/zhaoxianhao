<template>
  <!-- 权限不足申请卡（文档 6.2 第 4 条：403 返回授权申请路由，不白屏） -->
  <view v-if="visible" class="privacy-card">
    <text class="lock-icon">🔒</text>
    <text class="title">{{ title }}</text>
    <text class="desc">{{ desc }}</text>
    <button class="apply-btn" @click="apply">申请查看权限</button>
  </view>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    visible: boolean;
    title?: string;
    desc?: string;
    applyRoute?: string;
  }>(),
  {
    title: '内容暂不可见',
    desc: '该内容受族人隐私授权保护，您可以向对方或族史委申请查看',
    applyRoute: '/pages/privacy/privacy'
  }
);

defineEmits(['apply']);

function apply() {
  uni.navigateTo({
    url: props.applyRoute,
    fail: () => uni.showToast({ title: '授权中心开发中', icon: 'none' })
  });
}
</script>

<style lang="scss" scoped>
.privacy-card {
  background: var(--home-card-2, #f7f4ec);
  border: 1px solid var(--home-line, #eae4d6);
  border-radius: 12px;
  padding: 28px 16px;
  text-align: center;
}

.lock-icon { font-size: 36px; display: block; }

.title {
  display: block;
  margin-top: 12px;
  font-size: 16px;
  font-weight: 600;
  color: var(--home-text, #2b2723);
}

.desc {
  display: block;
  margin-top: 8px;
  font-size: 13px;
  color: var(--home-text-2, #6e6659);
  line-height: 1.6;
}

.apply-btn {
  margin-top: 16px;
  min-width: 160px;
  height: 38px;
  line-height: 38px;
  background: var(--river, #3a4a56);
  color: #fff;
  border-radius: 8px;
  font-size: 14px;
}
</style>
