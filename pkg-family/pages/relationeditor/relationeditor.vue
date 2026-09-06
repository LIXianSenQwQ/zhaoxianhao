<!-- pkg-family/pages/relationeditor/relationeditor.vue – L4 关系变更（Sprint R16：蓝图 8.0 relationeditor/index + 7.6/7.7 修谱变更工单） -->
<template>
  <view class="page">
    <view class="header">
      <text class="title">关系变更</text>
      <text class="sub">提交修谱变更工单 · 双人审核通过后生效</text>
    </view>

    <view v-if="loading" class="card">
      <view v-for="i in 5" :key="i" class="skeleton-line" />
    </view>

    <view v-else-if="err" class="card error">
      <text>{{ err }}</text>
    </view>

    <view v-else-if="result?.code === 200" class="card ok">
      <text>工单已提交：{{ result.recordId }}</text>
      <button size="small" @click="resetForm">重新提交</button>
    </view>

    <view v-else class="card form">
      <view class="field">
        <label>申请人成员编号</label>
        <input type="number" placeholder="如：m-1" v-model="fromId" />
      </view>
      <view class="field">
        <label>被申请人成员编号</label>
        <input type="number" placeholder="如：m-2" v-model="toId" />
      </view>
      <view class="field">
        <label>关系类型</label>
        <picker :range="types" range-key="label" @change="(e:any)=>{ typeIdx=e.detail.value; }">
          <view class="select">{{ types[typeIdx].label || '请选择' }}</view>
        </picker>
      </view>
      <view class="field">
        <label>子类型（可选）</label>
        <input type="text" placeholder="继养/初婚/再婚等" v-model="subType" maxlength="50" />
      </view>
      <view class="field">
        <label>备注说明（审计用）</label>
        <textarea placeholder="变更原因或依据材料说明" v-model="note" maxlength="200" />
      </view>
      <button :loading="submitting" type="primary" @click="submit">提交工单</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { write, read } from '@/services/request';

const types = [
  { label: '父子/母子', value: 'PARENT_CHILD' },
  { label: '配偶', value: 'SPOUSE' },
  { label: '兄弟/姐妹', value: 'SIBLING' },
  { label: '过继', value: 'ADOPTED' },
  { label: '师徒', value: 'MENTOR' }
];
const typeIdx = ref(0);
const fromId = ref('');
const toId = ref('');
const subType = ref('');
const note = ref('');
const loading = ref(false);
const submitting = ref(false);
const result = ref<any>(null);
const err = ref('');

async function submit() {
  if (!fromId.value || !toId.value) return uni.showToast({ title: '请填两个成员编号', icon: 'none' });
  if (fromId.value === toId.value) return uni.showToast({ title: '不能对同一成员建立关系', icon: 'none' });
  if (!types[typeIdx.value]) return uni.showToast({ title: '请选择关系类型', icon: 'none' });
  loading.value = true; err.value = ''; result.value = null; submitting.value = true;
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
      result.value = { code: 200, recordId: res.data.recordId };
      uni.showToast({ title: '工单已提交', icon: 'success' });
    } else {
      err.value = res.message || '提交失败';
    }
  } catch (e: any) {
    err.value = e.message || '网络错误';
  } finally {
    loading.value = false; submitting.value = false;
  }
}

function resetForm() {
  result.value = null; err.value = ''; fromId.value = ''; toId.value = ''; subType.value = ''; note.value = '';
}
</script>

<style scoped>
.page { background: #F7F4EC; min-height: 100vh; padding: 16px; }
.header { padding: 16px; text-align: center; margin-bottom: 12px; background: linear-gradient(165deg,#FDFCF8 0%,#F5F1E6 45%,#EDF2EC 100%); border-radius: 12px; }
.title { font-size: 24px; font-weight: 700; color: #2B2723; display: block; }
.sub { font-size: 13px; color: #6E6659; margin-top: 6px; display: block; }
.card { background: #FFFFFF; border-radius: 12px; padding: 16px; box-shadow: 0 2px 12px rgba(38,34,30,0.06); margin-bottom: 12px; }
.skeleton-line { height: 14px; background: #F5F1E6; margin-bottom: 12px; border-radius: 4px; width: calc(100% - var(--w,0)); }
.field { margin: 14px 0; }
.label { font-size: 14px; color: #2B2723; display: block; margin-bottom: 6px; }
input { width: 100%; padding: 10px 12px; border: 1px solid #EAE4D6; border-radius: 8px; font-size: 14px; box-sizing: border-box; background: #FAF8F2; }
.select { width: 100%; padding: 10px 12px; border: 1px solid #EAE4D6; border-radius: 8px; font-size: 14px; background: #FAF8F2; }
textarea { width: 100%; padding: 10px 12px; border: 1px solid #EAE4D6; border-radius: 8px; font-size: 14px; line-height: 1.6; box-sizing: border-box; background: #FAF8F2; min-height: 80px; resize: none; }
.error { color: #B03A2E; font-size: 14px; line-height: 1.6; }
.ok { color: #2E7D32; text-align: center; line-height: 1.8; }
button { width: 100%; margin-top: 24px; height: 44px; font-size: 16px; background: linear-gradient(135deg,#D4B06A 0%,#C9A063 50%,#B8924F 100%); color: #FFF; border-radius: 8px; border: none; }
</style>
