<template>
  <view class="chess-page">
    <!-- 模式切换 -->
    <view class="mode-tabs">
      <view class="mode-tab" :class="{ on: mode === 'duel' }" @tap="switchMode('duel')">对弈</view>
      <view class="mode-tab" :class="{ on: mode === 'endgame' }" @tap="switchMode('endgame')">
        残局挑战<text v-if="mode === 'endgame'" class="prog">{{ solvedCount }}/{{ LEVEL_COUNT }}</text>
      </view>
    </view>

    <!-- 顶部状态 -->
    <view class="status-bar">
      <template v-if="mode === 'duel'">
        <text class="turn-label" :class="{ red: turn === 'red', black: turn === 'black' }">
          {{ turn === 'red' ? '红方' : '黑方' }}行棋
        </text>
        <text v-if="checkMsg" class="check-msg">{{ checkMsg }}</text>
        <text v-if="overMsg" class="over-msg">{{ overMsg }}</text>
      </template>
      <template v-else>
        <view class="level-head">
          <text class="turn-label red">第 {{ levelIdx + 1 }}/{{ LEVEL_COUNT }} 题 · {{ level?.title }}</text>
          <text class="diff">{{ '⭐'.repeat(level?.difficulty || 1) }}</text>
        </view>
        <text v-if="resultMsg" class="over-msg">{{ resultMsg }}</text>
        <text v-if="solvedHere" class="check-msg">✓ 已通关</text>
      </template>
    </view>

    <!-- 棋盘 -->
    <view class="board-wrap">
      <view class="board">
        <view v-for="(row, r) in board" :key="r" class="board-row">
          <view
            v-for="(cell, c) in row"
            :key="c"
            class="cell"
            :class="{
              selected: selected && selected.row === r && selected.col === c,
              movable: isHint(r, c),
              'last-move': lastMove && lastMove.to.row === r && lastMove.to.col === c
            }"
            @tap="onCellTap(r, c)"
          >
            <text v-if="cell" class="piece" :class="cell.color === 'red' ? 'piece-red' : 'piece-black'">
              {{ pieceChar(cell.piece, cell.color) }}
            </text>
          </view>
        </view>
      </view>
    </view>

    <!-- 操作条 -->
    <view class="ops" v-if="mode === 'duel'">
      <button class="op-btn" @tap="restart">重新开局</button>
      <button class="op-btn" :disabled="!history.length" @tap="undo">悔棋</button>
      <button class="op-btn" @tap="toggleHint">提示走法{{ hintOn ? ' 关' : ' 开' }}</button>
    </view>
    <view class="ops" v-else>
      <button class="op-btn" :disabled="levelIdx <= 0" @tap="prevLevel">上一题</button>
      <button class="op-btn" @tap="loadLevel(levelIdx)">重试</button>
      <button class="op-btn" :disabled="levelIdx >= LEVEL_COUNT - 1" @tap="nextLevel">下一题</button>
    </view>

    <!-- 残局提示（tip） -->
    <view v-if="mode === 'endgame' && level" class="tip-box">
      <text class="tip-text" @tap="levelTipOn = !levelTipOn">
        {{ levelTipOn ? `棋诀：${level.tip}` : '👆 点按查看棋诀' }}
      </text>
    </view>

    <!-- 合规声明 -->
    <view class="comp-tip">
      <text class="comp-text">
        {{ mode === 'duel' ? '单机本地对弈 · 无联机匹配 · 仅娱乐研习' : '残局挑战 · 本地题库 · 引擎判定 · 无联机无随机' }}
      </text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useChildGuard } from '@/utils/child-guard.js';
import {
  initialBoard,
  cloneBoard,
  makeMove,
  possibleRawMoves,
  legalMoves,
  isCheck,
  isCheckmate,
  isStalemate
} from '@/utils/chess-engine.js';
import { LEVELS, LEVEL_COUNT, boardFromLevel } from '@/utils/endgame-library.js';
useChildGuard();

const STORAGE_KEY = 'hcs:endgame:solved';

// ── 模式与残局状态 ──
const mode = ref<'duel' | 'endgame'>('duel');
const levelIdx = ref(0);
const levelTipOn = ref(false);
const resultMsg = ref('');
const solvedIds = ref<string[]>(loadSolved());
const solvedCount = computed(() => solvedIds.value.length);
const solvedHere = computed(() => {
  const lv = LEVELS[levelIdx.value];
  return !!lv && solvedIds.value.includes(lv.id);
});
const level = computed(() => LEVELS[levelIdx.value] || null);

