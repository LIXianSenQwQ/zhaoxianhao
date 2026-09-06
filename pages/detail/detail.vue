<template>
  <view class="person-detail">
    <!-- 头部信息 -->
    <view class="detail-header" :style="{ background: bgGradient }">
      <text class="greeting-text">{{ person.name }}</text>
      <text class="genealogy-name" v-if="person.genealogyName">{{ person.genealogyName }}</text>
      
      <!-- 状态徽章 -->
      <view class="status-badges">
        <tag v-if="isLiving" class="badge alive">在世</tag>
        <tag v-else class="badge deceased">已故 {{ formatDate(person.deathDate) }}</tag>
        <tag v-if="isHero" class="badge hero">英烈</tag>
      </view>
    </view>

    <!-- 基本信息卡片 -->
    <BaseCard title="基本信息" class="info-card">
      <view class="info-row" v-for="item in basicInfo" :key="item.label">
        <text class="info-label">{{ item.label }}：</text>
        <text class="info-value">{{ item.value || '—' }}</text>
      </view>
    </BaseCard>

    <!-- 关系图谱卡片 -->
    <BaseCard title="亲属关系" class="relation-card" @click="expandRelations">
      <view class="relation-preview" v-if="relations.length > 0">
        <view 
          v-for="(rel, idx) in relations.slice(0, 3)" 
          :key="idx" 
          class="relation-item"
          @click.stop="jumpPerson(rel.targetId)"
        >
          <text class="relation-label">{{ rel.relation }} · </text>
          <text class="relation-name">{{ rel.targetName }}</text>
        </view>
        <view class="more-hint" v-if="relations.length > 3">等{{ relations.length - 3 }}人</view>
      </view>
      <text class="empty-tip" v-else>暂无亲属数据</text>
    </BaseCard>

    <!-- 成就与荣誉 -->
    <BaseCard v-if="achievements.length > 0" title="善行事迹" class="achievement-card">
      <scroll-view scroll-y class="achievement-scroll">
        <view 
          v-for="(ach, idx) in achievements" 
          :key="idx" 
          class="achievement-item"
          :class="{ highlight: ach.important }"
        >
          <text class="ach-title">{{ ach.title }}</text>
          <text class="ach-desc">{{ ach.desc }}</text>
          <text class="ach-time">{{ ach.year }}</text>
        </view>
      </scroll-view>
    </BaseCard>

    <!-- 留言列表（英雄模式） -->
    <BaseCard v-if="isHero" :title="`访客留言(${messageCount})`" class="message-card">
      <view class="message-grid">
        <view 
          v-for="msg in messages.slice(0, 6)" 
          :key="msg.msgId" 
          class="message-cell"
        >
          <text class="msg-author">{{ msg.authorName }}</text>
          <text class="msg-content">{{ msg.content.substring(0, 20) }}</text>
        </view>
      </view>
      <view class="all-btn" @click="goToMessages">查看全部 →</view>
    </BaseCard>

    <!-- 底部操作栏 -->
    <view class="bottom-bar">
      <button class="btn apply-auth" v-if="needApplyAuth" @click="applyViewAccess">申请查看权限</button>
      <button class="btn share" @click="sharePage">分享</button>
      <button class="btn back" @click="goBack">返回</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from '@dcloudio/uni-router';
import * as memberSvc from '@/services/member';

const route = useRoute();
const router = useRouter();
const memberId = route.params?.id || route.query.id;

// State
const person = ref<any>(null);
const relations = ref<any[]>([]);
const achievements = ref<any[]>([]);
const messages = ref<any[]>([]);
const messageCount = ref(0);
const loading = ref(false);
const error = ref('');

// Computed
const isLiving = computed(() => !person.value?.deathDate || person.value.status === 'LIVING');
const isHero = computed(() => person.value?.tags?.includes('HERO') || false);
const needApplyAuth = computed(() => !['HISTORIAN', 'CHIEF'].includes(person.value?.role || ''));
const bgGradient = computed(() => isLiving.value ? 
  'linear-gradient(180deg, #F7F4EC 0%, #EBE8E0 100%)' :
  'linear-gradient(180deg, #EFE9D8 0%, #D8D2C0 100%)'
);

// Basic info items
const basicInfo = computed(() => {
  if (!person.value) return [];
  return [
    { label: '性别', value: person.value.gender ? ['男','女'][person.value.gender] : null },
    { label: '世代', value: person.value.generation },
    { label: '房支', value: person.value.branchName },
    { label: '出生地', value: person.value.birthPlace },
    { label: '职业', value: person.value.occupation },
    { label: '学历', value: person.value.education }
  ].filter(i => i.value);
});

