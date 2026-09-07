<!--
  pkg-profile/pages/capsule/index.vue — 百年家书定时胶囊（蓝图 V1.1 §24.5 time_capsules）
  数据：profile.capsule.list → { capsules[] }
  交互：
    · 创建：写给谁（输入姓名/虚拟代号）+ 书信正文（≤2000 字）+ 解锁日期 picker（>今天）
    · 列表展示：状态（SEALED/UNLOCKED）、解锁日、内容摘要；当前仅显示 SEALED（scan 为内部任务执行解锁）
-->
<template>
  <view class="capsule-page">
    <!-- 创建表单 -->
    <view class="editor-wrap">
      <text class="editor-title">设置百年家书</text>
      <text class="editor-sub">将一封家书封存至今日之后的某个日子，由家族服务器自动解封送达</text>

      <!-- 写给谁 -->
      <view class="section">
        <text class="section-label">写给<span class="required">*</span></text>
        <input class="input-field" v-model="form.targetId" placeholder="后辈姓名或代号（如：曾孙·子安）" maxlength="64" />
      </view>

      <!-- 书信 -->
      <view class="section">
        <text class="section-label">信的内容<span class="required">*</span></text>
        <textarea class="input-text" v-model="form.message" placeholder="写下你的寄语（≤2000 字）……" maxlength="2000" auto-height />
        <text class="count">{{ form.message.length }}/2000</text>
      </view>

      <!-- 解锁日期 -->
      <view class="section">
        <text class="section-label">解封时间<span class="required">*</span></text>
        <picker mode="date" :value="form.unlockDate" :start="minDate" :end="maxDate" @change="onDateChange">
          <view class="picker-value">{{ form.unlockDate || '请选择年月日' }}</view>
        </picker>
      </view>

      <button class="save-btn" :disabled="saving" @click="createCapsule">
        {{ saving ? '保存中…' : '创建家书' }}
      </button>
    </view>

    <!-- 我的胶囊列表 -->
    <view class="list-section">
      <text class="section-head">我的百年家书</text>
      <view v-if="loading" class="empty-state"><text>加载中…</text></view>
      <scroll-view class="card-list" scroll-y v-else-if="capsules.length > 0">
        <view v-for="c in capsules" :key="c._id" class="list-item" :class="{ sealed: c.status === 'SEALED', unlocked: c.status === 'UNLOCKED' }">
          <view class="item-header">
            <view class="header-left">
              <text class="item-target">{{ c.targetId || '家人' }}</text>
              <text v-if="c.status === 'SEALED'" class="badge-sealed">已封存</text>
              <text v-else class="badge-unlocked">已开启</text>
            </view>
            <text class="item-date">{{ c.unlockDate }} · {{ c.createdAt && (new Date(c.createdAt).getFullYear()) + '年' }}</text>
          </view>
          <text class="item-preview">{{ (c.message && c.message.slice(0, 80)) || '(无内容)' }}</text>
          <view v-if="c.status !== 'SEALED'" class="item-log">{{ formatUnlockLog(c.unlockLog) }}</view>
        </view>
      </scroll-view>
      <view v-else class="empty-state">
        <text class="empty-t">暂无封存的百年家书</text>
        <text class="empty-s">设置后可查看进度与未来解封记录</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { createCapsule, listCapsules } from '@/services/profile';

const capsules = ref<any[]>([]);
const loading = ref(true);
const saving = ref(false);

const today = new Date();
const nextYear = new Date(today.getFullYear() + 100, today.getMonth(), today.getDate());
const minDate = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
const maxDate = `${nextYear.getFullYear()}-${String(nextYear.getMonth()+1).padStart(2,'0')}-${String(nextYear.getDate()).padStart(2,'0')}`;

const form = ref({ targetId: '', message: '', unlockDate: '' });

async function load() {
  loading.value = true;
  const res = await listCapsules();
  loading.value = false;
  if (res.data?.capsules) capsules.value = res.data.capsules;
}
onShow(load);

function onDateChange(e: any) {
  form.value.unlockDate = e.detail.value;
}

