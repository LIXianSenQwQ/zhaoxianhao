<!--
  pkg-game/pages/game/async.vue — 异步对弈（一手传书 · 非实时匹配）
  V2.0 F7：选择族人对手 → 发起挑战（24h 回合制）→ 我的对局 → 点击进入棋盘走子 → 等待对手应战/回招
-->
<template>
  <view class="async-page">
    <!-- top banner -->
    <view class="hd">异步对弈（实验性）</view>
    <text class="sub">非实时匹配 · 每步 24h 内有效 · 家族棋王榜（记分板）</text>

    <!-- 发起对局 -->
    <BaseCard title="发起对局" @click="showCreate=true">
      <text class="card-sub">选择认证族人作为对手（红先），一手传书</text>
    </BaseCard>

    <!-- 我的对局 -->
    <BaseCard title="我的对局">
      <view v-for="g of myGames" :key="g._id" class="game-item">
        <view class="info">
          <text>{{ g.mySide === 'red' ? '我' : g.blackName }} vs {{ g.mySide === 'red' ? g.blackName : '我' }}</text>
          <text class="opponent">{{ g.redName }} vs {{ g.blackName }}</text>
        </view>
        <view class="meta">
          <text class="status">{{ getStatus(g) }}</text>
          <button class="mini-btn" @click="openGame(g)">查看</button>
        </view>
      </view>
      <view v-if="!myGames.length" class="empty">暂无对局</view>
    </BaseCard>

    <!-- 发起模态框 -->
    <view v-if="showCreate" class="mask" @click.self="showCreate=false">
      <view class="modal">
        <view class="hd">发起挑战</view>
        <view class="input-box">
          <input v-model="searchKeyword" placeholder="搜索族人（谱名/本名）" />
          <button size="mini" @click="doSearch" :disabled="!searchKeyword.trim()">搜索</button>
        </view>
        <view v-if="searchResults.length > 0" class="results">
          <view v-for="r in searchResults" :key="r.id" class="result-item" @click="selectOpponent(r)">
            <text class="name">{{ r.genealogyName || r.name }}</text>
            <text v-if="r.generation" class="gen">第{{ r.generation }}代</text>
            <text class="tag">{{ r.status === 'ALIVE' ? '在世' : '已故' }}</text>
          </view>
        </view>
        <view class="actions">
          <button class="btn-cancel" @click="showCreate=false">取消</button>
          <button v-if="selectedOpponent && !submitting" class="btn-create" @click="submitChallenge">确认</button>
          <button v-if="submitting" disabled class="btn-create">提交中...</button>
        </view>
      </view>
    </view>

    <!-- 游戏详情模态框（棋盘交互） -->
    <view v-if="activeGame" class="mask game-modal" @click.self="activeGame=null">
      <view class="game-modal-inner">
        <view class="hd">{{ activeGame.gameId }} • {{ getStatus(activeGame) }}</view>
        <view class="board-wrap">
          <!-- 棋盘网格：10 行 ×9 列，CSS 渲染 -->
          <view class="board">
            <view v-for="(row, r) in board" :key="r" class="board-row">
              <view v-for="(cell, c) in row" :key="c" class="cell"
                :class="{
                  selected: selected && selected.row === r && selected.col === c,
                  movable: hintOn && hints.some(h => h.row === r && h.col === c),
                  lastMove: lastMove && lastMove.to.row === r && lastMove.to.col === c
                }"
                @tap="onCellTap(r,c)"
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
          <button class="op-btn" @click="toggleHint">{{ hintOn ? '关闭提示' : '打开提示' }}</button>
          <button class="op-btn" :disabled="!history.length" @click="undo">悔棋</button>
          <button class="op-btn danger" @click="resignBtn">认输</button>
        </view>

        <!-- 底部合规声明 -->
        <view class="comp-tip">
          <text class="comp-text">异步回合制 · 零内购 · 禁止赌博 · 单机娱乐引擎校验</text>
        </view>

        <!-- close btn -->
        <view class="close-btn" @click="activeGame=null">关闭</view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import BaseCard from '@/components/common/BaseCard.vue';
import { useChildGuard } from '@/utils/child-guard.js';
import { useUserStore } from '@/stores/user';
import * as memberSrv from '@/services/member';
import * as asyncSrv from '@/services/asyncgame';
import { possibleRawMoves, initialBoard } from '@/utils/chess-engine.js';

useChildGuard();
const store = useUserStore();

// UI state
const showCreate = ref(false);
const myGames = ref<any[]>([]);
const searching = ref(false);
const searchResults = ref<any[]>([]);
const searchKeyword = ref('');
const selectedOpponent = ref<{ id: string; name?: string } | null>(null);
const submitting = ref(false);

