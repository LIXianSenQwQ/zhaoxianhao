<!--
  pkg-news/pages/news/index.vue — 新闻资讯首页（蓝图 V2.0 §28 模块二）
  数据源：推荐流 recommend.get（F4 三路召回）默认；分类 Tab 使用 listByCategory
  架构：
    · 顶部家族专区置顶卡 → 跳转 /pkg-moment/pages/moment/index（自有内容入口）
    · 分类横滑 chips (NEWS_CATEGORIES)
    · 推荐/最新双 Tab（推荐流 default，最新用 listItems）
    · 每条目：title/summary/sourceName/publishAt/url + 收藏/不感兴趣按钮
    · 点击 → reportClick + 跳详情
-->
<template>
  <view class="news-page">
    <!-- 骨架屏 -->
    <view v-if="loading" class="sk-list">
      <view v-for="i in 10" :key="i" class="sk-card" />
    </view>
    <!-- 列表 -->
    <template v-else>
      <!-- 家族专区卡 -->
      <view class="family-card" @click="$router.push('/pkg-moment/pages/moment/index')">
        <text class="family-icon">族徽</text>
        <view class="family-body">
          <text class="family-title">家族专区</text>
          <text class="family-sub">郝氏动态 | 族务公告 | 红白事 | 节庆</text>
        </view>
        <text class="arrow">›</text>
      </view>
      <!-- 分类 Tabs -->
      <view class="cat-tabs">
        <scroll-view scroll-x class="cat-scroll" :scroll-with-animation="true">
          <view class="cat-chip" :class="{ active: currentCat === '' }" @click="setCat('')">全部</view>
          <view
            v-for="cat of NEWS_CATEGORIES"
            :key="cat"
            class="cat-chip"
            :class="{ active: currentCat === cat }"
            @click="setCat(cat)">{{ cat }}</view>
        </scroll-view>
      </view>
      <!-- TabBar 切换 -->
      <view class="tab-bar">
        <view class="tab-btn" :class="{ active: tab === 'feed' }" @click="tab='feed'">推荐</view>
        <view class="tab-btn" :class="{ active: tab === 'latest' }" @click="tab='latest'">最新</view>
      </view>
      <!-- 空态兜底 -->
      <view v-if="!items.length" class="empty-state">
        <text class="empty-txt">暂无资讯</text>
      </view>
      <!-- 列表 -->
      <view v-for="item of items" :key="item._id" class="news-card" @click="goDetail(item._id)">
        <text class="news-cat">{{ item.category || '未分类' }}</text>
        <text class="news-title">{{ item.title }}</text>
        <text class="news-summary">{{ item.summary || '暂无摘要' }}</text>
        <view class="news-ft">
          <text class="news-source">{{ item.sourceName || '来源' }} · {{ fmtTime(item.publishAt) }}</text>
          <view class="news-actions">
            <text class="act-btn" @click.stop="doLike(item)">赞 {{ item.hot || 0 }}</text>
            <text class="act-btn" @click.stop="toggleFav(item)">
              {{ isFav[item._id] ? '已收藏' : '收藏' }}
            </text>
            <text class="act-btn" @click.stop="reportNeg(item)">不感兴趣</text>
          </view>
        </view>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { getFeed, listLatest, listByCategory, addFavorite, removeFavorite, reportClick, reportNegative } from '@/services/news';
import { NEWS_CATEGORIES as ALL_CATEGORIES } from '@/services/news';
import { filterCategories } from '@/utils/minor-mode.js';
import { useUserStore } from '@/stores/user';

const store = useUserStore();
const NEWS_CATEGORIES = computed(() => filterCategories(ALL_CATEGORIES, store.childMode));

const currentCat = ref('');
const tab = ref('feed');
const loading = ref(true);
const items = ref<any[]>([]);
const isFav: Record<string, boolean> = {};

let timer: any;

// 定时刷新 hot 计数（B.3 行为回流）
onMounted(() => { load(); });
onUnmounted(() => { if(timer) clearInterval(timer); });

