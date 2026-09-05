<!-- pages/search/search.vue – 全局搜索接入 doc.search OCR（Sprint R6） -->
<template>
  <view class="search-page">
    <!-- 搜索栏 -->
    <view class="search-bar">
      <image class="icon" src="/static/search.png" mode="aspectFit" />
      <input class="input" type="text" placeholder="文档关键词/谱库检索词" v-model="query" @confirm="doSearch" @input="onInput" />
      <Button class="btn-clear" v-if="query" size="mini" @click="clearQuery">清除</Button>
    </view>

    <!-- 加载骨架 -->
    <Skeleton v-if="loading" :rows="8" />

    <!-- 空态 -->
    <EmptyState v-else-if="!error && !hits.length" desc="暂无搜索结果" />

    <!-- 错误兜底 -->
    <ErrorPage v-else-if="error" :message="error" @retry="doSearch" />

    <!-- 结果列表 -->
    <scroll-view scroll-y v-else class="results-scroll">
      <BaseCard v-for="d in hits" :key="d._id + '_k'" hover-class="card-hover">
        <view class="row">
          <image class="type-icon" :src="getTypeIcon(d.type)" mode="aspectFit" />
          <view class="info">
            <text class="title">{{ d.title }}</text>
            <text class="meta">{{ formatType(d.type) }} · {{ formatDate(d.createdAt) }}</text>
            <text class="preview" v-if="d.preview">“{{ d.preview }}”</text>
          </view>
        </view>
      </BaseCard>
      <View v-if="hasMore && loadingMore" class="more-line">加载中...</View>
      <View v-else-if="!hasMore" class="end-line">没有更多了</View>
    </scroll-view>

    <!-- 辅助说明 -->
    <PrivacyCard
      v-if="isVisitingUser"
      :level="privacyLevel"
      :desc="privacyDesc"
      class="privacy-card"
    />
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useUserStore } from '@/stores/user';
import { read } from '@/services/request';
import BaseCard from '@/components/common/BaseCard.vue';
import Skeleton from '@/components/common/Skeleton.vue';
import ErrorPage from '@/components/common/ErrorPage.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import PrivacyCard from '@/components/common/PrivacyCard.vue';
import Button from '@/uni_modules/uview-ui/components/u-button/u-button.vue';

const user = useUserStore();
const query = ref('');
const hits = ref<any[]>([]);
const hasMore = ref(false);
const page = ref(1);
const loading = ref(false);
const loadingMore = ref(false);
const error = ref('');

// 防抖延迟
let timer: number | null = null;
const DEBOUNCE_MS = 300;

function onInput() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { doSearch(); }, DEBOUNCE_MS);
}

async function clearQuery() {
  query.value = '';
  hits.value = [];
  hasMore.value = false;
  page.value = 1;
  error.value = '';
}

async function doSearch(keyword?: string) {
  const kw = keyword || query.value;
  if (!kw || kw.trim().length === 0) {
    hits.value = [];
    hasMore.value = false;
    error.value = '';
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const res = await read(
      'doc',
      { action: 'search', keyword: kw.trim(), page: page.value },
      `search:${kw}:${page.value}`,
      30000
    );
    if (res.data?.docs) {
      hits.value = res.data.docs.slice(0, 50); // 前端截断，避免过长列表
      hasMore.value = res.data.hasMore ?? false;
    } else {
      error.value = res.error?.message || '检索失败';
    }
  } catch (e: any) {
    error.value = e.message || '网络异常';
  } finally {
    loading.value = false;
  }
}

async function loadMore() {
  if (!hasMore.value || loadingMore.value) return;
  loadingMore.value = true;
  page.value++;
  await doSearch(query.value);
  loadingMore.value = false;
}

function getTypeIcon(type: string): string {
  return { old_genealogy: '/static/genealogy.png', photo: '/static/photo.png', stele: '/static/stele.png', document: '/static/doc.png' }[type] || '/static/doc.png';
}

function formatType(t: string): string {
  return { old_genealogy: '旧谱', photo: '照片', stele: '碑拓', document: '文书' }[t] || '档案';
}

function formatDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

const isVisitingUser = computed(() => !user.isLoggedIn);
const privacyLevel = computed(() => isVisitingUser.value ? '未认证' : '公开');
const privacyDesc = computed(() => isVisitingUser.value ? '登录后可查看全部字段' : '');
</script>

<style scoped>
.search-page { flex: 1; display: flex; flex-direction: column; background: #F7F6F3; }
.search-bar { padding: 12px; display: flex; align-items: center; gap: 8px; background: #FFF; border-bottom: 1px solid #EEE7DA; }
.icon { width: 18px; height: 18px; }
.input { flex: 1; border-radius: 20px; padding: 8px 12px; background: #EFECE4; font-size: 14px; }
.btn-clear { min-width: 50px; }

.results-scroll { flex: 1; padding: 12px; }
.row { display: flex; align-items: center; gap: 10px; }
.type-icon { width: 32px; height: 32px; border-radius: 8px; background: #EEE7DA; }
.info { flex: 1; }
.title { font-size: 15px; font-weight: 600; color: #2B2320; display: block; }
.meta { font-size: 11px; color: #8A8378; margin-top: 2px; display: block; }
.preview { font-size: 12px; color: #6B6459; margin-top: 4px; display: block; }

.more-line, .end-line { text-align: center; padding: 12px; font-size: 12px; color: #999; }
.privacy-card { padding: 12px; }
</style>
