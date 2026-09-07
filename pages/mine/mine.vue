<template>
  <view class="mine-page">
    <!-- 加载骨架 -->
    <Skeleton v-if="loading" :rows="3" />

    <!-- 错误兜底 -->
    <ErrorPage
      v-else-if="loadError"
      :message="loadError"
      @retry="loadProfile"
    />

    <template v-else>
      <!-- 个人信息卡 -->
      <BaseCard>
        <view class="profile">
          <image
            class="avatar"
            :src="profile.avatarUrl || '/static/logo.png'"
            mode="aspectFill"
          />
          <view class="profile-main">
            <text class="nick" :class="{ 'elder-text': store.elderMode }">
              {{ profile.nickName || '族人' }}
            </text>
            <view class="role-badge" :class="roleClass">{{ roleLabel }}</view>
          </view>
        </view>
      </BaseCard>

      <!-- 无障碍 / 显示模式 -->
      <BaseCard title="显示设置">
        <view class="switch-row" @tap="store.toggleElderMode()">
          <text class="row-label" :class="{ 'elder-text': store.elderMode }">年长模式（字号 ×1.4）</text>
          <view class="switch-ui" :class="{ on: store.elderMode }">
            <view class="knob" />
          </view>
        </view>
        <view class="switch-row" @tap="store.toggleChildMode()">
          <text class="row-label" :class="{ 'elder-text': store.childMode }">少年模式（游戏限时 · 内容净网）</text>
          <view class="switch-ui" :class="{ on: store.childMode }">
            <view class="knob" />
          </view>
        </view>
      </BaseCard>

      <!-- 常用入口 -->
      <BaseCard title="常用">
        <view
          v-for="item in entries"
          :key="item.key"
          class="entry-row"
          @tap="go(item)"
        >
          <text class="row-label" :class="{ 'elder-text': store.elderMode }">{{ item.label }}</text>
          <text class="arrow">›</text>
        </view>
      </BaseCard>

      <!-- 隐私说明 -->
      <PrivacyCard :level="profile.role ? '公开' : '未认证'" :desc="privacyDesc" />
    </template>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useUserStore } from '@/stores/user';
import { read } from '@/services/request';
import BaseCard from '@/components/common/BaseCard.vue';
import Skeleton from '@/components/common/Skeleton.vue';
import ErrorPage from '@/components/common/ErrorPage.vue';
import PrivacyCard from '@/components/common/PrivacyCard.vue';

const store = useUserStore();
const loading = ref(true);
const loadError = ref('');
const profile = ref<{ nickName?: string; avatarUrl?: string; role?: string }>({});

const ROLE_LABEL: Record<string, string> = {
  VISITOR: '访客', MEMBER: '认证会员', EDITOR: '编辑',
  HISTORIAN: '族史委', CHIEF: '族长', ADMIN: '管理员'
};

const roleLabel = computed(() => ROLE_LABEL[profile.value.role || 'VISITOR'] || '族人');
const roleClass = computed(() => {
  const r = profile.value.role || 'VISITOR';
  return r === 'CHIEF' ? 'badge-chief' : r === 'VISITOR' ? 'badge-visitor' : 'badge-member';
});

const privacyDesc = computed(() =>
  store.isLoggedIn
    ? '您的个人资料按隐私分级保护，族人仅可查看您授权的字段'
    : '完成认证后即可查看族谱与家族动态'
);

const entries = computed(() => {
  const base = [
    { key: 'tree', label: '我的族谱树', url: '/pkg-family/pages/tree/tree' },
    { key: 'profile', label: '个人档案（V1.1）', url: '/pkg-profile/pages/profile/index' },
    { key: 'task', label: '成长任务', url: '/pkg-growth/pages/task/task' },
    { key: 'notify', label: '我的消息', url: '/pkg-calendar/pages/notification/index' }
  ];
  // 家族专区入口（V2.0）
  if (window._featureFlags?.v20News?.enabled) {
    base.push({ key: 'news', label: '家族新闻', url: '/pkg-news/pages/news/index' });
  }
  if (window._featureFlags?.v20Moment?.enabled) {
    base.push({ key: 'moment', label: '家族动态', url: '/pkg-moment/pages/moment/index' });
  }
  // 族史委及以上显示审核入口
  if (store.isAdmin) {
    base.push({ key: 'audit', label: '入谱审核', url: '/pkg-growth/pages/audit/audit' });
  }
  // 族长可见授权审批入口
  if (store.isChief) {
    base.push({ key: 'reviewAuth', label: '授权审批', url: '/pkg-growth/pages/reviewAuth/reviewAuth' });
  }
  return base;
});

function go(item: { url: string }) {
  uni.navigateTo({ url: item.url });
}

async function loadProfile() {
  loading.value = true;
  loadError.value = '';
  const res = await read('auth', { action: 'profile' }, 'mine:profile', 60000);
  if (res.data) {
    profile.value = res.data;
  } else {
    // 未登录/游客也允许浏览本页（访客态），仅网络异常才显示错误页
    loadError.value = res.error && res.error.code !== 403 ? res.error.message : '';
    if (res.error && res.error.code === 403) {
      profile.value = {}; // 访客态展示
    }
  }
  loading.value = false;
}

onMounted(loadProfile);
</script>

<style scoped>
.mine-page { padding: 48px 16px 32px; display: flex; flex-direction: column; gap: 12px; }

.profile { display: flex; align-items: center; gap: 12px; }
.avatar { width: 56px; height: 56px; border-radius: 50%; background: #EEE7DA; }
.profile-main { display: flex; flex-direction: column; gap: 6px; }
.nick { font-size: 20px; font-weight: 700; color: #2B2320; }
.elder-text { font-size: 28px !important; }

.role-badge { align-self: flex-start; font-size: 11px; padding: 2px 8px; border-radius: 10px; }
.badge-visitor { background: #EFECE6; color: #8A8378; }
.badge-member { background: #E8F0E4; color: #4E6E3F; }
.badge-chief { background: #F5E6D3; color: #8A5A2B; }

.switch-row, .entry-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 0; border-bottom: 1px solid #F0ECE4;
}
.switch-row:last-child, .entry-row:last-child { border-bottom: none; }
.row-label { font-size: 15px; color: #2B2320; }
.arrow { color: #C9C2B4; font-size: 18px; }

.switch-ui {
  width: 44px; height: 24px; border-radius: 12px; background: #DDD7CC;
  position: relative; transition: background 0.2s;
}
.switch-ui.on { background: #7A9A5F; }
.knob {
  position: absolute; top: 2px; left: 2px; width: 20px; height: 20px;
  border-radius: 50%; background: #FFF; transition: left 0.2s;
}
.switch-ui.on .knob { left: 22px; }
</style>
