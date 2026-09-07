<template>
  <view class="score-page">
    <!-- 顶部 -->
    <view class="page-header">
      <text class="page-title">牌局记分板</text>
      <text class="page-subtitle">线下娱乐记分工具 · 禁止赌博</text>
    </view>

    <!-- 合规声明 -->
    <view class="compliance-tip">
      <text class="comp-text">{{ complianceText.split('\n')[0] }}</text>
    </view>

    <!-- 建房：玩家录入 -->
    <view v-if="!scorecard" class="setup-card">
      <view class="card-title">新建记分单</view>
      <view class="player-input-row">
        <input class="player-input" v-model="newPlayerName" placeholder="输入玩家昵称" maxlength="12" />
        <button class="btn-add" :disabled="!newPlayerName.trim()" @tap="addPlayer">＋ 添加</button>
      </view>
      <view class="player-list" v-if="players.length">
        <view v-for="(p, i) in players" :key="p.id" class="player-chip">
          <text>{{ p.name }}</text>
          <text class="chip-del" @tap="removePlayer(i)">×</text>
        </view>
      </view>
      <view class="hint" v-else>至少添加 2 名玩家（麻将等可 2–8 人）</view>
      <button class="btn-start" :disabled="players.length < 2" @tap="startGame">开始记分</button>
    </view>

    <!-- 记分中 -->
    <template v-else>
      <!-- 排名榜 -->
      <view class="rank-section">
        <view class="card-title">当前排名</view>
        <view v-for="(entry, idx) in rankings" :key="entry.id" class="rank-row" @tap="toggleStats(entry.id)">
          <text class="rank-no">{{ idx + 1 }}</text>
          <text class="rank-name">{{ entry.name }}</text>
          <text class="rank-score" :class="{ pos: entry.total > 0, neg: entry.total < 0 }">
            {{ entry.total > 0 ? '+' : '' }}{{ entry.total }}
          </text>
          <text class="rank-rounds">{{ entry.rounds.length }}局</text>
        </view>
      </view>

      <!-- 本局记账 -->
      <view class="round-card">
        <view class="card-title">第 {{ scorecard.currentRound + 1 }} 局 · 记账</view>
        <view class="round-form">
          <picker :range="playerNames" @change="onPlayerChange">
            <view class="picker-box">{{ selectedName }} ▾</view>
          </picker>
          <input class="score-input" type="digit" v-model="scoreInput" placeholder="得分 ±" />
          <input class="note-input" v-model="noteInput" placeholder="备注(可选)" maxlength="20" />
          <button class="btn-record" :disabled="!selectedPlayer || scoreInput === ''" @tap="recordRound">记一笔</button>
        </view>
        <view v-if="activeStats" class="stats-panel">
          <text class="stats-title">{{ activeStats.player.name }} 统计</text>
          <view class="stats-grid">
            <view class="stat-item"><text class="stat-label">总局数</text><text class="stat-value">{{ activeStats.stats.totalRounds }}</text></view>
            <view class="stat-item"><text class="stat-label">胜局</text><text class="stat-value">{{ activeStats.stats.wins }}</text></view>
            <view class="stat-item"><text class="stat-label">负局</text><text class="stat-value">{{ activeStats.stats.losses }}</text></view>
            <view class="stat-item"><text class="stat-label">最高</text><text class="stat-value">{{ activeStats.stats.highestScore }}</text></view>
            <view class="stat-item"><text class="stat-label">最低</text><text class="stat-value">{{ activeStats.stats.lowestScore }}</text></view>
            <view class="stat-item"><text class="stat-label">场均</text><text class="stat-value">{{ activeStats.stats.averageScore.toFixed(1) }}</text></view>
          </view>
          <view class="round-log" v-for="(r, i) in activeStats.player.rounds" :key="i">
            <text class="log-idx">{{ i + 1 }}</text>
            <text class="log-score">{{ r.score > 0 ? '+' : '' }}{{ r.score }}</text>
            <text class="log-note">{{ r.note }}</text>
          </view>
        </view>
      </view>

      <!-- 操作 -->
      <view class="action-row">
        <button class="btn-ghost" @tap="resetCurrent">清空本局</button>
        <button class="btn-ghost" @tap="undoLast">撤销上一笔</button>
        <button class="btn-finish" @tap="finishGame">结束并生成战报</button>
      </view>

      <!-- 战报 -->
      <view v-if="scorecard.status === 'FINISHED'" class="report-card">
        <text class="report-title">🏆 战报 · {{ scorecard.finishedAt ? new Date(scorecard.finishedAt).toLocaleDateString() : '' }}</text>
        <view v-for="(entry, idx) in rankings" :key="entry.id" class="report-row">
          <text>{{ idx + 1 }}. {{ entry.name }}</text>
          <text class="report-total">{{ entry.total > 0 ? '+' : '' }}{{ entry.total }}</text>
        </view>
        <button class="btn-new" @tap="newGame">再来一局</button>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  createScorecard,
  addRound,
  finishScorecard,
  resetScorecard,
  getRankings,
  getPlayerStats,
  COMPLIANCE_TEXT
} from '@/utils/scoreboard-engine.js';

