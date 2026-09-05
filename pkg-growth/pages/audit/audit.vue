<!-- pkg-growth/pages/audit/audit.vue -->
<template>
  <view class="audit-page">
    <scroll-view scroll-y class="scan-list" @scrolltolower="loadMore">
      <!-- 状态筛选 -->
      <view class="tabs">
        <view 
          v-for="tab in tabs" 
          :key="tab.key" 
          :class="['tab', { active: curTab === tab.key }]" 
          @tap="curTab = tab.key"
        >
          {{ tab.label }}
        </view>
      </view>

      <!-- 加载骨架 -->
      <Skeleton v-if="loading" :rows="5" />

      <!-- 错误兜底 -->
      <ErrorPage v-else-if="error" :message="error" @retry="loadList" />

      <template v-else>
        <!-- 空态 -->
        <EmptyState v-if="records.length === 0" desc="暂无工单记录" />

        <!-- 工单列表 -->
        <BaseCard v-for="r in records" :key="r._id" hover-class="card-hover">
          <view class="row">
            <view class="status-tag" :class="statusClass(r.status)">
              {{ statusLabel(r.status) }}
            </view>
            <view class="info">
              <text class="name">{{ r.payload?.genealogyName || '未命名' }}</text>
              <text class="meta">{{ r.type }} · {{ formatTime(r.createdAt) }}</text>
            </view>
          </view>

          <!-- 操作按钮 -->
          <view class="actions" v-if="curTab !== 'APPROVED' && curTab !== 'REJECTED'">
            <Button size="mini" type="primary" @click="doAudit(r, 'FIRST_PASS')">初审</Button>
            <Button 
              size="mini" 
              type="default" 
              v-if="r.status === 'FIRST_PASS'" 
              @click="doAudit(r, 'SECOND_PASS')"
            >复审</Button>
            <Button size="mini" type="warn" @click="doAudit(r, 'REJECT')">驳回</Button>
          </view>

          <!-- 已通过 / 已驳回 -->
          <view class="actioned" v-else>
            <text class="done-text">{{ doneText(r.status) }}</text>
          </view>

          <!-- 备注 -->
          <text class="comment" v-if="r.auditChain?.[r.auditChain.length -1]?.comment">{{ r.auditChain[r.auditChain.length-1].comment }}</text>
        </BaseCard>

        <!-- 加载更多指示 -->
        <View v-if="loadingMore" class="more-line">加载中...</View>
        <View v-else-if="!hasMore" class="end-line">没有更多了</View>
      </template>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useUserStore } from '@/stores/user';
import { read } from '@/services/request';
import BaseCard from '@/components/common/BaseCard.vue';
import Skeleton from '@/components/common/Skeleton.vue';
import ErrorPage from '@/components/common/ErrorPage.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import Button from '@/uni_modules/uview-ui/components/u-button/u-button.vue';

const user = useUserStore();
const loading = ref(true);
const error = ref('');
const records = ref<any[]>([]);
const curTab = ref<'SUBMITTED' | 'FIRST_PASS' | 'APPROVED' | 'REJECTED'>('SUBMITTED');
const hasMore = ref(false);
const loadingMore = ref(false);

// 标签配置
const tabs = [
  { key: 'SUBMITTED', label: '待审核' },
  { key: 'FIRST_PASS', label: '初审通过' },
  { key: 'APPROVED', label: '已通过' },
  { key: 'REJECTED', label: '已驳回' }
];

async function loadList() {
  loading.value = true;
  error.value = '';
  try {
    const res = await read(
      'entry',
      { action: 'list', page: 1, status: curTab.value },
      `audit:${curTab.value}:1`,
      30000
    );
    if (res.data?.records) {
      records.value = res.data.records;
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

async function loadMore() {
  if (!hasMore.value || loadingMore.value) return;
  loadingMore.value = true;
  // 分页续载略（需后端支持）...
  loadingMore.value = false;
}

async function doAudit(record: any, action: 'FIRST_PASS' | 'SECOND_PASS' | 'REJECT') {
  const confirmed = await confirmDialog(`确认${statusActionLabel(action)}？`);
  if (!confirmed) return;

  try {
    // entry audit
    const res = await read('entry', { action: 'audit', recordId: record._id, auditAction: action }, null, 5000);
    if (!res.success && res.code) throw new Error(res.message || '审核失败');

    // 刷新列表
    loadList();
  } catch (e: any) {
    uni.showToast({ title: e.message || '操作失败', icon: 'none' });
  }
}

function statusClass(s: string): string {
  return { approved: s === 'APPROVED', rejected: s === 'REJECTED', submitted: s === 'SUBMITTED' };
}

function statusLabel(s: string): string {
  return { SUBMITTED: '待提交', FIRST_PASS: '初审通过', APPROVED: '已通过', REJECTED: '已驳回' }[s] || '未知';
}

function statusActionLabel(a: string): string {
  return { FIRST_PASS: '初审', SECOND_PASS: '复审', REJECT: '驳回' }[a] || '';
}

function doneText(s: string): string {
  return { APPROVED: '已通过入谱', REJECTED: '已驳回' }[s] || '';
}

function formatTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function confirmDialog(msg: string): Promise<boolean> {
  return new Promise(res => uni.showConfirmDialog({ title: '确认', content: msg, success: ({confirm}) => res(confirm) }));
}

onMounted(loadList);
</script>

<style scoped>
.audit-page { flex: 1; display: flex; flex-direction: column; }
.scan-list { flex: 1; background: #F7F6F3; padding-bottom: 20px; }

.tabs { display: flex; gap: 12px; padding: 12px; background: #FFF; }
.tab { padding: 8px 16px; border-radius: 20px; font-size: 14px; color: #2B2320; background: #EEECE4; }
.tab.active { background: #7A9A5F; color: #FFF; }

.row { display: flex; align-items: center; justify-content: space-between; }
.status-tag { font-size: 11px; padding: 4px 10px; border-radius: 10px; color: #FFF; }
.approved { background: #7A9A5F; }
.rejected { background: #C44D4D; }
.submitted { background: #FFA500; }
.info { flex: 1; margin-left: 10px; }
.name { font-size: 15px; font-weight: 600; display: block; }
.meta { font-size: 11px; color: #8A8378; margin-top: 2px; display: block; }
.actions { display: flex; gap: 8px; margin-top: 8px; }
.actioned { text-align: center; padding: 8px; font-size: 12px; color: #8A8378; }
.comment { display: block; font-size: 12px; color: #999; margin-top: 6px; }

.more-line, .end-line { text-align: center; padding: 12px; font-size: 12px; color: #999; }
</style>
