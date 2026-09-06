<template>
  <view class="search-page">
    <!-- 搜索框 -->
    <view class="search-box">
      <input 
        v-model="keyword"
        placeholder="输入关键词/日期/分类筛选"
        class="input-field"
        @confirm="doSearch"
      />
      <view class="clear-btn" v-if="keyword" @click="keyword = ''; reset();">清</view>
    </view>

    <!-- 快捷筛选 -->
    <view class="quick-filter">
      <scroll-view scroll-x class="filter-scroll">
        <view 
          class="filter-chip"
          :class="{ active: activeDate === d.value }"
          v-for="d in dateFilters"
          :key="d.value"
          @click="selectDate(d.value)"
        >
          <text>{{ d.label }}</text>
        </view>
      </scroll-view>
    </view>

    <!-- 高级筛选展开区 -->
    <view class="advanced-section">
      <view class="adv-header" @click="showAdv = !showAdv">
        <text class="title">高级筛选 {{ showAdv ? '▲' : '▼' }}</text>
      </view>
      
      <view v-if="showAdv" class="adv-content">
        <!-- 主分类 -->
        <view class="filter-row">
          <text class="label">主分类：</text>
          <picker 
            :value="mainCatIndex"
            @change="onMainCatChange"
            :range="['全部', ...mainCats.map(c => c.name)]"
          >
            <view class="picker-value">{{ mainCatSelector }}</view>
          </picker>
        </view>

        <!-- 子分类 -->
        <view class="filter-row" v-if="hasSubFilter">
          <text class="label">子分类：</text>
          <picker 
            v-if="currentSubCats.length"
            :value="subCatIndex"
            @change="onSubCatChange"
            :range="['全部', ...currentSubCats.map(c => c.name)]"
          >
            <view class="picker-value">{{ subCatSelector }}</view>
          </picker>
          <view v-else class="picker-value">无子分类</view>
        </view>

        <!-- 类型过滤 -->
        <view class="filter-row">
          <text class="label">类型：</text>
          <radio-group @change="onTypeChange">
            <label class="radio-item" v-for="t in typeOpts" :key="t.value">
              <radio :value="t.value" :checked="activeType === t.value" color="#B03A2E" />
              <text>{{ t.label }}</text>
            </label>
          </radio-group>
        </view>

        <!-- 自定义日期范围 -->
        <view class="filter-row">
          <text class="label">自定义日期：</text>
          <view class="date-range">
            <picker mode="date" :value="fromDate" @change="onFromDateChange">
              <view class="date-picker">{{ fromDate || '开始' }}</view>
            </picker>
            <text class="separator">至</text>
            <picker mode="date" :value="toDate" @change="onToDateChange">
              <view class="date-picker">{{ toDate || '结束' }}</view>
            </picker>
          </view>
        </view>
      </view>
    </view>

    <!-- 搜索结果 -->
    <view class="results-section">
      <view class="results-count" v-if="results.length">
        <text>共找到 {{ results.length }} 条结果</text>
      </view>
      
      <view class="result-list" v-if="results.length">
        <view 
          v-for="item in results" 
          :key="item._id"
          class="result-item"
          @click="$emit('openDetail', item) || openDetail(item)"
        >
          <view class="res-media" v-if="item.mediaIds?.length && item.type !== 'record'">
            <image :src="getMediaUrl(item.mediaIds[0])" mode="aspectFill" class="thumb" />
          </view>
          <view class="res-body">
            <text class="res-title">{{ item.title }}</text>
            <text class="res-meta">
              <text>{{ formatDate(item.updatedAt) }}</text>
              <text class="visibility-tag">{{ visLabel(item.visibility) }}</text>
            </text>
            <text class="res-cat" v-if="item.mainCategory">#{{ item.mainCategory }}</text>
          </view>
        </view>
      </view>

      <view v-else class="empty-search">
        <text class="empty-icon">📝</text>
        <text class="empty-text">暂无匹配结果，请调整筛选条件</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import * as contentSvc from '@/services/content';

const emit = defineEmits(['openDetail']);

const keyword = ref('');
const results = ref<any[]>([]);
const loading = ref(false);

