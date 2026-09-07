<template>
  <view class="chess-page">
    <!-- 顶部状态 -->
    <view class="status-bar">
      <text class="turn-label" :class="{ red: turn === 'red', black: turn === 'black' }">
        {{ turn === 'red' ? '红方' : '黑方' }}行棋
      </text>
      <text v-if="checkMsg" class="check-msg">{{ checkMsg }}</text>
      <text v-if="overMsg" class="over-msg">{{ overMsg }}</text>
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
    <view class="ops">
      <button class="op-btn" @tap="restart">重新开局</button>
      <button class="op-btn" :disabled="!history.length" @tap="undo">悔棋</button>
      <button class="op-btn" @tap="toggleHint">提示走法{{ hintOn ? ' 关' : ' 开' }}</button>
    </view>

    <!-- 合规声明 -->
    <view class="comp-tip">
      <text class="comp-text">单机本地对弈 · 无联机匹配 · 仅娱乐研习</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
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

const board = ref<any[][]>(initialBoard());
const turn = ref('red');
const selected = ref<{ row: number; col: number } | null>(null);
const hints = ref<Array<{ row: number; col: number }>>([]);
const hintOn = ref(false);
const checkMsg = ref('');
const overMsg = ref('');
const lastMove = ref<{ from: { row: number; col: number }; to: { row: number; col: number } } | null>(null);
const history = ref<Array<any>>([]);

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
  return hintOn.value && hints.value.some(h => h.row === r && h.col === c);
}

function onCellTap(r: number, c: number) {
  if (overMsg.value) return;
  const cell = board.value[r][c];

  // 有选中且点在合法目标格 → 走子
  if (selected.value && hints.value.some(h => h.row === r && h.col === c)) {
    doMove(selected.value, { row: r, col: c });
    return;
  }
  // 选中己方棋子
  if (cell && cell.color === turn.value) {
    selected.value = { row: r, col: c };
    hints.value = hintOn.value ? possibleRawMoves(board.value, r, c) : [];
    return;
  }
  // 点空白/对方 → 取消
  selected.value = null;
  hints.value = [];
}

function doMove(from: { row: number; col: number }, to: { row: number; col: number }) {
  const src = board.value[from.row][from.col];
  if (!src || src.color !== turn.value) return;

  const nb = makeMove(cloneBoard(board.value), { row: from.row, col: from.col }, to);
  board.value = nb;
  history.value.push({ from: { ...from }, to: { ...to }, piece: { ...src } });
  lastMove.value = { from: { ...from }, to: { ...to } };
  selected.value = null;
  hints.value = [];
  checkMsg.value = '';

  // 切换行棋方并判胜负
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
  selected.value = null;
  hints.value = [];
  lastMove.value = history.value.length ? history.value[history.value.length - 1] : null;
}

function restart() {
  board.value = initialBoard();
  turn.value = 'red';
  history.value = [];
  selected.value = null;
  hints.value = [];
  checkMsg.value = '';
  overMsg.value = '';
  lastMove.value = null;
}

function toggleHint() {
  hintOn.value = !hintOn.value;
  if (!hintOn.value) hints.value = [];
  else if (selected.value) {
    const cell = board.value[selected.value.row][selected.value.col];
    if (cell && cell.color === turn.value) {
      hints.value = possibleRawMoves(board.value, selected.value.row, selected.value.col);
    }
  }
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

.status-bar { display: flex; align-items: center; gap: 12px; padding: 8px 2px 12px; flex-wrap: wrap; }
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

.comp-tip { background: #FBF3E8; border-radius: 8px; padding: 8px 12px; text-align: center; }
.comp-text { font-size: 12px; color: #A8783B; }
</style>
