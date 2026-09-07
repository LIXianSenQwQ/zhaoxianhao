<!--
  pkg-news/pages/news/search.vue — 资讯搜索（蓝图 V2.0 §28 B.5 收藏与离线）
  数据：searchItems(keyword,page)
  交互：搜索历史本地缓存、热门词推荐、上拉加载分页
-->
<template>
  <view class="search-page">
    <!-- 搜索框 -->
    <view class="search-box">
      <input class="inpt" v-model="keyword" placeholder="搜索标题或摘要..." @confirm="doSearch()" />
      <button class="search-btn" size="mini" @click="doSearch()">搜索</button>
    </view>
    <!-- 历史记录 -->
    <view v-if="!hasResult && !loading" class="histories">
      <text class="hd">搜索历史</text>
      <view class="hist-tags">
        <text v-for="(h,i) of histories" :key="i" class="hist-tag" @click="useHist(h)">
          {{ h }} <icon name="close" size="12" @click.stop="rmHist(i)" />
        </text>
        <text class="clear-all" @click="clearHist()">清空</text>
      </view>
    </view>
    <!-- 热点（无结果时显示） -->
    <view v-if="!hasResult && !loading" class="hot">
      <text class="hd">热门推荐</text>
      <view class="hot-tags">
        <text v-for="t of ['三农','文化','科技','医疗','教育']" :key="t" class="hot-tag" @click="useHist(t)">#{{ t }}</text>
      </view>
    </view>
    <!-- 列表 -->
    <view v-if="hasResult" class="res-list">
      <view v-for="it of items" :key="it._id" class="res-card" @click="goDetail(it._id)">
        <text class="res-cat">{{ it.category || '未分类' }}</text>
        <text class="res-title">{{ it.title }}</text>
        <text class="res-summary">{{ it.summary || '' }}</text>
        <view class="res-ft"><text>{{ it.sourceName || '来源' }} · {{ fmtTime(it.publishAt) }}</text></view>
      </view>
      <view v-if="hasMore" class="load-more" @click="loadMore()">加载更多</view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { searchNews, reportClick } from '@/services/news';

const STORAGE_KEY = 'hcs:cache:news:searchHistory';

let keyword = ref('');
const loading = ref(false);
const hasResult = ref(false);
const hasMore = ref(false);
const items = ref<any[]>([]);
const page = ref(1);
const pageSize = 20;
const histories = ref<string[]>(uni.getStorageSync(STORAGE_KEY) || []);

async function doSearch() {
  if(!keyword.value.trim()) return uni.showToast({ title:'请输入关键词', icon:'none' });
  loading.value=true; hasResult.value=false; hasMore.value=false; items.value=[]; page.value=1;
  await load();
  // 追加记录
  const hs = histories.value.filter(h => h !== keyword.value.trim());
  hs.unshift(keyword.value.trim().trim()); if(hs.length>10) hs.pop();
  histories.value=hs; uni.setStorageSync(STORAGE_KEY, hs);
}

async function load() {
  const res = await searchNews(keyword.value.trim(), page.value);
  data=res.data?.items|| []; hasMore.value=(data.length === pageSize);
}

function useHist(t:string) { keyword.value=t; doSearch(); }
function rmHist(i:number) { histories.value.splice(i,1); uni.setStorageSync(STORAGE_KEY,histories.value); }
function clearHist() { histories.value=[]; uni.setStorageSync(STORAGE_KEY,[]); }
function goDetail(id:string) { reportClick(id); uni.navigateTo({ url:`/pkg-news/pages/news/detail?id=${encodeURIComponent(id)}` }); }
function fmtTime(ts?:string){ if(!ts)return ''; const d=new Date(ts); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
async function loadMore(){ page.value++; await load(); }
</script>

<style lang="scss" scoped>
.search-page{ min-height:100vh; background:#FAF8F2; padding:16px; box-sizing:border-box; }
.search-box{ display:flex; gap:8px; margin-bottom:16px; }
.inpt{ flex:1; border-radius:6px; border:1px solid #EAE4D6; padding:8px 12px; font-size:14px; background:#FFF;}
.search-btn{ background:#B03A2E; color:#FFF; border:none; border-radius:6px; font-size:14px; padding:0 16px; }
.histories, .hot{ margin-bottom:16px; }
.hd{ font-size:14px; color:#999; margin-bottom:8px; display:block; }
.hist-tags{ display:flex; flex-wrap:wrap; gap:8px; }
.hist-tag{ padding:6px 10px; background:#FFF; border-radius:16px; font-size:13px; display:flex; align-items:center; gap:4px; box-shadow:0 1px 4px rgba(38,34,30,.04);}
.clear-all{ font-size:12px; color:#6E6659; cursor:pointer; margin-left:4px; }
.hot-tags{ display:flex; flex-wrap:wrap; gap:8px; }
.hot-tag{ padding:6px 10px; background:#F5F1E6; border-radius:16px; font-size:13px; color:#2B2723; }
.res-list{ display:flex; flex-direction:column; gap:12px; }
.res-card{ background:#FFF; border-radius:12px; padding:12px; box-shadow:0 2px 12px rgba(38,34,30,.06); }
.res-cat{ font-size:12px; color:#7FA8A0; display:inline-block; margin-bottom:6px; padding:2px 6px; background:#EDF5F4; border-radius:4px; }
.res-title{ font-size:16px; font-weight:600; line-height:1.4; color:#2B2723; }
.res-summary{ font-size:14px; color:#6E6659; margin-top:6px; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
.res-ft{ font-size:12px; color:#999; margin-top:8px; }
.load-more{ text-align:center; padding:16px; color:#6E6659; }
</style>
