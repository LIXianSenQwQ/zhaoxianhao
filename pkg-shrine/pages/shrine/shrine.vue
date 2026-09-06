<!-- pkg-shrine/pages/shrine/shrine.vue – 祖堂点灯（Sprint R13：蓝图 shrine/index，点灯/上香/献花+灵位列表，接 ceremony.spirits/worship/list） -->
<template>
  <view class="shrine-page">
    <!-- 灵位列表（ceremony.spirits：已故族人，20/页） -->
    <BaseCard title="祖堂灵位">
      <view v-if="spirits.length === 0 && !loading" class="empty">
        <text>暂无灵位记录</text>
      </view>
      <view
        v-for="s in spirits"
        :key="s.id"
        class="spirit-row"
        :class="{ active: selectedId === s.id }"
        @click="selectSpirit(s)"
      >
        <view class="spirit-left">
          <text class="spirit-name">{{ s.name }}</text>
          <text class="spirit-meta">
            {{ s.generation ? `第${s.generation}世` : '' }}{{ s.deathDate ? ` · ${s.deathDate}` : '' }}
          </text>
        </view>
        <view class="spirit-count">
          <text class="count-num">{{ s.worshipCount }}</text>
          <text class="count-label">祭拜</text>
        </view>
      </view>
      <view v-if="spiritHasMore" class="load-more" @click="loadSpirits">
        <text>{{ loading ? '加载中…' : '更多灵位' }}</text>
      </view>
    </BaseCard>

    <!-- 祭拜区（蓝图 11：点击轻震，长按触发祝福语） -->
    <BaseCard title="敬香祭拜">
      <view class="worship-target">
        <text v-if="selectedSpirit">正祭 · {{ selectedSpirit.name }}</text>
        <text v-else class="target-hint">请先在上方选择灵位</text>
      </view>
      <view class="worship-btns">
        <view
          v-for="w in WORSHIPS"
          :key="w.type"
          class="worship-btn"
          :style="{ background: w.bg }"
          @click="doWorship(w.type)"
          @longpress="openMessage(w.type)"
        >
          <text class="worship-icon">{{ w.icon }}</text>
          <text class="worship-name">{{ w.label }}</text>
        </view>
      </view>
      <text class="worship-tip">点击祭拜 · 长按可附祝福语</text>

      <!-- 祝福语弹层 -->
      <view v-if="msgVisible" class="msg-mask" @click="closeMessage">
        <view class="msg-panel" @click.stop>
          <text class="msg-title">祝福语（{{ WORSHIP_MAP[msgType] }}）</text>
          <textarea
            v-model="msgText"
            class="msg-input"
            :maxlength="100"
            placeholder="写下对先人的追思（≤100 字）"
          />
          <view class="msg-btns">
            <view class="msg-btn cancel" @click="closeMessage"><text>取消</text></view>
            <view class="msg-btn confirm" @click="confirmMessage"><text>敬上</text></view>
          </view>
        </view>
      </view>
    </BaseCard>

    <!-- 祭记（ceremony.list：按灵位过滤，date 倒序） -->
    <BaseCard title="最近祭记">
      <view v-if="logs.length === 0 && !loading" class="empty">
        <text>暂无祭记，为先人点一盏灯吧</text>
      </view>
      <view v-for="l in logs" :key="l._id" class="log-row">
        <view class="log-left">
          <text class="log-type">{{ l.typeLabel || l.type }}</text>
          <text v-if="l.message" class="log-msg">「{{ l.message }}」</text>
        </view>
        <text class="log-date">{{ fmtDate(l.date) }}</text>
      </view>
      <view v-if="logHasMore" class="load-more" @click="loadLogs">
        <text>{{ loading ? '加载中…' : '加载更多' }}</text>
      </view>
    </BaseCard>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { read, write } from '@/services/request';
import BaseCard from '@/components/common/BaseCard.vue';

const WORSHIPS = [
  { type: 'lamp', label: '点灯', icon: '🕯', bg: '#F7F1E3' },
  { type: 'incense', label: '上香', icon: '🪔', bg: '#F9EDEB' },
  { type: 'flower', label: '献花', icon: '🌸', bg: '#EDF2EC' }
];
const WORSHIP_MAP: Record<string, string> = { lamp: '点灯', incense: '上香', flower: '献花', group: '合拜' };

const spirits = ref<any[]>([]);
const spiritPage = ref(1);
const spiritHasMore = ref(false);
const selectedId = ref('');
const selectedSpirit = ref<any>(null);
const logs = ref<any[]>([]);
const logPage = ref(1);
const logHasMore = ref(false);
const loading = ref(false);

// 祝福语弹层
const msgVisible = ref(false);
const msgType = ref('lamp');
const msgText = ref('');

