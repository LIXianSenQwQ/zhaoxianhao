<template>
  <view class="visit-page">
    <view class="page-header">
      <text class="page-title">好友家园</text>
      <text class="page-subtitle">访问族人家园 · 每日 20 次</text>
    </view>

    <!-- 搜索好友 -->
    <view class="search-row">
      <input class="search-input" v-model="targetName" placeholder="输入族人姓名" maxlength="20" />
      <button class="search-btn" :disabled="!targetName.trim()" @tap="searchUser">搜索</button>
    </view>

    <!-- 搜索结果 -->
    <view v-if="resultMsg" class="result-card">
      <text class="result-text">{{ resultMsg }}</text>
      <button v-if="foundWorld && foundWorld.ownerOpenid" class="visit-btn" @tap="visitHome(foundWorld.ownerOpenid)">访问家园</button>
    </view>

    <!-- 互访记录 -->
    <view class="stats-section">
      <text class="section-title">今日互访次数：{{ visitCount }} / 20</text>
      <view class="history-log" v-for="(h, i) in visitHistory" :key="i">
        <text>{{ h.name || h.targetOpenid }}</text>
        <text class="log-time">{{ new Date(h.at).toLocaleTimeString() }}</text>
      </view>
    </view>

    <view class="comp-tip">
      <text class="comp-text">互访上限 20 次/天 · 零成本 · 仅用于家园互动与经验奖励</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { worldGet, worldVisit } from '@/services/home';
import { search } from '@/services/member';

const targetName = ref('');
const resultMsg = ref('');
const foundWorld = ref<any>(null);
const visitCount = ref(0);
const visitHistory = ref<Array<{ targetOpenid: string; name?: string; at: string }>>([]);

async function searchUser() {
  const name = targetName.value.trim();
  if (!name) return;
  resultMsg.value = '搜索中...';
  foundWorld.value = null;
  try {
    const res = await search(name);
    if (res.data && res.data.members && res.data.members.length) {
      const m = res.data.members[0];
      const worldRes = await worldGet(m.openid || m.linkedOpenid || m._id);
      if (worldRes.data && worldRes.data.world) {
        foundWorld.value = worldRes.data.world;
        resultMsg.value = `找到「${m.name}」的家园（Lv.${foundWorld.value.level}）`;
      } else {
        resultMsg.value = `「${m.name}」尚未创建家园`;
      }
    } else {
      resultMsg.value = '未找到该族人';
    }
  } catch (e: any) {
    resultMsg.value = '查询失败：' + (e.message || '');
  }
}

async function visitHome(targetOpenid: string) {
  if (!targetOpenid) return;
  try {
    const res = await worldVisit(targetOpenid);
    if (res.data && res.data.visits != null) {
      visitCount.value = (visitCount.value || 0) + 1;
      visitHistory.value.unshift({ targetOpenid, name: targetName.value, at: new Date().toISOString() });
      uni.showToast({ title: '访问成功', icon: 'success' });
    } else {
      uni.showToast({ title: res.error?.message || '访问失败', icon: 'none' });
    }
  } catch (e: any) {
    uni.showToast({ title: e.message || '访问失败', icon: 'none' });
  }
}
</script>

<style scoped>
.visit-page { flex: 1; min-height: 100vh; background: #FAF8F2; padding: 16px; box-sizing: border-box; }
.page-header { padding: 8px 0 12px; }
.page-title { display: block; font-size: 22px; font-weight: 700; color: #2B2723; }
.page-subtitle { display: block; font-size: 12px; color: #8A867F; margin-top: 4px; }
.search-row { display: flex; gap: 8px; margin-bottom: 12px; }
.search-input { flex: 1; background: #FFF; border: 1px solid #E8DFD0; border-radius: 8px; padding: 8px 12px; height: 40px; font-size: 14px; }
.search-btn { background: #B03A2E; color: #FFF; border-radius: 8px; min-width: 80px; font-size: 14px; }
.search-btn[disabled] { opacity: 0.5; }
.result-card { background: #FFF; border-radius: 12px; padding: 14px; margin-bottom: 12px; }
.result-text { display: block; font-size: 14px; color: #2B2723; margin-bottom: 8px; }
.visit-btn { background: #7FA8A0; color: #FFF; border-radius: 8px; font-size: 14px; }
.stats-section { background: #FFF; border-radius: 12px; padding: 14px; margin-bottom: 12px; }
.section-title { display: block; font-size: 15px; font-weight: 600; color: #2B2723; margin-bottom: 8px; }
.history-log { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #F3EFE6; font-size: 13px; color: #5A5348; }
.log-time { font-size: 11px; color: #B0A99C; }
.comp-tip { background: #FBF3E8; border-radius: 8px; padding: 8px 12px; text-align: center; }
.comp-text { font-size: 12px; color: #A8783B; }
</style>