// 快捷日期过滤器
const dateFilters = [
  { label: '全部', value: '' },
  { label: '近 7 天', value: '7' },
  { label: '近 30 天', value: '30' },
  { label: '今年', value: 'year' }
];

const activeDate = ref('');
const activeType = ref(''); // all/article/photo/video/record
const showAdv = ref(false);

// 分类状态
const mainCats = ref<any[]>([]);
const mainCat = ref('');
const subCat = ref('');
const currentSubCats = ref<any[]>([]);

const mainCatIndex = computed(() => mainCats.value.findIndex(c => c.name === mainCat.value));
const subCatIndex = computed(() => currentSubCats.value.findIndex(c => c.name === subCat.value));

// Selectors
const mainCatSelector = computed(() => mainCats.value.find(c => c.name === mainCat.value)?.name || '全部');
const subCatSelector = computed(() => currentSubCats.value.find(c => c.name === subCat.value)?.name || '全部');

const hasSubFilter = computed(() => currentSubCats.value.length > 0);

// Type options
const typeOpts = [
  { label: '全部类型', value: '' },
  { label: '文章', value: 'article' },
  { label: '照片', value: 'photo' },
  { label: '视频', value: 'video' },
  { label: '记录', value: 'record' }
];

// Dates
const fromDate = ref('');
const toDate = ref('');

async function loadCategories() {
  const res = await contentSvc.listCategories();
  if (res.success) {
    mainCats.value = res.data.categories.filter((c: any) => c.type === 'MAIN' && !c.deleted);
  }
}

async function doSearch() {
  if (!keyword.value && !mainCat.value && !subCat.value && !activeType.value && !fromDate.value && !toDate.value) {
    return uni.showToast({ title: '请输入关键词或选择筛选条件', icon: 'none' });
  }

  loading.value = true;
  const params: any = {};
  
  if (keyword.value.trim()) params.keyword = keyword.value.trim();
  if (mainCat.value) params.mainCategory = mainCat.value;
  if (subCat.value) params.subCategory = subCat.value;
  if (activeType.value) params.type = activeType.value;
  
  // 快捷日期处理（前端计算近似）
  if (activeDate.value === '7') {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    params.from = sevenDaysAgo.toISOString().split('T')[0];
  } else if (activeDate.value === '30') {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    params.from = thirtyDaysAgo.toISOString().split('T')[0];
  } else if (activeDate.value === 'year') {
    const jan1 = new Date(new Date().getFullYear(), 0, 1);
    params.from = jan1.toISOString().split('T')[0];
  }
  
  if (fromDate.value) params.from = fromDate.value;
  if (toDate.value) params.to = toDate.value;
  
  try {
    const r = await contentSvc.searchContent({ ...params, pageSize: 50 });
    if (r.success) {
      results.value = r.data.contents || [];
    } else {
      uni.showToast({ title: r.data?.message || '搜索失败', icon: 'none' });
    }
  } catch (e) {
    uni.showToast({ title: e.message, icon: 'none' });
  } finally {
    loading.value = false;
  }
}

function selectDate(value: string) {
  activeDate.value = value;
  activeType.value = ''; // Reset custom dates
  fromDate.value = '';
  toDate.value = '';
  doSearch();
}

function reset() {
  keyword.value = '';
  mainCat.value = '';
  subCat.value = '';
  activeType.value = '';
  fromDate.value = '';
  toDate.value = '';
  activeDate.value = '';
  results.value = [];
}

function onMainCatChange(e: any) {
  const idx = e.detail.value;
  if (idx === 0) {
    mainCat.value = '';
    subCat.value = '';
    currentSubCats.value = [];
  } else {
    mainCat.value = mainCats.value[idx - 1]?.name || '';
    // Load children
    const parent = mainCats.value[idx - 1];
    // TODO: 实际应从服务器获取；此处简化从本地缓存读取
  }
}

function onSubCatChange(e: any) {
  const idx = e.detail.value;
  if (idx === 0) {
    subCat.value = '';
  } else {
    subCat.value = currentSubCats.value[idx - 1]?.name || '';
  }
}