function fmtDate(t: string) {
  if (!t) return '';
  const d = new Date(t);
  return isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}月${d.getDate()}日`;
}

async function fetchSpirits(p = 1) {
  loading.value = true;
  try {
    const res = await read('ceremony', { action: 'spirits', page: p }, null, 0);
    if (res.success && res.data) {
      const list = res.data.spirits || [];
      spirits.value = p === 1 ? list : spirits.value.concat(list);
      spiritHasMore.value = !!res.data.hasMore;
      spiritPage.value = p;
      if (p === 1 && list.length && !selectedId.value) selectSpirit(list[0]);
    }
  } finally {
    loading.value = false;
  }
}

function loadSpirits() {
  if (loading.value || !spiritHasMore.value) return;
  fetchSpirits(spiritPage.value + 1);
}

function selectSpirit(s: any) {
  selectedId.value = s.id;
  selectedSpirit.value = s;
  fetchLogs(1);
}

async function fetchLogs(p = 1) {
  if (!selectedId.value) return;
  const res = await read('ceremony', { action: 'list', targetMemberId: selectedId.value, page: p }, null, 0);
  if (res.success && res.data) {
    const list = res.data.logs || [];
    logs.value = p === 1 ? list : logs.value.concat(list);
    logHasMore.value = !!res.data.hasMore;
    logPage.value = p;
  }
}

function loadLogs() {
  if (loading.value || !logHasMore.value) return;
  fetchLogs(logPage.value + 1);
}

/** 祭拜：tap 直接敬上；写路径幂等键按次生成（服务端积分幂等由 bizId 日期口径兜底） */
async function doWorship(type: string, message = '') {
  if (!selectedId.value) {
    uni.showToast({ title: '请先选择灵位', icon: 'none' });
    return;
  }
  if (!message) uni.vibrateShort?.();
  const res = await write(
    'ceremony',
    { action: 'worship', type, targetMemberId: selectedId.value, message },
    'ceremony.worship',
    `${type}:${selectedId.value}:${Date.now()}`
  );
  if (res.success && res.data) {
    const b = res.data.blessing;
    uni.showToast({
      title: b && !b.duplicated ? `${WORSHIP_MAP[type]}敬上 · 功德+${b.delta}` : `${WORSHIP_MAP[type]}敬上`,
      icon: 'none'
    });
    // 乐观更新灵位计数
    if (selectedSpirit.value) selectedSpirit.value.worshipCount = res.data.worshipCount;
    fetchLogs(1);
  } else {
    uni.showToast({ title: res.message || '祭拜失败，请重试', icon: 'none' });
  }
}

function openMessage(type: string) {
  msgType.value = type;
  msgVisible.value = true;
  uni.vibrateShort?.();
}

function closeMessage() {
  msgVisible.value = false;
  msgText.value = '';
}

function confirmMessage() {
  const text = msgText.value.trim();
  msgVisible.value = false;
  doWorship(msgType.value, text);
  msgText.value = '';
}

fetchSpirits(1);
</script>

<style scoped>
.shrine-page { min-height: 100vh; background: #F7F6F3; padding: 16px; display: flex; flex-direction: column; gap: 12px; }

.spirit-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 8px; border-bottom: 1px solid #EAE4D6; border-radius: 8px; }
.spirit-row:last-of-type { border-bottom: none; }
.spirit-row.active { background: #F7F1E3; }
.spirit-left { display: flex; flex-direction: column; gap: 2px; }
.spirit-name { font-size: 15px; font-weight: 600; color: #2B2320; }
.spirit-meta { font-size: 11px; color: #B0A99A; }
.spirit-count { display: flex; flex-direction: column; align-items: center; }
.count-num { font-size: 16px; font-weight: 700; color: #C9A063; }
.count-label { font-size: 10px; color: #B0A99A; }

.worship-target { font-size: 13px; color: #6E6659; margin-bottom: 10px; }
.target-hint { color: #B0A99A; }
.worship-btns { display: flex; gap: 8px; }
.worship-btn { flex: 1; border-radius: 10px; padding: 16px 0; text-align: center; }
.worship-icon { font-size: 22px; display: block; }
.worship-name { font-size: 13px; color: #2B2320; margin-top: 4px; display: block; }
.worship-tip { font-size: 11px; color: #B0A99A; margin-top: 8px; display: block; text-align: center; }

.msg-mask { position: fixed; inset: 0; background: rgba(38, 34, 30, 0.4); display: flex; align-items: flex-end; z-index: 99; }
.msg-panel { width: 100%; background: #FFFFFF; border-radius: 16px 16px 0 0; padding: 16px; }
.msg-title { font-size: 15px; font-weight: 600; color: #2B2320; display: block; margin-bottom: 10px; }
.msg-input { width: 100%; height: 80px; background: #F7F6F3; border-radius: 8px; padding: 10px; font-size: 14px; box-sizing: border-box; }
.msg-btns { display: flex; gap: 8px; margin-top: 12px; }
.msg-btn { flex: 1; text-align: center; padding: 10px 0; border-radius: 8px; font-size: 14px; }
.msg-btn.cancel { background: #F0EEE8; color: #6E6659; }
.msg-btn.confirm { background: #B03A2E; color: #FFFFFF; }

.log-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #EAE4D6; }
.log-row:last-of-type { border-bottom: none; }
.log-left { display: flex; flex-direction: column; gap: 2px; }
.log-type { font-size: 14px; color: #2B2320; }
.log-msg { font-size: 12px; color: #6E6659; }
.log-date { font-size: 11px; color: #B0A99A; }
.empty { text-align: center; color: #B0A99A; font-size: 13px; padding: 20px 0; }
.load-more { text-align: center; padding: 10px; font-size: 13px; color: #8A8378; }
</style>
