<!--
  pkg-moment/pages/moment/detail.vue — 动态详情（蓝图 V2.0 §29 C.4）
  数据：plaza.detail(momentId) → { moment, comments[], likedByMe }
-->
<template>
  <view class="detail-page">
    <!-- 骨架屏 -->
    <view v-if="loading" class="sk-card"></view>
    <template v-else>
      <view class="hd"><text>{{ item?.authorName || '族人' }}</text><text class="time">{{ fmtTime(item?.publishAt) }}</text></view>
      <text class="ct">{{ item?.content || '' }}</text>
      <view v-if="item?.mediaIds && item.mediaIds.length" class="media">
        <image v-for="url of item.mediaIds" :key="url" :src="url" mode="aspectFill"/>
      </view>
      <view v-if="item?.topicTags && item.topicTags.length" class="tags">
        <text v-for="tg of item.topicTags" :key="tg" class="tag">#{{ tg }}</text>
      </view>
      <view class="ft">
        <text :class="{on:liked}" @click="doLike()">赞 {{ item?.stats?.like||0 }}</text>
        <text>分享</text>
      </view>
      <!-- 评论 -->
      <view class="comments">
        <text class="hd">评论 ({{ comments.length }})</text>
        <view v-for="c of comments" :key="c._id" class="c-item">
          <text class="user">{{ c.userName || '族人' }}</text><text class="text">{{ c.content }}</text>
          <text class="time">{{ fmtTime(c.createdAt) }}</text>
        </view>
      </view>
      <!-- 输入框 -->
      <view class="input-row">
        <input class="inpt" v-model="commentText" placeholder="友善评论…" maxlength="5000"/>
        <button class="send-btn" size="mini" @click="postComment()">发送</button>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { getMomentDetail, likeMoment, commentMoment } from '@/services/moment';

let route = getCurrentPage();
const id = decodeURIComponent(route.options.id || '');
const loading = ref(true);
const item = ref<any>(null);
const comments = ref<any[]>([]);
const liked = ref(false);
let commentText = ref('');

onMounted(async ()=>{ await load(); });

async function load(){ loading.value=true; const r=await getMomentDetail(id); item.value=r.data?.moment|| null; comments.value=(r.data?.comments|| []); liked.value=r.data?.likedByMe|| false; loading.value=false; }

async function doLike(){ if(liked.value) return uni.showToast({title:'已赞过',icon:'none'}); await likeMoment(id); liked.value=true; /* 重新加载以同步后端计数 */ setTimeout(()=>load(),800); }

async function postComment(){ if(!commentText.value.trim()) return uni.showToast({title:'请输入内容',icon:'none'}); const r=await commentMoment(id,commentText.value); if(r.error){ uni.showToast({title:'发送失败',icon:'none'}); return; } commentText.value=''; await load(); }

function fmtTime(ts?:string){ if(!ts) return ''; const d=new Date(ts); return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }
</script>

<style lang="scss" scoped>
.detail-page{ min-height:100vh; background:#FAF8F2; padding:16px; box-sizing:border-box; font-family:system-ui,sans-serif; }
.sk-card{ height:160px; background:#FFF; border-radius:12px; animation:fade .5s; margin-bottom:12px; }
@keyframes fade { from{opacity:.4} to{opacity:1} }
.hd{ display:flex; justify-content:space-between; font-size:12px; color:#999; margin-bottom:6px; }
.ct{ font-size:14px; line-height:1.5; color:#333; display:block; margin-bottom:8px; }
.media{ display:flex; gap:6px; flex-wrap:wrap; margin-bottom:8px; }
.media image{ width:80px; height:80px; border-radius:8px; object-fit:cover; }
.tags{ margin-bottom:8px; display:flex; flex-wrap:wrap; gap:6px; }
.tag{ font-size:12px; color:#7FA8A0; background:#EDF5F4; padding:2px 6px; border-radius:4px; }
.ft{ display:flex; gap:16px; font-size:13px; color:#6E6659; margin-bottom:12px; }
.ft .on{ color:#B03A2E; font-weight:700; }
.comments .hd{ font-size:14px; color:#333; margin-bottom:8px; display:block; }
.c-item{ background:#FFF; padding:10px; border-radius:12px; margin-bottom:8px; }
.c-item .user{ font-size:12px; color:#6E6659; }
.c-item .text{ font-size:14px; color:#333; display:block; margin-top:4px; }
.c-item .time{ font-size:11px; color:#999; display:block; margin-top:4px; }
.input-row{ position:sticky; bottom:0; background:#FAF8F2; padding:12px; display:flex; gap:8px; box-shadow:0 -2px 12px rgba(0,0,0,.04); }
.inpt{ flex:1; border:1px solid #EAE4D6; border-radius:6px; padding:8px; font-size:14px; }
.send-btn{ background:#B03A2E; color:#FFF; font-size:12px; padding:8px 16px; border:none; border-radius:6px; }
</style>