function loadSolved(): string[] {
  try {
    const raw = uni.getStorageSync(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function persistSolved() {
  try { uni.setStorageSync(STORAGE_KEY, JSON.stringify(solvedIds.value)); } catch { /* ignore */ }
}

// ── 公共对局状态 ──
const board = ref<any[][]>(initialBoard());
const turn = ref('red');
const selected = ref<{ row: number; col: number } | null>(null);
const moves = ref<Array<{ row: number; col: number }>>([]); // 当前选子的合法落点（走子判定用）
const hints = ref<Array<{ row: number; col: number }>>([]);  // 视觉高亮（受 hintOn 控制）
const hintOn = ref(true); // 对弈模式默认显示落点辅助
const checkMsg = ref('');
const overMsg = ref('');
const lastMove = ref<{ from: { row: number; col: number }; to: { row: number; col: number } } | null>(null);
const history = ref<Array<any>>([]);

function switchMode(m: 'duel' | 'endgame') {
  if (m === mode.value) return;
  mode.value = m;
  if (m === 'endgame') loadLevel(0);
  else restart();
}

function loadLevel(i: number) {
  const idx = Math.max(0, Math.min(LEVEL_COUNT - 1, i));
  levelIdx.value = idx;
  levelTipOn.value = false;
  hintOn.value = false; // 残局默认不开落点提示（可点棋诀）
  resultMsg.value = '';
  overMsg.value = '';
  board.value = boardFromLevel(LEVELS[idx]);
  turn.value = 'red';
  selected.value = null;
  moves.value = [];
  hints.value = [];
  lastMove.value = null;
  history.value = [];
}

function prevLevel() { if (levelIdx.value > 0) loadLevel(levelIdx.value - 1); }
function nextLevel() { if (levelIdx.value < LEVEL_COUNT - 1) loadLevel(levelIdx.value + 1); }

// 棋盘渲染辅助
function pieceChar(type: string, color: string): string {
  const map: Record<string, [string, string]> = {
    K: ['帅', '将'], A: ['仕', '士'], E: ['相', '象'],
    H: ['马', '马'], R: ['车', '车'], C: ['炮', '炮'], P: ['兵', '卒']
  };
  const pair = map[type] || [type, type];
  return color === 'red' ? pair[0] : pair[1];
}

function isHint(r: number, c: number): boolean {
  if (!hintOn.value) return false;
  return hints.value.some(h => h.row === r && h.col === c);
}

function canMovePiece(cell: { color: string }): boolean {
  if (mode.value === 'duel') return cell.color === turn.value;
  return cell.color === 'red'; // 残局只允许红方行棋（一步将杀）
}

function onCellTap(r: number, c: number) {
  if (mode.value === 'duel' && overMsg.value) return;
  const cell = board.value[r][c];

  // 有选中且点在合法目标格 → 走子
  if (selected.value && moves.value.some(h => h.row === r && h.col === c)) {
    doMove(selected.value, { row: r, col: c });
    return;
  }
  // 选中己方可走棋子
  if (cell && canMovePiece(cell)) {
    selected.value = { row: r, col: c };
    moves.value = possibleRawMoves(board.value, r, c); // 落点集（走子判定）
    hints.value = hintOn.value ? moves.value : [];     // 视觉高亮
    return;
  }
  // 点空白/对方 → 取消
  clearSelection();
}

function clearSelection() {
  selected.value = null;
  moves.value = [];
  hints.value = [];
}

function doMove(from: { row: number; col: number }, to: { row: number; col: number }) {
  const src = board.value[from.row][from.col];
  if (!src || !canMovePiece(src)) return;
  // 合法性：目标必须在当前棋子落点集内
  const raw = selected.value && selected.value.row === from.row && selected.value.col === from.col
    ? moves.value
    : possibleRawMoves(board.value, from.row, from.col);
  if (!raw.some(h => h.row === to.row && h.col === to.col)) return;

  const nb = makeMove(cloneBoard(board.value), { row: from.row, col: from.col }, to);
  board.value = nb;
  history.value.push({ from: { ...from }, to: { ...to }, piece: { ...src } });
  lastMove.value = { from: { ...from }, to: { ...to } };
  clearSelection();
  checkMsg.value = '';

  if (mode.value === 'endgame') return afterEndgameMove();
  // ── 对弈模式 ──
  const nextTurn = turn.value === 'red' ? 'black' : 'red';
  if (isCheckmate(board.value, nextTurn)) {
    overMsg.value = `🏆 ${turn.value === 'red' ? '红方' : '黑方'} 胜（将死）`;
    return;
  }
  if (isStalemate(board.value, nextTurn)) {
    overMsg.value = '和棋（困毙，无子可动）';
    return;
  }
  turn.value = nextTurn;
  if (isCheck(board.value, nextTurn)) {
    checkMsg.value = `${nextTurn === 'red' ? '红' : '黑'}方被将军！`;
  }
}

// ── 残局判定：一步将杀 → 通关；否则重置本题 ──
function afterEndgameMove() {
  const lv = LEVELS[levelIdx.value];
  if (isCheckmate(board.value, 'black')) {
    resultMsg.value = '🎉 妙手！一步成杀';
    if (!solvedIds.value.includes(lv.id)) {
      solvedIds.value = [...solvedIds.value, lv.id];
      persistSolved();
    }
    return;
  }
  if (isCheck(board.value, 'black')) {
    resultMsg.value = '将军了但未成杀 —— 本题需一步将死，再想想';
  } else {
    resultMsg.value = '未成杀 —— 本题红方必可一步将死，重试';
  }
  board.value = boardFromLevel(lv); // 重置盘面
  lastMove.value = null;
  history.value = [];
}

function undo() {
  if (!history.value.length) return;
  history.value.pop();
  turn.value = 'red';
  board.value = initialBoard();
  for (const h of history.value) {
    if (board.value[h.from.row][h.from.col]) {
      board.value = makeMove(board.value, { row: h.from.row, col: h.from.col }, h.to);
      turn.value = turn.value === 'red' ? 'black' : 'red';
    }
  }
  overMsg.value = '';
  checkMsg.value = '';
  clearSelection();
  lastMove.value = history.value.length ? history.value[history.value.length - 1] : null;
}

function restart() {
  board.value = initialBoard();
  turn.value = 'red';
  history.value = [];
  clearSelection();
  checkMsg.value = '';
  overMsg.value = '';
  lastMove.value = null;
}

function toggleHint() {
  hintOn.value = !hintOn.value;
  if (selected.value) {
    const cell = board.value[selected.value.row][selected.value.col];
    if (cell && canMovePiece(cell)) {
      moves.value = possibleRawMoves(board.value, selected.value.row, selected.value.col);
      hints.value = hintOn.value ? moves.value : [];
      return;
    }
  }
  hints.value = hintOn.value ? moves.value : [];
}

// 供后端 action 校验参考（本地即可完成全部合法规则，无需网络）
function isLegal(from: { row: number; col: number }, to: { row: number; col: number }): boolean {
  return legalMoves(board.value, turn.value).some(m =>
    m.from.row === from.row && m.from.col === from.col && m.to.row === to.row && m.to.col === to.col
  );
}
void isLegal;
</script>

<style scoped>
.chess-page { flex: 1; min-height: 100vh; background: #FAF8F2; padding: 12px 16px 32px; box-sizing: border-box; }

.mode-tabs { display: flex; gap: 8px; margin-bottom: 10px; }
.mode-tab { padding: 6px 14px; border-radius: 16px; background: #F0EFEA; color: #6E6659; font-size: 14px; font-weight: 600; }
.mode-tab.on { background: #B03A2E; color: #FFF; }
.prog { margin-left: 6px; font-size: 12px; opacity: .9; }

.status-bar { display: flex; align-items: center; gap: 12px; padding: 8px 2px 12px; flex-wrap: wrap; }
.level-head { display: flex; flex-direction: column; gap: 2px; }
.diff { font-size: 12px; color: #C9A063; }
.turn-label { font-size: 16px; font-weight: 700; }
.turn-label.red { color: #B03A2E; }
.turn-label.black { color: #2B2723; }
.check-msg { font-size: 13px; color: #B03A2E; background: #FBE9E5; border-radius: 6px; padding: 3px 10px; }
.over-msg { font-size: 14px; font-weight: 700; color: #B03A2E; }

.board-wrap { background: #EDE4D3; border-radius: 10px; padding: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
.board { display: flex; flex-direction: column; }
.board-row { display: flex; }
.cell { width: 10.5vw; height: 8.4vw; max-width: 34px; max-height: 30px; display: flex; align-items: center; justify-content: center; background: transparent; position: relative; }
@media (min-width: 500px) {
  .cell { width: 34px; height: 30px; }
}
.cell.selected { background: rgba(176,58,46,0.18); border-radius: 4px; }
.cell.movable { background: rgba(127,168,160,0.4); border-radius: 50%; }
.cell.last-move::after { content: ''; position: absolute; inset: 2px; border: 1px dashed #B03A2E; border-radius: 6px; opacity: 0.6; }

.piece { font-size: 20px; font-weight: 700; line-height: 1; text-shadow: 0 1px 0 #FFF; }
.piece-red { color: #B03A2E; }
.piece-black { color: #26221E; }

.ops { display: flex; gap: 10px; margin: 14px 0; }
.op-btn { flex: 1; background: #FFFFFF; color: #5A5348; border: 1px solid #E8DFD0; border-radius: 8px; font-size: 13px; }
.op-btn[disabled] { opacity: 0.4; }

.tip-box { background: #F4F7F5; border: 1px dashed #BFD3CC; border-radius: 8px; padding: 8px 12px; margin-bottom: 12px; }
.tip-text { font-size: 13px; color: #5A7A6E; }

.comp-tip { background: #FBF3E8; border-radius: 8px; padding: 8px 12px; text-align: center; }
.comp-text { font-size: 12px; color: #A8783B; }
</style>
