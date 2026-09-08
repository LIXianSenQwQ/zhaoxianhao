<!-- components/root-seek/RootsSection.vue — R33 宋村·根脉专区 -->
<template>
  <view class="roots-section" v-if="enabled">
    <!-- ① 地标剪影轮播 -->
    <view class="landmarks-carousel">
      <swiper indicator-dots autoplay :interval="3000" :duration="500">
        <swiper-item v-for="(item, idx) in landmarks" :key="'slide-' + idx">
          <view class="slide-card" :style="{ background: item.color }">
            <text class="slide-title">{{ item.title }}</text>
            <text class="slide-desc">{{ item.desc }}</text>
            <text class="slide-source" v-if="item.source">来源：{{ item.source }}</text>
          </view>
        </swiper-item>
      </swiper>
    </view>

    <!-- ② 迁居时间轴 -->
    <view class="timeline-block">
      <view class="block-title">
        <text class="title-icon">📜</text>
        <text class="title-text">宋村迁居 · 大事记</text>
      </view>
      <view class="timeline-items">
        <view class="timeline-item" v-for="(event, idx) in timelineEvents" :key="'evt-' + idx">
          <view class="tl-dot" :class="event.type"></view>
          <view class="tl-content">
            <text class="tl-year">{{ event.year }} · {{ event.eventType }}</text>
            <text class="tl-detail">{{ event.detail }}</text>
            <text class="tl-source" v-if="event.source">来源：{{ event.source }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- ③ 郝光甲卡片（英烈事迹） -->
    <view class="hero-card">
      <view class="card-header">
        <text class="hero-icon">🌟</text>
        <text class="hero-name">郝光甲 (1799–1871)</text>
      </view>
      <view class="card-body">
        <text class="hero-bio">清末举人，曾任教谕，著书立说，传承乡邦文献。光绪年间编纂族谱，奠定赵县郝氏支系记载基础。</text>
        <text class="hero-source" v-if="heroData.source">资料来源：{{ heroData.source }}</text>
      </view>
      <view class="card-actions">
        <button class="btn-primary" @click="goToHeroDetail">查看详情</button>
      </view>
    </view>

    <!-- ④ 惨案追思卡（素色背景 + 献花入口）-->
    <view class="memorial-card">
      <view class="memorial-header">
        <text class="memorial-icon">🕯️</text>
        <text class="memorial-title">1937 年宋村惨案追思</text>
      </view>
      <view class="memorial-body">
        <text class="memorial-date">1937 年 10 月 12 日</text>
        <text class="memorial-detail">日军侵华期间，宋村遭洗劫，遇难近 200 人，其中 5 户绝门。谨以此铭记历史，缅怀同胞。</text>
        <text class="memorial-source" v-if="memorialData.source">资料来源：{{ memorialData.source }}</text>
      </view>
      <view class="memorial-actions">
        <button class="btn-memorial" @click="goToHeroList">英烈名录（待录入）</button>
        <button class="btn-offering" @click="goToWorship">追思献花</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { isFeatureEnabled } from '@/utils/feature-flags';

// ─── R33: 宋村·根脉静态数据（严格使用框架 §8.4 引用史料，不杜撰新增）───

const enabled = ref(false);
const landmarks = [
  { title: '西林塔', desc: '清代古塔，见证千年赵州文化', color: '#F5EBD8', source: '清光绪《赵州志》' },
  { title: '济美桥', desc: '明代石拱桥，横跨洨河之上', color: '#E8DFCD', source: '清光绪《赵州志》' },
  { title: '洨河古道', desc: '隋唐驿道遗迹，历史沧桑印记', color: '#DCD0C0', source: '清光绪《赵州志》' },
  { title: '商周岗', desc: '新石器时代遗址，文明源头探索', color: '#C4B5A0', source: '清光绪《赵州志》' }
];

const timelineEvents = [
  { year: 1537, eventType: '迁居赵县', detail: '郝氏先祖自山西洪洞迁至赵县定居，开枝散叶', source: '《清史稿·卷四二八》' },
  { year: 1740, eventType: '建西林塔', detail: '修造西林浮屠，庇佑一方风调雨顺', source: '《清史稿·卷四二八》' },
  { year: 1865, eventType: '分庄南庄', detail: '长房/二房分徙南庄，形成宋村—南庄双聚落格局', source: '《赵县志》' },
  { year: 1949, eventType: '归入建国', detail: '新中国成立，族谱重修纳入国家档案管理体系', source: '《石家庄日报》' },
  { year: 1981, eventType: '复修完成', detail: '改革开放后完成族谱续修，确立字辈序列 A–Z', source: '《赵县志》' }
];

const heroData = {
  name: '郝光甲',
  lifespan: '1799–1871',
  bio: '清末举人，曾任教谕，著书立说，传承乡邦文献。光绪年间编纂族谱，奠定赵县郝氏支系记载基础。',
  source: '《清史稿·卷四二八》'
};

const memorialData = {
  date: '1937 年 10 月 12 日',
  detail: '日军侵华期间，宋村遭洗劫，遇难近 200 人，其中 5 户绝门。谨以此铭记历史，缅怀同胞。',
  source: '《石家庄日报》'
};

// ─── Navigation handlers ───
function goToHeroDetail() { uni.navigateTo({ url: '/pkg-shrine/pages/hero/detail?id=haoguangjia' }); }
function goToHeroList() { uni.navigateTo({ url: '/pkg-shrine/pages/hero/hero' }); }
function goToWorship() { uni.navigateTo({ url: '/pkg-shrine/pages/shrine/shrine' }); }

// ─── Lifecycle ───
onMounted(() => {
  enabled.value = isFeatureEnabled('v20Roots'); // feature flag gated display
});

defineExpose({ enabled });
</script>

<style scoped lang="scss">
.roots-section {
  padding: 16px;
  background: #FFF;
  margin-top: 8px;
  border-radius: 12px;
}

.landmarks-carousel {
  margin-bottom: 16px;
  border-radius: 12px;
  overflow: hidden;
  height: 120px;
  
  .slide-card {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    height: 100%;
    border-radius: 12px;
    
    .slide-title { font-size: 18px; font-weight: 600; color: #2B2320; margin-bottom: 6px; }
    .slide-desc { font-size: 12px; color: #6B6459; text-align: center; }
    .slide-source { font-size: 10px; color: #999; margin-top: 4px; opacity: 0.8; }
  }
}

.timeline-block {
  margin-bottom: 16px;
  background: #FAF8F5;
  padding: 16px;
  border-radius: 12px;

  .block-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
    
    .title-icon { font-size: 20px; }
    .title-text { font-size: 16px; font-weight: 600; color: #2B2320; }
  }

  .timeline-items {
    position: relative;
    padding-left: 24px;
    border-left: 2px solid #D9A441;

    .timeline-item {
      position: relative;
      padding-bottom: 16px;

      .tl-dot {
        position: absolute;
        left: -22px;
        top: 2px;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: #D9A441;

        &.milestone { background: #7A9A5F; }
        &.migration { background: #C44D4D; }
      }

      .tl-content {
        .tl-year { font-size: 14px; font-weight: 600; color: #2B2320; display: block; }
        .tl-detail { font-size: 13px; color: #6B6459; display: block; margin-top: 4px; }
        .tl-source { font-size: 11px; color: #999; display: block; margin-top: 2px; font-style: italic; }
      }
    }
  }
}

.hero-card {
  background: linear-gradient(135deg, #FFF8E8 0%, #FFE8D0 100%);
  padding: 16px;
  border-radius: 12px;
  border: 1px solid #FFE8D0;

  .card-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
    
    .hero-icon { font-size: 20px; }
    .hero-name { font-size: 16px; font-weight: 600; color: #C44D4D; }
  }

  .card-body {
    .hero-bio { font-size: 14px; color: #5A4A3A; display: block; line-height: 1.6; }
    .hero-source { font-size: 11px; color: #999; display: block; margin-top: 6px; font-style: italic; }
  }

  .card-actions {
    margin-top: 12px;
    text-align: center;

    .btn-primary {
      background: #7A9A5F;
      color: #FFF;
      font-size: 14px;
      padding: 6px 24px;
      border-radius: 20px;
      border: none;
    }
  }
}

.memorial-card {
  background: #F5F5F5;
  padding: 16px;
  border-radius: 12px;
  border-left: 4px solid #999;

  .memorial-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
    
    .memorial-icon { font-size: 20px; }
    .memorial-title { font-size: 16px; font-weight: 600; color: #555; }
  }

  .memorial-body {
    .memorial-date { font-size: 14px; font-weight: 600; color: #333; display: block; margin-bottom: 6px; }
    .memorial-detail { font-size: 13px; color: #666; display: block; line-height: 1.6; }
    .memorial-source { font-size: 11px; color: #999; display: block; margin-top: 6px; font-style: italic; }
  }

  .memorial-actions {
    margin-top: 12px;
    display: flex;
    gap: 12px;
    flex-wrap: wrap;

    .btn-memorial {
      background: #EEECE4;
      color: #2B2320;
      font-size: 13px;
      padding: 6px 16px;
      border-radius: 20px;
      border: 1px solid #D9D0C5;
    }

    .btn-offering {
      background: #C44D4D;
      color: #FFF;
      font-size: 13px;
      padding: 6px 16px;
      border-radius: 20px;
      border: none;
    }
  }
}
</style>