// Methods
async function loadDetail() {
  loading.value = true;
  error.value = '';
  try {
    const res = await memberSvc.getDetail(memberId!);
    if (res.error) throw new Error(res.error.message);
    person.value = res.data;
    
    // 同步加载亲属关系（模拟）
    relations.value = []; // TODO: call relation.calculate
    
    // 同步加载成就（模拟）
    achievements.value = person.value.achievements || [];
    
    // 同步加载留言数量
    messageCount.value = person.value.messageCount || 0;
    
  } catch (e: any) {
    error.value = e.message || '加载失败';
    uni.showToast({ title: '加载失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
}

function expandRelations() {
  uni.navigateTo({ url: `/pages/relation/relation?id=${memberId}` });
}

function jumpPerson(id: string) {
  uni.navigateTo({ url: `/pages/detail/detail?id=${id}` });
}

function goToMessages() {
  uni.navigateTo({ url: `/pages/messages/messages?targetId=${memberId}&type=hero` });
}

function formatDate(dateStr?: string) {
  if (!dateStr) return '';
  return dateStr;
}

function applyViewAccess() {
  uni.navigateTo({ url: '/pages/apply-auth/apply-auth?targetId=' + memberId });
}

function sharePage() {
  uni.showShareMenu({ withShareTicket: true });
}

function goBack() {
  uni.navigateBack();
}

onMounted(loadDetail);
</script>

<style scoped lang="scss">
.person-detail {
  min-height: 100vh;
  background: var(--home-bg);
  padding-bottom: 100px;
}

.detail-header {
  padding: 40px 24px 30px;
  border-radius: var(--radius-card);
  
  .greeting-text {
    font-size: var(--font-xl);
    font-weight: bold;
    color: var(--text-main);
  }
  
  .genealogy-name {
    display: block;
    margin-top: 8px;
    font-size: var(--font-md);
    color: var(--text-sub);
  }
  
  .status-badges {
    display: flex;
    gap: 8px;
    margin-top: 12px;
    
    .badge {
      font-size: 12px;
      padding: 4px 8px;
      border-radius: 12px;
      background: rgba(176,58,46,0.08);
      
      &.alive { color: #B03A2E; }
      &.deceased { color: #666; }
      &.hero { 
        background: linear-gradient(135deg, #D4B06A, #C9A063);
        color: white;
      }
    }
  }
}

.info-card {
  margin: 0 16px 12px;
  padding: 20px;
  
  .info-row {
    display: flex;
    justify-content: space-between;
    margin-bottom: 12px;
    
    &:last-child { margin-bottom: 0; }
    
    .info-label { color: var(--text-sub); font-size: 14px; }
    .info-value { color: var(--text-main); font-size: 14px; }
  }
}

.relation-card, .achievement-card, .message-card {
  margin: 0 16px 12px;
  padding: 20px;
}

.relation-preview {
  .relation-item {
    display: flex;
    align-items: center;
    margin-bottom: 8px;
    
    .relation-label { color: var(--text-sub); }
    .relation-name { color: var(--cinnabar); }
  }
  
  .more-hint { color: var(--text-aux); font-size: 12px; margin-left: 8px; }
}

.achievement-scroll {
  max-height: 300px;
  
  .achievement-item {
    margin-bottom: 16px;
    padding: 12px;
    background: #FAF7F0;
    border-radius: 8px;
    
    &.highlight { background: linear-gradient(135deg, #FFF8E8, #FFF4E0); }
    
    .ach-title { font-size: 16px; font-weight: bold; }
    .ach-desc { display: block; margin-top: 4px; font-size: 14px; color: var(--text-sub); }
    .ach-time { display: block; margin-top: 8px; font-size: 12px; color: var(--text-aux); }
  }
}

.message-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  
  .message-cell {
    padding: 12px;
    background: #FAF7F0;
    border-radius: 8px;
    
    .msg-author { display: block; font-size: 12px; color: var(--text-sub); }
    .msg-content { display: block; margin-top: 4px; font-size: 13px; line-height: 1.4; }
  }
}

.all-btn {
  text-align: center;
  margin-top: 12px;
  color: var(--cinnabar);
  font-size: 14px;
}

.bottom-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 16px;
  background: white;
  box-shadow: 0 -2px 12px rgba(0,0,0,0.06);
  display: flex;
  gap: 12px;
  
  button {
    flex: 1;
    font-size: 14px;
    height: 44px;
    border-radius: 8px;
    background: white;
    border: 1px solid var(--text-aux);
    color: var(--text-main);
  }
  
  .apply-auth {
    background: linear-gradient(135deg, #D4B06A, #C9A063);
    color: white;
    border: none;
  }
}
</style>