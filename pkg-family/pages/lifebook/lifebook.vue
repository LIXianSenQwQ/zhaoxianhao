<!-- pkg-family/pages/lifebook/lifebook.vue – 传记查看页（Sprint R16：蓝图 8.0 lifebook/index 篇章浏览） -->
<template>
  <view class="page">
    <view v-if="loading" class="header">
      <view class="skeleton-lines">
        <view class="line" /> <view class="line" /> <view class="line short" />
      </view>
    </view>

    <view v-else-if="err" class="error">{{ err }}</view>

    <view v-else-if="memberData && !loading" class="content">
      <view class="profile">
        <view class="name-row">
          <text class="name">{{ memberData.genealogyName || '未定' }}</text>
          <text v-if="memberData.status === 'DECEASED'" class="status-badge">故</text>
        </view>
        <view class="meta">
          <text v-if="memberData.generation">第{{ memberData.generation }}世 · </text>
          <text>{{ memberData.gender === 'MALE' ? '男' : '女' }} · {{ memberData.branchId || '未知房支' }}</text>
        </view>
        <view v-if="memberData.birthDate || memberData.deathDate" class="dates">
          <text v-if="memberData.birthDate">生：{{ memberData.birthDate }}</text>
          <text v-if="memberData.birthDate && memberData.deathDate"> | </text>
          <text v-if="memberData.deathDate">卒：{{ memberData.deathDate }}</text>
        </view>
        <!-- 英烈事迹（英雄名录成员高亮） -->
        <view v-if="memberData.heroNote" class="hero-note-card">
          <text class="hero-tag">英烈事迹</text>
          <text class="hero-text">{{ memberData.heroNote }}</text>
        </view>
        <view v-if="memberData.lifespan && typeof memberData.lifespan === 'number'" class="lifespan">享年 {{ memberData.lifespan }}岁</view>
      </view>

      <!-- 善行事迹（deeds，蓝图 5.2 德行公开） -->
      <view v-if="memberData.deeds && memberData.deeds.length" class="section">
        <view class="section-title">善行事迹</view>
        <view v-for="(d, i) in memberData.deeds" :key="i" class="deed-card">
          <view class="deed-title">{{ d.title || '事件' }} <text v-if="d.date" class="date">({{ d.date }})</text></view>
          <text class="deed-desc">{{ d.desc || '' }}</text>
        </view>
      </view>

      <!-- 家训（motto，关联家训展示位） -->
      <view v-if="memberData.motto" class="section">
        <view class="section-title">家风家训</view>
        <view class="motto-card">
          <text class="motto-text">{{ memberData.motto }}</text>
        </view>
      </view>

      <!-- 私密字段提示 -->
      <view v-if="hiddenFields && hiddenFields.length" class="hidden-hint">
        <text>受隐私保护，部分字段已隐藏（授权后可见）</text>
      </view>
    </view>

    <view v-else class="empty">
      <text>暂无资料</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { read } from '@/services/request';

const memberId = (getApp() as any).globalData.params?.memberId || 'm-1'; // 演示 ID，实际从路由参数 or tree 跳转
const loading = ref(false);
const err = ref('');
const memberData = ref<any>(null);
const hiddenFields = ref<string[]>([]);

async function fetchDetail() {
  loading.value = true; err.value = ''; memberData.value = null;
  try {
    const res = await read('member', { action: 'getDetail', memberId }, null, 1*60*1000);
    if (res.success && res.data?.member) {
      memberData.value = res.data.member;
      hiddenFields.value = res.data.hiddenFields || [];
    } else {
      err.value = res.message || '加载失败';
    }
  } catch (e: any) {
    err.value = e.message || '网络错误';
  } finally {
    loading.value = false;
  }
}

fetchDetail();
</script>

<style scoped>
.page { background: #F7F4EC; min-height: 100vh; padding: 16px; }
.skeleton-lines .line { height: 14px; background: #F5F1E6; margin-bottom: 8px; border-radius: 4px; }
.line.short { width: 60%; }
.error { color: #B03A2E; text-align: center; padding: 32px 16px; font-size: 14px; }
.empty { color: #B0A99A; text-align: center; padding: 48px 16px; font-size: 13px; }
.content { background: #FFFFFF; border-radius: 12px; padding: 16px; box-shadow: 0 2px 12px rgba(38,34,30,0.06); margin-bottom: 12px; }
.profile { margin-bottom: 16px; }
.name-row { display: flex; align-items: baseline; gap: 8px; }
.name { font-size: 22px; font-weight: 700; color: #2B2723; }
.status-badge { font-size: 11px; padding: 2px 6px; background: #EDF2EC; color: #6E6659; border-radius: 4px; }
.meta { font-size: 13px; color: #6E6659; margin-top: 4px; }
.dates { font-size: 12px; color: #999; margin-top: 4px; }
.lifespan { font-size: 12px; color: #2B2723; margin-top: 6px; }
.hero-note-card { margin-top: 12px; padding: 12px; background: linear-gradient(135deg,#FDFCF8 0%,#F5F1E6 45%,#EDF2EC 100%); border-left: 4px solid #B03A2E; border-radius: 8px; }
.hero-tag { font-size: 12px; color: #B03A2E; display: block; margin-bottom: 4px; }
.hero-text { font-size: 13px; color: #2B2723; line-height: 1.5; }
.section { margin: 16px 0; border-top: 1px dashed #EAE4D6; padding-top: 16px; }
.section-title { font-size: 16px; font-weight: 700; color: #2B2723; margin-bottom: 8px; }
.deed-card { background: #FAF8F2; padding: 10px 12px; border-radius: 8px; margin-bottom: 8px; }
.deed-title { font-size: 14px; font-weight: 600; color: #2B2723; }
.deed-title .date { font-size: 12px; color: #6E6659; }
.deed-desc { font-size: 12px; color: #6E6659; display: block; margin-top: 4px; }
.motto-card { background: linear-gradient(135deg,#D4B06A 0%,#C9A063 50%,#B8924F 100%); color: #FFF; padding: 12px; border-radius: 8px; line-height: 1.6; }
.motto-text { font-size: 14px; font-style: italic; }
.hidden-hint { font-size: 11px; color: #B0A99A; text-align: center; margin-top: 8px; }
</style>