function onTypeChange(e: any) {
  activeType.value = e.detail.value;
}

function onFromDateChange(e: any) {
  fromDate.value = e.detail.value;
}

function onToDateChange(e: any) {
  toDate.value = e.detail.value;
}

function formatDate(d: any) {
  if (!d) return '';
  const date = new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getMediaUrl(mediaId: string): string {
  return mediaId.includes('http') ? mediaId : `https://placeholder.com/${mediaId}.jpg`;
}

const visLabel = (v?: string) => ({ PRIVATE: '仅自己', GROUP: '指定可见', PUBLIC: '公开' }[v] || v);

function openDetail(item: any) {
  uni.navigateTo({ url: `/pkg-content/pages/content/detail?id=${item._id}` });
}

onMounted(() => {
  loadCategories();
});
</script>

<style scoped lang="scss">
.search-page { min-height: 100vh; background: var(--home-bg); padding-bottom: 60px; }

.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
  background: var(--home-card);
  border-radius: 8px;
  margin: 16px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
  
  .input-field {
    flex: 1;
    padding: 10px;
    font-size: 14px;
  }
  
  .clear-btn {
    padding: 8px;
    color: var(--home-accent);
    font-weight: bold;
  }
}

.quick-filter {
  padding: 0 16px;
  margin-bottom: 12px;
  
  .filter-scroll {
    white-space: nowrap;
    
    .filter-chip {
      display: inline-block;
      padding: 6px 16px;
      margin-right: 8px;
      background: var(--home-card);
      border-radius: 20px;
      font-size: 13px;
      
      &.active {
        background: linear-gradient(135deg, #D4B06A, #C9A063);
        color: white;
        font-weight: bold;
      }
    }
  }
}

.advanced-section {
  background: var(--home-card);
  border-radius: 8px;
  margin: 0 16px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
  
  .adv-header {
    padding: 12px 16px;
    
    .title { font-size: 14px; font-weight: bold; color: var(--home-text); }
  }
  
  .adv-content {
    padding: 16px;
    
    .filter-row {
      display: flex;
      align-items: center;
      padding: 8px;
      border-bottom: 1px solid var(--home-line);
      
      .label { width: 70px; font-size: 14px; color: var(--home-text-2); }
      
      .picker-value { flex: 1; font-size: 14px; color: var(--home-text); }
      
      .date-range {
        display: flex;
        align-items: center;
        gap: 8px;
        
        .date-picker {
          padding: 6px 12px;
          background: var(--home-card-2);
          border-radius: 4px;
          font-size: 13px;
        }
        
        .separator { font-size: 12px; color: var(--home-text-2); }
      }
    }
    
    .radio-item {
      display: flex;
      align-items: center;
      margin: 4px 0;
      
      radio { transform: scale(0.8); }
      text { margin-left: 8px; font-size: 14px; }
    }
  }
}

.results-section {
  padding: 16px;
  
  .results-count {
    font-size: 13px;
    color: var(--home-text-2);
    margin-bottom: 12px;
  }
  
  .result-list {
    .result-item {
      display: flex;
      gap: 12px;
      background: var(--home-card);
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 10px;
      
      .res-media {
        width: 80px;
        height: 80px;
        border-radius: 4px;
        overflow: hidden;
        
        .thumb { width: 100%; height: 100%; object-fit: cover; }
      }
      
      .res-body {
        flex: 1;
        
        .res-title { font-size: 14px; font-weight: bold; color: var(--home-text); display: block; margin-bottom: 4px; }
        
        .res-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          
          .visibility-tag {
            padding: 2px 6px;
            background: var(--home-gold);
            border-radius: 4px;
            font-size: 10px;
            color: white;
          }
        }
        
        .res-cat {
          font-size: 12px;
          color: var(--home-text-2);
          display: block;
          margin-top: 4px;
        }
      }
    }
  }
  
  .empty-search {
    text-align: center;
    margin-top: 60px;
    
    .empty-icon { font-size: 48px; display: block; }
    .empty-text { color: var(--home-text-2); margin-top: 12px; display: block; }
  }
}
</style>