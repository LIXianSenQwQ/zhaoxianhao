<template>
  <view class="content-page">
    <!-- 顶部导航 -->
    <view class="page-header">
      <text class="page-title">我的内容库</text>
      <text class="page-subtitle">本地记忆 · 家族传承</text>
    </view>

    <!-- 分类快捷区（3 级结构主分类横滑） -->
    <scroll-view scroll-x class="main-cats" v-if="mainCategories.length">
      <view 
        v-for="cat in mainCategories" 
        :key="cat._id" 
        class="cat-chip"
        :class="{ active: activeMain === cat.name }"
        @click="selectMain(cat)"
      >
        <text>{{ cat.name }}</text>
      </view>
    </scroll-view>

    <!-- 工具操作条 -->
    <view class="toolbar">
      <view class="toolbar-left">
        <view class="tool-item" @click="showUploadMenu">
          <text class="tool-icon">＋</text>
          <text>上传</text>
        </view>
        <view class="tool-item" @click="goCategory">
          <text class="tool-icon">📁</text>
          <text>分类</text>
        </view>
        <view class="tool-item" @click="goSearch">
          <text class="tool-icon">🔍</text>
          <text>搜索</text>
        </view>
      </view>
      <view class="toolbar-right">
        <view class="tool-item" @click="goBackup">
          <text class="tool-icon">💾</text>
          <text>备份</text>
        </view>
        <view class="grid-btn" @click="toggleView">{{ isGrid ? '☷' : '☰' }}</view>
      </view>
    </view>

    <!-- 骨架屏 -->
    <view v-if="loading && !contents.length" class="skeleton-wrap">
      <view class="sk-item"><view class="sk-block w70"></view><view class="sk-block w40"></view></view>
      <view class="sk-item"><view class="sk-block w60"></view><view class="sk-block w50"></view></view>
      <view class="sk-item"><view class="sk-block w80"></view><view class="sk-block w30"></view></view>
    </view>

    <!-- 内容网格 / 列表 -->
    <view v-else-if="contents.length" :class="isGrid ? 'content-grid' : 'content-list'">
      <view 
        v-for="item in contents" 
        :key="item._id"
        class="content-item"
        @click="openDetail(item)"
      >
        <view class="item-media" v-if="item.type === 'photo' && item.thumbUrl">
          <image :src="item.thumbUrl" mode="aspectFill" lazy-load class="thumb-img" />
        </view>
        <view class="item-body">
          <text class="item-title">{{ item.title }}</text>
          <text class="item-sub">{{ categoryLabel(item) }}</text>
          <view class="item-meta">
            <text class="item-date">{{ formatDate(item.updatedAt) }}</text>
            <text class="item-visibility">{{ visLabel(item.visibility) }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 空态 -->
    <view v-else class="empty-state">
      <text class="empty-icon">📚</text>
      <text class="empty-text">还没有内容，点「＋上传」记录家族记忆</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import * as contentSvc from '@/services/content';

const contents = ref<any[]>([]);
const categories = ref<any[]>([]);
const activeMain = ref('');
const isGrid = ref(true);
const loading = ref(false);

// 主分类（仅 level=1）
const mainCategories = computed(() => categories.value.filter(c => c.type === 'MAIN'));

function selectMain(cat: any) {
  activeMain.value = cat.name;
  load(cat.name);
}

function categoryLabel(item: any) {
  return [item.mainCategory, item.subCategory].filter(Boolean).join(' / ') || '未分类';
}

function visLabel(v: string) {
  const map: Record<string, string> = { PRIVATE: '仅自己', GROUP: '指定可见', PUBLIC: '公开' };
  return map[v] || v;
}

function formatDate(d: any) {
  if (!d) return '';
  const date = new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

async function load(mainCategory = '') {
  loading.value = true;
  const res = await contentSvc.searchContent({ mainCategory, pageSize: 50 });
  contents.value = (res.data?.contents) || [];
  loading.value = false;
}

async function loadCats() {
  const res = await contentSvc.listCategories();
  categories.value = res.data?.categories || [];
}

function toggleView() { isGrid.value = !isGrid.value; }

function showUploadMenu() {
  uni.showActionSheet({
    itemList: ['照片 / 视频', '文章 / 记录'],
    success: (r) => {
      if (r.tapIndex === 0) uni.navigateTo({ url: '/pkg-content/pages/content/upload?type=media' });
      else uni.navigateTo({ url: '/pkg-content/pages/content/upload?type=article' });
    }
  });
}

function goCategory() { uni.navigateTo({ url: '/pkg-content/pages/content/category' }); }
function goSearch() { uni.navigateTo({ url: '/pkg-content/pages/content/search' }); }
function goBackup() { uni.navigateTo({ url: '/pkg-content/pages/content/backup' }); }
function openDetail(item: any) { uni.navigateTo({ url: `/pkg-content/pages/content/detail?id=${item._id}` }); }

onMounted(() => { loadCats(); load(); });
</script>

<style scoped lang="scss">
.content-page {
  min-height: 100vh;
  background: var(--home-bg);
  padding: 0 16px;
}

.page-header {
  padding: 24px 0 12px;
  
  .page-title { font-size: 24px; font-weight: bold; color: var(--home-text); }
  .page-subtitle { font-size: 13px; color: var(--home-text-2); margin-top: 2px; }
}

.main-cats {
  white-space: nowrap;
  padding: 8px 0;
  
  .cat-chip {
    display: inline-block;
    padding: 6px 16px;
    margin-right: 8px;
    background: var(--home-card);
    border-radius: 20px;
    font-size: 14px;
    color: var(--home-text-2);
    box-shadow: 0 1px 4px rgba(0,0,0,0.04);
    
    &.active {
      background: linear-gradient(135deg, #D4B06A, #C9A063);
      color: white;
      font-weight: bold;
    }
  }
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  
  .toolbar-left {
    display: flex;
    gap: 16px;
  }
  
  .tool-item {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
    color: var(--home-text-2);
    
    .tool-icon { font-size: 18px; }
  }
  
  .grid-btn { font-size: 22px; color: var(--home-text-2); padding: 0 4px; }
}

.content-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding-bottom: 40px;
  
  .content-item {
    background: var(--home-card);
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 1px 6px rgba(0,0,0,0.04);
    
    .item-media { width: 100%; height: 120px; }
    .thumb-img { width: 100%; height: 100%; }
    
    .item-body { padding: 10px; }
    .item-title { font-size: 14px; font-weight: bold; display: block; }
    .item-sub { font-size: 12px; color: var(--home-text-2); margin-top: 2px; display: block; }
    .item-meta { display: flex; justify-content: space-between; margin-top: 6px; }
    .item-date, .item-visibility { font-size: 10px; color: var(--home-text-2); }
  }
}

.content-list {
  .content-item {
    background: var(--home-card);
    border-radius: 12px;
    padding: 14px;
    margin-bottom: 10px;
    box-shadow: 0 1px 6px rgba(0,0,0,0.04);
  }
}

.empty-state {
  text-align: center;
  margin-top: 80px;
  
  .empty-icon { font-size: 48px; }
  .empty-text { display: block; margin-top: 12px; color: var(--home-text-2); }
}

/* 骨架屏 */
.skeleton-wrap {
  padding-bottom: 60px;
  
  .sk-item {
    background: var(--home-card);
    border-radius: 12px;
    padding: 12px;
    margin-bottom: 10px;
    
    .sk-block {
      background: linear-gradient(90deg, #EAE4D6 8%, #F7F4EC 18%, #EAE4D6 32%);
      border-radius: 6px;
      height: 12px;
      animation: shimmer 1.5s infinite;
      
      &.w70 { width: 70%; }
      &.w60 { width: 60%; }
      &.w80 { width: 80%; }
      &.w50 { width: 50%; }
      &.w40 { width: 40%; }
      &.w30 { width: 30%; }
    }
  }
}

@keyframes shimmer {
  0% { opacity: 0.6; }
  50% { opacity: 1; }
  100% { opacity: 0.6; }
}
</style>