async function createCapsule() {
  if (!form.value.targetId.trim()) return uni.showToast({ title: '请输入写给谁', icon: 'none' });
  if (!form.value.message.trim()) return uni.showToast({ title: '请输入信的内容', icon: 'none' });
  if (!form.value.unlockDate) return uni.showToast({ title: '请选择解封时间', icon: 'none' });
  // 校验 unlockDate > today
  const d = new Date(form.value.unlockDate + 'T00:00:00Z');
  if (d <= new Date()) return uni.showToast({ title: '解封时间必须晚于今天', icon: 'none' });

  saving.value = true;
  const res = await createCapsule({ targetType: 'FAMILY', targetId: form.value.targetId.trim(), unlockDate: form.value.unlockDate, message: form.value.message.trim() });
  saving.value = false;
  if (res.error && !res.data) {
    uni.showToast({ title: (res.error as any)?.message || '创建失败', icon: 'none' });
  } else {
    uni.showToast({ title: '家书已封存', icon: 'success' });
    load();
    form.value.targetId = ''; form.value.message = ''; form.value.unlockDate = '';
  }
}

function formatUnlockLog(logs?: any[]) {
  if (!logs || !Array.isArray(logs)) return '';
  const last = logs[logs.length - 1];
  return last ? `已开启 · ${last.unlockAt && (new Date(last.unlockAt).toLocaleString('zh-CN'))}` : '';
}
</script>

<style lang="scss" scoped>
.capsule-page { min-height: 100vh; background: #FAF8F2; padding: 16px 12px; box-sizing: border-box; }
.editor-wrap { background: #FFF; border-radius: 12px; padding: 16px; margin-bottom: 14px; box-shadow: 0 2px 12px rgba(38,34,30,.06); }
.editor-title { display: block; font-size: 14px; font-weight: 700; color: #2B2723; margin-bottom: 8px; letter-spacing: 1px; }
.editor-sub { display: block; font-size: 12px; color: #8A7B5A; line-height: 1.6; margin-bottom: 16px; }

.section { margin-bottom: 16px; }
.section-label { display: block; font-size: 13px; color: #6E6659; margin-bottom: 8px; font-weight: 600; }
.required { color: #B03A2E; }
.input-field, .input-text { width: 100%; min-height: 80px; background: #FAF8F2; border-radius: 8px; padding: 10px; font-size: 14px; color: #2B2723; line-height: 1.7; box-sizing: border-box; }
.input-field { min-height: 40px; }
.count { float: right; font-size: 11px; color: #B0A99A; margin-top: 4px; }
.picker-value { padding: 10px 12px; background: #F7F4EC; border-radius: 6px; font-size: 14px; color: #2B2723; text-align: center; }
.save-btn { width: 100%; height: 42px; line-height: 42px; font-size: 14px; font-weight: 600; color: #FFF; background: #B03A2E; border-radius: 8px; padding: 0; }
.save-btn[disabled] { background: #D8A59D; }

.list-section { margin-top: 10px; }
.section-head { display: block; font-size: 13px; font-weight: 700; color: #8A7B5A; margin-bottom: 8px; letter-spacing: 1px; }
.card-list { max-height: 500px; }
.empty-state { text-align: center; padding: 40px 0; font-size: 13px; color: #B0A99A; }
.empty-t { display: block; font-size: 15px; font-weight: 600; color: #6E6659; }
.empty-s { display: block; font-size: 12px; color: #B0A99A; margin-top: 6px; }

.list-item { background: #FFF; border-radius: 12px; padding: 12px 14px; margin-bottom: 10px; box-shadow: 0 2px 12px rgba(38,34,30,.06); position: relative; }
.list-item.sealed { border-left: 4px solid #C9A063; }
.list-item.unlocked { opacity: 0.7; border-left: 4px solid #B03A2E; }
.item-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
.header-left { display: flex; align-items: center; gap: 8px; }
.item-target { font-size: 14px; font-weight: 600; color: #2B2723; }
.badge-sealed, .badge-unlocked { font-size: 10px; padding: 2px 6px; border-radius: 4px; }
.badge-sealed { color: #8A6D3B; background: #F4EDDD; }
.badge-unlocked { color: #B03A2E; background: #F6E0DC; }
.item-date { font-size: 11px; color: #B0A99A; }
.item-preview { font-size: 13px; color: #6E6659; line-height: 1.7; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.item-log { font-size: 11px; color: #C9A063; margin-top: 4px; }
</style>
