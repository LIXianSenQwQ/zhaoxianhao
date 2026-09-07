<!--
  pkg-news/pages/news/favorites.vue — 收藏夹管理（蓝图 V2.0 §28 B.5）
  数据：listFavorites(groupId?,page) + favorite group actions(create/rename/remove/move)
-->
<template>
  <view class="fav-page">
    <!-- tabs -->
    <view class="tabs">
      <text :class="{active:tab==='my'}" @click="tab='my'">我的收藏</text>
      <text :class="{active:tab==='groups'}" @click="tab='groups'">分组管理</text>
    </view>
    <!-- 我的收藏 -->
    <view v-if="tab==='my'" class="my-col">
      <!-- 按组筛选 chips -->
      <scroll-view scroll-x class="group-chips" :scroll-with-animation="true">
        <text class="chip" :class="{active:gid===''}" @click="gid=''">全部</text>
        <text v-for="g of groups" :key="g.groupId" class="chip" :class="{active: gid===g.groupId}" @click="gid=g.groupId">{{ g.groupName }}</text>
      </scroll-view>
      <!-- 列表 -->
      <view v-if="loading" class="sk-list"><view v-for="i in 10" :key="i" class="sk-card"/></view>
      <template v-else>
        <view v-for="f of list" :key="f._id" class="card">
          <text class="title">{{ f.snapshot?.title || '文章标题缺失' }}</text>
          <text class="summary">{{ f.snapshot?.summary || '暂无摘要' }}</text>
          <view class="ft">
            <text class="source">{{ f.groupName || '未分组' }} · {{ fmtTime(f.createdAt) }}</text>
            <view class="actions">
              <text @click.stop="openUrl(f.snapshot?.url)">阅读原文</text>
              <text @click.stop="move(f.newsId)">移动</text>
              <text class="del-btn" @click.stop="remove(f.newsId)">删除</text>
            </view>
          </view>
        </view>
        <view v-if="!list.length" class="empty">暂无收藏内容</view>
        <view v-if="hasMore" class="load-more" @click="loadMore()">加载更多</view>
      </template>
    </view>
    <!-- 分组管理 -->
    <view v-if="tab==='groups'" class="groups-col">
      <button class="new-btn" size="mini" @click="showCreate=true">新建分组</button>
      <view v-for="g of groups" :key="g.groupId" class="g-item">
        <text>{{ g.groupName }}（{{ g.count }}）</text>
        <view class="g-actions">
          <text @click="rename(g)">重命名</text>
          <text @click="removeGroup(g.groupId)" class="del">删除</text>
        </view>
      </view>
    </view>
  </view>
  <!-- create dialog -->
  <view v-if="showCreate" class="mask" @click="showCreate=false">
    <view class="dialog" @click.stop>
      <input class="inp" v-model="newGname" placeholder="输入分组名（1-20 字）" maxlength="20"/>
      <view class="btns"><button @click="createNew()">确定</button><button class="sec" @click="showCreate=false">取消</button></view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { listFavoriteGroups, listFavorites, createFavoriteGroup, renameFavoriteGroup, removeFavoriteGroup, moveFavorite, addFavorite, removeFavorite } from '@/services/news';

const tab = ref('my');
const loading = ref(true);
const hasMore = ref(false);
const page = ref(1);
const pageSize = 50;
let gid = ref<string|''>('');
const list = ref<any[]>([]);
const groups = ref<any[]>([]);
const showCreate = ref(false);
const newGname = ref('');

onMounted(()=>{ loadGroups(); loadMyFavs(); });

async function loadMyFavs(){ loading.value=true; const r=await listFavorites(gid.value||null, page.value, pageSize); data=r.data?.favorites|| []; hasMore.value=(data.length===pageSize); }

async function loadMore(){ page.value++; await loadMyFavs(); }

async function loadGroups(){ const r=await listFavoriteGroups(); groups.value=(r.data?.groups|| []).map(g=> ({groupId:g.groupId, groupName:g.groupName, count:g.count}) ); }

