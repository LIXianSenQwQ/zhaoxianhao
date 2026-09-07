<template>
  <view class="avatar-page">
    <view class="page-header">
      <text class="page-title">虚拟角色</text>
      <text class="page-subtitle">家园主人形象 · 成长仅来自家族行为</text>
    </view>

    <!-- 角色卡 -->
    <view v-if="avatar" class="avatar-card">
      <view class="avatar-face">
        <text class="face-emoji">{{ faceEmoji }}</text>
      </view>
      <view class="avatar-info">
        <text class="avatar-name">{{ avatar.name }}</text>
        <text class="avatar-title">{{ avatar.title || '暂无称号' }}</text>
        <view class="avatar-level">
          <text>Lv.{{ avatar.level }} · 修为 {{ avatar.exp }}</text>
        </view>
      </view>
    </view>
    <view v-else-if="!loading" class="empty-box">
      <text>尚未创建虚拟角色</text>
      <button class="create-btn" @tap="startCreate">创建角色</button>
    </view>

    <!-- 创建/编辑 -->
    <view v-if="editing" class="edit-card">
      <view class="form-row">
        <text class="form-label">角色名</text>
        <input class="form-input" v-model="draft.name" maxlength="12" placeholder="如：梨园小生" />
      </view>
      <view class="form-row">
        <text class="form-label">形象</text>
        <view class="face-options">
          <view
            v-for="f in FACE_OPTIONS"
            :key="f.emoji"
            class="face-chip"
            :class="{ active: draft.face === f.emoji }"
            @tap="draft.face = f.emoji"
          ><text>{{ f.emoji }}</text></view>
        </view>
      </view>
      <view class="form-row" v-if="avatar">
        <text class="form-label">称号</text>
        <input class="form-input" v-model="draft.title" maxlength="12" placeholder="选填" />
      </view>
      <view class="form-actions">
        <button class="save-btn" :disabled="!draft.name.trim()" @tap="save">保存</button>
        <button class="cancel-btn" @tap="editing = false">取消</button>
      </view>
    </view>

    <!-- 无角色时的引导 -->
    <view v-if="!avatar && !editing" class="create-hint">
      <text>以角色的名义在家族家园中行走，累积「修为」解锁装扮。</text>
    </view>

    <!-- 合规声明 -->
    <view class="comp-tip">
      <text class="comp-text">虚拟形象为家族文化载体 · 无内购无充值 · 修为仅来源于家族行为与任务</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { avatarGet, avatarCreate, avatarUpdate } from '@/services/home';

const FACE_OPTIONS = [
  { emoji: '🧓' }, { emoji: '👨‍🌾' }, { emoji: '🧕' }, { emoji: '👵' },
  { emoji: '🎭' }, { emoji: '📚' }, { emoji: '🪷' }, { emoji: '🌾' }
];

const avatar = ref<any>(null);
const loading = ref(false);
const editing = ref(false);
const draft = ref({ name: '', face: '🎭', title: '' });

const faceEmoji = computed(() => {
  const f = FACE_OPTIONS.find(o => o.emoji === avatar.value?.face);
  return f ? f.emoji : '🎭';
});

onMounted(loadAvatar);

async function loadAvatar() {
  loading.value = true;
  try {
    const res = await avatarGet();
    if (res.data?.avatar) {
      avatar.value = res.data.avatar;
      draft.value = { name: avatar.value.name, face: avatar.value.face || '🎭', title: avatar.value.title || '' };
    }
  } catch (e: any) {
    uni.showToast({ title: e.message || '获取角色失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
}

function startCreate() {
  editing.value = true;
  draft.value = { name: '', face: '🎭', title: '' };
}

async function save() {
  if (!draft.value.name.trim()) return;
  try {
    if (avatar.value) {
      const res = await avatarUpdate({ name: draft.value.name.trim(), face: draft.value.face, title: draft.value.title.trim() });
      if (res.success) avatar.value = { ...avatar.value, ...res.data };
    } else {
      const res = await avatarCreate(draft.value.name.trim(), { emoji: draft.value.face });
      if (res.success) avatar.value = res.data?.avatar;
    }
    editing.value = false;
    uni.showToast({ title: '已保存', icon: 'success' });
  } catch (e: any) {
    uni.showToast({ title: e.message || '保存失败', icon: 'none' });
  }
}
</script>

<style scoped>
.avatar-page { flex: 1; min-height: 100vh; background: #FAF8F2; padding: 16px; box-sizing: border-box; }
.page-header { padding: 8px 0 12px; }
.page-title { display: block; font-size: 22px; font-weight: 700; color: #2B2723; }
.page-subtitle { display: block; font-size: 12px; color: #8A867F; margin-top: 4px; }
.avatar-card { display: flex; align-items: center; gap: 16px; background: #FFF; border-radius: 14px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
.avatar-face { width: 72px; height: 72px; border-radius: 50%; background: #F3EDE3; display: flex; align-items: center; justify-content: center; }
.face-emoji { font-size: 40px; }
.avatar-info { flex: 1; }
.avatar-name { display: block; font-size: 18px; font-weight: 700; color: #2B2723; }
.avatar-title { display: block; font-size: 12px; color: #A8783B; margin-top: 2px; }
.avatar-level { margin-top: 8px; display: inline-block; background: #FBF3E8; color: #A8783B; border-radius: 6px; padding: 2px 8px; font-size: 12px; }
.empty-box { background: #FFF; border-radius: 12px; padding: 40px 0; text-align: center; color: #B0A99C; font-size: 14px; }
.create-btn { margin-top: 14px; background: #B03A2E; color: #FFF; border-radius: 8px; width: 200px; }
.create-hint { margin-top: 12px; background: #FBF3E8; border-radius: 8px; padding: 12px; color: #A8783B; font-size: 13px; }
.edit-card { background: #FFF; border-radius: 12px; padding: 16px; margin-top: 14px; }
.form-row { margin-bottom: 12px; }
.form-label { display: block; font-size: 13px; color: #8A867F; margin-bottom: 6px; }
.form-input { background: #F7F4EC; border-radius: 8px; padding: 8px 12px; height: 38px; font-size: 14px; }
.face-options { display: flex; flex-wrap: wrap; gap: 8px; }
.face-chip { width: 44px; height: 44px; border-radius: 10px; border: 1px solid #EEE7DA; display: flex; align-items: center; justify-content: center; font-size: 24px; background: #FFF; }
.face-chip.active { border-color: #B03A2E; background: #FDF2F0; }
.form-actions { display: flex; gap: 10px; }
.save-btn { flex: 1; background: #B03A2E; color: #FFF; border-radius: 8px; font-size: 14px; }
.save-btn[disabled] { opacity: 0.5; }
.cancel-btn { flex: 1; background: #F3EDE3; color: #5A5348; border-radius: 8px; font-size: 14px; }
.comp-tip { background: #FBF3E8; border-radius: 8px; padding: 8px 12px; margin-top: 14px; text-align: center; }
.comp-text { font-size: 12px; color: #A8783B; }
</style>