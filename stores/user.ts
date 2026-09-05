/**
 * stores/user.ts
 * Pinia 用户状态管理
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useUserStore = defineStore('user', () => {
  // State
  const userInfo = ref<{
    id: string;
    openid: string;
    nickName: string;
    avatarUrl: string;
    role: string;
    memberId?: string;
    branchId?: string;
    status: string;
  } | null>(null);

  const elderMode = ref(false); // 年长模式
  const childMode = ref(false); // 少年模式
  const featureFlags = ref<Record<string, any>>({});

  // Getters
  const isLoggedIn = computed(() => !!userInfo.value);
  const isMember = computed(() => userInfo.value?.role === 'MEMBER' || ['EDITOR', 'CHIEF'].includes(userInfo.value?.role || ''));
  const isAdmin = computed(() => ['CHIEF', 'EDITOR', 'HISTORIAN'].includes(userInfo.value?.role || ''));
  const isChief = computed(() => userInfo.value?.role === 'CHIEF');

  // Actions
  async function login() {
    const { code } = await wx.login();
    const res = await wx.cloud.callFunction({
      name: 'login',
      data: { code }
    });

    if (res.result?.success) {
      userInfo.value = res.result.userInfo;
      uni.setStorageSync('token', res.result.token);
    }
  }

  async function loadFeatureFlags() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'admin',
        data: { action: 'getFeatureFlags' }
      });
      featureFlags.value = res.result?.flags || {};
    } catch (e) {
      console.warn('loadFeatureFlags failed:', e);
    }
  }

  function isFeatureEnabled(key: string): boolean {
    return !!featureFlags.value[key]?.enabled;
  }

  function isV11Enabled(feature: string): boolean {
    return isFeatureEnabled(`v11${feature}`);
  }

  function isV20Enabled(feature: string): boolean {
    return isFeatureEnabled(`v20${feature}`);
  }

  function toggleElderMode() {
    elderMode.value = !elderMode.value;
    uni.setStorageSync('elderMode', elderMode.value);
  }

  function logout() {
    userInfo.value = null;
    uni.removeStorageSync('token');
  }

  return {
    userInfo,
    elderMode,
    childMode,
    featureFlags,
    isLoggedIn,
    isMember,
    isAdmin,
    isChief,
    login,
    loadFeatureFlags,
    isFeatureEnabled,
    isV11Enabled,
    isV20Enabled,
    toggleElderMode,
    logout
  };
});
