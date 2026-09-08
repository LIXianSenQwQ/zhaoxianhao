<!-- pkg-growth/pages/entry-submit/entry-submit.vue — 入谱申请（框架 §4.5 六类入谱前端入口） -->
<template>
  <view class="entry-page">
    <scroll-view scroll-y class="form-scroll">
      <!-- ① 入谱类型（框架 §4.5；迁出走分支迁徙，不在此受理） -->
      <BaseCard>
        <text class="sec-title">① 入谱类型</text>
        <view class="kind-grid">
          <view
            v-for="k in kindOptions"
            :key="k.key"
            :class="['kind-chip', { active: form.entryKind === k.key }]"
            @tap="form.entryKind = k.key"
          >
            <text class="kind-label">{{ k.label }}</text>
            <text class="kind-desc">{{ k.desc }}</text>
          </view>
        </view>
        <text class="kind-note">迁出/支系整体迁徙请走「分支管理 · 迁徙」流程</text>
      </BaseCard>

      <!-- ② 基本信息（§3.1 成员实体；谱名 = 郝 + 字辈 + 名，提交后自动生成） -->
      <BaseCard>
        <text class="sec-title">② 基本信息</text>
        <view class="field">
          <text class="label">本名 <text class="req">*</text></text>
          <input class="input" v-model="form.name" placeholder="入谱成员本名" maxlength="20" />
        </view>
        <view class="field-row">
          <view class="field half">
            <text class="label">性别 <text class="req">*</text></text>
            <picker :range="genderLabels" @change="onGenderPick">
              <view class="input picker">{{ genderLabels[form.gender] || '请选择' }}</view>
            </picker>
          </view>
          <view class="field half">
            <text class="label">世代数 <text class="req">*</text></text>
            <input class="input" type="number" v-model="generationText" placeholder="自始祖起算" />
          </view>
        </view>
        <view class="field">
          <text class="label">所属支谱 <text class="req">*</text></text>
          <picker :range="branchNames" @change="onBranchPick">
            <view class="input picker">{{ pickedBranchLabel || '请选择支谱' }}</view>
          </picker>
        </view>
        <view class="field-row">
          <view class="field half">
            <text class="label">出生日期</text>
            <picker mode="date" @change="(e: any) => form.birthDate = e.detail.value">
              <view class="input picker">{{ form.birthDate || '公历' }}</view>
            </picker>
          </view>
          <view class="field half">
            <text class="label">出生地</text>
            <input class="input" v-model="form.birthPlace" placeholder="行政区划或村名" />
          </view>
        </view>
        <view class="field">
          <text class="label">父代（已入谱时可选，用于自动挂接）</text>
          <input class="input" v-model="fatherIdText" placeholder="父代成员ID（族史委可代填）" />
        </view>
      </BaseCard>

      <!-- ③ 证明材料（按 entryKind 强制，与后端 validateEntryKind 同口径） -->
      <BaseCard v-if="needProof">
        <text class="sec-title">③ 证明材料</text>
        <view class="field" v-if="form.entryKind === 'MIGRATION_IN'">
          <text class="label">原分支编码 <text class="req">*</text></text>
          <input class="input" v-model="form.sourceBranchCode" placeholder="如 HAO-0000-01（原支谱编码）" />
        </view>
        <view class="field">
          <text class="label">证明来源标注 <text class="req">*</text></text>
          <input class="input" v-model="form.proofSourceTag" placeholder="如「民国十二年东汪郝氏谱·卷首」/「过继文书·赵县档案馆」" />
        </view>
      </BaseCard>

      <!-- ④ 证据标注（框架 §3.2 元数据规范：来源标注率 100%） -->
      <BaseCard>
        <text class="sec-title">④ 证据标注</text>
        <view class="field">
          <text class="label">来源标注（顿号分隔，至少 1 条）</text>
          <input class="input" v-model="sourceTagsText" placeholder="清光绪《赵州志》、口述·郝某某（2024）" />
        </view>
        <view class="field">
          <text class="label">置信度：{{ confidenceLabel }}</text>
          <view class="conf-row">
            <view
              v-for="n in 5"
              :key="n"
              :class="['conf-star', { on: n <= (form.confidence || 0) }]"
              @tap="form.confidence = n"
            >★</view>
          </view>
          <text class="conf-hint">5=碑刻原件/官方档案 · 3=口述一致 · 1=存疑传说</text>
        </view>
      </BaseCard>

      <view class="submit-wrap">
        <button class="submit-btn" :disabled="submitting" @tap="onSubmit">
          {{ submitting ? '提交中…' : '提交入谱申请' }}
        </button>
        <text class="flow-hint">提交后：初审 → 复审（双人审核）→ 公示期 → 生效入谱</text>
      </view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import BaseCard from '@/components/common/BaseCard.vue';
