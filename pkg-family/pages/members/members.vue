<!-- pkg-family/pages/members/members.vue -->
<template>
  <view class="members-page">
    <!-- 搜索框 + 筛选 -->
    <view class="search-bar">
      <input 
        class="search-input" 
        placeholder="搜索姓名/谱名" 
        v-model="query.name" 
        @confirm="doSearch" 
      />
      <select-v2
        :placeholder="'按房支选择'" 
        :model-value="curBranch" 
        @change="onBranchChange"
      />
    </view>

    <!-- 空态 / 错误兜底 -->
    <Skeleton v-if="loading" :rows="10" />
    <EmptyState v-else-if="error" desc="暂无结果" />
    
    <scroll-view scroll-y v-else class="list-scroll" @scrolltolower="loadMore">
      <BaseCard v-for="m in list" :key="m._id" hover-class="card-hover">
        <view class="row">
          <image class="avatar" :src="getAvatar(m)" mode="aspectFill" />
          <view class="info">
            <text class="name">{{ m.genealogyName || m.name }}</text>
            <text class="meta">{{ m.branchId }} · {{ m.generation }}世</text>
          </view>
          <Button size="mini" type="default" @click="goDetail(m)">详情</Button>
        </view>
      </BaseCard>

      <!-- 加载更多指示 -->
      <View v-if="loadingMore" class="more-line">加载中...</View>
      <View v-else-if="!hasMore" class="end-line">没有更多了</View>
    </scroll-view>

    <!-- 隐私保护提示 -->
    <PrivacyCard v-if="privacyTip" :level="privacyLevel" :desc="privacyTip" />
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useUserStore } from '@/stores/user';
import { read } from '@/services/request';
import BaseCard from '@/components/common/BaseCard.vue';
import Skeleton from '@/components/common/Skeleton.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import PrivacyCard from '@/components/common/PrivacyCard.vue';
import Button from '@/uni_modules/uview-ui/components/u-button/u-button.vue';
// uni-app select-v2 组件略，使用自定义弹窗代替

const user = useUserStore();
const loading = ref(true);
const error = ref('');
const list = ref<any[]>([]);
const curBranch = ref('ALL');
const query = ref({ name: '' });
const hasMore = ref(false);
const page = ref(1);
const loadingMore = ref(false);

// 隐私等级（成员档案 L2/L3）
const privacyLevel = computed(() => user.isLoggedIn ? '公开' : '未认证');
const privacyTip = computed(() => user.isLoggedIn ? null : '完善资料后可查看全部字段');

const branches = ['ALL', 'long', 'ci', ...new Set(list.value.map(m => m.branchId)).values()];

async function loadList() {
  loading.value = true;
  error.value = '';
  try {
    const res = await read(
      'member',
      { action: 'list', branch: curBranch.value === 'ALL' ? undefined : curBranch.value, page: page.value },
      `members:${page.value}`,
      30000
    );
    if (res.data?.docs) {
      list.value = res.data.docs;
      hasMore.value = res.data.hasMore ?? false;
    } else {
      error.value = res.error?.message || '获取失败';
    }
  } catch (e: any) {
    error.value = e.message || '网络异常';
  } finally {
    loading.value = false;
  }
}

async function doSearch() {
  page.value = 1;
  // 调用 doc.search 替代 member.list 模糊检索（待实现）...
  loadList();
}

function loadMore() {
  if (!hasMore.value || loadingMore.value) return;
  loadingMore.value = true;
  page.value++;
  setTimeout(() => { loadList(); loadingMore.value = false; }, 500); // 模拟异步
}

function onBranchChange(v: string) {
  curBranch.value = v;
  page.value = 1;
  loadList();
}

function getAvatar(m: any): string {
  return m.gender === 'FEMALE' ? '/static/female.png' : '/static/male.png';
}

function goDetail(m: any) {
  uni.navigateTo({ url: `/pkg-family/pages/memberDetail/detail?id=${m._id}` });
}

onMounted(loadList);
</script>

<style scoped>
.members-page { flex: 1; display: flex; flex-direction: column; background: #F7F6F3; }
.search-bar { padding: 12px; display: flex; gap: 8px; background: #FFF; }
.search-input { flex: 1; border-radius: 16px; padding: 8px 12px; background: #EFECE4; font-size: 14px; }

.list-scroll { flex: 1; padding: 12px; }
.row { display: flex; align-items: center; gap: 10px; }
.avatar { width: 36px; height: 36px; border-radius: 50%; background: #EEE7DA; }
.info { flex: 1; }
.name { font-size: 15px; font-weight: 600; display: block; }
.meta { font-size: 12px; color: #8A8378; margin-top: 2px; display: block; }

.more-line, .end-line { text-align: center; padding: 12px; font-size: 12px; color: #999; }
</style>
