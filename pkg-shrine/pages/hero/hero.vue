<!-- pkg-shrine/pages/hero/hero.vue – 英烈献花（Sprint R15：蓝图 8.0 hero/index + 6.3 访客可浏览，名录+献花原子计数，接 member.heroList + ceremony.worship flower） -->
<template>
  <view class="hero-page">
    <view class="hero-header">
      <text class="hero-title">郝氏英烈</text>
      <text class="hero-sub">为国捐躯之族人，永载家乘 · 献花以志不忘</text>
    </view>

    <view v-if="heroes.length === 0 && !loading" class="empty">
      <text>暂无英烈名录，待族史委录入</text>
    </view>

    <view v-for="h in heroes" :key="h.id" class="hero-card" @tap="goDetail(h.id)">
      <view class="hero-left">
        <view class="hero-name-row">
          <text class="hero-name">{{ h.name }}</text>
          <text v-if="h.generation" class="hero-gen">第{{ h.generation }}世</text>
        </view>
        <text v-if="h.heroNote" class="hero-note">{{ h.heroNote }}</text>
        <text v-if="h.deathDate" class="hero-date">{{ h.deathDate }}</text>
      </view>
      <view class="hero-right">
        <text class="hero-count">{{ h.worshipCount }}</text>
        <text class="hero-count-label">献花</text>
        <view class="flower-btn" @click="doFlower(h)">
          <text>🌸 献花</text>
        </view>
      </view>
      <!-- 献花花瓣动效（纯 CSS，蓝图 11：点击献花→花瓣粒子+计数原子 +1） -->
      <view v-if="burstId === h.id" class="petal-layer">
        <view v-for="i in 8" :key="i" class="petal" :style="petalStyle(i)" />
      </view>
    </view>

    <view v-if="hasMore" class="load-more" @click="loadMore">
      <text>{{ loading ? '加载中…' : '更多英烈' }}</text>
    </view>
    <text class="page-tip">访客可浏览英烈名录；献花需认证族人（蓝图 6.3）</text>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { read, write } from '@/services/request';

interface HeroItem {
  id: string; name: string; generation: number | null;
  deathDate: string; heroNote: string; worshipCount: number
}

const heroes = ref<HeroItem[]>([]);
const page = ref(1);
const hasMore = ref(false);
const loading = ref(false);
const burstId = ref('');

async function fetchHeroes(p = 1) {
  loading.value = true;
  try {
    const res = await read('member', { action: 'heroList', page: p }, null, 0);
    if (res.success && res.data) {
      const list = res.data.heroes || [];
      heroes.value = p === 1 ? list : heroes.value.concat(list);
      hasMore.value = !!res.data.hasMore;
      page.value = p;
    }
  } finally {
    loading.value = false;
  }
}

function loadMore() {
  if (loading.value || !hasMore.value) return;
  fetchHeroes(page.value + 1);
}

/** R19：跳英烈事迹详情（蓝图 8.0 hero/detail 贯通） */
function goDetail(id: string) {
  uni.navigateTo({ url: `/pkg-shrine/pages/hero/detail?memberId=${id}` });
}

/** 献花：ceremony.worship type=flower（MEMBER+；功德分按日幂等） */
async function doFlower(h: HeroItem) {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const res = await write(
    'ceremony',
    { action: 'worship', type: 'flower', targetMemberId: h.id },
    'ceremony.worship',
    `flower:${h.id}:${dateStr}`
  );
  if (res.success && res.data) {
    burstId.value = h.id;
    uni.vibrateShort?.();
    setTimeout(() => { burstId.value = ''; }, 1200);
    h.worshipCount = res.data.worshipCount;
    uni.showToast({
      title: res.data.blessing && !res.data.blessing.duplicated ? '献花敬上 · 功德+1' : '献花敬上',
      icon: 'none'
    });
  } else {
    uni.showToast({ title: res.message || '献花失败，请重试', icon: 'none' });
  }
}

/** 花瓣随机轨迹（8 瓣，CSS 变量驱动，动效克制） */
function petalStyle(i: number) {
  const angle = (i / 8) * 360;
  const dist = 40 + (i % 3) * 18;
  return {
    '--dx': `${Math.cos((angle * Math.PI) / 180) * dist}px`,
    '--dy': `${Math.sin((angle * Math.PI) / 180) * dist - 20}px`,
    '--delay': `${(i % 4) * 60}ms`
  };
}

fetchHeroes(1);
</script>

<style scoped>
.hero-page { min-height: 100vh; background: #F7F6F3; padding-bottom: 24px; }

.hero-header { padding: 24px 16px 12px; background: linear-gradient(165deg, #FDFCF8 0%, #F5F1E6 45%, #EDF2EC 100%); }
.hero-title { font-size: 24px; font-weight: 700; color: #2B2723; display: block; }
.hero-sub { font-size: 13px; color: #6E6659; margin-top: 6px; display: block; }

.hero-card { position: relative; margin: 12px 16px 0; background: #FFFFFF; border-radius: 12px; padding: 14px; box-shadow: 0 2px 12px rgba(38, 34, 30, 0.06); display: flex; align-items: center; justify-content: space-between; overflow: hidden; }
.hero-left { flex: 1; display: flex; flex-direction: column; gap: 4px; }
.hero-name-row { display: flex; align-items: baseline; gap: 8px; }
.hero-name { font-size: 17px; font-weight: 700; color: #B03A2E; }
.hero-gen { font-size: 11px; color: #B0A99A; }
.hero-note { font-size: 13px; color: #2B2320; }
.hero-date { font-size: 11px; color: #B0A99A; }
.hero-right { display: flex; flex-direction: column; align-items: center; gap: 2px; margin-left: 12px; }
.hero-count { font-size: 20px; font-weight: 700; color: #C9A063; }
.hero-count-label { font-size: 10px; color: #B0A99A; }
.flower-btn { margin-top: 6px; background: #F7F1E3; border-radius: 14px; padding: 6px 12px; }
.flower-btn text { font-size: 13px; color: #B03A2E; }

.petal-layer { position: absolute; left: 50%; top: 50%; pointer-events: none; }
.petal { position: absolute; width: 10px; height: 10px; background: #F5B8C4; border-radius: 50% 0 50% 50%; animation: petal-fly 1s ease-out forwards; animation-delay: var(--delay); opacity: 0.9; }
@keyframes petal-fly {
  0% { transform: translate(0, 0) rotate(0deg); opacity: 0.9; }
  100% { transform: translate(var(--dx), var(--dy)) rotate(220deg); opacity: 0; }
}

.empty { text-align: center; color: #B0A99A; font-size: 13px; padding: 48px 16px; }
.load-more { text-align: center; padding: 14px; font-size: 13px; color: #8A8378; }
.page-tip { display: block; text-align: center; font-size: 11px; color: #B0A99A; padding: 8px 16px; }
</style>
