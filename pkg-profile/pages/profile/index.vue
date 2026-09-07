<!--
  pkg-profile/pages/profile/index.vue — 个人档案 V1.1 中心（蓝图第八部分）
  功能：
    · 顶部用户卡（头像可更换：chooseImage → 云存储 uploadFile → profile.saveAvatar → CI 转码）
    · 功能九宫格：问候语 / 家训 / 字辈 / 百年家书 / 相册 / 私密委托 / 账号安全
    · 仅 V1.1 flags 开启时显示对应项（入口级灰化），全部直连 pkg-profile 分包页面
-->
<template>
  <view class="profile-page">
    <!-- 用户卡 -->
    <view class="user-card">
      <view class="user-top">
        <image v-if="avatarUrl" class="avatar" :src="avatarUrl" mode="aspectFill" />
        <view v-else class="avatar avatar-ph">{{ initial }}</view>
        <view class="user-info">
          <text class="nick">{{ nickName || '未登录用户' }}</text>
          <text class="role" :class="roleClass">{{ roleLabel }}</text>
        </view>
        <button v-if="store.isLoggedIn" class="change-avatar" @click="changeAvatar">换头像</button>
      </view>
      <text class="user-sub">V1.1 个人档案 · 头像 / 问候 / 家训 / 字辈 / 百年家书</text>
    </view>

    <!-- 功能九宫格 -->
    <view class="grid">
      <view v-for="m in modules" :key="m.key" class="grid-item" @click="go(m.url)">
        <view class="icon-wrap" :style="{ background: m.bg }"><text class="icon">{{ m.icon }}</text></view>
        <text class="grid-label">{{ m.label }}</text>
        <text class="grid-desc">{{ m.desc }}</text>
      </view>
    </view>

    <!-- 说明 -->
    <view class="note">
      <text class="note-t">隐私说明</text>
      <text class="note-b">头像、问候与相册默认仅 FAMILY 可见；家训/字辈为全族展示内容（EDITOR+ 维护）。</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onMounted } from 'vue';
import { useUserStore } from '@/stores/user';
import { saveAvatar } from '@/services/profile';

const store = useUserStore();
const avatarUrl = ref('');
const nickName = ref('');
const initial = computed(() => (nickName.value ? nickName.value.slice(0, 1) : '郝'));

const ROLE_LABEL: Record<string, string> = {
  VISITOR: '访客', MEMBER: '族人', EDITOR: '编辑', HISTORIAN: '族史委', CHIEF: '族长', ADMIN: '管理员'
};
const roleLabel = computed(() => ROLE_LABEL[store.userInfo?.role || 'VISITOR'] || '族人');
const roleClass = computed(() => {
  const r = store.userInfo?.role || 'VISITOR';
  return r === 'CHIEF' ? 'chief' : r === 'HISTORIAN' ? 'historian' : r === 'VISITOR' ? 'visitor' : 'member';
});

const modules = [
  { key: 'greeting', label: '家庭问候语', desc: '首页问候区', icon: '问', url: '/pkg-profile/pages/greeting/index', bg: '#F4EDDD' },
  { key: 'motto', label: '家风家训', desc: '族之纲常', icon: '训', url: '/pkg-profile/pages/motto/index', bg: '#F6E9DC' },
  { key: 'generation', label: '字辈', desc: '行辈次序', icon: '辈', url: '/pkg-profile/pages/generation/index', bg: '#F4F1E8' },
  { key: 'capsule', label: '百年家书', desc: '定时解封', icon: '封', url: '/pkg-profile/pages/capsule/index', bg: '#F1ECE2' },
  { key: 'photomgr', label: '我的相册', desc: '家族影像', icon: '影', url: '/pkg-profile/pages/photomgr/index', bg: '#EDF2EC' },
  { key: 'delegate', label: '私密委托', desc: '授权代理', icon: '委', url: '/pkg-profile/pages/delegate/index', bg: '#ECF0F1' },
  { key: 'security', label: '账号安全', desc: '密码/反向', icon: '安', url: '/pkg-profile/pages/security/index', bg: '#FBEEEC' }
];

function go(url: string) {
  uni.navigateTo({ url });
}

onMounted(() => {
  if (store.isLoggedIn && store.userInfo) {
    nickName.value = store.userInfo.nickName || '';
    avatarUrl.value = store.userInfo.avatarUrl || '';
  }
});