const complianceText = COMPLIANCE_TEXT;
const newPlayerName = ref('');
const players = ref<Array<{ id: string; name: string }>>([]);
const scorecard = ref<any>(null);
const scoreInput = ref('');
const noteInput = ref('');
const selectedPlayer = ref('');
const activeStats = ref<any>(null);
const undoLog: Array<{ playerId: string; score: number; note: string }> = [];

const playerNames = computed(() => (scorecard.value ? (scorecard.value.players as any[]).map((p: any) => p.name) : []));
const rankings = computed(() => (scorecard.value ? getRankings(scorecard.value) : []));
const selectedName = computed(() => {
  const p = (scorecard.value?.players as any[])?.find((x: any) => x.id === selectedPlayer.value);
  return p ? p.name : '选择玩家';
});

function addPlayer() {
  const name = newPlayerName.value.trim();
  if (!name) return;
  if (players.value.length >= 8) { uni.showToast({ title: '最多 8 人', icon: 'none' }); return; }
  players.value.push({ id: `p${Date.now()}_${players.value.length}`, name });
  newPlayerName.value = '';
}

function removePlayer(i: number) {
  players.value.splice(i, 1);
}

function startGame() {
  if (players.value.length < 2) return;
  scorecard.value = createScorecard(players.value);
  selectedPlayer.value = scorecard.value.players[0].id;
}

function onPlayerChange(e: any) {
  const idx = Number(e.detail.value);
  selectedPlayer.value = (scorecard.value.players as any[])[idx]?.id || '';
}

function recordRound() {
  if (!scorecard.value || !selectedPlayer.value || scoreInput.value === '') return;
  const score = Number(scoreInput.value);
  undoLog.push({ playerId: selectedPlayer.value, score, note: noteInput.value });
  scorecard.value = { ...addRound(scorecard.value, selectedPlayer.value, score, noteInput.value) };
  scoreInput.value = '';
  noteInput.value = '';
  activeStats.value = null;
}

function toggleStats(id: string) {
  if (!scorecard.value) return;
  activeStats.value = activeStats.value?.player?.id === id ? null : getPlayerStats(scorecard.value, id);
}

function undoLast() {
  if (!scorecard.value || !undoLog.length) return;
  const last = undoLog.pop();
  const s = scorecard.value;
  const entry = s.entries[last.playerId];
  entry.rounds.pop();
  entry.total -= last.score;
  s.currentRound = Math.max(0, s.currentRound - 1);
  s.lastUpdated = new Date().toISOString();
  scorecard.value = { ...s };
  activeStats.value = null;
}

function resetCurrent() {
  if (!scorecard.value) return;
  scorecard.value = { ...resetScorecard(scorecard.value) };
  undoLog.length = 0;
  activeStats.value = null;
  uni.showToast({ title: '已清空', icon: 'none' });
}

function finishGame() {
  if (!scorecard.value) return;
  scorecard.value = { ...finishScorecard(scorecard.value) };
  undoLog.length = 0;
  uni.showToast({ title: '记分单已结束', icon: 'none' });
}

function newGame() {
  scorecard.value = null;
  players.value = [];
  undoLog.length = 0;
  activeStats.value = null;
}
</script>

