<!--
  pkg-game/pages/game/async.vue — 异步对弈（蓝图 V2.0 §30 D.1 合规替代路径）
  实现：一手传书（双方轮流落子，每步 24h 内有效），不触发实时匹配类目
-->
<template>
  <view class="async-page">
    <view class="hd">异步对弈（实验性）</view>
    <text class="sub">非实时匹配 · 每步 24h 有效 · 家族棋王榜</text>
    <!-- 发起对局 -->
    <BaseCard title="发起对局" @click="showCreate=true">
      <text class="card-sub">选择对手（需认证族人）+ 棋盘规格 + 时长限制</text>
    </BaseCard>
    <!-- 我的对局列表 -->
    <BaseCard title="我的对局">
      <view v-for="g of myGames" :key="g._id" class="game-item">
        <text>{{ g.opponent }} vs 我</text>
        <view class="status">{{ getStatus(g) }}</view>
        <button size="mini" @click="makeMove(g)">下一手</button>
      </view>
      <view v-if="!myGames.length" class="empty">暂无对局</view>
    </BaseCard>
  </view>
  <!-- 弹窗占位 -->
  <view v-if="showCreate" class="mask"><text @click="showCreate=false">取消</text></view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import BaseCard from '@/components/common/BaseCard.vue';
const showCreate = ref(false);
const myGames = ref<any[]>([]); // stub: 未来对接 game 云函数

function getStatus(g:any) { return g.status === 'WAITING' ? '等待对手·剩余'+g.leftHours+'小时' : '已结束'; }

onMounted(async ()=>{ /* stub: load games */ });
function makeMove(g:any){ alert('棋盘交互组件需 Canvas 实现'); }
</script>

<style scoped>
.async-page{ min-height:100vh; background:#FAF8F2; padding:16px 16px 32px; }
.hd{ font-size:20px; font-weight:700; color:#2B2723; margin-bottom:4px; }
.sub{ font-size:13px; color:#999; display:block; margin-bottom:16px; }
.card-sub{ font-size:13px; color:#6E6659; display:block; margin-top:6px; }
.game-item{ display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid #F0EFEA; }
.game-item:last-child{ border-bottom:none; }
.status{ font-size:12px; color:#C9A063; }
.empty{text-align:center; padding:32px 0; color:#CCC; }
.mask{ position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,.4); z-index:999; align-items:center; justify-content:center; }
</style>
