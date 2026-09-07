<template>
  <view class="opera-page">
    <!-- 模块头 -->
    <view class="page-header">
      <text class="page-title">梨园小筑</text>
      <text class="page-subtitle">戏曲票友模拟 · 单机娱乐 · 唱念做打</text>
    </view>

    <!-- 票友卡池 -->
    <view class="section">
      <view class="section-head">
        <text class="section-title">我的票友（{{ tickets.length }}）</text>
        <button class="add-btn" size="mini" @tap="openCreate">添加票友</button>
      </view>
      <view v-if="!tickets.length && !loading" class="empty">
        <text>梨园尚无票友，点右上「添加票友」开锣</text>
      </view>
      <view v-for="t in tickets" :key="t._id" class="ticket-row" :class="{ active: selectedId === t._id }" @tap="selectedId = t._id">
        <text class="ticket-name">{{ t.name }}</text>
        <text class="ticket-role">{{ t.roleTitle }}</text>
        <text class="ticket-lv">Lv.{{ t.skillLevel }}</text>
        <text class="ticket-stage">登台 {{ t.stageCount || 0 }} 次</text>
      </view>
    </view>

    <!-- 创建票友 -->
    <view v-if="creating" class="create-card">
      <input class="name-input" v-model="draftName" maxlength="12" placeholder="票友名字（如：梨园小生）" />
      <view class="role-opts">
        <view
          v-for="r in ROLE_LIST"
          :key="r.key"
          class="role-chip"
          :class="{ active: draftRole === r.key }"
          @tap="draftRole = r.key"
        >
          <text class="role-key">{{ r.key }}</text>
          <text class="role-title">{{ r.title }}</text>
        </view>
      </view>
      <view class="create-actions">
        <button class="confirm-btn" size="mini" :disabled="!draftName.trim()" @tap="doCreate">开锣收徒</button>
        <button class="cancel-btn" size="mini" @tap="creating = false">取消</button>
      </view>
    </view>

    <!-- 登台表演 -->
    <view class="section">
      <button class="perform-btn" :disabled="!selectedId" @tap="doPerform">
        登台献艺{{ selectedId ? '' : '（请先选票友）' }}
      </button>

      <view v-if="performance" class="perf-card">
        <text class="perf-play">{{ performance.playName }}</text>
        <text class="perf-snippet">“{{ performance.snippet }}”</text>
        <view class="perf-score">
          <text class="score-num">{{ performance.score }}</text>
          <text class="score-grade">{{ performance.grade }}</text>
        </view>
        <text class="perf-feedback">{{ performance.feedback }}</text>
        <view class="sugg-row" v-if="performance.suggestions && performance.suggestions.length">
          <text v-for="(s, i) in performance.suggestions" :key="i" class="sugg-chip">💡 {{ s }}</text>
        </view>
        <text class="exp-gain" v-if="performance.expGain > 0">+{{ performance.expGain }} 修为</text>
      </view>
    </view>

    <!-- 每日签到 -->
    <view class="section">
      <button class="checkin-btn" size="mini" @tap="doCheckin">{{ checkedIn ? '今日已签到' : '梨园签到 +5 分' }}</button>
      <text v-if="checkinMsg" class="checkin-msg">{{ checkinMsg }}</text>
    </view>

    <!-- 历史演出记录 -->
    <view class="section" v-if="records.length">
      <text class="section-title">演出记录</text>
      <view v-for="(r, i) in records" :key="i" class="record-row">
        <text class="rec-name">{{ r.rosterName }} · {{ r.playName }}</text>
        <text class="rec-grade">{{ r.grade }} {{ r.score }}分</text>
      </view>
    </view>

    <!-- 合规声明 -->
    <view class="comp-tip">
      <text class="comp-text">梨园小筑为单机娱乐模拟：零内购 · 无联机对战 · 演出结果随机生成，奖励仅家族积分</text>
    </view>

    <!-- 合规声明 ─── V2.0 F11 -->
    <view class="section comp-tip">
      <text class="comp-text">梨园小筑为纯娱乐单机戏曲票友模拟：零内购、无联机对战、无虚拟货币；演出结果为随机模拟，仅作休闲娱乐与家族积分互动。</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { rosterList, rosterCreate, stagePerform, dailyCheckin, recordsList } from '@/services/opera';

const ROLE_LIST = [
  { key: '生', title: '生行' }, { key: '旦', title: '旦行' }, { key: '净', title: '净行' },
  { key: '末', title: '末行' }, { key: '丑', title: '丑行' }
];

const tickets = ref<any[]>([]);
const records = ref<any[]>([]);
const selectedId = ref('');
const creating = ref(false);
const loading = ref(false);
const draftName = ref('');
const draftRole = ref('生');
const performance = ref<any>(null);
const checkedIn = ref(false);
const checkinMsg = ref('');

