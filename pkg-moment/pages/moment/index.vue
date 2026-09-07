<!--
  pkg-moment/pages/moment/index.vue — 家族动态（蓝图 V2.0 §29 模块三）
  数据：plaza.list(publishAt desc, hotScore desc)
  交互：话题 Tabs / 发布入口 (+) / 点赞/评论/分享按钮
-->
<template>
  <view class="moment-page">
    <!-- 顶部家族专区置顶卡（与 news index 同源） -->
    <view class="family-card" @click="$router.push('/pkg-news/pages/news/index')">
      <text class="icon">族徽</text>
      <text class="txt">家族专区 · 郝氏动态 | 族务公告 | 红白事</text>
    </view>
    <!-- 话题 Tabs -->
    <scroll-view scroll-x class="tabs">
      <text :class="{active:t==='all'}" @click="t='all'">全部</text>
      <text v-for="tag of TOPICS" :key="tag" :class="{active:t===tag}" @click="t=tag">{{ tag }}</text>
    </scroll-view>
    <!-- 列表 -->
    <view v-if="loading" class="sk-list"><view v-for="i in 10" :key="i" class="sk-card"/></view>
    <template v-else>
      <view v-for="m of items" :key="m._id" class="card" @click="goDetail(m._id)">
        <view class="hd">
          <text class="author">{{ m.authorName || '族人' }}</text>
          <text class="time">{{ fmtTime(m.publishAt) }}</text>
        </view>
        <text v-if="m.content" class="ct">{{ m.content }}</text>
        <view v-if="m.mediaIds && m.mediaIds.length" class="media">
          <image v-for="url of m.mediaIds.slice(0,3)" :key="url" :src="url" mode="aspectFill"/>
        </view>
        <view class="ft">
          <text :class="{on:liked[m._id]}" @click.stop="doLike(m)">赞 {{ m.stats?.like || 0 }}</text>
          <text @click.stop="goDetail(m._id)">评论 {{ m.stats?.comment || 0 }}</text>
          <text @click.stop="share()">分享</text>
        </view>
        <!-- 标签 -->
        <view v-if="m.topicTags && m.topicTags.length" class="tags">
          <text v-for="tg of m.topicTags" :key="tg" class="tag">#{{ tg }}</text>
        </view>
      </view>
      <view v-if="!items.length" class="empty">暂无动态，快来发布第一条！</view>
    </template>
    <!-- 发布按钮 -->
    <button class="fab" size="mini" @click="$router.push('/pkg-moment/pages/moment/publish')">＋发布</button>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { listMoments, likeMoment, reportClick } from '@/services/moment';
const TOPICS=['族务','红白事','节庆','添丁','寿诞','升学','寻根','老照片','梨乡'];

const loading = ref(true);
const items = ref<any[]>([]);
const t = ref('all');
const liked: Record<string,boolean>={};
const route=getCurrentPage();

onMounted(async ()=>{ await load(); });

async function load(){ loading.value=true; const res=await listMoments({page:1, pageSize:20, topicTags:t.value!=='all'?[t.value]:[]}); data=res.data?.moments|| []; loading.value=false; }

async function doLike(it:any){ await likeMoment(it._id); liked[it._id]=true; /* 本地 UI + 后端原子计数同步 */ }

function goDetail(id:string){ reportClick(id); uni.navigateTo({ url:`/pkg-moment/pages/moment/detail?id=${encodeURIComponent(id)}` }); }

function share(){ /* 生成卡片分享到群；此处简化*/ uni.showToast({title:'已复制到剪贴板', icon:'none'}); }

function fmtTime(ts?:string){ if(!ts) return ''; const d=new Date(ts); return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }
</script>

<style lang="scss" scoped>
.moment-page{ min-height:100vh; background:#FAF8F2; padding-bottom:60px; }
.family-card{ display:flex; align-items:center; padding:12px; margin:12px 16px; background:#F5F1E6; border-radius:12px; font-size:13px; }
.icon{ font-weight:700; color:#C9A063; margin-right:8px; }
.txt{ flex:1; color:#2B2723; }
.tabs{ white-space:nowrap; padding:8px 16px; overflow-x:auto; background:#FAF8F2; position:sticky; top:0; z-index:10; }
.tabs .active{ font-weight:700; border-bottom:2px solid #B03A2E; padding-bottom:4px; margin-bottom:-14px; }
.sk-list{ display:flex; flex-direction:column; gap:12px; }
.sk-card{ height:140px; background:#FFF; border-radius:12px; margin:12px 16px; }
.card{ background:#FFF; border-radius:12px; padding:12px; margin:12px 16px; box-shadow:0 2px 12px rgba(38,34,30,.06); }
.hd{ display:flex; justify-content:space-between; font-size:12px; color:#999; margin-bottom:6px; }
.ct{ font-size:14px; line-height:1.5; color:#333; display:block; margin-bottom:6px; }
.media{ display:flex; gap:6px; }
.media image{ width:80px; height:80px; border-radius:8px; }
.ft{ display:flex; gap:16px; font-size:13px; color:#6E6659; margin-top:8px; }
.ft .on{ color:#B03A2E; font-weight:700; }
.tags{ margin-top:8px; display:flex; flex-wrap:wrap; gap:6px; }
.tag{ font-size:12px; color:#7FA8A0; background:#EDF5F4; padding:2px 6px; border-radius:4px; }
.empty{text-align:center; padding:60px 0; color:#CCC; }
.fab{ position:fixed; bottom:100px; right:16px; background:#B03A2E; color:#FFF; padding:10px 16px; border-radius:30px; box-shadow:0 4px 12px rgba(176,58,46,.4); z-index:100; }
</style>
