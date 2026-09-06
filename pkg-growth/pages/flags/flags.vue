<!-- pkg-growth/pages/flags/flags.vue – 功能开关面板（Sprint R12：蓝图 17.2 开关表，CHIEF 专属，接 admin.getFeatureFlags/featureFlag） -->
<template>
  <view class="flags-page">
    <BaseCard title="功能开关管理">
      <text class="desc">族长专属（蓝图 17.2）：关闭后前端入口不出现（不留灰按钮），接口返回 403。变更实时生效并写审计。</text>

      <view v-if="!isChief" class="deny">
        <text>仅族长可维护功能开关。</text>
      </view>

      <view v-else class="flag-list">
        <view v-for="f in flags" :key="f.key" class="flag-row">
          <view class="flag-info">
            <text class="flag-key">{{ f.label }}</text>
            <text class="flag-note">{{ f.note || f.key }}</text>
          </view>
          <switch
            :checked="f.enabled"
            :disabled="toggling === f.key"
            color="#B03A2E"
            @change="e => toggle(f, e.detail.value)"
          />
        </view>
      </view>
    </BaseCard>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { read, write } from '@/services/request';
import BaseCard from '@/components/common/BaseCard.vue';

/** 开关键 → 中文标签（蓝图 17.2 开关表） */
const KEY_LABELS: Record<string, string> = {
  v11Profile: 'V1.1 头像/视频/相册',
  v11Weather: 'V1.1 天气小件',
  v11Motto: 'V1.1 家风家训',
  v11Generation: 'V1.1 字辈展示',
  v11Security: 'V1.1 密码安全',
  v11Almanac: 'V1.1 老皇历',
  v20Content: 'V2.0 本地内容',
  v20News: 'V2.0 新闻资讯',
  v20Moment: 'V2.0 家族动态',
  v20Games: 'V2.0 合规版游戏',
  v20Home: 'V2.0 虚拟成长家园',
  live: '直播（P2）',
  healthArchive: '健康档案（P1）',
  treeFanView: '族谱扇形视图（P1）',
  homeFamilyCard: '首页家庭卡'
};

const raw = ref<Record<string, any>>({});
const isChief = ref(false);
const toggling = ref<string | null>(null);

const flags = computed(() =>
  Object.entries(raw.value).map(([key, v]) => ({
    key,
    enabled: !!(v && v.enabled),
    note: v && v.note,
    label: KEY_LABELS[key] || key
  }))
);

async function load() {
  const me = await read('auth', { action: 'me' }, null, 0).catch(() => null);
  const role = me?.success && me.data?.user ? me.data.user.role : (uni.getStorageSync('role') || '');
  isChief.value = role === 'CHIEF';

  const res = await read('admin', { action: 'getFeatureFlags' }, 'featureFlags', 15000);
  if (res.success && res.data?.flags) raw.value = res.data.flags;
}

/** 切换开关（乐观更新 + 失败回滚）；admin.featureFlag 变更写审计（后端） */
async function toggle(f: { key: string; enabled: boolean }, next: boolean) {
  if (toggling.value) return;
  const prev = raw.value[f.key];
  toggling.value = f.key;
  raw.value = { ...raw.value, [f.key]: { ...(prev || {}), enabled: next } };
  try {
    const res = await write(
      'admin',
      { action: 'featureFlag', key: f.key, value: { enabled: next } },
      'admin.featureFlag',
      f.key
    );
    if (res.success && res.data?.flags) {
      raw.value = res.data.flags;
      uni.showToast({ title: next ? '已开启' : '已关闭', icon: 'none' });
    } else {
      raw.value = { ...raw.value, [f.key]: prev };
      uni.showToast({ title: res.message || '变更失败', icon: 'none' });
    }
  } catch (e) {
    raw.value = { ...raw.value, [f.key]: prev };
  } finally {
    toggling.value = null;
  }
}

load();
</script>

<style scoped>
.flags-page { min-height: 100vh; background: #F7F6F3; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.desc { font-size: 13px; color: #8A8378; display: block; margin-bottom: 12px; }
.deny { text-align: center; color: #C0392B; font-size: 14px; padding: 24px 0; }
.flag-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #EAE4D6; }
.flag-row:last-child { border-bottom: none; }
.flag-info { display: flex; flex-direction: column; gap: 2px; flex: 1; margin-right: 12px; }
.flag-key { font-size: 14px; color: #2B2320; font-weight: 500; }
.flag-note { font-size: 11px; color: #B0A99A; word-break: break-all; }
</style>
