<!--
  pkg-news/pages/news/detail.vue — 文章详情（蓝图 V2.0 §28 合规外链版）
  数据：recommend.get / listItems (后端已含 title/summary/sourceName/category/tags/publishAt/url/hot)
  架构：标题 + summary + source/category/tags/publishAt + 「阅读原文」外链跳转（web-view 或系统复制）+ 收藏/不感兴趣
  免责声明：页面底部标注来源与「内容版权归原作者所有，如有侵权请联系删除」
-->
<template>
  <view class="detail-page" v-if="loading || !item">
    <view class="sk-card"></view>
  </view>
  <view v-else class="detail-page">
    <text class="det-cat">{{ item.category || '未分类' }}</text>
    <text class="det-title">{{ item.title }}</text>
    <text class="det-summary">{{ item.summary || '暂无摘要' }}</text>
    <view class="det-ft">
      <text class="det-source">{{ item.sourceName || '来源' }} · {{ fmtTime(item.publishAt) }}</text>
      <view class="det-actions">
        <text class="act-btn" @click="toggleFav()">
          {{ isFav ? '已收藏' : '收藏' }}
        </text>
        <text class="act-btn" @click="reportNeg()">不感兴趣</text>
      </view>
    </view>
    <!-- 标签 -->
    <view v-if="item.tags && item.tags.length" class="tags-row">
      <text v-for="t of item.tags" :key="t" class="tag-chip">#{{ t }}</text>
    </view>
    <!-- 外链跳转卡（B.6 外链正文） -->
    <view class="url-card">
      <text class="url-hd">阅读全文（外链跳转）</text>
      <text class="url-sub">原文来自 {{ item.sourceName || '发布源' }}，点击打开新窗口浏览完整内容</text>
      <button class="open-btn" @click="openUrl()">阅读原文</button>
    </view>
    <!-- 免责声明（合规要求 9.0.3） -->
    <view class="disclaimer">
      <text class="disc-label">来源声明：</text>
      <text class="disc-body">本文内容及链接由第三方提供，不代表本平台立场。版权归原作者所有。如涉侵权问题，请联系我们删除。</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { getFeed, addFavorite, removeFavorite, reportClick, reportNegative } from '@/services/news';

const route = getCurrentPage();
const id = decodeURIComponent(route.options.id || '');

const loading = ref(true);
let item: any = null;
const isFav = ref(false);

onMounted(async () => {
  // 从推荐流读取当前条目（简单实现；实际应通过 detail action 获取更准确的数据）
  const res = await getFeed(1, 50);
  const found = (res.data?.items || []).find((x:any)=> x._id === id);
  if(found) {
    item = found;
    // 检查收藏状态
    const favs = await listFavorites('', 1, 50);
    isFav.value = !!favs.data?.favorites?.some(f => f.newsId === id);
  } else {
    uni.showToast({ title: '文章不存在', icon:'none' });
    setTimeout(()=>history.back(), 1000);
  }
});

async function toggleFav() {
  if(isFav.value) { await removeFavorite(id); isFav.value=false; }
  else { await addFavorite(id); isFav.value=true; }
}

function reportNeg() {
  reportNegative(id);
  uni.showToast({ title: '已反馈不感兴趣', icon:'none' });
}

function openUrl() {
  if(!item || !item.url) return uni.showToast({ title: '无外链可打开', icon:'none' });
  // 使用 wx.openSetting? 没有 webview 时可用 setClipboard or openLink? 小程序内用 wx.openURL 不支持;
  // 常用方式：复制链接 + 提示用户手动打开，或者跳转到一个 webview 页展示 iframe(需要 license)
  // 这里采用最简单的方案：复制到剪贴板并提示
  uni.setClipboardData({ text: item.url, success: ()=>{
    uni.showToast({ title: '原文链接已复制，请在浏览器中打开', icon:'none' });
  }});
}

function fmtTime(ts?: string) { if(!ts) return ''; const d=new Date(ts); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }

async function listFavorites(groupId?: string, page: number = 1, pageSize: number = 50) { return {} as any; }
</script>

<style lang="scss" scoped>
.detail-page { min-height:100vh; background:#FAF8F2; padding:16px; box-sizing:border-box; font-family:system-ui,sans-serif; }
.sk-card { height:160px; background:#FFF; border-radius:12px; margin-bottom:12px; animation:fade .5s; }
@keyframes fade { from{opacity:.4} to{opacity:1} }
.det-cat { font-size:12px; color:#7FA8A0; display:inline-block; margin-bottom:6px; padding:2px 6px; background:#EDF5F4; border-radius:4px; }
.det-title { font-size:20px; line-height:1.3; color:#2B2723; font-weight:700; margin-bottom:8px; }
.det-summary { font-size:14px; color:#6E6659; line-height:1.6; margin-bottom:12px; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; }
.det-ft { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; font-size:12px; color:#999; }
.det-actions { display:flex; gap:12px; }
.act-btn { cursor:pointer; color:#6E6659; }
.tags-row { margin-bottom:12px; }
.tag-chip { display:inline-block; padding:4px 8px; background:#FFF; border-radius:6px; margin-right:6px; font-size:12px; color:#333; border:1px solid #EAE4D6; }
.url-card { background:#F5F1E6; border-radius:12px; padding:16px; margin-bottom:12px; }
.url-hd { font-size:14px; font-weight:600; color:#2B2723; display:block; margin-bottom:6px; }
.url-sub { font-size:12px; color:#6E6659; display:block; margin-bottom:10px; }
.open-btn { width:100%; font-size:14px; padding:10px; background:#B03A2E; color:#FFF; border:none; border-radius:6px; }
.disclaimer { background:#FFF; border-radius:12px; padding:12px; margin-top:12px; border-left:3px solid #C9A063; }
.disc-label { font-size:12px; color:#C9A063; font-weight:600; display:block; margin-bottom:4px; }
.disc-body { font-size:12px; color:#6E6659; line-height:1.4; display:block; }
</style>