import { submitEntry, ENTRY_KIND_LABELS, type EntryKind } from '@/services/entry';
import { listAll } from '@/services/branch';
import { matchGen } from '@/services/generation';

// ─── 表单状态（与 entry.validatePayload/validateEntryKind 字段一一对应） ───
const form = ref({
  entryKind: 'NEWBORN' as EntryKind,
  name: '',
  gender: '' as '' | 'MALE' | 'FEMALE',
  generation: null as number | null,
  branchId: '',
  birthDate: '',
  birthPlace: '',
  fatherId: '',
  sourceBranchCode: '',
  proofSourceTag: '',
  sourceTags: [] as string[],
  confidence: 0
});
const generationText = ref('');
const fatherIdText = ref('');
const sourceTagsText = ref('');
const submitting = ref(false);

const kindOptions = (Object.keys(ENTRY_KIND_LABELS) as EntryKind[]).map((key) => ({
  key,
  label: ENTRY_KIND_LABELS[key],
  desc: { NEWBORN: '本支新生儿/新增族人', MIGRATION_IN: '自他支迁入，需原支证明', ADOPTION: '过继/收养入谱', RETURN: '失联回归认祖归宗' }[key]
}));

const genderLabels = ['请选择', '男', '女'];
const genderMap: Record<string, 'MALE' | 'FEMALE'> = { 男: 'MALE', 女: 'FEMALE' };

// ─── 分支选择器（branch.list 三级谱系） ───
const branches = ref<{ code: string; name: string; level: number }[]>([]);
const branchNames = computed(() => branches.value.map((b) => `${b.name}（${b.code}）`));
const pickedBranchLabel = computed(() => {
  const b = branches.value.find((x) => x.code === form.value.branchId);
  return b ? `${b.name}（${b.code}）` : '';
});

const needProof = computed(() => form.value.entryKind !== 'NEWBORN');

const confidenceLabel = computed(() => {
  const m: Record<number, string> = { 5: '确凿无疑', 4: '高度可信', 3: '基本可信', 2: '有待考证', 1: '存疑' };
  return form.value.confidence ? `${form.value.confidence}★ ${m[form.value.confidence]}` : '未评级';
});

function onGenderPick(e: any) {
  const label = genderLabels[Number(e.detail.value)] || '';
  form.value.gender = (genderMap[label] || '') as '' | 'MALE' | 'FEMALE';
}

function onBranchPick(e: any) {
  const b = branches.value[Number(e.detail.value)];
  if (b) form.value.branchId = b.code;
}

// ─── 校验（前端先行，后端二次校验兜底） ───
function validate(): string | null {
  const f = form.value;
  if (!f.name.trim()) return '请填写本名';
  const gen = Number(generationText.value);
  if (!Number.isInteger(gen) || gen < 1) return '世代数须为正整数';
  f.generation = gen;
  if (!f.branchId) return '请选择所属支谱';
  if (f.entryKind === 'MIGRATION_IN' && !f.sourceBranchCode.trim()) return '迁入入谱需填写原分支编码';
  if (needProof.value && !f.proofSourceTag.trim()) return `${ENTRY_KIND_LABELS[f.entryKind]}需填写证明来源标注`;
  return null;
}

