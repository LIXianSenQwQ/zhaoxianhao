<!--
  pkg-home/pages/home/growth.vue — 成长长卷（蓝图 V2.0 §31 E.2 角色成长）
  数据：home 云函数 getGrowth → { level, experience, expNext, progressPct, skills[], badges[] }
  交互：等级进度条、技能树三大系（孝悌/耕读/睦族）、称号墙、徽章柜
-->
<template>
  <view class="growth-page">
    <view class="hd">成长长卷</view>
    <!-- 等级进度条 -->
    <view class="level-card">
      <view class="level-row">
        <text class="lvl-badge">Lv.{{ data.level }}</text>
        <text class="title-txt">{{ titleTxt }}</text>
      </view>
      <view class="exp-bar"><view class="exp-fill" :style="{ width: data.progressPct + '%' }"></view></view>
      <text class="exp-text">{{ data.experience }} / {{ data.expNext }} ({{ data.progressPct }}%)</text>
    </view>
    <!-- 技能树 -->
    <view class="card">
      <text class="card-hd">技能树</text>
      <view v-for="s of data.skills" :key="s.name" class="skill-item">
        <text class="skill-name">{{ s.name }}</text>
        <text class="skill-lv">Lv.{{ s.level }}</text>
        <view class="sk-bar"><view class="sk-fill" :style="{ width: (s.progress*100)+'%' }"></view></view>
      </view>
    </view>
    <!-- 徽章柜 -->
    <view class="card">
      <text class="card-hd">徽章（{{ data.badges?.length || 0 }}）</text>
      <view class="badge-row">
        <view v-for="b of data.badges" :key="b.id" class="badge">
          {{ b.name }}
          <text class="badge-desc">{{ b.desc }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { call } from '@/services/request';

const data = ref<any>({ level:1,experience:0,expNext:100,progressPct:0,skills:[],badges:[] });
const titles = ['蒙童','知礼','立业','持家','望族','耆老','族尊'];
const titleTxt = ref('蒙童');

onMounted(async ()=>{
  const res = await call('home', { action:'getGrowth' });
  if(res.data && res.data.growth) { data.value = res.data.growth; data.value.progressPct = Math.round((data.value.experience||0)/(data.value.expNext||100)*100); }
  titleTxt.value = titles[Math.min(Math.floor((data.value.level||1)/15),6)] || '族尊';
});
</script>

<style scoped>
.growth-page{ min-height:100vh; background:#FAF8F2; padding:16px; }
.hd{ font-size:20px; font-weight:700; color:#2B2723; margin-bottom:12px; }
.level-card{ background:#FFF; border-radius:12px; padding:16px; margin-bottom:12px; box-shadow:0 2px 12px rgba(38,34,30,.06); }
.level-row{ display:flex; align-items:center; gap:8px; margin-bottom:10px; }
.lvl-badge{ background:#C9A063; color:#FFF; padding:4px 12px; border-radius:20px; font-size:14px; font-weight:700; }
.title-txt{ font-size:18px; color:#2B2723; font-weight:600; }
.exp-bar{ height:8px; background:#F0EFEA; border-radius:4px; overflow:hidden; }
.exp-fill{ height:100%; background:linear-gradient(90deg,#C9A063,#D4B06A); border-radius:4px; transition:width .3s; }
.exp-text{ font-size:12px; color:#6E6659; margin-top:6px; display:block; }
.card{ background:#FFF; border-radius:12px; padding:16px; margin-bottom:12px; box-shadow:0 2px 12px rgba(38,34,30,.06); }
.card-hd{ font-size:16px; font-weight:600; color:#2B2723; margin-bottom:12px; display:block; }
.skill-item{ display:flex; align-items:center; gap:8px; margin-bottom:8px; }
.skill-name{ width:80px; font-size:13px; color:#333; font-weight:500; }
.skill-lv{ font-size:12px; color:#C9A063; width:40px; }
.sk-bar{ flex:1; height:4px; background:#F0EFEA; border-radius:2px; }
.sk-fill{ height:100%; background:#C9A063; border-radius:2px; }
.badge-row{ display:flex; flex-wrap:wrap; gap:8px; }
.badge{ background:#F5F1E6; padding:6px 10px; border-radius:8px; font-size:13px; color:#2B2723; }
.badge-desc{ font-size:11px; color:#6E6659; display:block; margin-top:2px; }
</style>