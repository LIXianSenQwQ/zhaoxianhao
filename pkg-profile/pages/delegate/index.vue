<!--
  pkg-profile/pages/delegate/index.vue — 私密委托（蓝图 V1.1 §24.3）
  数据：auth.delegate.list → { delegates[{userId,scopes,nickName}], count }
  交互：
    · 展示我委托的代理人（≤3 名）与授权范围
    · 添加代理：输入被委托人 openid + 勾选授权范围 → auth.setDelegates（全量替换，短信码占位 '000000'）
    · 撤销代理：auth.revokeDelegate
-->
<template>
  <view class="delegate-page">
    <view class="intro-card">
      <text class="intro-t">私密委托</text>
      <text class="intro-b">当我无法亲自处理时，可委托信任的族人代理查看与操作授权范围内容。委托关系双向：被委托人需已是认证族人。</text>
    </view>

    <!-- 代理人列表 -->
    <view class="card" v-if="loading"><text class="placeholder">加载中…</text></view>
    <template v-else>
      <view class="card">
        <view class="card-hd">
          <text class="card-title">我的代理人（{{ delegates.length }}/3）</text>
        </view>
        <view v-if="!delegates.length" class="empty">
          <text class="empty-t">尚未设置委托</text>
          <text class="empty-s">添加信任族人作为您的代理人</text>
        </view>
        <view v-for="(d, i) in delegates" :key="d.userId + i" class="delegate-row">
          <view class="d-main">
            <text class="d-name">{{ d.nickName || d.userId }}</text>
            <text class="d-scopes">{{ scopeText(d.scopes) }}</text>
          </view>
          <view class="d-id">{{ d.userId.slice(0, 10) }}…</view>
          <text class="remove-btn" @click="removeDelegate(d.userId)">撤销</text>
        </view>
      </view>

      <!-- 添加委托 -->
      <view class="card add-card">
        <text class="card-title">添加代理人</text>
        <view class="field">
          <text class="field-label">被委托人 openid</text>
          <input class="field-input" v-model="form.userId" placeholder="输入认证族人的 openid" maxlength="64" />
        </view>
        <view class="field">
          <text class="field-label">授权范围</text>
          <view class="scope-chips">
            <view
              v-for="s in scopes"
              :key="s.id"
              class="scope-chip"
              :class="{ on: form.scopes.includes(s.id) }"
              @click="toggleScope(s.id)"
            >{{ s.label }}</view>
          </view>
        </view>
        <button class="add-btn" :disabled="saving || delegates.length >= 3" @click="addDelegate">
          {{ saving ? '提交中…' : (delegates.length >= 3 ? '代理人已达上限' : '确认委托') }}
        </button>
        <text class="tip">提交需短信验证（当前开发环境占位码 000000 自动通过）。</text>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { listDelegates, revokeDelegate, setDelegates } from '@/services/auth';

const scopes = [
  { id: 'PROFILE', label: '资料查看' },
  { id: 'AUDIT', label: '代审核' },
  { id: 'BACKUP', label: '备份管理' }
];

const delegates = ref<any[]>([]);
const loading = ref(true);
const saving = ref(false);
const form = ref({ userId: '', scopes: [] as string[] });

async function load() {
  loading.value = true;
  const res = await listDelegates();
  loading.value = false;
  if (res.data?.delegates) delegates.value = res.data.delegates;
}
onShow(load);

function scopeText(ids: string[]) {
  const map: Record<string, string> = { PROFILE: '资料查看', AUDIT: '代审核', BACKUP: '备份管理' };
  return (ids || []).map(id => map[id] || id).join('、') || '未设范围';
}
function toggleScope(id: string) {
  const i = form.value.scopes.indexOf(id);
  if (i >= 0) form.value.scopes.splice(i, 1); else form.value.scopes.push(id);
}

