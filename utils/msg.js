/**
 * utils/msg.js — 全局消息总线（轻量替代 uni-ui msg 模块）
 *
 * 设计：
 *   - 统一封装 uni.showToast / uni.showModal / uni.showLoading
 *   - 支持订阅模式：页面内 ErrorToast / Banner 可订阅全局错误
 *   - 与项目现有组件（ErrorToast.vue）打通，一处订阅处处响应
 *
 * 使用：
 *   import msg from '@/utils/msg';
 *   msg.success('导入完成');
 *   msg.error('导入失败：xx');
 *   msg.warn('即将弃用');
 *   msg.info('提示信息');
 *   msg.confirm('确定删除？').then(ok => ok && doDelete());
 *   const off = msg.onError(handler);  // 页面内 Banner 订阅
 *   off();                              // onUnload 时取消
 */

// 订阅者列表
const errorSubscribers = new Set();
const successSubscribers = new Set();

/** 统一 toast 参数（项目风格：#FAF8F2 背景色系） */
const TOAST_DURATION = 2500;

function emit(subs, payload) {
  subs.forEach((handler) => {
    try {
      handler(payload);
    } catch (e) {
      console.warn('[msg] subscriber error:', e.message);
    }
  });
}

// ─── 基础 toast ───

function toast(title, icon = 'none', duration = TOAST_DURATION) {
  uni.showToast({ title: String(title || '').slice(0, 40), icon, duration });
}

function success(title, duration) {
  toast(title || '操作成功', 'success', duration);
  emit(successSubscribers, { type: 'success', message: title, ts: Date.now() });
}

function error(title, duration) {
  toast(title || '操作失败', 'none', duration);
  const payload = { type: 'error', message: title, ts: Date.now() };
  emit(errorSubscribers, payload);
  console.error('[msg:error]', title);
}

function warn(title, duration) {
  toast(title || '警告', 'none', duration);
  console.warn('[msg:warn]', title);
}

function info(title, duration) {
  toast(title || '', 'none', duration);
}

// ─── 对话框 ───

function confirm(content, { title = '提示', confirmText = '确定', cancelText = '取消' } = {}) {
  return new Promise((resolve) => {
    uni.showModal({
      title,
      content: String(content),
      confirmText,
      cancelText,
      success: (res) => resolve(!!res.confirm),
      fail: () => resolve(false)
    });
  });
}

function alert(content, { title = '提示' } = {}) {
  return new Promise((resolve) => {
    uni.showModal({
      title,
      content: String(content),
      showCancel: false,
      success: () => resolve(true),
      fail: () => resolve(false)
    });
  });
}

// ─── Loading ───

function showLoading(title = '加载中...') {
  uni.showLoading({ title, mask: true });
}

function hideLoading() {
  uni.hideLoading();
}

// ─── 订阅管理 ───

function onError(handler) {
  errorSubscribers.add(handler);
  return () => errorSubscribers.delete(handler);
}

function onSuccess(handler) {
  successSubscribers.add(handler);
  return () => successSubscribers.delete(handler);
}

// ─── 导出 ───

export default {
  toast,
  success,
  error,
  warn,
  info,
  confirm,
  alert,
  showLoading,
  hideLoading,
  onError,
  onSuccess
};
