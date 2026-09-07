<template>
  <view class="home-page" :class="{ 'elder-mode': userStore.elderMode }">
    <!-- ① 问候区（晨光渐变 · 动态主题） -->
    <view 
      class="home-header" 
      :style="{
        background: `linear-gradient(165deg, ${theme.top} 0%, ${theme.mid} 45%, ${theme.bottom} 100%)`
      }"
      :class="{ muted: isMutedPeriod }"
    >
      <text class="home-greeting">{{ greeting }}</text>
      <text class="home-greeting-sub" v-if="loaded">
        {{ festival ? festival + ' · ' : '' }}{{ solarTerm }}
      </text>
      <view class="weather-widget-wrap" @click="goWeatherDetail">
        <WeatherWidget @detail="goWeatherDetail" />
      </view>
    </view>

    <!-- ② 快捷工具条（固定 5 键） -->
    <view class="home-quickbar">
      <view
        v-for="item in quickItems"
        :key="item.id"
        class="home-quickbar-item"
        @click="handleQuickClick(item)"
      >
        <text class="qb-icon" :class="{ gild: item.id === 'lamp' }">{{ item.glyph }}</text>
        <text class="home-quickbar-label">{{ item.label }}</text>
      </view>
    </view>

    <!-- ③ 今日要事卡流 -->
    <view class="today-section">
      <!-- 骨架屏：数据未到位时 ≤300ms 出现 -->
      <Skeleton v-if="loading" :rows="3" />

      <!-- 错误兜底：可重试不白屏 -->
      <ErrorPage
        v-else-if="loadError"
        title="今日要事加载失败"
        :message="loadError.message"
        @retry="loadTodayCards"
      />

      <!-- 空态降级：祖训今日卡（不空屏，文档 0.3.3） -->
      <EmptyState v-else-if="!cards.length" />

      <!-- 正常卡流（仪式卡置顶：蓝图 0.3.2 ③；入场 fade-in ≤200ms） -->
      <template v-else>
        <BaseCard
          v-for="card in sortedCards"
          :key="card.id"
          class="fade-in"
          :title="card.title"
          :desc="card.desc"
          :type="card.type === 'ceremony' ? 'ceremony' : card.type === 'motto' ? 'motto' : 'normal'"
          clamp
          @click="openCard(card)"
        />
      </template>
    </view>

    <!-- ④ 家族速览（横滑数据卡） -->
    <view class="home-overview">
      <view v-for="(stat, idx) in overviewStats" :key="idx" class="home-overview-item">
        <text class="home-overview-num">{{ stat.value }}</text>
        <text class="home-overview-label">{{ stat.label }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useUserStore } from '@/stores/user';
import { call } from '@/services/request';
import BaseCard from '@/components/common/BaseCard.vue';
import Skeleton from '@/components/common/Skeleton.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import ErrorPage from '@/components/common/ErrorPage.vue';
import { resolveTheme, MUTED_THEME } from '@/utils/home-atmosphere';
import WeatherWidget from '@/components/weather/WeatherWidget.vue';

const userStore = useUserStore();

// 问候区渐变主题：服务端 24 节气端点色（atmosphere.moodTheme）优先；
// 数据未到/失败前用客户端晨光默认（resolveTheme）；白事静默 → 素色令牌总优先
// computed 绑定，atmosphere 数据到达 muted=true 后自动切换素色（蓝图 0.2.2 / 7.8）
const greeting = ref('您好');
const solarTerm = ref('');
const festival = ref('');
const isMutedPeriod = ref(false);
const loaded = ref(false);
const themeOverride = ref<{ top: string; mid: string; bottom: string } | null>(null);

const theme = computed(() => {
  if (isMutedPeriod.value) return MUTED_THEME;
  return themeOverride.value || resolveTheme(false);
});

const loading = ref(true);
const loadError = ref<{ message: string } | null>(null);
const cards = ref<{ id: string; title: string; desc: string; type: string }[]>([]);

/** 仪式卡置顶（蓝图 0.3.2 ③：红白事最要紧，先于普卡呈现；其余保持服务端序） */
const sortedCards = computed(() => {
  const rank = (t: string) => (t === 'ceremony' ? 0 : t === 'motto' ? 1 : 2);
  return [...cards.value].sort((a, b) => rank(a.type) - rank(b.type));
});