// game modal
const activeGame = ref<any|null>(null);
const board = ref<any[][]>(initialBoard());
const selected = ref<{row:number,col:number} | null>(null);
const hints = ref<Array<{row:number,col:number}>>([]);
const hintOn = ref(false);
const lastMove = ref<{from:{row:number,col:number}; to:{row:number,col:number}} | null>(null);

// 初始化对局列表
onMounted(() => loadGames());

async function loadGames() {
  try {
    const res = await asyncSrv.asyncList();
    if (!res.error && res.data?.games) myGames.value = res.data.games;
  } catch (e:any) { console.warn(e.message); }
}

// 状态文本
function getStatus(g:any) {
  if (g.status === 'WAITING') return `等待对手·截止${g.deadlineAt? g.deadlineAt.slice(11,16):''}`;
  if (g.status === 'ONGOING') {
    if (g.turn === 'red') return '轮到红方';
    return g.turn === 'black' ? '轮到黑方' : '';
  }
  if (g.result?.reason === 'CHECKMATE') return `胜负已分 • 红方胜`;
  return '已结束';
}

// search 族人
async function doSearch() {
  if (!searchKeyword.value.trim()) return;
  searching.value = true;
  searchResults.value = [];
  try {
    const res = await memberSrv.search(searchKeyword.value);
    if (!res.error && res.data?.hits) {
      searchResults.value = res.data.hits.filter(m => m.status !== 'DECEASED'); // 仅在世
    } else if (res.error) {
      uni.showToast({ title: res.error.message || '搜索失败', icon:'none' });
    }
  } catch (e:any) { console.warn('search fail', e.message); }
  searching.value = false;
}

function selectOpponent(r:any) {
  selectedOpponent.value = { id: r.id, name: r.genealogyName || r.name };
}

async function submitChallenge() {
  if (!selectedOpponent.value) return;
  submitting.value = true;
  try {
    const res = await asyncSrv.asyncCreate({
      blackMemberId: selectedOpponent.value.id,
      redMemberId: store.userInfo.memberId || undefined,
      redName: '我'
    });
    if (!res.error && res.data?.game) {
      showCreate.value = false;
      selectedOpponent.value = null;
      searchKeyword.value = '';
      searchResults.value = [];
      await loadGames();
    } else {
      uni.showToast({ title: res.error?.message || '创建失败', icon:'none' });
    }
  } catch (e:any) {
    uni.showToast({ title: e.message || '创建失败', icon:'none' });
  } finally {
    submitting.value = false;
  }
}

// game modal ops
function openGame(g:any) {
  activeGame.value = g;
  asyncSrv.asyncState(g.gameId).then(res => {
    if (!res.error && res.data?.game) {
      const st = res.data.game;
      activeGame.value = st; // 以最新状态为准（含 status/turn/deadline/result）
      board.value = JSON.parse(st.board || JSON.stringify(initialBoard()));
      selected.value = null;
      hints.value = [];
      lastMove.value = null;
      if (st.moveLog && st.moveLog.length) {
        const last = st.moveLog[st.moveLog.length - 1];
        lastMove.value = { from: last.from, to: last.to };
      }
    } else if (res.error) {
      uni.showToast({ title: res.error.message || '加载对局失败', icon:'none' });
    }
  });
}

// 棋子字符映射
function pieceChar(type:string, color:string) {
  const map:{[k:string]:[string,string]} = {
    K:['帅','将'], A:['仕','士'], E:['相','象'],
    H:['马','马'], R:['车','车'], C:['炮','炮'], P:['兵','卒']
  };
  const pair = map[type] || [type,type];
  return color === 'red' ? pair[0] : pair[1];
}

function toggleHint() { hintOn.value = !hintOn.value; }
function undo() { /* stub：暂不实现服务端逆向 */ }
function resignBtn() {
  if (!activeGame.value) return;
  uni.showModal({ title:'是否认输?', success:async ret=>{
    if(ret.confirm){
      const res = await asyncSrv.asyncResign(activeGame.value.gameId);
      if(!res.error && res.data?.game){ closeGame(); await loadGames(); }
      else uni.showToast({ title: res.error?.message || '认输失败', icon:'none' });
    }
  }});
}

