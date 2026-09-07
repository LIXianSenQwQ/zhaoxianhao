<!--
  pkg-news/pages/news/category.vue — 分类浏览（蓝图 V2.0 §28 B.2）
  数据：listByCategory(category,page,pageSize)
  架构：标题 + 分类名展示 + 列表分页上拉加载 + 空态
-->
<template>
  <view class="cat-page">
    <view class="hd">{title}}</view>
    <!-- 骨架屏 -->
    <view v-if="loading && items.length === 0" class="sk-list">
      <view v-for="i in 10" :key="i" class="sk-card" />
    </view>
    <!-- 列表 -->
    <template v-else>
      <view v-for="item of items" :key="item._id" class="news-card" @click="goDetail(item._id)">
        <text class="news-cat">{{ item.category }}</text>
        <text class="news-title">{{ item.title }}</text>
        <text class="news-summary">{{ item.summary || '暂无摘要' }}</text>
        <view class="news-ft">
          <text class="news-source">{{ item.sourceName || '来源' }} · {{ fmtTime(item.publishAt) }}</text>
          <button class="fav-btn" @click.stop="toggleFav(item)" size="small">
            {{ isFav[item._id] ? '已收藏' : '收藏' }}
          </button>
        </view>
      </view>
      <!-- 空态 -->
      <view v-if="!items.length" class="empty">暂无内容</view>
      <view v-if="hasMore && !loadingEnd" class="load-more" @click="loadMore()">加载更多</view>
      <view v-if="loadingEnd" class="no-more">没有更多了</view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { listByCategory, addFavorite, removeFavorite, reportClick } from '@/services/news';
import { listFavorites } from '@/services/news';

const route = getCurrentPage();
let queryCat: string;

const title = ref('');
const loading = ref(true);
const loadingEnd = ref(false);
const hasMore = ref(false);
const items = ref<any[]>([]);
const page = ref(1);
const pageSize = 20;
const isFav: Record<string, boolean> = {};

onLoad((options) => {
  queryCat = decodeURIComponent(options.cat || '');
  const map: Record<string,string> = {
    '时政要闻':'时政要闻', '财经商业':'财经商业', '科技数码':'科技数码', '文化艺术':'文化艺术',
    '娱乐体育':'娱乐体育', '健康生活':'健康生活', '教育升学':'教育升学', '三农乡土':'三农乡土',
    '法治社会':'法治社会', '家族专区':'家族专区'
  };
  title.value = map[queryCat] || queryCat;
});

(async function init() {
  const favs = await listFavorites('', 1, 50);
  (favs.data?.favorites || []).forEach(f => isFav[f.newsId] = true);
})();

async function load() {
  if(!queryCat) return;
  const res = await listByCategory(queryCat, page.value, pageSize);
  data = res.data?.items || [];
  hasMore.value = data.length === pageSize;
}

async function toggleFav(it: any) {
  if(isFav[it._id]) { await removeFavorite(it._id); delete isFav[it._id]; }
  else { await addFavorite(it._id); isFav[it._id]=true; }
}

function goDetail(id: string) { reportClick(id); uni.navigateTo({ url: `/pkg-news/pages/news/detail?id=${encodeURIComponent(id)}` }); }
function fmtTime(ts?: string) { if(!ts) return ''; const d=new Date(ts); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
</script>

<style lang="scss" scoped>
.cat-page { min-height:100vh; background:#FAF8F2; padding:16px; box-sizing:border-box; }
.hd { font-size:20px; font-weight:700; margin-bottom:16px; color:#2B2723; }
.sk-list { display:flex; flex-direction:column; gap:12px; }
.sk-card { height:96px; background:#FFF; border-radius:12px; }
.news-card { background:#FFF; border-radius:12px; padding:12px; margin-bottom:12px; box-shadow:0 2px 12px rgba(38,34,30,.06); }
.news-cat { font-size:12px; color:#7FA8A0; display:inline-block; margin-bottom:6px; padding:2px 6px; background:#EDF5F4; border-radius:4px; }
.news-title { font-size:16px; font-weight:600; line-height:1.4; color:#2B2723; }
.news-summary { font-size:14px; color:#6E6659; margin-top:6px; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
.news-ft { display:flex; justify-content:space-between; align-items:center; margin-top:8px; font-size:12px; color:#999; }
.fav-btn { font-size:12px; padding:4px 8px; border-radius:6px; border:1px solid #EAE4D6; background:#FFF; color:#333; }
.empty { text-align:center; padding:60px 0; color:#CCC; }
.load-more { text-align:center; padding:16px; color:#6E6659; }
.no-more { text-align:center; padding:16px; color:#CCC; }
</style>