onMounted(async () => {
  loading.value = true;
  try {
    const res = await rosterList();
    tickets.value = res.data?.tickets || [];
    if (tickets.value.length) selectedId.value = tickets.value[0]._id;
    const rec = await recordsList(1);
    records.value = rec.data?.records || [];
  } catch (e: any) {
    uni.showToast({ title: e.message || '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
});

function openCreate() {
  draftName.value = '';
  draftRole.value = '生';
  creating.value = true;
}

async function doCreate() {
  try {
    const res = await rosterCreate({ name: draftName.value.trim(), role: draftRole.value as any });
    const t = res.data?.ticket;
    if (t) {
      if (!tickets.value.some(x => x._id === t._id)) tickets.value.unshift(t);
      selectedId.value = t._id;
    }
    creating.value = false;
    uni.showToast({ title: res.data?.alreadyCreated ? '已有同名票友' : '票友入册', icon: 'none' });
  } catch (e: any) {
    uni.showToast({ title: e.message || '创建失败', icon: 'none' });
  }
}

async function doPerform() {
  if (!selectedId.value) return;
  try {
    const res = await stagePerform(selectedId.value);
    performance.value = res.data?.performance || null;
    const t = tickets.value.find(x => x._id === selectedId.value);
    if (t && res.data?.roster) {
      t.skillLevel = res.data.roster.skillLevel;
      t.stageCount = res.data.roster.stageCount;
    }
    const rec = await recordsList(1);
    records.value = rec.data?.records || [];
  } catch (e: any) {
    uni.showToast({ title: e.message || '登台失败', icon: 'none' });
  }
}

async function doCheckin() {
  try {
    const res = await dailyCheckin();
    if (res.data?.alreadyDone) {
      checkedIn.value = true;
      checkinMsg.value = '今日已签到，明日再来';
    } else {
      checkedIn.value = true;
      checkinMsg.value = res.data?.message || `签到成功 +${res.data?.points || 0} 分`;
    }
  } catch (e: any) {
    uni.showToast({ title: e.message || '签到失败', icon: 'none' });
  }
}
</script>

<style scoped>
.opera-page { flex: 1; min-height: 100vh; background: #FAF3EC; padding: 16px; box-sizing: border-box; }
.page-header { padding: 8px 0 12px; }
.page-title { display: block; font-size: 22px; font-weight: 700; color: #4A2C17; }
.page-subtitle { display: block; font-size: 12px; color: #A06B3A; margin-top: 4px; }

.section { background: #FFF; border-radius: 12px; padding: 14px; margin-top: 12px; }
.section-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.section-title { font-size: 14px; font-weight: 600; color: #4A2C17; }
.add-btn { background: #B03A2E; color: #FFF; font-size: 12px; }

.ticket-row { display: flex; align-items: center; gap: 8px; padding: 10px 8px; border-bottom: 1px solid #F6EFE6; border-radius: 6px; }
.ticket-row.active { background: #FBF1E7; border: 1px solid #E8C9A8; }
.ticket-name { flex: 1; font-size: 14px; font-weight: 600; color: #4A2C17; }
.ticket-role { font-size: 12px; color: #B03A2E; background: #FDEBE7; border-radius: 4px; padding: 1px 6px; }
.ticket-lv { font-size: 12px; color: #8A6D4F; }
.ticket-stage { font-size: 11px; color: #B0A08C; }

.empty { text-align: center; color: #B0A08C; padding: 24px 0; font-size: 13px; }
.create-card { background: #FFF; border-radius: 12px; padding: 14px; margin-top: 12px; border: 1px solid #F0DFC8; }
.name-input { background: #FBF6EF; border-radius: 8px; padding: 8px 12px; height: 40px; font-size: 14px; }
.role-opts { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
.role-chip { flex: 1; min-width: 90px; border: 1px solid #E8D5BC; border-radius: 8px; padding: 8px 6px; text-align: center; background: #FFF; }
.role-chip.active { border-color: #B03A2E; background: #FDF0EE; }
.role-key { display: block; font-size: 18px; color: #4A2C17; }
.role-title { display: block; font-size: 11px; color: #A06B3A; }
.create-actions { display: flex; gap: 8px; margin-top: 12px; }
.confirm-btn { flex: 1; background: #B03A2E; color: #FFF; font-size: 13px; }
.cancel-btn { flex: 1; background: #F3EDE3; color: #5A5348; font-size: 13px; }

.perform-btn { width: 100%; background: linear-gradient(135deg, #C0352C, #A62B23); color: #FFF; border-radius: 10px; font-size: 15px; font-weight: 600; }
.perform-btn[disabled] { opacity: 0.5; }
.remaining-tip { display: block; text-align: center; color: #A06B3A; font-size: 11px; margin-top: 6px; }

.perf-card { margin-top: 12px; background: #FDF6EE; border-radius: 10px; padding: 12px; border: 1px solid #EFDCC2; }
.perf-play { display: block; font-size: 15px; font-weight: 700; color: #4A2C17; }
.perf-snippet { display: block; font-size: 12px; color: #8A6D4F; font-style: italic; margin-top: 4px; }
.perf-score { display: flex; align-items: baseline; gap: 8px; margin-top: 8px; }
.score-num { font-size: 26px; font-weight: 700; color: #B03A2E; }
.score-grade { font-size: 14px; color: #A06B3A; }
.perf-feedback { display: block; font-size: 12px; color: #5A5348; margin-top: 6px; }
.sugg-row { margin-top: 8px; display: flex; flex-direction: column; gap: 4px; }
.sugg-chip { font-size: 12px; color: #7A5C3A; }
.exp-gain { display: block; margin-top: 8px; color: #B03A2E; font-size: 12px; font-weight: 600; }

.checkin-btn { background: #E9C46A; color: #4A2C17; font-size: 13px; }
.checkin-msg { display: block; text-align: center; font-size: 12px; color: #A06B3A; margin-top: 8px; }

.record-row { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid #F6EFE6; }
.rec-name { flex: 1; font-size: 13px; color: #4A2C17; }
.rec-grade { font-size: 12px; color: #B03A2E; }

.comp-tip { background: #FBF1E7; border-radius: 8px; padding: 8px 12px; margin-top: 14px; text-align: center; }
.comp-text { font-size: 11px; color: #A06B3A; }
</style>