/** 更换头像：选择 → 云存储上传（微信环境）→ profile.saveAvatar */
async function changeAvatar() {
  if (!store.isLoggedIn) {
    uni.navigateTo({ url: '/pages/login/login' });
    return;
  }
  const chosen = await new Promise<string>((resolve) => {
    uni.chooseImage({
      count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'],
      success: (res) => resolve(res.tempFilePaths[0]),
      fail: () => resolve('')
    });
  });
  if (!chosen) return;

  // 小程序云开发上传（H5 环境提示微信端操作）
  const wxCtx: any = (globalThis as any).wx;
  if (!wxCtx || !wxCtx.cloud || typeof wxCtx.cloud.uploadFile !== 'function') {
    uni.showToast({ title: '请在微信端上传头像', icon: 'none' });
    return;
  }
  const ext = (chosen.split('.').pop() || 'jpg').toLowerCase();
  const cloudPath = `avatars/${store.userInfo?.id || 'u'}/${Date.now()}.${ext}`;
  const upRes: any = await new Promise((resolve) => {
    wxCtx.cloud.uploadFile({ cloudPath, filePath: chosen, success: resolve, fail: () => resolve(null) });
  });
  if (!upRes || !upRes.fileID) return uni.showToast({ title: '上传失败', icon: 'none' });

  const res = await saveAvatar({ fileId: upRes.fileID, cropMeta: { ratio: '1:1' }, visibility: 'FAMILY' });
  if (res.data) {
    uni.showToast({ title: '头像已更新', icon: 'success' });
    avatarUrl.value = upRes.fileID; // 云存储 fileID 可由 image 直接渲染
  } else {
    uni.showToast({ title: (res.error as any)?.message || '保存失败', icon: 'none' });
  }
}
</script>

<style lang="scss" scoped>
.profile-page { min-height: 100vh; background: #FAF8F2; padding: 16px 12px 32px; box-sizing: border-box; }

.user-card {
  background: linear-gradient(135deg, #FDFCF8, #F5F1E6 60%, #EDF2EC);
  border-radius: 12px; padding: 18px 16px; margin-bottom: 14px;
  box-shadow: 0 2px 12px rgba(38,34,30,.06);
}
.user-top { display: flex; align-items: center; gap: 12px; }
.avatar { width: 64px; height: 64px; border-radius: 50%; background: #EEE7DA; flex-shrink: 0; }
.avatar-ph { display: flex; align-items: center; justify-content: center; font-size: 26px; color: #8A7B5A; background: #E9E4D8; }
.user-info { flex: 1; min-width: 0; }
.nick { display: block; font-size: 18px; font-weight: 700; color: #2B2723; }
.role {
  display: inline-block; margin-top: 4px; font-size: 11px; padding: 1px 8px; border-radius: 8px;
}
.role.chief { color: #8A6D3B; background: #F4EDDD; }
.role.historian { color: #7A4A2B; background: #F6E9DC; }
.role.member { color: #B03A2E; background: #FBEEEC; }
.role.visitor { color: #6E6659; background: #F0EEE8; }
.change-avatar { font-size: 12px; color: #B03A2E; background: #FFF; border: 1px solid #E5C5C0; border-radius: 6px; padding: 0 10px; height: 30px; line-height: 30px; flex-shrink: 0; }
.user-sub { display: block; margin-top: 12px; font-size: 11px; color: #8A7B5A; }

.grid { display: flex; flex-wrap: wrap; gap: 10px; }
.grid-item {
  width: calc((100% - 20px) / 3); box-sizing: border-box;
  background: #FFF; border-radius: 12px; padding: 14px 10px 12px; text-align: center;
  box-shadow: 0 2px 12px rgba(38,34,30,.06);
}
.icon-wrap {
  width: 44px; height: 44px; margin: 0 auto 8px; border-radius: 10px;
  display: flex; align-items: center; justify-content: center;
}
.icon { font-size: 20px; color: #8A6D3B; font-weight: 600; }
.grid-label { display: block; font-size: 13px; font-weight: 600; color: #2B2723; }
.grid-desc { display: block; font-size: 10px; color: #B0A99A; margin-top: 2px; }

.note { margin-top: 16px; padding: 0 4px; }
.note-t { display: block; font-size: 12px; font-weight: 700; color: #8A7B5A; margin-bottom: 4px; }
.note-b { font-size: 11px; color: #B0A99A; line-height: 1.7; }
</style>
