<!--
  pkg-home/pages/home/task.vue — 任务中心（蓝图 V2.0 §31 E.4 多元化任务系统）
  数据：home 云函数 getTasks / checkin / claimReward
  布局：日常/社交/成就/家族四类任务，一键领取
-->
<template>
  <view class="task-page">
    <view class="hd">任务中心</view>
    <!-- 任务列表 -->
    <view class="section">
      <text class="sec-hd">日常任务</text>
      <view v-for="t of dailies" :key="t.id" class="task-row">
        <view class="task-info">
          <text class="task-name">{{ t.name }}</text>
          <text class="task-progress">{{ t.completed }}/{{ t.total }}</text>
        </view>
        <button size="mini" :disabled="t.claimed" @click="claim(t)">{{ t.claimed ? '已领取' : '领取' }}</button>
      </view>
    </view>
    <view class="section">
      <text class="sec-hd">成就任务</text>
      <view v-for="t of achievements" :key="t.id" class="ach-row">
        <text>{{ t.name }}</text>
        <text class="ach-reward">{{ t.reward }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { call, write } from '@/services/request';

const dailies = ref<any[]>([]);
const achievements = ref<any[]>([]);

onMounted(async ()=>{
  const res = await call('home', { action:'getTasks', type:'daily' });
  if(res.data?.tasks) dailies.value = res.data.tasks;
  const achRes = await call('home', { action:'getTasks', type:'achievement' });
  if(achRes.data?.tasks) achievements.value = achRes.data.tasks;
});

async function claim(t:any){
  await write('home', { action:'claimReward', taskId:t.id }, 'home', `claim_${t.id}`);
  t.claimed = true;
  uni.showToast({ title:'+经验'+t.reward, icon:'success' });
}
</script>

<style scoped>
.task-page{ min-height:100vh; background:#FAF8F2; padding:16px; }
.hd{ font-size:20px; font-weight:700; color:#2B2723; margin-bottom:12px; }
.section{ margin-bottom:16px; }
.sec-hd{ font-size:14px; color:#999; margin-bottom:8px; display:block; }
.task-row{ display:flex; justify-content:space-between; align-items:center; background:#FFF; border-radius:12px; padding:12px; margin-bottom:8px; box-shadow:0 2px 12px rgba(38,34,30,.06); }
.task-name{ font-size:14px; color:#333; }
.task-progress{ font-size:12px; color:#6E6659; }
.ach-row{ display:flex; justify-content:space-between; align-items:center; background:#FFF; border-radius:12px; padding:12px; margin-bottom:8px; font-size:14px; }
.ach-reward{ font-size:12px; color:#C9A063; }
</style>