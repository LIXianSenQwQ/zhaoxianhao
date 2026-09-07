<!--
  pkg-news/pages/news/push.vue — 推送设置（蓝图 V2.0 §28 B.4）
  开关：重大新闻/家族专区/兴趣分类（三档独立），本地存储；免打扰时段 22:00–07:00
-->
<template>
  <view class="push-page">
    <text class="hd">订阅消息开关</text>
    <view class="card">
      <view class="switch-row">
        <text class="label">重大新闻</text>
        <switch :checked="sw.major" @change="v=>sw.major=v.detail.value" color="#B03A2E" />
      </view>
      <view class="switch-row">
        <text class="label">家族专区</text>
        <switch :checked="sw.family" @change="v=>sw.family=v.detail.value" color="#C9A063" />
      </view>
      <view class="switch-row">
        <text class="label">兴趣分类</text>
        <switch :checked="sw.interest" @change="v=>sw.interest=v.detail.value" color="#7FA8A0" />
      </view>
    </view>
    <view class="card">
      <view class="switch-row">
        <text class="label">免打扰（22:00–07:00）</text>
        <switch :checked="sw.dnd" @change="v=>sw.dnd=v.detail.value" />
      </view>
    </view>
    <button class="save-btn" size="mini" @click="save()">保存设置</button>
    <text class="tips">订阅消息需在小程序内开启权限，否则不会生效。</text>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
const STORAGE_KEY = 'hcs:cache:news:pushSettings';

let sw:{major:boolean;family:boolean;interest:boolean;dnd:boolean};
onMounted(()=>{ const s=uni.getStorageSync(STORAGE_KEY) || {major:true,family:true,interest:false,dnd:true}; sw=s; });

function save(){ uni.setStorageSync(STORAGE_KEY, sw); uni.showToast({title:'已保存',icon:'success'}); }
</script>

<style lang="scss" scoped>
.push-page{ min-height:100vh; background:#FAF8F2; padding:16px; box-sizing:border-box; }
.hd{ font-size:18px; font-weight:700; color:#2B2723; display:block; margin-bottom:12px; }
.card{ background:#FFF; border-radius:12px; padding:12px; margin-bottom:12px; box-shadow:0 2px 12px rgba(38,34,30,.06);}
.switch-row{ display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid #F0EFEA; }
.switch-row:last-child{ border-bottom:none; }
.label{ font-size:14px; color:#333; flex:1; }
.save-btn{ width:100%; font-size:14px; padding:10px; background:#B03A2E; color:#FFF; border:none; border-radius:6px; margin-top:12px; }
.tips{ font-size:12px; color:#999; display:block; margin-top:8px; line-height:1.5; }
</style>
