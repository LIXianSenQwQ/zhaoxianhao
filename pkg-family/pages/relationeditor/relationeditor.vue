<!-- pkg-family/pages/relationeditor/relationeditor.vue – L4 关系变更（Sprint R16：蓝图 8.0 relationeditor/index + 7.6/7.7 修谱变更工单） -->
<template>
  <view class="page">
    <view class="header">
      <text class="title">关系变更</text>
      <text class="sub">提交修谱变更工单 · 双人审核通过并公示后生效</text>
    </view>

    <view v-if="!user.isLoggedIn" class="card">
      <EmptyState text="请先登录后再发起关系变更" />
    </view>

    <view v-else-if="!user.isAdmin" class="card">
      <EmptyState text="关系维护需编辑（EDITOR）及以上角色（蓝图 9.1 L4）" />
    </view>

    <view v-else class="card form">
      <view class="field">
        <text class="label">申请人成员编号</text>
        <input type="text" placeholder="如：m-1" v-model="fromId" />
      </view>
      <view class="field">
        <text class="label">被申请人成员编号</text>
        <input type="text" placeholder="如：m-2" v-model="toId" />
      </view>
      <view class="field">
        <text class="label">关系类型（蓝图 5.3）</text>
        <picker :range="types" range-key="label" @change="onTypeChange">
          <view class="select">{{ typeIdx >= 0 ? types[typeIdx].label : '请选择' }}</view>
        </picker>
      </view>
      <view class="field">
        <text class="label">子类型（可选）</text>
        <input type="text" placeholder="继养/初婚/再婚等" v-model="subType" maxlength="50" />
      </view>
      <view class="field">
        <text class="label">备注说明（审计用）</text>
        <textarea placeholder="变更原因或依据材料说明" v-model="note" maxlength="200" />
      </view>
      <button :loading="submitting" type="primary" @click="submit">提交工单</button>
      <text class="tip">工单将进入双人审核链：初审（支系）→ 复审（族史委 2 人）→ 公示 7 天 → APPROVED 生效</text>
    </view>

    <view v-if="err" class="card error">
      <text>{{ err }}</text>
    </view>

    <view v-if="result" class="card ok">
      <text class="ok-title">工单已提交</text>
      <text class="ok-id">工单号：{{ result.recordId }}</text>
      <button size="mini" @click="resetForm">继续提交</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { write } from '@/services/request';
import { useUserStore } from '@/stores/user';
import EmptyState from '@/components/common/EmptyState.vue';

const user = useUserStore();

const types = [
  { label: '父子/母子', value: 'PARENT_CHILD' },
  { label: '配偶', value: 'SPOUSE' },
  { label: '兄弟/姐妹', value: 'SIBLING' },
  { label: '过继', value: 'ADOPTED' },
  { label: '师徒', value: 'MENTOR' }
];
const typeIdx = ref(-1);
const fromId = ref('');
const toId = ref('');
const subType = ref('');
const note = ref('');
const submitting = ref(false);
const result = ref<{ recordId: string } | null>(null);
const err = ref('');

// R17：memberDetail 入口带入 memberId 预填申请人
onLoad((q: any = {}) => {
  if (q.memberId) fromId.value = String(q.memberId);
});

function onTypeChange(e: any) {
  typeIdx.value = Number(e.detail?.value ?? -1);
}

async function submit() {
  if (!fromId.value.trim() || !toId.value.trim()) {
    return uni.showToast({ title: '请填两个成员编号', icon: 'none' });
  }
  if (fromId.value.trim() === toId.value.trim()) {
    return uni.showToast({ title: '不能对同一成员建立关系', icon: 'none' });
  }
  if (typeIdx.value < 0 || !types[typeIdx.value]) {
    return uni.showToast({ title: '请选择关系类型', icon: 'none' });
  }
  err.value = ''; result.value = null; submitting.value = true;
  try {
    const res = await write('relation', {
      action: 'edit',
      fromId: fromId.value.trim(),
      toId: toId.value.trim(),
      type: types[typeIdx.value].value,
      subType: subType.value.trim(),
      note: note.value.trim()
    });
    if (res.success && res.data?.recordId) {
      result.value = { recordId: res.data.recordId };
      uni.showToast({ title: '工单已提交', icon: 'success' });
    } else {
      err.value = res.message || '提交失败';
    }
  } catch (e: any) {
    err.value = e.message || '网络错误';
  } finally {
    submitting.value = false;
  }
}

function resetForm() {
  result.value = null; err.value = ''; fromId.value = ''; toId.value = ''; subType.value = ''; note.value = ''; typeIdx.value = -1;
}
</script>

<style scoped>
.page { background: #F7F4EC; min-height: 100vh; padding: 16px; }
.header { padding: 20px 16px; text-align: center; margin-bottom: 12px; background: linear-gradient(165deg, #FDFCF8 0%, #F5F1E6 45%, #EDF2EC 100%); border-radius: 12px; }
.title { font-size: 22px; font-weight: 700; color: #2B2723; display: block; }
.sub { font-size: 12px; color: #6E6659; margin-top: 6px; display: block; }
.card { background: #FFFFFF; border-radius: 12px; padding: 16px; box-shadow: 0 2px 12px rgba(38, 34, 30, 0.06); margin-bottom: 12px; }
.field { margin: 14px 0; }
.label { font-size: 14px; color: #2B2723; display: block; margin-bottom: 6px; }
input { width: 100%; padding: 10px 12px; border: 1px solid #EAE4D6; border-radius: 8px; font-size: 14px; box-sizing: border-box; background: #FAF8F2; }
.select { width: 100%; padding: 10px 12px; border: 1px solid #EAE4D6; border-radius: 8px; font-size: 14px; box-sizing: border-box; background: #FAF8F2; color: #2B2723; }
textarea { width: 100%; padding: 10px 12px; border: 1px solid #EAE4D6; border-radius: 8px; font-size: 14px; line-height: 1.6; box-sizing: border-box; background: #FAF8F2; min-height: 80px; }
.tip { display: block; font-size: 11px; color: #B0A99A; margin-top: 12px; line-height: 1.6; text-align: center; }
.error { color: #B03A2E; font-size: 14px; line-height: 1.6; }
.ok { text-align: center; }
.ok-title { font-size: 16px; font-weight: 700; color: #2E7D32; display: block; }
.ok-id { font-size: 13px; color: #6E6659; margin: 8px 0 12px; display: block; }
button { background: linear-gradient(135deg, #D4B06A 0%, #C9A063 50%, #B8924F 100%); color: #FFFFFF; border: none; }
.form button { width: 100%; margin-top: 24px; height: 44px; font-size: 16px; border-radius: 8px; }
</style>