<style scoped>
.score-page { flex: 1; min-height: 100vh; background: #FAF8F2; padding: 16px 16px 32px; box-sizing: border-box; }
.page-header { padding: 8px 0 12px; }
.page-title { display: block; font-size: 22px; font-weight: 700; color: #2B2723; }
.page-subtitle { display: block; font-size: 12px; color: #8A867F; margin-top: 4px; }

.compliance-tip { background: #FBF3E8; border: 1px solid #EAD9BE; border-radius: 8px; padding: 8px 12px; margin-bottom: 12px; }
.comp-text { font-size: 12px; color: #A8783B; }

.setup-card, .rank-section, .round-card, .report-card { background: #FFFFFF; border-radius: 12px; padding: 14px; margin-bottom: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.04); }
.card-title { font-size: 15px; font-weight: 600; color: #2B2723; margin-bottom: 10px; }

.player-input-row { display: flex; gap: 8px; margin-bottom: 10px; }
.player-input { flex: 1; background: #F7F4EC; border-radius: 8px; padding: 8px 12px; font-size: 14px; height: 40px; box-sizing: border-box; }
.btn-add { background: #B03A2E; color: #FFF; font-size: 13px; border-radius: 8px; width: 96px; line-height: 2.4; }
.btn-start, .btn-finish { width: 100%; background: #B03A2E; color: #FFF; border-radius: 8px; font-size: 15px; margin-top: 10px; }
.btn-start[disabled] { background: #D8C8C0; color: #FFF; }

.player-list { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 6px; }
.player-chip { display: inline-flex; align-items: center; background: #F3EDE3; border-radius: 14px; padding: 4px 10px; font-size: 13px; color: #5A5348; }
.chip-del { margin-left: 6px; color: #B03A2E; font-weight: 700; }
.hint { font-size: 12px; color: #B0A99C; padding: 4px 0; }

.rank-row { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid #F3EFE6; }
.rank-no { width: 24px; height: 24px; border-radius: 50%; background: #B03A2E; color: #FFF; text-align: center; line-height: 24px; font-size: 12px; }
.rank-name { flex: 1; font-size: 15px; color: #2B2723; }
.rank-score { font-size: 16px; font-weight: 700; }
.rank-score.pos { color: #3E8E5A; }
.rank-score.neg { color: #B03A2E; }
.rank-rounds { font-size: 12px; color: #B0A99C; }

.round-form { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.picker-box { background: #F7F4EC; border-radius: 8px; padding: 8px 12px; font-size: 14px; min-width: 120px; }
.score-input, .note-input { background: #F7F4EC; border-radius: 8px; padding: 8px 12px; font-size: 14px; height: 40px; }
.score-input { width: 96px; }
.note-input { flex: 1; min-width: 140px; }
.btn-record { background: #7FA8A0; color: #FFF; border-radius: 8px; font-size: 14px; padding: 0 18px; }
.btn-record[disabled] { opacity: 0.5; }

.stats-panel { margin-top: 12px; border-top: 1px solid #F3EFE6; padding-top: 10px; }
.stats-title { font-size: 13px; font-weight: 600; color: #6E6659; }
.stats-grid { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
.stat-item { flex: 1; min-width: 30%; background: #FBF9F4; border-radius: 8px; padding: 8px; text-align: center; }
.stat-label { display: block; font-size: 11px; color: #8A867F; }
.stat-value { display: block; font-size: 16px; font-weight: 700; color: #2B2723; }
.round-log { display: flex; gap: 10px; font-size: 13px; padding: 4px 0; color: #5A5348; }
.log-idx { color: #B0A99C; width: 18px; }
.log-score { font-weight: 600; color: #3E8E5A; min-width: 40px; }
.log-note { color: #8A867F; flex: 1; }

.action-row { display: flex; gap: 8px; margin-bottom: 12px; }
.btn-ghost { flex: 1; background: #F3EDE3; color: #5A5348; border-radius: 8px; font-size: 13px; }
.btn-finish { flex: 1; background: #2B2723; color: #FFF; border-radius: 8px; font-size: 13px; }

.report-title { display: block; font-size: 15px; font-weight: 700; margin-bottom: 8px; }
.report-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #F3EFE6; font-size: 14px; }
.report-total { font-weight: 700; color: #B03A2E; }
.btn-new { width: 100%; background: #7FA8A0; color: #FFF; border-radius: 8px; margin-top: 12px; }
</style>
