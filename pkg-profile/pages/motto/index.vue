<!--
  pkg-profile/pages/motto/index.vue — 家风家训（蓝图 V1.1 §8 家训展示 + 首页祖训卡同源）
  数据：profile.motto.get → { motto, canEdit, source }
  交互：
    · 家训横幅卡（书法视觉：大字号居中、宽松行距、朱丝边饰）
    · canEdit（EDITOR+）展开编辑（≤500 字，updateFamilyInfo 落 settings.family_motto）
  降级：未录入家训 → 引导文案；家训将同步至首页祖训卡（atmosphere/notify.digest 同源）
-->
<template>
  <view class="motto-page">
    <!-- 家训横幅 -->
    <view v-if="loading" class="sk-card" />
    <template v-else>
      <view v-if="motto" class="motto-banner">
        <text class="motto-hd">家 训</text>
        <text class="motto-text">{{ motto }}</text>
        <view class="seal"><text>诚</text></view>
      </view>
      <view v-else class="motto-banner empty-banner">
        <text class="motto-hd">家 训</text>
        <text class="empty-t">家风家训尚未录入</text>
        <text class="empty-s">由族史委维护后展示于此，并同步至首页祖训卡</text>
      </view>
    </template>

    <!-- 释义说明卡 -->
    <view class="note-card">
      <text class="note-title">训诫立身 · 传家以诚</text>
      <text class="note-body">
        家训为族之纲常。本页展示经族史委审核发布的家族训言，亦作首页「今日祖训」卡内容来源（settings.family_motto）。
      </text>
    </view>

    <!-- 编辑（EDITOR+） -->
    <view v-if="canEdit" class="edit-wrap">
      <button class="edit-toggle" @click="showEdit = !showEdit">
        {{ showEdit ? '收起' : (motto ? '修订家训' : '录入家训') }}
      </button>
      <view v-if="showEdit" class="edit-panel">
        <textarea
          class="edit-input"
          v-model="editText"
          placeholder="输入家风家训（≤500 字），如：忠厚传家久，诗书继世长。"
          maxlength="500"
          :auto-height="true"
        />
        <view class="edit-actions">
          <text class="char-count">{{ editText.length }}/500</text>
          <button class="save-btn" :disabled="saving" @click="saveMottoText">
            {{ saving ? '保存中…' : '发布家训' }}
          </button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { getMotto, saveMotto } from '@/services/profile';

const motto = ref('');
const canEdit = ref(false);
const loading = ref(true);
const showEdit = ref(false);
const editText = ref('');
const saving = ref(false);

async function load() {
  loading.value = true;
  const res = await getMotto();
  loading.value = false;
  const d = res.data;
  if (d) {
    motto.value = d.motto || '';
    canEdit.value = !!d.canEdit;
    editText.value = motto.value;
  }
}
onShow(load);

async function saveMottoText() {
  const text = editText.value.trim();
  if (!text) return uni.showToast({ title: '请输入家训内容', icon: 'none' });
  if (text.length > 500) return uni.showToast({ title: '家训不超过 500 字', icon: 'none' });
  saving.value = true;
  const res = await saveMotto(text);
  saving.value = false;
  if (res.error && !res.data) {
    uni.showToast({ title: (res.error as any)?.message || '保存失败', icon: 'none' });
  } else {
    uni.showToast({ title: '家训已发布', icon: 'success' });
    showEdit.value = false;
    load();
  }
}
</script>

<style lang="scss" scoped>
.motto-page { min-height: 100vh; background: #F7F6F3; padding: 16px 12px 32px; box-sizing: border-box; }

.motto-banner {
  position: relative;
  background: #FFF; border-radius: 12px; padding: 34px 28px;
  box-shadow: 0 2px 12px rgba(38,34,30,.06);
  border-top: 2px solid #C9A063; border-bottom: 2px solid #C9A063; /* 朱丝栏 */
}
.motto-hd {
  display: block; text-align: center; font-size: 13px; letter-spacing: 8px;
  color: #8A7B5A; margin-bottom: 20px; font-weight: 600;
}
.motto-text {
  display: block; text-align: center; font-size: 20px; line-height: 2.1;
  color: #2B2723; font-weight: 500; letter-spacing: 2px;
}
.seal {
  position: absolute; right: 20px; bottom: 18px;
  width: 34px; height: 34px; border: 1.5px solid #B03A2E; border-radius: 6px;
  display: flex; align-items: center; justify-content: center; transform: rotate(-8deg);
}
.seal text { color: #B03A2E; font-size: 18px; font-weight: 700; }

.empty-banner { padding: 36px 24px; }
.empty-t { display: block; text-align: center; font-size: 15px; font-weight: 600; color: #6E6659; }
.empty-s { display: block; text-align: center; font-size: 12px; color: #B0A99A; margin-top: 8px; line-height: 1.7; }

.note-card { background: #FFF; border-radius: 12px; padding: 14px 16px; margin-top: 12px; box-shadow: 0 2px 12px rgba(38,34,30,.06); }
.note-title { display: block; font-size: 13px; font-weight: 700; color: #8A7B5A; margin-bottom: 6px; letter-spacing: 1px; }
.note-body { font-size: 12px; color: #6E6659; line-height: 1.8; }

.edit-wrap { margin-top: 12px; }
.edit-toggle {
  height: 42px; line-height: 42px; font-size: 14px; font-weight: 600;
  background: #FFF; color: #8A7B5A; border: 1px solid #EAE4D6; border-radius: 8px; padding: 0;
}
.edit-panel { background: #FFF; border-radius: 12px; padding: 14px; margin-top: 10px; }
.edit-input {
  width: 100%; min-height: 120px; box-sizing: border-box;
  background: #FAF8F2; border-radius: 8px; padding: 10px; font-size: 15px; color: #2B2723; line-height: 1.8;
}
.edit-actions { display: flex; align-items: center; justify-content: space-between; margin-top: 10px; }
.char-count { font-size: 12px; color: #B0A99A; }
.save-btn { width: 130px; height: 38px; line-height: 38px; font-size: 13px; color: #FFF; background: #B03A2E; border-radius: 8px; padding: 0; }
.save-btn[disabled] { background: #D8A59D; }

.sk-card { height: 220px; border-radius: 12px; background: linear-gradient(90deg,#F0EDE4 25%,#F7F4EC 50%,#F0EDE4 75%); background-size: 400% 100%; animation: shimmer 1.2s ease infinite; }
@keyframes shimmer { 0% { background-position: 100% 0; } 100% { background-position: -100% 0; } }
</style>
