<!-- pkg-shrine/pages/hero/detail.vue – 英烈事迹详情（Sprint R18：蓝图 8.0 hero/detail，数据源 member.getDetail deeds/motto/heroNote） -->
<template>
  <view class="page">
    <view v-if="loading" class="card">
      <Skeleton rows="6" />
    </view>

    <view v-else-if="err" class="card error">
      <text>{{ err }}</text>
      <button size="mini" @click="loadDetail">重试</button>
    </view>

    <template v-else-if="m">
      <!-- 英烈牌位卡 -->
      <view class="card memorial">
        <view class="name-row">
          <text class="name">{{ m.genealogyName || m.name || '英烈' }}</text>
          <text v-if="m.generation" class="gen">第{{ m.generation }}世</text>
        </view>
        <view v-if="m.birthDate || m.deathDate" class="dates">
          <text v-if="m.birthDate">{{ m.birthDate }}</text>
          <text v-if="m.birthDate && m.deathDate"> ── </text>
          <text v-if="m.deathDate">{{ m.deathDate }}</text>
          <text v-if="m.lifespan" class="lifespan">（享年 {{ m.lifespan }}）</text>
        </view>
        <view class="flower-row">
          <text class="flower-count">{{ worshipCount }}</text>
          <text class="flower-label">献花</text>
          <view class="flower-btn" @click="doFlower">
            <text>🌸 献花致敬</text>
          </view>
        </view>
      </view>

      <!-- 英烈事迹（朱砂左条） -->
      <view v-if="m.heroNote" class="card hero-card">
        <text class="section-title hero-title">英烈事迹</text>
        <text class="hero-text">{{ m.heroNote }}</text>
      </view>

      <!-- 善行事迹 -->
      <view v-if="m.deeds && m.deeds.length" class="card">
        <text class="section-title">生平事迹</text>
        <view v-for="(d, i) in m.deeds" :key="i" class="deed">
          <view class="deed-head">
            <text class="deed-title">{{ d.title || '事迹' }}</text>
            <text v-if="d.date" class="deed-date">{{ d.date }}</text>
          </view>
          <text v-if="d.desc" class="deed-desc">{{ d.desc }}</text>
        </view>
      </view>

      <!-- 家风家训 -->
      <view v-if="m.motto" class="card">
        <text class="section-title">家风家训</text>
        <view class="motto-card">
          <text class="motto-text">{{ m.motto }}</text>
        </view>
      </view>

      <!-- 无内容空态 -->
      <view v-if="!m.heroNote && !(m.deeds && m.deeds.length) && !m.motto" class="card">
        <EmptyState text="暂无详细事迹，待族史委补充" />
      </view>

      <text class="page-tip">献花需认证族人（MEMBER+）· 留言板规划中（蓝图 8.0 篇章）</text>
    </template>

    <view v-else class="card">
      <EmptyState text="族人不存在" />
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { read, write } from '@/services/request';
import Skeleton from '@/components/common/Skeleton.vue';
import EmptyState from '@/components/common/EmptyState.vue';

const loading = ref(true);
const err = ref('');
const m = ref<any>(null);
const worshipCount = ref(0);
let memberId = '';

onLoad((q: any = {}) => {
  memberId = String(q.memberId || q.id || '');
  if (!memberId) {
    err.value = '缺少族人编号';
    loading.value = false;
    return;
  }
  loadDetail();
});

async function loadDetail() {
  loading.value = true; err.value = ''; m.value = null;
  try {
    const res = await read('member', { action: 'getDetail', memberId }, `heroDetail:${memberId}`, 5 * 60 * 1000);
    if (res.success && res.data?.member) {
      m.value = res.data.member;
      worshipCount.value = m.value.worshipCount || 0;
    } else if (!res.success && res.code === 403 && res.needAuthCard) {
      // 英烈公开级可读（蓝图 6.3），403 视为不存在
      err.value = res.message || '该资料需授权查看';
    } else {
      err.value = res.message || '加载失败';
    }
  } catch (e: any) {
    err.value = e.message || '网络错误';
  } finally {
    loading.value = false;
  }
}

/** 献花：ceremony.worship type=flower（MEMBER+，按日幂等；复用 R15 口径） */
async function doFlower() {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const res = await write(
    'ceremony',
    { action: 'worship', type: 'flower', targetMemberId: memberId },
    'ceremony.worship',
    `flower:${memberId}:${dateStr}`
  );
  if (res.success && res.data) {
    worshipCount.value = res.data.worshipCount;
    uni.vibrateShort?.();
    uni.showToast({
      title: res.data.blessing && !res.data.blessing.duplicated ? '献花敬上 · 功德+1' : '献花敬上',
      icon: 'none'
    });
  } else {
    uni.showToast({ title: res.message || '献花失败，请重试', icon: 'none' });
  }
}
</script>

<style scoped>
.page { background: #F7F4EC; min-height: 100vh; padding: 16px; }
.card { background: #FFFFFF; border-radius: 12px; padding: 16px; box-shadow: 0 2px 12px rgba(38, 34, 30, 0.06); margin-bottom: 12px; }
.memorial { background: linear-gradient(165deg, #FDFCF8 0%, #F5F1E6 45%, #EDF2EC 100%); text-align: center; padding: 24px 16px; }
.name-row { display: flex; align-items: baseline; justify-content: center; gap: 8px; }
.name { font-size: 24px; font-weight: 700; color: #B03A2E; }
.gen { font-size: 12px; color: #B0A99A; }
.dates { font-size: 13px; color: #6E6659; margin-top: 8px; }
.lifespan { font-size: 12px; }
.flower-row { display: flex; flex-direction: column; align-items: center; margin-top: 16px; gap: 2px; }
.flower-count { font-size: 26px; font-weight: 700; color: #C9A063; }
.flower-label { font-size: 11px; color: #B0A99A; }
.flower-btn { margin-top: 8px; background: #F7F1E3; border-radius: 16px; padding: 8px 18px; }
.flower-btn text { font-size: 14px; color: #B03A2E; }
.section-title { font-size: 15px; font-weight: 700; color: #2B2723; display: block; margin-bottom: 10px; }
.hero-card { border-left: 4px solid #B03A2E; }
.hero-title { color: #B03A2E; }
.hero-text { font-size: 14px; color: #2B2723; line-height: 1.8; }
.deed { background: #FAF8F2; border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; }
.deed-head { display: flex; justify-content: space-between; align-items: baseline; }
.deed-title { font-size: 14px; font-weight: 600; color: #2B2723; }
.deed-date { font-size: 11px; color: #B0A99A; }
.deed-desc { font-size: 12px; color: #6E6659; display: block; margin-top: 4px; line-height: 1.6; }
.motto-card { background: linear-gradient(135deg, #D4B06A 0%, #C9A063 50%, #B8924F 100%); border-radius: 8px; padding: 14px; }
.motto-text { font-size: 15px; color: #FFFFFF; line-height: 1.7; letter-spacing: 1px; }
.error { color: #B03A2E; font-size: 14px; line-height: 1.6; }
.page-tip { display: block; text-align: center; font-size: 11px; color: #B0A99A; padding: 8px 16px; }
</style>
