<!-- pkg-growth/pages/task/task.vue – 成长任务（Sprint R14：蓝图 task/index，今日任务+打卡+积分反馈，接 task.today/checkin） -->
<template>
  <view class="task-page">
    <!-- 今日进度 -->
    <BaseCard title="今日任务">
      <view class="progress-row">
        <text class="progress-num">{{ completedCount }}/{{ tasks.length }}</text>
        <text class="progress-label">已完成 · 积分入账 normal 池</text>
      </view>
      <view v-if="tasks.length === 0 && !loading" class="empty">
        <text>暂无进行中的任务</text>
      </view>
      <view v-for="t in tasks" :key="t.id" class="task-row">
        <view class="task-left">
          <text class="task-title">{{ t.title }}</text>
          <text v-if="t.desc" class="task-desc">{{ t.desc }}</text>
        </view>
        <view class="task-right">
          <text class="task-points">+{{ t.points || 1 }}</text>
          <view
            class="checkin-btn"
            :class="{ done: t.completed }"
            @click="doCheckin(t)"
          >
            <text>{{ t.completed ? '已打卡' : '打卡' }}</text>
          </view>
        </view>
      </view>
    </BaseCard>

    <text class="page-tip">每日打卡积入普通池，连续打卡走成长任务族议会加成（V1.1）</text>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { read, write } from '@/services/request';
import BaseCard from '@/components/common/BaseCard.vue';

interface TaskItem { id: string; title: string; desc: string; points: number; completed: boolean }

const tasks = ref<TaskItem[]>([]);
const completedCount = ref(0);
const loading = ref(false);

async function fetchToday() {
  loading.value = true;
  try {
    const res = await read('task', { action: 'today' }, 'task.today', 30000);
    if (res.success && res.data) {
      tasks.value = res.data.tasks || [];
      completedCount.value = res.data.completedCount || 0;
    }
  } finally {
    loading.value = false;
  }
}

/** 打卡：服务端当日幂等（task:date:uid）+ common/points 积分联动（R13 闭环） */
async function doCheckin(t: TaskItem) {
  if (t.completed) {
    uni.showToast({ title: '今日已打卡', icon: 'none' });
    return;
  }
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const res = await write('task', { action: 'checkin', taskId: t.id }, 'task.checkin', `${t.id}:${dateStr}`);
  if (res.success && res.data) {
    if (res.data.alreadyDone) {
      uni.showToast({ title: '今日已打卡', icon: 'none' });
    } else {
      const delta = res.data.points && res.data.points.delta;
      uni.showToast({ title: delta ? `打卡成功 · 积分+${delta}` : '打卡成功', icon: 'none' });
    }
    t.completed = true;
    completedCount.value = tasks.value.filter(x => x.completed).length;
  } else {
    uni.showToast({ title: res.message || '打卡失败，请重试', icon: 'none' });
  }
}

fetchToday();
</script>

<style scoped>
.task-page { min-height: 100vh; background: #F7F6F3; padding: 16px; display: flex; flex-direction: column; gap: 12px; }

.progress-row { display: flex; align-items: baseline; gap: 8px; margin-bottom: 6px; }
.progress-num { font-size: 24px; font-weight: 700; color: #B03A2E; }
.progress-label { font-size: 12px; color: #6E6659; }

.task-row { display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #EAE4D6; }
.task-row:last-of-type { border-bottom: none; }
.task-left { display: flex; flex-direction: column; gap: 2px; }
.task-title { font-size: 15px; font-weight: 600; color: #2B2320; }
.task-desc { font-size: 12px; color: #B0A99A; }
.task-right { display: flex; align-items: center; gap: 10px; }
.task-points { font-size: 15px; font-weight: 700; color: #C9A063; }

.checkin-btn { background: #B03A2E; border-radius: 8px; padding: 8px 16px; min-width: 56px; text-align: center; }
.checkin-btn text { font-size: 13px; color: #FFFFFF; }
.checkin-btn.done { background: #F0EEE8; }
.checkin-btn.done text { color: #B0A99A; }

.empty { text-align: center; color: #B0A99A; font-size: 13px; padding: 20px 0; }
.page-tip { font-size: 11px; color: #B0A99A; text-align: center; padding: 4px 0 12px; }
</style>