async function addDelegate() {
  if (!form.value.userId.trim()) return uni.showToast({ title: '请输入被委托人 openid', icon: 'none' });
  if (!form.value.scopes.length) return uni.showToast({ title: '请至少勾选一项授权范围', icon: 'none' });
  saving.value = true;
  const merged = [
    ...delegates.value.map(d => ({ userId: d.userId, scopes: d.scopes || [] })),
    { userId: form.value.userId.trim(), scopes: [...form.value.scopes] }
  ];
  const res = await setDelegates(merged);
  saving.value = false;
  if (res.error && !res.data) {
    uni.showToast({ title: (res.error as any)?.message || '委托失败', icon: 'none' });
  } else {
    uni.showToast({ title: '委托已生效', icon: 'success' });
    form.value = { userId: '', scopes: [] };
    load();
  }
}

async function removeDelegate(userId: string) {
  const res = await revokeDelegate(userId);
  if (res.error && !res.data) {
    uni.showToast({ title: (res.error as any)?.message || '撤销失败', icon: 'none' });
  } else {
    uni.showToast({ title: '已撤销委托', icon: 'success' });
    load();
  }
}
</script>

<style lang="scss" scoped>
.delegate-page { min-height: 100vh; background: #FAF8F2; padding: 16px 12px 32px; box-sizing: border-box; }
.intro-card { background: #EDF2EC; border-radius: 12px; padding: 14px 16px; margin-bottom: 12px; }
.intro-t { display: block; font-size: 14px; font-weight: 700; color: #2E6B46; margin-bottom: 6px; letter-spacing: 1px; }
.intro-b { font-size: 12px; color: #4A6A58; line-height: 1.8; }
.card { background: #FFF; border-radius: 12px; padding: 14px 16px; margin-bottom: 12px; box-shadow: 0 2px 12px rgba(38,34,30,.06); }
.card-hd { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; }
.card-title { font-size: 14px; font-weight: 700; color: #2B2723; }
.placeholder { font-size: 13px; color: #B0A99A; text-align: center; padding: 20px 0; display: block; }
.empty { text-align: center; padding: 26px 0 14px; }
.empty-t { display: block; font-size: 14px; font-weight: 600; color: #6E6659; }
.empty-s { display: block; font-size: 12px; color: #B0A99A; margin-top: 4px; }
.delegate-row {
  display: flex; align-items: center; gap: 8px;
  border-top: 1px dashed #EAE4D6; padding: 12px 0;
}
.d-main { flex: 1; min-width: 0; }
.d-name { display: block; font-size: 14px; font-weight: 600; color: #2B2723; }
.d-scopes { display: block; font-size: 11px; color: #8A6D3B; margin-top: 2px; }
.d-id { font-size: 11px; color: #B0A99A; flex-shrink: 0; }
.remove-btn { font-size: 12px; color: #B03A2E; flex-shrink: 0; }
.add-card .card-title { display: block; margin-bottom: 12px; }
.field { margin-bottom: 12px; }
.field-label { display: block; font-size: 12px; color: #6E6659; margin-bottom: 6px; }
.field-input { background: #FAF8F2; border-radius: 8px; padding: 10px; font-size: 13px; color: #2B2723; }
.scope-chips { display: flex; gap: 8px; flex-wrap: wrap; }
.scope-chip {
  padding: 6px 12px; border-radius: 6px; background: #F7F4EC; color: #8A7B5A; font-size: 12px;
  border: 1px solid transparent;
}
.scope-chip.on { background: #FBEEEC; color: #B03A2E; border-color: #E0B8B2; font-weight: 600; }
.add-btn { width: 100%; height: 42px; line-height: 42px; font-size: 14px; font-weight: 600; color: #FFF; background: #B03A2E; border-radius: 8px; padding: 0; }
.add-btn[disabled] { background: #D8A59D; }
.tip { display: block; font-size: 11px; color: #B0A99A; margin-top: 8px; line-height: 1.6; }
</style>
