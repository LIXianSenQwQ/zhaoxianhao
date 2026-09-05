<template>
  <view class="home-page fade-in">
    <!-- ① 问候区 (晨光渐变) -->
    <view 
      class="home-header" 
      :class="{ muted: isMutedPeriod }"
    >
      <text class="home-greeting">{{ greeting }}</text>
      <text class="home-greeting-sub">{{ solarTerm }} · {{ weatherInfo }}</text>
      
      <!-- V1.1 天气组件 -->
      <v11-weather-widget v-if="isV11Enabled('weather')" />
    </view>
    
    <!-- ② 快捷工具条 (5 键横向) -->
    <view class="home-quickbar">
      <view 
        v-for="item in quickItems.filter(i => isFeatureEnabled(i.key))" 
        :key="item.id"
        class="home-quickbar-item"
        @click="handleQuickClick(item)"
      >
        <image :src="item.icon" class="home-quickbar-icon" mode="aspectFit" />
        <text class="home-quickbar-label">{{ item.label }}</text>
      </view>
    </view>
    
    <!-- ③ 今日要事卡流 -->
    <scroll-view scroll-y class="today-scroll">
      <!-- 仪式/红白事卡 (最高优先级) -->
      <home-today-card 
        v-if="ceremonyCard" 
        type="ceremony"
        :data="ceremonyCard"
        @click="goToCeremony"
      />
      
      <!-- 提醒卡 -->
      <home-today-card v-for="reminder in reminders" :key="reminder.id" :data="reminder" @click="goToCalendar" />
      
      <!-- 动态摘要卡 -->
      <home-today-card v-if="momentDigest" :data="momentDigest" @click="goToPlaza" />
      
      <!-- V1.1 家风家训推荐卡 -->
      <home-today-card 
        v-if="isV11Enabled('motto') && mottoRecommend" 
        type="motto"
        :data="mottoRecommend"
        @click="goToMotto"
      />
    </scroll-view>
    
    <!-- ④ 家族速览 (横滑数据卡) -->
    <view class="home-overview">
      <view 
        v-for="(stat, idx) in overviewStats" 
        :key="idx"
        class="home-overview-item"
        @click="handleOverviewStat(stat)"
      >
        <text class="home-overview-num">{{ stat.value }}</text>
        <text class="home-overview-label">{{ stat.label }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useUserStore } from '@/stores/user';
import { isFeatureEnabled } from '@/utils/feature-flags';

const userStore = useUserStore();

// V1.1 功能开关检查
const isV11Enabled = (key: string) => isFeatureEnabled(`v11${key}`);

// 问候语
const greeting = ref('');
const solarTerm = ref('');
const weatherInfo = ref('');
const isMutedPeriod = ref(false);

// 快捷工具（固定 5 键）
const quickItems = ref([
  { id: 'lamp', key: 'shrine', label: '点灯', icon: '/static/icons/lamp.png' },
  { id: 'qingan', key: 'social', label: '请安', icon: '/static/icons/qingan.png' },
  { id: 'zupu', key: 'jiapu', label: '族谱', icon: '/static/icons/zupu.png' },
  { id: 'daka', key: 'task', label: '打卡', icon: '/static/icons/daka.png' },
  { id: 'more', key: 'mine', label: '更多', icon: '/static/icons/more.png' }
]);

// 今日要事数据
const ceremonyCard = ref(null);
const reminders = ref([]);
const momentDigest = ref(null);
const mottoRecommend = ref(null);

// 家族速览统计
const overviewStats = computed(() => [
  { value: '128', label: '在世人口' },
  { value: '47', label: '最新代数' },
  { value: '3', label: '本月大事' },
  { value: '明', label: '我的字辈' }
]);

// 页面加载
onMounted(async () => {
  // 1. 获取节气信息
  const atmRes = await wx.cloud.callFunction({ name: 'atmosphere', data: { action: 'today' } });
  if (atmRes.result) {
    solarTerm.value = atmRes.result.solarTerm;
    isMutedPeriod.value = !!atmRes.result.mutedPeriod;
  }
  
  // 2. 聚合 API 加载要事数据
  await loadTodayCards();
});

// 加载今日卡片
async function loadTodayCards() {
  try {
    const res = await wx.cloud.callFunction({
      name: 'notify',
      data: { action: 'digest' }
    });
    
    if (res.result?.cards) {
      ceremonyCard.value = res.result.cards.find(c => c.type === 'ceremony');
      reminders.value = res.result.cards.filter(c => c.type === 'reminder');
      momentDigest.value = res.result.cards.find(c => c.type === 'moment');
    }
  } catch (e) {
    console.error('Failed to load today cards:', e);
  }
}

// 快捷点击处理
function handleQuickClick(item) {
  switch (item.id) {
    case 'lamp': wx.navigateTo({ url: '/pkg-shrine/shrine/index' }); break;
    case 'qingan': wx.showToast({ title: '请安入口' }); break;
    case 'zupu': wx.navigateTo({ url: '/pkg-genealogy/jiapu/index' }); break;
    case 'daka': wx.navigateTo({ url: '/pkg-points/task/index' }); break;
    case 'more': wx.navigateTo({ url: '/pages/mine/mine' }); break;
  }
}

function goToCeremony() { /* ... */ }
function goToCalendar() { /* ... */ }
function goToPlaza() { /* ... */ }
function goToMotto() { /* ... */ }
function handleOverviewStat(stat) { /* ... */ }
</script>

<style scoped>
@import '/styles/home.scss';
/* 其他样式... */
</style>