const overviewStats = ref([
  { value: '—', label: '族谱代数' },
  { value: '—', label: '在世人口' },
  { value: '—', label: '本月大事' },
  { value: '—', label: '我的字辈' }
]);

/** 家族速览（蓝图 0.3.2 ④，R15 接 member.stats 真数据；未认证/失败保持占位不阻塞首屏） */
async function loadOverview() {
  const res = await call('member', { action: 'stats' }, {
    cacheKey: 'member:stats',
    cacheTTL: 5 * 60 * 1000
  });
  if (res.error || !res.data) return;
  const s = res.data.data ?? res.data;
  overviewStats.value = [
    { value: s.totalGenerations || '—', label: '族谱代数' },
    { value: s.aliveCount ?? '—', label: '在世人口' },
    { value: s.monthEvents ?? '—', label: '本月大事' },
    { value: s.myGenerationChar || (s.myGeneration ? `第${s.myGeneration}世` : '—'), label: '我的字辈' }
  ];
}

// 快捷 5 键（图标用字形占位，切图后替换 image；路由对齐 pages.json 注册页）
const quickItems = [
  { id: 'lamp', label: '点灯', glyph: '🕯', url: '/pkg-shrine/pages/shrine/shrine' },
  { id: 'qingan', label: '请安', glyph: '🙏', url: '' },
  { id: 'zupu', label: '族谱', glyph: '📜', url: '/pkg-family/pages/tree/tree' },
  { id: 'daka', label: '打卡', glyph: '✅', url: '/pkg-growth/pages/task/task' },
  { id: 'more', label: '更多', glyph: '⋯', url: '/pages/mine/mine' }
];

onMounted(() => {
  // 时段问候（本地计算，零网络开销）
  const h = new Date().getHours();
  greeting.value = h < 6 ? '夜安' : h < 12 ? '晨安' : h < 18 ? '午安' : '晚安';
  loadTodayCards();
  loadOverview();
});

/**
 * 首屏数据：缓存优先 + 静默刷新（文档 0.3.3 / 11.5）
 * atmosphere.today → 10 分钟缓存（节气/氛围变化低频）
 * notify.digest → 60 秒缓存（要事需要相对新鲜）
 */
async function loadTodayCards() {
  loading.value = true;
  loadError.value = null;

  // 1. 氛围数据（缓存优先）
  const atm = await call('atmosphere', { action: 'today' }, {
    cacheKey: 'atmosphere:today',
    cacheTTL: 10 * 60 * 1000
  });

  if (atm.data) {
    const d = atm.data.data ?? atm.data;
    solarTerm.value = d.solarTerm || '';
    festival.value = d.festival || '';
    isMutedPeriod.value = !!d.muted; // R13 atmosphere 字段口径：muted
    loaded.value = true;
    themeOverride.value = d.moodTheme || null; // §7.8 服务端 24 节气端点色板为主源
  }
  // 注：天气由 <WeatherWidget> 组件独立承载（含 3h 缓存），避免双请求

  // 2. 要事卡流（缓存优先，短 TTL）
  const digest = await call('notify', { action: 'digest' }, {
    cacheKey: 'notify:digest',
    cacheTTL: 60 * 1000
  });

  if (digest.error && !digest.data) {
    loadError.value = { message: digest.error.message };
    cards.value = [];
  } else {
    const d = digest.data?.data ?? digest.data;
    cards.value = (d?.cards || []).map((c: any) => ({
      id: c.id || c._id || c.title,
      title: c.title,
      desc: c.desc || '',
      type: c.type || 'normal'
    }));
  }

  loading.value = false;
}

function handleQuickClick(item: typeof quickItems[number]) {
  if (!item.url) {
    uni.showToast({ title: '「请安」入口开发中', icon: 'none' });
    return;
  }
  uni.navigateTo({
    url: item.url,
    fail: () => uni.showToast({ title: '页面开发中', icon: 'none' })
  });
}

function openCard(card: { id: string; type: string }) {
  if (card.type === 'ceremony') {
    uni.navigateTo({ url: '/pkg-calendar/pages/calendar/calendar', fail: () => {} });
  } else if (card.type === 'moment') {
    uni.navigateTo({ url: '/pkg-family/pages/plaza/plaza', fail: () => {} });
  } else if (card.type === 'notice' || card.type === 'reminder') {
    uni.navigateTo({ url: '/pkg-calendar/pages/calendar/calendar', fail: () => {} });
  } else if (card.type === 'motto') {
    uni.showToast({ title: '祖训今日 · 点击翻转看注解（V1.1）', icon: 'none' });
  } else {
    uni.navigateTo({ url: '/pkg-family/pages/plaza/plaza', fail: () => {} });
  }
}

