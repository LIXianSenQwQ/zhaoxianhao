<template>
  <view class="clanaffairs-page">
    <!-- 顶部背景 -->
    <view class="page-header">
      <text class="page-title">家族事务</text>
      <text class="page-subtitle">族务公告 · 任务 · 仪式</text>
    </view>

    <!-- 分类标签 -->
    <view class="tab-bar">
      <view v-for="tab in tabs" :key="tab.key" class="tab-item" :class="{ active: activeTab === tab.key }" @click="activeTab = tab.key">
        <text>{{ tab.label }}</text>
      </view>
    </view>

    <!-- 事务列表 -->
    <scroll-view scroll-y class="affairs-scroll">
      <view v-if="affairs.length === 0" class="empty-state">
        <text class="empty-icon">📋</text>
        <text class="empty-text">{{ emptyMsg }}</text>
      </view>

      <view v-for="(item, idx) in filteredAffairs" :key="item.id || idx" class="affair-card" @click="onAffairClick(item)">
        <view class="card-header">
          <text class="card-type" :style="{ color: typeColor(item.type) }">{{ item.typeLabel }}</text>
          <text class="card-status" v-if="item.statusLabel">{{ item.statusLabel }}</text>
        </view>
        <text class="card-title">{{ item.title }}</text>
        <text class="card-desc" v-if="item.desc">{{ item.desc.length > 60 ? item.desc.slice(0, 60) + '...' : item.desc }}</text>
        <text class="card-time">{{ formatTime(item.createdAt) }}</text>
      </view>
    </scroll-view>

    <!-- 底部快速发布（仅编辑+） -->
    <view class="fab" v-if="canPublish" @click="showPublishModal">
      <text class="fab-icon">＋</text>
      <text class="fab-text">发布</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useUserStore } from '@/stores/user';

const userStore = useUserStore();

interface AffairItem {
  id: string;
  type: 'NOTICE' | 'TASK' | 'CEREMONY' | 'SOLICIT';
  typeLabel: string;
  title: string;
  desc?: string;
  statusLabel?: string;
  createdAt: string;
  route?: string;
}

const tabs = [
  { key: 'all', label: '全部' },
  { key: 'NOTICE', label: '公告' },
  { key: 'TASK', label: '任务' },
  { key: 'CEREMONY', label: '仪式' },
];
const activeTab = ref('all');
const affairs = ref<AffairItem[]>([]);
const canPublish = computed(() => userStore.isAdmin);

const filteredAffairs = computed(() => {
  if (activeTab.value === 'all') return affairs.value;
  return affairs.value.filter(a => a.type === activeTab.value);
});

const emptyMsg = computed(() => {
  if (activeTab.value === 'all') return '暂无公告或任务';
  const tab = tabs.find(t => t.key === activeTab.value);
  return `暂无${tab?.label || '相关'}事务`;
});

function typeColor(type: string) {
  const map: Record<string, string> = { NOTICE: '#B03A2E', TASK: '#C9A063', CEREMONY: '#D4B06A', SOLICIT: '#8A867F' };
  return map[type] || '#666';
}

function formatTime(t: string) {
  if (!t) return '';
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function onAffairClick(item: AffairItem) {
  if (item.route) uni.navigateTo({ url: item.route });
}

function showPublishModal() {
  uni.showActionSheet({
    itemList: ['发布公告', '分配任务', '发起仪式', '征求意见'],
    success: (res) => {
      const types = ['NOTICE', 'TASK', 'CEREMONY', 'SOLICIT'];
      uni.navigateTo({ url: `/pages/publish/publish?type=${types[res.tapIndex]}` });
    }
  });
}

onMounted(() => {
  // 加载事务列表（调用云函数）
  setTimeout(() => {
    affairs.value = [
      { id: '1', type: 'NOTICE', typeLabel: '族务公告', title: '世系数据收集启动通知', desc: '2026年世系数据收集已启动，请各位房长组织人员配合收集工作...', createdAt: '2026-09-05' },
      { id: '2', type: 'TASK', typeLabel: '任务', title: '第三房世系信息核对', desc: '第三房已提交的世系数据需在7天内完成双人核对', statusLabel: '进行中', createdAt: '2026-09-03' },
      { id: '3', type: 'CEREMONY', typeLabel: '仪式', title: '2026年秋季祭祖仪式', desc: '拟定于10月5日上午9时在宗祠举行秋季祭祖仪式', createdAt: '2026-09-01' },
      { id: '4', type: 'NOTICE', typeLabel: '族务公告', title: '家风家训修订意见征集', desc: '族议会决定开展家风家训修订工作，面向全体族人征求意见建议...', createdAt: '2026-08-28' },
      { id: '5', type: 'TASK', typeLabel: '任务', title: '族谱电子化录入进度统计', desc: '请各房长统计本房世系电子化录入完成情况', statusLabel: '已完成', createdAt: '2026-08-20' },
    ];
  }, 300);
});
</script>

<style scoped lang="scss">
.clanaffairs-page {
  min-height: 100vh;
  background: var(--home-bg);
}

.page-header {
  padding: 40px 24px 20px;
  background: linear-gradient(180deg, #F7F4EC 0%, #F0ECE2 100%);
  text-align: center;
  
  .page-title { font-size: 24px; font-weight: bold; color: var(--text-main); }
  .page-subtitle { font-size: 14px; color: var(--text-sub); margin-top: 4px; }
}

.tab-bar {
  display: flex;
  justify-content: space-around;
  padding: 12px 16px;
  background: white;
  box-shadow: 0 1px 4px rgba(0,0,0,0.04);
  
  .tab-item {
    font-size: 14px;
    padding: 6px 16px;
    color: var(--text-sub);
    border-radius: 20px;
    
    &.active {
      background: rgba(201,160,99,0.12);
      color: var(--cinnabar);
      font-weight: bold;
    }
  }
}

.affairs-scroll {
  padding: 12px 16px;
  padding-bottom: 100px;
  max-height: calc(100vh - 200px);
  overflow: scroll;
}

.affair-card {
  background: white;
  border-radius: var(--radius-card);
  padding: 16px;
  margin-bottom: 12px;
  box-shadow: 0 1px 6px rgba(0,0,0,0.04);
  
  .card-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 8px;
    
    .card-type { font-size: 12px; font-weight: bold; }
    .card-status { font-size: 11px; background: #F4F1E8; padding: 2px 8px; border-radius: 10px; color: var(--text-sub); }
  }
  
  .card-title { font-size: 16px; font-weight: bold; color: var(--text-main); }
  .card-desc { display: block; margin-top: 6px; font-size: 13px; color: var(--text-sub); line-height: 1.5; }
  .card-time { display: block; margin-top: 8px; font-size: 11px; color: var(--text-aux); }
}

.empty-state {
  text-align: center;
  margin-top: 60px;
  
  .empty-icon { font-size: 48px; }
  .empty-text { display: block; margin-top: 12px; color: var(--text-sub); font-size: 14px; }
}

.fab {
  position: fixed;
  bottom: 32px;
  right: 24px;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: linear-gradient(135deg, #D4B06A, #C9A063);
  box-shadow: 0 4px 16px rgba(201,160,99,0.3);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  
  .fab-icon { color: white; font-size: 24px; line-height: 1; }
  .fab-text { color: white; font-size: 9px; margin-top: 1px; }
}
</style>