async function onSubmit() {
  if (submitting.value) return;
  const err = validate();
  if (err) return uni.showToast({ title: err, icon: 'none' });

  // 字辈对齐预检（§5.1 alignCheck 前端提示，不阻断——族史委审核为准）
  submitting.value = true;
  try {
    const payload: any = {
      branchId: form.value.branchId,
      name: form.value.name.trim(),
      generation: form.value.generation,
      gender: form.value.gender || 'UNKNOWN',
      birthDate: form.value.birthDate || undefined,
      birthPlace: form.value.birthPlace.trim() || undefined,
      fatherId: fatherIdText.value.trim() || undefined,
      entryKind: form.value.entryKind,
      proofSourceTag: form.value.proofSourceTag.trim() || undefined,
      sourceBranchCode: form.value.sourceBranchCode.trim() || undefined,
      sourceTags: sourceTagsText.value.split(/[、,，;；]/).map((s) => s.trim()).filter(Boolean).slice(0, 20),
      confidence: form.value.confidence || undefined
    };
    const res = await submitEntry(payload);
    if (res.error) throw new Error(res.error.message || '提交失败');

    // 非阻塞字辈预检：提示审核人复核（R35 alignCheck 语义前移）
    matchGen(payload.generation)
      .then((m: any) => {
        if (m.data && m.data.valid === false) {
          uni.showToast({ title: '已提交（字辈与世代表存在偏差，审核时请复核）', icon: 'none', duration: 2500 });
        }
      })
      .catch(() => {});

    uni.showModal({
      title: '提交成功',
      content: '工单已进入审核队列，可在「审核工作台」查看进度。',
      showCancel: false,
      success: () => uni.navigateBack()
    });
  } catch (e: any) {
    uni.showToast({ title: e.message || '提交失败，请稍后重试', icon: 'none' });
  } finally {
    submitting.value = false;
  }
}

onMounted(async () => {
  try {
    const res = await listAll();
    if (res.data?.items) {
      // 只允许挂到支谱/分谱（level≥2）；总谱为索引层
      branches.value = (res.data.items as any[]).filter((b) => b.level >= 2 && b.status === 'ACTIVE');
    }
  } catch {
    /* 分支加载失败不阻断填写（提交时后端校验 branchId） */
  }
});
</script>

<style scoped>
.entry-page { flex: 1; display: flex; flex-direction: column; }
.form-scroll { flex: 1; background: #F7F6F3; padding-bottom: 32px; }

.sec-title { font-size: 14px; font-weight: 700; color: #2B2320; display: block; margin-bottom: 10px; }
.req { color: #C44D4D; }

/* ① 类型选择 */
.kind-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.kind-chip { width: calc(50% - 4px); box-sizing: border-box; border: 1px solid #E4DFD3; border-radius: 10px; padding: 10px 12px; background: #FAF9F5; }
.kind-chip.active { border-color: #7A9A5F; background: #EAF2E2; }
.kind-label { font-size: 13px; font-weight: 600; color: #2B2320; display: block; }
.kind-chip.active .kind-label { color: #5A7A3F; }
.kind-desc { font-size: 10px; color: #8A8378; display: block; margin-top: 2px; }
.kind-note { font-size: 10px; color: #B0A99A; display: block; margin-top: 8px; }

/* ② 表单域 */
.field { margin-bottom: 12px; }
.field-row { display: flex; gap: 10px; }
.field.half { flex: 1; }
.label { font-size: 12px; color: #6B6459; display: block; margin-bottom: 4px; }
.input { background: #FFF; border: 1px solid #E4DFD3; border-radius: 8px; padding: 9px 12px; font-size: 13px; color: #2B2320; width: 100%; box-sizing: border-box; }
.input.picker { color: #2B2320; }

/* ④ 置信度 */
.conf-row { display: flex; gap: 6px; padding: 4px 0; }
.conf-star { font-size: 24px; color: #E4DFD3; line-height: 1.2; }
.conf-star.on { color: #D9A441; }
.conf-hint { font-size: 10px; color: #B0A99A; display: block; margin-top: 4px; }

/* 提交 */
.submit-wrap { padding: 4px 16px 16px; }
.submit-btn { background: #7A9A5F; color: #FFF; font-size: 15px; font-weight: 600; border-radius: 12px; line-height: 2.6; }
.submit-btn[disabled] { opacity: 0.6; }
.flow-hint { font-size: 10px; color: #8A8378; text-align: center; display: block; margin-top: 8px; }
</style>
