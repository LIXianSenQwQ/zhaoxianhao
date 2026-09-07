<!--
  pkg-profile/pages/greeting/index.vue — 家庭问候语（蓝图 V1.1 §8 问候）
  数据：profile.greeting.active → { card }  |  profile.greeting.list → { cards[] }
  交互：
    · 首页问候区展示当前 ACTIVE 卡片（今日自动显示）
    · 本页面显示"我的问候语列表" + 创建新问候语表单（templateId/content{text≤200}/schedule）
-->
<template>
  <view class="greet-page">
    <!-- 今日问候预览 -->
    <view class="card active-card">
      <text class="card-hd">今日问候卡</text>
      <view v-if="activeCard">
        <view class="greet-preview">
          <text class="greet-template">{{ activeCard.templateId || 'default' }}</text>
          <text class="greet-text">{{ (activeCard.content && activeCard.content.text) || '' }}</text>
        </view>
        <text class="greet-footer">{{ activeCard.schedule ? `定时 ${activeCard.schedule.time}` : '立即展示' }}</text>
      </view>
      <view v-else class="empty-state">
        <text class="empty-t">暂无激活的问候卡</text>
        <text class="empty-s">创建问候语将自动成为今日问候，在首页展示</text>
      </view>
      <button class="go-list-btn" @click="scrollToEditor">
        {{ activeCard ? '编辑当前问候' : '创建新问候' }}
      </button>
    </view>

    <!-- 新建问候语表单 -->
    <view id="editor-anchor" ref="editorAnchorRef" class="editor-wrap">
      <view class="editor-head">
        <text class="editor-title">创建问候语卡</text>
        <text class="editor-sub">支持晨安/晚安/节日/节气等模板，自动同步至首页问候区</text>
      </view>

      <!-- 模板选择 -->
      <view class="section">
        <text class="section-label">模板</text>
        <view class="chips">
          <view
            v-for="tid in templates"
            :key="tid.id"
            class="chip"
            :class="{ active: form.templateId === tid.id }"
            @click="form.templateId = tid.id"
          >
            <text>{{ tid.label }}</text>
          </view>
        </view>
      </view>

      <!-- 问候内容 -->
      <view class="section">
        <text class="section-label">问候内容<span class="required">*</span></text>
        <textarea
          class="input-text"
          v-model="form.contentText"
          placeholder="输入问候语（≤200 字），如：新的一天，祝您精神焕发！"
          maxlength="200"
          auto-height
        />
        <text class="count">{{ form.contentText.length }}/200</text>
      </view>

      <!-- 字体大小（简化为字号 14-20） -->
      <view class="section">
        <text class="section-label">字号</text>
        <view class="size-row">
          <view v-for="s in sizes" :key="s" class="size-chip" :class="{ active: form.size === s }" @click="form.size = s">
            <text :style="{ fontSize: s + 'px' }">{{ sizeLabel(s) }}</text>
          </view>
        </view>
      </view>

      <!-- 时间设置 -->
      <view class="section">
        <text class="section-label">展示时间</text>
        <picker mode="time" :value="form.scheduleTime" range-type="clock" show-separator="false" @change="onTimeChange">
          <view class="picker-value">{{ formatTime(form.scheduleTime) || '--:--' }}</view>
        </picker>
      </view>

      <!-- 周次（工作日/周末） -->
      <view class="section">
        <text class="section-label">频率</text>
        <view class="day-chips">
          <view
            v-for="(w,i) in weekDays"
            :key="i"
            class="day-chip"
            :class="{ active: form.weekdays.includes(i) }"
            @click="toggleWeek(i)"
          >
            {{ w }}
          </view>
        </view>
      </view>

      <!-- 保存 -->
      <button class="save-btn" :disabled="saving" @click="saveGreeting">
        {{ saving ? '保存中…' : '保存问候' }}
      </button>
    </view>

    <!-- 问候列表 -->
    <view class="list-section">
      <text class="section-head">我的问候语库</text>
      <view v-if="cards.length === 0" class="list-empty">
        <text>暂无收藏的问候语</text>
      </view>
      <scroll-view class="card-list" scroll-y v-else>
        <view v-for="c in cards" :key="c._id" class="list-item">
          <text class="list-name">{{ c.templateId || '默认' }}</text>
          <text class="list-text">{{ (c.content && c.content.text) || '' }}</text>
          <text class="list-meta">{{ (c.schedule && c.schedule.time) || '即时' }}</text>
        </view>
      </scroll-view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { getActiveGreeting, listGreetings, saveGreeting } from '@/services/profile';

const templates = [
  { id: 'default', label: '日常' },
  { id: 'morning', label: '晨安' },
  { id: 'night', label: '晚安' },
  { id: 'festival', label: '节日' },
  { id: 'solar', label: '节气' },
  { id: 'family', label: '家族' }
];
const sizes = [14, 16, 18, 20];
const weekDays = ['日', '一', '二', '三', '四', '五', '六'];

const activeCard = ref<any>(null);
const cards = ref<any[]>([]);
const saving = ref(false);
const form = ref({
  templateId: 'default',
  contentText: '',
  size: 16,
  scheduleTime: '08:00',
  weekdays: [1,2,3,4,5] // 周一到周五默认
});

async function load() {
  const [r1, r2] = await Promise.all([getActiveGreeting(), listGreetings()]);
  if (r1.data?.card) activeCard.value = r1.data.card;
  if (r2.data?.cards) cards.value = r2.data.cards;
}
onShow(load);