function goWeatherDetail() {
  uni.navigateTo({ url: '/pkg-home/pages/home/weather', fail: () => {
    uni.showToast({ title: '天气详情页未就绪', icon: 'none' });
  } });
}
</script>

<style lang="scss" scoped>
@import '@/styles/home.scss';

/* 年长模式：全局字号 ×1.4（文档 0.5） */
.elder-mode {
  .home-greeting { font-size: calc(28px * 1.4); }
  .home-greeting-sub { font-size: calc(14px * 1.4); }
  .home-quickbar-label { font-size: calc(12px * 1.4); }
  .home-overview-num { font-size: calc(20px * 1.4); }
  .home-overview-label { font-size: calc(12px * 1.4); }
}

/* ─── 晨光问候区优化（蓝图 0.3.2 ①） ─── */
.home-header {
  min-height: 120px; /* 固定高度确保首屏稳定 */
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  position: relative;
  padding-top: 24px;
  padding-bottom: 24px;
  
  &.muted {
    background: var(--home-header-muted) !important; /* 强制覆盖 inline style */
  }
}

.home-greeting {
  font-size: 24px;
  font-weight: 700;
  line-height: 1.4;
}

.home-greeting-sub {
  font-size: 14px;
  color: var(--home-text-2);
  padding-right: 180px; /* 为右下角天气小件预留空间，防止文字重叠 */
}

/* 天气小件：右下角对齐，白底胶囊悬浮（着色纪律：清新点缀） */
.weather-widget-wrap {
  position: absolute;
  right: 16px;
  bottom: 24px;
  z-index: 2;
  background: rgba(255, 255, 255, 0.72);
  border-radius: 20px;
  padding: 6px 12px;
  box-shadow: 0 2px 12px rgba(38, 34, 30, 0.08);
}

/* ─── 快捷工具条（蓝图 0.3.2 ②） ─── */
.home-quickbar {
  margin: -8px 0 12px 0; /* 向上偏移抵消部分间距 */
  box-shadow: 0 2px 12px rgba(38, 34, 30, 0.06);
  
  &-item {
    min-width: 44px;
    min-height: 44px; /* 最小触控热区 */
    cursor: pointer;
    
    &:active .qb-icon {
      transform: scale(0.92); /* 按压反馈 ≤200ms */
    }
  }
  
  &-label {
    font-size: 12px;
  }
}

.qb-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  line-height: 1;
  border-radius: 50%;
  background: var(--home-card-2);
  transition: transform 120ms ease-out;
  
  &.gild {
    background: linear-gradient(135deg, #D4B06A 0%, #C9A063 50%, #B8924F 100%);
  }
}

/* ─── 今日要事卡流（蓝图 0.3.2 ③） ─── */
.today-section {
  margin-top: 12px;
  
  .fade-in {
    animation: fadeIn 200ms ease-out;
  }
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ─── 家族速览横滑数据卡（蓝图 0.3.2 ④） ─── */
.home-overview {
  margin-top: 12px;
  height: 72px; /* 固定高度避免跳动 */
  overflow-x: auto;
  scrollbar-width: none;
  
  &::-webkit-scrollbar {
    display: none;
  }
}

.home-overview-item {
  flex-shrink: 0;
  min-width: 120px;
  background: var(--home-card);
  border-radius: 12px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  box-shadow: 0 2px 12px rgba(38, 34, 30, 0.06);
  cursor: pointer;
  
  &:active {
    transform: scale(0.98);
  }
}

.home-overview-num {
  font-size: 20px;
  font-weight: 700;
  color: #C9A063; /* 直接写琉璃金 hex，不依赖 CSS 变量兼容问题 */
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}

.home-overview-label {
  font-size: 12px;
  color: var(--home-text-2);
}

/* ─── BaseCard 类型边条增强 ─── */
:deep(.base-card.ceremony) {
  border-left: 4px solid var(--home-accent);
}

:deep(.base-card.motto) {
  background: var(--home-card-2);
}
</style>
