<template>
  <view class="game-page">
    <!-- 少年模式时长提示横幅 -->
    <view v-if="childMode" class="time-banner">
      <text class="time-text" v-if="remainingSec > 0">本日游戏剩余时间：{{ mm }}:{{ ss }}</text>
      <text class="time-text red" v-else>今日游戏时间已达上限，请明日再玩</text>
    </view>
    <view class="hd">家族娱乐</view>
    <text class="sub">合规版 · 无内购 · 零虚拟货币兑换</text>
    <view v-if="childMode && remainingSec <= 0" class="locked"><text>⏰ 时间已到</text></view>
    <template v-else>
      <BaseCard v-if="flags.chess" title="棋谱研习室" @click="enter('chess')"><text class="card-sub">象棋 · 双人对弈 · 残局挑战（红先一步将死）</text><text class="tag">单机合规</text></BaseCard>
      <BaseCard v-if="flags.score" title="牌局记分板" @click="enter('score')"><text class="card-sub">斗地主/掼蛋/麻将 · 线下战绩记录工具</text><text class="tag">非游戏玩法</text></BaseCard>
      <BaseCard v-if="flags.riddle" title="家族灯谜会" @click="enter('riddle')"><text class="card-sub">题库管理 · 擂台赛 · 节庆专题 · 每日一谜</text><text class="tag">文化益智</text></BaseCard>
      <BaseCard v-if="flags.quiz" title="百业问学" @click="enter('quiz')"><text class="card-sub">10+ 行业题库 · 闯关排位 · 行业专场</text><text class="tag">知识传承</text></BaseCard>
      <BaseCard v-if="flags.simulate" title="梨园小筑" @click="enter('simulate')"><text class="card-sub">单机经营模拟 · 赵县梨园 · 行业扩展包</text><text class="tag">零内购</text></BaseCard>
      <BaseCard v-if="flags.async" title="异步对弈（Beta）" @click="enter('async')"><text class="card-sub">一手传书 · 24h 内有效 · 家族棋王榜</text></BaseCard>
    </template>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import BaseCard from '@/components/common/BaseCard.vue';
import { useUserStore } from '@/stores/user';
import {
  canPlay, dailyLimitFromFlags, remainingMs, todayKey
} from '@/utils/minor-mode.js';

const store = useUserStore();
const STORAGE_KEY = 'hcs:childmode:games';

const childMode = computed(() => store.childMode);
const remainingSec = ref(0);
let timer: any = null;

const flags = computed(() => ({
  chess: window._featureFlags?.v20Games?.enabled,
  score: window._featureFlags?.v20Games?.enabled,
  riddle: window._featureFlags?.v20Games?.enabled,
  quiz: window._featureFlags?.v20Games?.enabled,
  simulate: window._featureFlags?.v20Games?.enabled,
  async: window._featureFlags?.v20Games?.enabled
}));

const mm = computed(() => String(Math.floor(remainingSec.value / 60)).padStart(2, '0'));
const ss = computed(() => String(remainingSec.value % 60).padStart(2, '0'));

// 每日上限从功能开关 minorProtection 读取（族议会可调，默认 30 分钟）
const dailyLimitMs = computed(() =>
  dailyLimitFromFlags((window as any)._featureFlags || {})
);

function readRaw(): any {
  try { return uni.getStorageSync(STORAGE_KEY); } catch { return null; }
}
function refreshRemaining() {
  remainingSec.value = Math.floor(remainingMs(readRaw(), todayKey(), dailyLimitMs.value) / 1000);
}

function startTimer() {
  refreshRemaining();
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    remainingSec.value = Math.max(0, remainingSec.value - 1);
    // 每 10s 以存储口径校准，防倒计时漂移/跨日残留
    if (remainingSec.value % 10 === 0) refreshRemaining();
  }, 1000);
}
function stopTimer() {
  if (timer) { clearInterval(timer); timer = null; }
}

// 模式切换实时生效：开启即开始计时，关闭即停表
watch(childMode, (on) => (on ? startTimer() : stopTimer()));
onMounted(() => {
  if (!(window as any)._featureFlags) import('@/utils/feature-flags');
  if (childMode.value) startTimer();
});
onUnmounted(stopTimer);
// 从子游戏页返回时以存储口径校准剩余（子页真实计时已写回）
onShow(() => { if (childMode.value) refreshRemaining(); });

function enter(page: string) {
  if (childMode.value && !canPlay(readRaw(), todayKey(), dailyLimitMs.value)) {
    return uni.showToast({ title: '今日游戏时间已用完', icon: 'none' });
  }
  // 少年模式：真实时长由子页 useChildGuard 在 onHide/onUnload 结算，
  // 本入口不再预扣（避免双重扣减），仅做耗尽拦截
  uni.navigateTo({ url: `/pkg-game/pages/game/${page}` });
}
</script>

<style scoped>
.game-page { min-height:100vh; background:#FAF8F2; padding:16px 16px 32px; }
.time-banner { padding:10px 16px; background:#EDF5F4; border-radius:12px; margin-bottom:12px; text-align:center; border:1px solid #7FA8A0; }
.time-text { font-size:14px; color:#2B2723; font-weight:600; }
.time-text.red { color:#B03A2E; }
.hd{ font-size:24px; font-weight:700; color:#2B2723; margin-bottom:4px; }
.sub{ font-size:13px; color:#999; display:block; margin-bottom:16px; }
.locked{ text-align:center; padding:60px 0; font-size:18px; color:#CCC; }
.card-sub{ font-size:13px; color:#6E6659; display:block; margin-top:6px; line-height:1.4; }
.tag{ display:inline-block; margin-top:8px; font-size:11px; padding:2px 6px; background:#F5F1E6; color:#C9A063; border-radius:4px; }
</style>