async function load() {
  loading.value = true;
  const params = { page: 1, pageSize: 20 };
  let res;
  if(tab.value === 'feed') {
    res = await getFeed(1, 20);
    items.value = (res.data && res.data.items) || [];
  } else {
    // latest：根据是否选择了分类
    if(currentCat.value) res = await listByCategory(currentCat.value, 1, 20);
    else res = await listLatest(1, 20);
    items.value = (res.data && res.data.items) || [];
  }
  // 标记收藏状态
  const favs = (await getMyFavorites()); data = favs.favorites || []; favs.forEach(f=> isFav[f.newsId]=true);
}

async function setCat(c: string) {
  currentCat.value = c;
  items.value = [];
  await load();
}

function goDetail(id: string) {
  reportClick(id);
  uni.navigateTo({ url: `/pkg-news/pages/news/detail?id=${encodeURIComponent(id)}` });
}

function doLike(it: any) { /* 后端 hot 累加由 recommend.click/cron 做；仅 UI */ }
function toggleFav(it: any) {
  const fid = it._id;
  if(isFav[fid]) { removeFavorite(fid); delete isFav[fid]; }
  else { addFavorite(fid); isFav[fid]=true; }
}

function reportNeg(it: any) {
  reportNegative(it._id);
  items.value = items.value.filter(x=>x._id !== it._id);
}

async function getMyFavorites() {
  return await listFavorites('', 1, 50);
}

function fmtTime(ts?: string) {
  if(!ts) return '';
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
</script>

<style lang="scss" scoped>
.news-page { min-height: 100vh; background: #FAF8F2; padding: 0 16px 32px; box-sizing: border-box; }
.sk-list { padding-top: 32px; display:flex; flex-direction:column; gap:12px; }
.sk-card { height:96px; background:#FFF; border-radius:12px; }
.family-card { display:flex; align-items:center; padding:12px 16px; margin-bottom:12px; background:#F5F1E6; border-radius:12px; }
.family-icon { font-size:20px; color:#C9A063; font-weight:700; }
.family-body { flex:1; margin-left:8px; }
.family-title { font-size:16px; font-weight:600; color:#2B2723; }
.family-sub { font-size:12px; color:#6E6659; }
.arrow { font-size:20px; color:#999; }
.cat-tabs { position:sticky; top:0; z-index:10; background:#FAF8F2; padding:12px 0; }
.cat-scroll { white-space:nowrap; }
.cat-chip { display:inline-block; padding:6px 12px; background:#FFF; border-radius:16px; margin-right:8px; font-size:14px; border:1px solid #EAE4D6; color:#333; }
.cat-chip.active { background:#B03A2E; color:#FFF; border-color:#B03A2E; }
.tab-bar { display:flex; gap:24px; border-bottom:1px solid #EAE4D6; margin-bottom:12px; }
.tab-btn { padding-bottom:4px; font-size:16px; color:#333; cursor:pointer; }
.tab-btn.active { font-weight:600; border-bottom:2px solid #B03A2E; }
.news-card { background:#FFF; border-radius:12px; padding:12px; margin-bottom:12px; box-shadow:0 2px 12px rgba(38,34,30,.06); }
.news-cat { font-size:12px; color:#7FA8A0; display:inline-block; margin-bottom:6px; padding:2px 6px; background:#EDF5F4; border-radius:4px; }
.news-title { font-size:16px; font-weight:600; line-height:1.4; color:#2B2723; }
.news-summary { font-size:14px; color:#6E6659; margin-top:6px; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; }
.news-ft { display:flex; justify-content:space-between; align-items:center; margin-top:8px; font-size:12px; color:#999; }
.news-actions { display:flex; gap:12px; }
.act-btn { cursor:pointer; color:#6E6659; }
.empty-state { text-align:center; padding:60px 0; }
.empty-txt { color:#CCC; font-size:14px; }
</style>