function scrollToEditor() {
  const el = document.getElementById('editor-anchor');
  uni.pageScrollTo({ scrollTop: 0, duration: 300 });
}
function onTimeChange(e: any) {
  form.value.scheduleTime = e.detail.value;
}
function toggleWeek(i: number) {
  const idx = form.value.weekdays.indexOf(i);
  if (idx >= 0) {
    if (form.value.weekdays.length > 1) form.value.weekdays.splice(idx, 1);
  } else {
    form.value.weekdays.push(i);
  }
}
function sizeLabel(s: number) {
  return s === 14 ? '小' : s === 16 ? '中' : s === 18 ? '大' : '超大';
}
function formatTime(t: string) {
  return t || '';
}

async function saveGreeting() {
  const text = form.value.contentText.trim();
  if (!text) return uni.showToast({ title: '请输入问候内容', icon: 'none' });
  if (text.length > 200) return uni.showToast({ title: '不超过 200 字', icon: 'none' });
  saving.value = true;
  const res = await saveGreeting({
    templateId: form.value.templateId,
    content: { text, font: 'song', size: form.value.size as 14|16|18|20, color: '#2B2723', align: 'center' },
    schedule: { time: form.value.scheduleTime, weekdays: form.value.weekdays, enabled: true }
  });
  saving.value = false;
  if (res.error && !res.data) {
    uni.showToast({ title: (res.error as any)?.message || '保存失败', icon: 'none' });
  } else {
    uni.showToast({ title: '问候已保存', icon: 'success' });
    load();
  }
}
</script>

<style lang="scss" scoped>
.greet-page { min-height: 100vh; background: #FAF8F2; padding: 16px 12px; box-sizing: border-box; }

.active-card {
  background: #FFF; border-radius: 12px; padding: 16px; margin-bottom: 14px; box-shadow: 0 2px 12px rgba(38,34,30,.06);
}
.card-hd { display: block; font-size: 14px; font-weight: 700; color: #2B2723; margin-bottom: 12px; letter-spacing: 1px; }
.greet-preview { display: flex; flex-direction: column; gap: 6px; }
.greet-template { font-size: 12px; color: #C9A063; }
.greet-text { font-size: 16px; color: #2B2723; line-height: 1.8; text-align: center; }
.greet-footer { font-size: 12px; color: #8A7B5A; margin-top: 4px; }
.empty-state { padding: 18px 0; }
.empty-t { display: block; font-size: 14px; font-weight: 600; color: #6E6659; text-align: center; }
.empty-s { display: block; font-size: 12px; color: #B0A99A; text-align: center; margin-top: 4px; }
.go-list-btn { height: 40px; line-height: 40px; font-size: 14px; background: #B03A2E; color: #FFF; border-radius: 8px; padding: 0; text-align: center; margin-top: 12px; width: 100%; }

.editor-wrap { background: #FFF; border-radius: 12px; padding: 16px; margin-bottom: 14px; box-shadow: 0 2px 12px rgba(38,34,30,.06); }
.editor-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 16px; }
.editor-title { font-size: 14px; font-weight: 700; color: #2B2723; }
.editor-sub { font-size: 11px; color: #B0A99A; }

.section { margin-bottom: 16px; }
.section-label { display: block; font-size: 13px; color: #6E6659; margin-bottom: 8px; font-weight: 600; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip {
  padding: 6px 12px; border-radius: 6px; background: #F7F4EC; color: #8A7B5A; font-size: 12px;
  border: 1px solid transparent; cursor: pointer;
}
.chip.active { background: #FBEEEC; color: #B03A2E; border-color: #E0B8B2; font-weight: 600; }
.input-text { width: 100%; min-height: 100px; background: #FAF8F2; border-radius: 8px; padding: 10px; font-size: 14px; color: #2B2723; line-height: 1.7; }
.count { float: right; font-size: 11px; color: #B0A99A; margin-top: 4px; }
.size-row { display: flex; gap: 10px; }
.size-chip {
  width: 56px; height: 36px; line-height: 36px; text-align: center; border-radius: 6px; background: #F7F4EC; border: 1px solid #EAE4D6; cursor: pointer;
}
.size-chip.active { background: #FBEEEC; border-color: #E0B8B2; color: #B03A2E; font-weight: 600; }
.picker-value { padding: 8px 12px; background: #F7F4EC; border-radius: 6px; font-size: 14px; color: #2B2723; }
.day-chips { display: flex; gap: 6px; flex-wrap: wrap; }
.day-chip { width: 32px; height: 32px; line-height: 32px; text-align: center; border-radius: 4px; background: #F7F4EC; border: 1px solid #EAE4D6; font-size: 12px; cursor: pointer; }
.day-chip.active { background: #FBEEEC; border-color: #E0B8B2; color: #B03A2E; }
.required { color: #B03A2E; }

.save-btn { width: 100%; height: 42px; line-height: 42px; font-size: 14px; font-weight: 600; color: #FFF; background: #B03A2E; border-radius: 8px; padding: 0; }
.save-btn[disabled] { background: #D8A59D; }

.list-section { margin-top: 10px; }
.section-head { display: block; font-size: 13px; font-weight: 700; color: #8A7B5A; margin-bottom: 8px; letter-spacing: 1px; }
.list-empty { text-align: center; padding: 40px 0; font-size: 13px; color: #B0A99A; }
.card-list { max-height: 400px; }
.list-item { background: #FFF; border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; box-shadow: 0 1px 6px rgba(38,34,30,.04); }
.list-name { display: block; font-size: 13px; color: #8A6D3B; margin-bottom: 4px; font-weight: 600; }
.list-text { display: block; font-size: 13px; color: #2B2723; line-height: 1.6; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.list-meta { display: block; font-size: 11px; color: #B0A99A; margin-top: 4px; }
</style>
