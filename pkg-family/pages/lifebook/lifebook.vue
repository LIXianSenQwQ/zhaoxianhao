<!-- pkg-family/pages/lifebook/lifebook.vue – 传记查看页（Sprint R16：蓝图 8.0 lifebook/index 篇章浏览，数据源 member.getDetail deeds/motto/heroNote） -->
<template>
  <view class="page">
    <view v-if="loading" class="card">
      <Skeleton rows="6" />
    </view>

    <!-- 权限不足 → 授权卡（不白屏，蓝图 11） -->
    <view v-else-if="needAuthCard" class="card auth-card">
      <text class="auth-title">该族人传记需授权查看</text>
      <text class="auth-desc">您可以申请授权后浏览完整人生篇章</text>
      <button size="mini" @click="goApply">申请授权</button>
    </view>

    <view v-else-if="err" class="card error">
      <text>{{ err }}</text>
      <button size="mini" @click="loadMember">重试</button>
    </view>

    <template v-else-if="m">
      <!-- 篇章一：名讳与世系 -->
      <view class="card profile">
        <view class="name-row">
          <text class="name">{{ m.genealogyName || m.name || '未定' }}</text>
          <text v-if="m.status === 'DECEASED'" class="status-badge">故</text>
          <text v-if="isHero" class="hero-badge">英烈</text>
        </view>
        <view class="meta">
          <text v-if="m.generation">第{{ m.generation }}世</text>
          <text v-if="m.gender"> · {{ m.gender === 'MALE' ? '男' : '女' }}</text>
          <text v-if="m.branchId"> · {{ m.branchId }}</text>
        </view>
        <view v-if="m.birthDate || m.deathDate" class="dates">
          <text v-if="m.birthDate">{{ m.birthDate }}</text>
          <text v-if="m.birthDate && m.deathDate"> ── </text>
          <text v-if="m.deathDate">{{ m.deathDate }}</text>
          <text v-if="m.lifespan" class="lifespan">（享年 {{ m.lifespan }}）</text>
        </view>
        <view v-if="hiddenFields.length" class="hidden-hint">
          <text>另有 {{ hiddenFields.length }} 项受限字段未展示（授权后可见）</text>
        </view>
      </view>

      <!-- 篇章二：英烈事迹（朱砂左条，R15/R16 heroNote 闭环） -->
      <view v-if="m.heroNote" class="card hero-card">
        <text class="section-title hero-title">英烈事迹</text>
        <text class="hero-text">{{ m.heroNote }}</text>
      </view>

      <!-- 篇章三：善行事迹（deeds，蓝图 5.2 德行公开） -->
      <view v-if="m.deeds && m.deeds.length" class="card">
        <text class="section-title">善行事迹</text>
        <view v-for="(d, i) in m.deeds" :key="i" class="deed">
          <view class="deed-head">
            <text class="deed-title">{{ d.title || '事迹' }}</text>
            <text v-if="d.date" class="deed-date">{{ d.date }}</text>
          </view>
          <text v-if="d.desc" class="deed-desc">{{ d.desc }}</text>
        </view>
      </view>

      <!-- 篇章四：家风家训（motto，琉璃金卡） -->
      <view v-if="m.motto" class="card">
        <text class="section-title">家风家训</text>
        <view class="motto-card">
          <text class="motto-text">{{ m.motto }}</text>
        </view>
      </view>

      <!-- 空态：无任何篇章 -->
      <view v-if="!m.heroNote && !(m.deeds && m.deeds.length) && !m.motto" class="card">
        <EmptyState text="本族人暂无传记篇章，待族人补充善行事迹" />
      </view>
    </template>

    <view v-else class="card">
      <EmptyState text="族人不存在或已删除" />
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { read } from '@/services/request';
import Skeleton from '@/components/common/Skeleton.vue';
import EmptyState from '@/components/common/EmptyState.vue';

const loading = ref(true);
const err = ref('');
const needAuthCard = ref(false);
const applyRoute = ref('/pages/privacy/privacy');
const m = ref<any>(null);
const hiddenFields = ref<string[]>([]);
const isHero = ref(false);
let memberId = '';

onLoad((q: any = {}) => {
  memberId = String(q.memberId || q.id || '');
  if (!memberId) {
    err.value = '缺少族人编号';
    loading.value = false;
    return;
  }
  loadMember();
});

async function loadMember() {
  if (!memberId) return;
  loading.value = true; err.value = ''; needAuthCard.value = false; m.value = null;
  try {
    const res = await read('member', { action: 'getDetail', memberId }, `lifebook:${memberId}`, 5 * 60 * 1000);
    if (res.success && res.data?.member) {
      m.value = res.data.member;
      hiddenFields.value = res.data.hiddenFields || [];
      isHero.value = !!m.value.heroNote;
    } else if (!res.success && res.code === 403 && res.needAuthCard) {
      needAuthCard.value = true;
      applyRoute.value = res.applyRoute || '/pages/privacy/privacy';
    } else {
      err.value = res.message || '加载失败';
    }
  } catch (e: any) {
    err.value = e.message || '网络错误';
  } finally {
    loading.value = false;
  }
}

function goApply() {
  uni.navigateTo({ url: applyRoute.value });
}
</script>

<style scoped>
.page { background: #F7F4EC; min-height: 100vh; padding: 16px; }
.card { background: #FFFFFF; border-radius: 12px; padding: 16px; box-shadow: 0 2px 12px rgba(38, 34, 30, 0.06); margin-bottom: 12px; }
.name-row { display: flex; align-items: center; gap: 8px; }
.name { font-size: 22px; font-weight: 700; color: #2B2723; }
.status-badge { font-size: 11px; padding: 2px 8px; background: #EDF2EC; color: #6E6659; border-radius: 4px; }
.hero-badge { font-size: 11px; padding: 2px 8px; background: #F7F1E3; color: #B03A2E; border-radius: 4px; border: 1px solid #E8C777; }
.meta { font-size: 13px; color: #6E6659; margin-top: 6px; }
.dates { font-size: 13px; color: #2B2723; margin-top: 6px; }
.lifespan { font-size: 12px; color: #6E6659; }
.hidden-hint { font-size: 11px; color: #B0A99A; margin-top: 10px; }
.section-title { font-size: 15px; font-weight: 700; color: #2B2723; display: block; margin-bottom: 10px; }
.hero-card { border-left: 4px solid #B03A2E; }
.hero-title { color: #B03A2E; }
.hero-text { font-size: 14px; color: #2B2723; line-height: 1.7; }
.deed { background: #FAF8F2; border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; }
.deed-head { display: flex; justify-content: space-between; align-items: baseline; }
.deed-title { font-size: 14px; font-weight: 600; color: #2B2723; }
.deed-date { font-size: 11px; color: #B0A99A; }
.deed-desc { font-size: 12px; color: #6E6659; display: block; margin-top: 4px; line-height: 1.6; }
.motto-card { background: linear-gradient(135deg, #D4B06A 0%, #C9A063 50%, #B8924F 100%); border-radius: 8px; padding: 14px; }
.motto-text { font-size: 15px; color: #FFFFFF; line-height: 1.7; letter-spacing: 1px; }
.error { color: #B03A2E; font-size: 14px; line-height: 1.6; }
.auth-card { text-align: center; }
.auth-title { font-size: 16px; font-weight: 700; color: #2B2723; display: block; margin-bottom: 8px; }
.auth-desc { font-size: 12px; color: #6E6659; display: block; margin-bottom: 12px; }
button { background: linear-gradient(135deg, #D4B06A 0%, #C9A063 50%, #B8924F 100%); color: #FFFFFF; border: none; }
</style>
