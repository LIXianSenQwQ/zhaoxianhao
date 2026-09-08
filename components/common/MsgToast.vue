<!--
  @description 全局消息展示组件（订阅 utils/msg.js 总线，支持 error/success 类型）
  @usage: 页面内放置 <MsgToast />，无需传参，自动订阅全局消息
  @api: <ErrorToast message="错误内容" /> 手动模式（受控）
-->
<template>
  <view v-if="visible" class="msg-toast" :class="`msg-${currentType}`">
    <view class="msg-header">
      <text class="msg-icon">{{ iconMap[currentType] }}</text>
      <text class="msg-title">{{ currentTitle }}</text>
      <text v-if="closable" class="close-btn" @click="hide">✕</text>
    </view>
    <text class="msg-message">{{ currentMessage }}</text>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import msg from '@/utils/msg';

const visible = ref(false);
const currentType = ref<'error' | 'success' | 'warn' | 'info'>('error');
const currentMessage = ref('');
const currentTitle = ref('提示');
const closable = ref(true);

const iconMap = { error: '⚠️', success: '✅', warn: '⚡', info: 'ℹ️' };
const titleMap = { error: '出错了', success: '成功', warn: '警告', info: '提示' };

let unsubscribeError = null;
let unsubscribeSuccess = null;
let autoHideTimer = null;

/** 显示消息 */
function show(type, message, { title, closable: cl = true, autoHideMs = 5000 } = {}) {
  currentType.value = type;
  currentMessage.value = String(message || '');
  currentTitle.value = title || titleMap[type] || '提示';
  closable.value = cl;
  visible.value = true;
  if (autoHideTimer) clearTimeout(autoHideTimer);
  if (autoHideMs > 0) {
    autoHideTimer = setTimeout(hide, autoHideMs);
  }
}

function hide() {
  visible.value = false;
  if (autoHideTimer) clearTimeout(autoHideTimer);
}

onMounted(() => {
  // 订阅全局错误（页面挂载后自动响应 msg.error()）
  unsubscribeError = msg.onError((payload) => {
    show('error', payload.message, { autoHideMs: 6000 });
  });
  // 订阅全局成功
  unsubscribeSuccess = msg.onSuccess((payload) => {
    show('success', payload.message, { autoHideMs: 3000 });
  });
});

onUnmounted(() => {
  if (unsubscribeError) unsubscribeError();
  if (unsubscribeSuccess) unsubscribeSuccess();
  if (autoHideTimer) clearTimeout(autoHideTimer);
});

defineExpose({ show, hide });
</script>

<style scoped lang="scss">
.msg-toast {
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 12px;
  animation: slide-in 0.25s ease;
}

.msg-error {
  background: #fff3cd;
  border: 1px solid #ffc107;
}

.msg-success {
  background: #e8f5e9;
  border: 1px solid #4caf50;
}

.msg-warn {
  background: #fff8e1;
  border: 1px solid #ffa726;
}

.msg-info {
  background: #e3f2fd;
  border: 1px solid #2196f3;
}

.msg-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.msg-icon {
  font-size: 16px;
}

.msg-title {
  font-weight: bold;
  font-size: 14px;
}

.msg-error .msg-title { color: #856404; }
.msg-success .msg-title { color: #1b5e20; }
.msg-warn .msg-title { color: #e65100; }
.msg-info .msg-title { color: #0d47a1; }

.close-btn {
  margin-left: auto;
  font-size: 14px;
  opacity: 0.7;
}

.msg-message {
  font-size: 13px;
  line-height: 1.5;
  word-wrap: break-word;
}

.msg-error .msg-message { color: #856404; }
.msg-success .msg-message { color: #1b5e20; }
.msg-warn .msg-message { color: #e65100; }
.msg-info .msg-message { color: #0d47a1; }

@keyframes slide-in {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
