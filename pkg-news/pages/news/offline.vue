<!--
  pkg-news/pages/news/offline.vue — 离线包管理（蓝图 V2.0 §28 B.5）
  数据：listOffline() / removeOffline(newsId) / cleanupOffline() / packOffline(groupId?, newsIds?)
-->
<template>
  <view class="offline-page">
    <text class="hd">离线阅读包</text>
    <view class="tips">离线包保存收藏/已读文章的摘要快照，方便弱网环境下的快速浏览。</view>
    <!-- 打包按钮 -->
    <button class="pack-btn" size="mini" @click="doPack()">选择内容打包（Beta）</button>
    <!-- 列表 -->
    <view v-if="loading" class="sk-list"><view v-for="i in 10" :key="i" class="sk-card"/></view>
    <template v-else>
      <view v-for="f of list" :key="f._id" class="card">
        <text class="t">{{ f.snapshot?.title || '文章标题缺失' }}</text>
        <text class="s">{{ f.snapshot?.summary || '' }}</text>
        <view class="ft">
          <text>{{ fmtTime(f.createdAt) }}</text>
          <text class="del-btn" @click="remove(f.newsId)">删除</text>
        </view>
      </view>
      <view v-if="!list.length" class="empty">暂无离线内容</view>
    </template>
    <view class="actions">
      <button class="clean-btn" @click="cleanup()">一键清理全部离线</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { listOffline, removeOffline, cleanupOffline, packOffline } from '@/services/news';

const loading = ref(true);
const list = ref<any[]>([]);

onMounted(async ()=>{ const r=await listOffline(); data=r.data?.offline|| []; loading.value=false; });

async function remove(id:string){ await removeOffline(id); list.value=list.value.filter(x=>x.newsId!==id); }

async function cleanup(){ if(confirm('确认清理全部离线内容？')){ await cleanupOffline(); list.value=[]; uni.showToast({title:'已清理',icon:'success'}); } }

async function doPack(){ /* 简化版：默认打包未离线的收藏；生产需选择器 */ const confirm='确定打包所有收藏至离线吗？'; if(!confirm('Confirm?'))return; await packOffline('',[]); uni.showToast({title:'已排队打包',icon:'success'}); }

function fmtTime(ts?:string){ if(!ts) return ''; const d=new Date(ts); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
</script>

<style lang="scss" scoped>
.offline-page{ min-height:100vh; background:#FAF8F2; padding:16px; box-sizing:border-box; }
.hd{ font-size:18px; font-weight:700; color:#2B2723; display:block; margin-bottom:8px; }
.tips{ font-size:13px; color:#6E6659; line-height:1.4; margin-bottom:12px; }
.pack-btn{ background:#B03A2E; color:#FFF; font-size:14px; padding:8px 16px; border-radius:6px; border:none; margin-bottom:12px; }
.sk-list{ display:flex; flex-direction:column; gap:8px; }
.sk-card{ height:80px; background:#FFF; border-radius:10px; }
.card{ background:#FFF; border-radius:12px; padding:12px; margin-bottom:12px; box-shadow:0 2px 12px rgba(38,34,30,.06);}
.t{ font-size:15px; font-weight:600; line-height:1.3; color:#2B2723; }
.s{ font-size:13px; color:#6E6659; margin-top:4px; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
.ft{ display:flex; justify-content:space-between; align-items:center; margin-top:8px; font-size:12px; color:#999; }
.del-btn{ color:#B03A2E; cursor:pointer; }
.empty{text-align:center; padding:60px 0; color:#CCC; }
.actions{ margin-top:16px; }
.clean-btn{ width:100%; font-size:14px; padding:10px; background:#C9A063; color:#FFF; border-radius:6px; border:none; }
</style>