async function createNew(){ if(!newGname.value.trim()) return uni.showToast({title:'请输入名称',icon:'none'}); await createFavoriteGroup(newGname.value); showCreate.value=false; newGname.value=''; await loadGroups(); }

async function rename(g:any){ const name=prompt?.()||g.groupName; /* 占位；实际可用自定义弹窗 */ if(name && name!==g.groupName){ await renameFavoriteGroup(g.groupId,name); await loadGroups(); } }

async function removeGroup(id:string){ if(confirm?.('确认删除该分组？（成员将回落未分组）')){ await removeFavoriteGroup(id); await loadGroups(); } }

async function remove(newsId:string){ await removeFavorite(newsId); list.value=list.value.filter(x=>x.newsId!==newsId); }

async function openUrl(url?:string){ if(!url) return uni.showToast({title:'无原文',icon:'none'}); uni.setClipboardData({text:url,success:()=>{uni.showToast({title:'已复制',icon:'none'})}}); }

function move(newsId:string){ const gIds=(groups.value.map((g,i)=>({id:g.groupId,name:g.groupName+'('+g.count+')','_index':i})) || []); /* 选择目标分组逻辑简化 */ alert('分组移动需 UI 选择组件，此处暂略'); }

function fmtTime(ts?:string){ if(!ts) return ''; const d=new Date(ts); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; }
</script>

<style lang="scss" scoped>
.fav-page{ min-height:100vh; background:#FAF8F2; padding:16px; box-sizing:border-box; }
.tabs{ display:flex; gap:24px; margin-bottom:16px; font-size:16px; }
.tabs .active{ font-weight:700; border-bottom:2px solid #B03A2E; padding-bottom:4px; }
.group-chips{ white-space:nowrap; padding:8px 0; margin-bottom:8px; }
.chip{ display:inline-block; padding:4px 10px; margin-right:8px; border-radius:16px; font-size:13px; border:1px solid #EAE4D6; background:#FFF; }
.chip.active{ background:#B03A2E; color:#FFF; border-color:#B03A2E; }
.sk-list{ display:flex; flex-direction:column; gap:8px; }
.sk-card{ height:80px; background:#FFF; border-radius:10px; }
.card{ background:#FFF; border-radius:12px; padding:12px; margin-bottom:12px; box-shadow:0 2px 12px rgba(38,34,30,.06);}
.title{ font-size:16px; font-weight:600; line-height:1.3; color:#2B2723; }
.summary{ font-size:14px; color:#6E6659; margin-top:6px; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
.ft{ display:flex; justify-content:space-between; align-items:center; margin-top:8px; font-size:12px; color:#999; }
.actions{ display:flex; gap:12px; }
.actions .del-btn{ color:#B03A2E; }
.empty{text-align:center; padding:60px 0; color:#CCC; }
.load-more{text-align:center; padding:16px; color:#6E6659; }
.groups-col .new-btn{ background:#B03A2E; color:#FFF; font-size:14px; padding:8px 16px; border-radius:6px; border:none; margin-bottom:12px; }
.g-item{ display:flex; justify-content:space-between; align-items:center; background:#FFF; padding:12px; border-radius:12px; margin-bottom:8px; }
.g-actions{ display:flex; gap:12px; }
.g-actions .del{ color:#B03A2E; }
.mask{ position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,.4); z-index:999; display:flex; align-items:center; justify-content:center; }
.dialog{ background:#FFF; border-radius:12px; padding:16px; width:80%; max-width:300px; }
.inp{ width:100%; padding:8px; border:1px solid #EAE4D6; border-radius:6px; font-size:14px; margin-bottom:12px; }
.btns{ display:flex; justify-content:space-between; }
.btns button{ padding:8px 20px; border-radius:6px; border:none; background:#B03A2E; color:#FFF; }
.btns .sec{ background:#EEE; }
</style>
