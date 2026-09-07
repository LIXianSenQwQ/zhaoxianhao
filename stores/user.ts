/**
 * stores/user.ts
 * Pinia 用户状态管理（通过 services 统一层，满足§7.10 接口不变性校验）
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { login as authLogin } from '../services/auth';
import { getFeatureFlags, updateFeatureFlag } from '../services/admin';

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
    try {
      const { token, userInfo: user } = await authLogin();
      if (token && user) {
        userInfo.value = { ...user, status: user.status || 'ACTIVE' };
        uni.setStorageSync('token', token);
      }
    } catch (err) {
      console.warn('store/login failed:', err);
      throw err;
    }
  }

  async function loadFeatureFlags() {
    try {
      const res = await getFeatureFlags();
      if (res.data?.flags) {
        featureFlags.value = res.data.flags;
      }
    } catch (e) {
      console.warn('loadFeatureFlags via admin service failed:', e);
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

  async function updateFlag(key: string, enabled: boolean, scope?: string) {
    return updateFeatureFlag(key, enabled, scope);
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
    updateFlag,
    toggleElderMode,
    logout
  };
});