function onCellTap(r:number, c:number) {
  if (!activeGame.value) return;
  const g = activeGame.value;
  const cell = board.value[r][c];

  // 有选中且点在合法目标格 → 走子
  if (selected.value && hints.value.some(h => h.row === r && h.col === c)) {
    doMove(selected.value, { row: r, col: c });
    return;
  }
  // 选中己方棋子
  if (cell && cell.color === g.turn) {
    selected.value = { row: r, col: c };
    hints.value = hintOn.value ? possibleRawMoves(board.value, r, c) : [];
    return;
  }
  // 点空白/对方 → 取消
  selected.value = null;
  hints.value = [];
}

async function doMove(from:{row:number,col:number}, to:{row:number,col:number}) {
  if (!activeGame.value) return;
  const g = activeGame.value;
  const res = await asyncSrv.asyncMove(g.gameId, from, to);
  if (!res.error && res.data?.game) {
    // 以服务端最新对局状态刷新本地棋盘（含终局判定）
    await openGame({ gameId: g.gameId });
    await loadGames();
    if (res.data.duplicate) uni.showToast({ title: '此步已提交过', icon:'none' });
    if (res.data.finished) uni.showToast({ title: '本局结束', icon:'none' });
  } else {
    uni.showToast({ title: res.error?.message || '走子失败', icon:'none' });
  }
}
</script>

<style scoped>
.async-page { min-height:100vh; background:#FAF8F2; padding:16px 16px 32px; }
.hd { font-size:20px; font-weight:700; color:#2B2723; margin-bottom:4px; }
.sub { font-size:13px; color:#999; display:block; margin-bottom:16px; }
.card-sub { font-size:13px; color:#6E6659; display:block; margin-top:6px; }
.game-item { display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid #F0EFEA; }
.info { display:flex; flex-direction:column; gap:2px; }
.opponent { font-size:12px; color:#AAA; }
.meta { display:flex; align-items:center; gap:8px; }
.status { font-size:12px; color:#C9A063; }
.empty { text-align:center; padding:32px 0; color:#CCC; }
.mask { position:fixed; inset:0; background:rgba(0,0,0,.4); z-index:999; display:flex; align-items:center; justify-content:center; }
.modal, .game-modal-inner { background:#FFF; border-radius:12px; max-width:480px; width:92vw; padding:16px; box-shadow:0 8px 24px rgba(0,0,0,.12); max-height:90vh; overflow-y:auto; }
.input-box { display:flex; gap:8px; margin:12px 0; }
.results { max-height:240px; overflow-y:auto; margin:8px 0; }
.result-item { display:flex; align-items:center; justify-content:space-between; padding:10px; border-radius:8px; margin-bottom:8px; cursor:pointer; }
.result-item:hover { background:#f4f4f4; }
.name { font-weight:600; }
.gen { font-size:12px; color:#888; margin-right:8px; }
.tag { font-size:11px; padding:2px 6px; background:#eee; border-radius:4px; color:#666; }
.btn-create { background:#B03A2E; color:#FFF; border:none; padding:8px 16px; border-radius:6px; font-size:14px; }
.btn-cancel { background:#EEE; color:#555; border:none; padding:8px 16px; border-radius:6px; font-size:14px; margin-right:8px; }
.actions { display:flex; gap:8px; margin-top:12px; }
.mini-btn { font-size:12px; padding:4px 8px; background:#EDF5F4; border-radius:4px; border:none; }
.board-wrap { background:#EDE4D3; border-radius:10px; padding:10px; box-shadow:0 2px 8px rgba(0,0,0,.08); }
.board { display:flex; flex-direction:column; }
.board-row { display:flex; }
.cell { width:10.5vw; height:8.4vw; max-width:34px; max-height:30px; display:flex; align-items:center; justify-content:center; background:transparent; position:relative; }
@media (min-width:500px){ .cell{width:34px;height:30px;} }
.cell.selected { background:rgba(176,58,46,0.18); border-radius:4px; }
.cell.movable { background:rgba(127,168,160,0.4); border-radius:50%; }
.cell.lastMove::after { content:''; position:absolute; inset:2px; border:1px dashed #B03A2E; border-radius:6px; opacity:0.6; }
.piece { font-size:20px; font-weight:700; line-height:1; text-shadow:0 1px 0 #FFF; }
.piece-red { color:#B03A2E; }
.piece-black { color:#26221E; }
.ops { display:flex; gap:10px; margin:14px 0; }
.op-btn { flex:1; background:#FFFFFF; color:#5A5348; border:1px solid #E8DFD0; border-radius:8px; font-size:13px; }
.op-btn.danger { color:#B03A2E; }
.comp-tip { background:#FBF3E8; border-radius:8px; padding:8px 12px; text-align:center; }
.comp-text { font-size:12px; color:#A8783B; }
.close-btn { margin-top:12px; text-align:center; font-size:14px; color:#5A5348; cursor:pointer; }
</style>
