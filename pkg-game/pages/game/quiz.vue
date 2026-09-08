<template>
  <view class="quiz-page">
    <view class="page-header">
      <view class="header-row">
        <view>
          <text class="page-title">百业问学</text>
          <text class="page-subtitle">族人出题 · 编辑审核 · 闯关积累</text>
        </view>
        <view class="header-ops">
          <button class="mini-btn" @tap="openCreate">出题</button>
          <button class="mini-btn ghost" @tap="openReview">待审</button>
        </view>
      </view>
    </view>

    <!-- 行业选择 -->
    <scroll-view scroll-x class="industry-scroll">
      <view class="industry-inner">
        <view
          v-for="ind in industries"
          :key="ind"
          class="ind-chip"
          :class="{ active: currentIndustry === ind }"
          @tap="selectIndustry(ind)"
        >
          <text>{{ ind }}</text>
        </view>
      </view>
    </scroll-view>

    <!-- 题目 -->
    <view v-if="question" class="question-card">
      <text class="q-industry">{{ currentIndustry }}</text>
      <text class="q-text">{{ question.question }}</text>
      <view
        v-for="(choice, i) in question.choices"
        :key="i"
        class="choice-row"
        :class="{ picked: selected === i }"
        @tap="selected = i"
      >
        <text class="choice-label">{{ String.fromCharCode(65 + i) }}</text>
        <text class="choice-text">{{ choice.text }}</text>
      </view>

      <view class="q-ops">
        <button class="q-submit" :disabled="selected == null" @tap="submit">确认</button>
      </view>

      <text v-if="resultMsg" class="q-result" :class="{ correct: resultCorrect }">{{ resultMsg }}</text>
      <text v-if="resultMsg && question.explanation" class="q-expl">{{ question.explanation }}</text>

      <button v-if="resultMsg" class="q-next" @tap="nextQuestion">下一题</button>
    </view>
    <view v-else-if="!loading" class="empty-box">
      <text>本行业暂无题目 —— 点右上「出题」贡献一道吧</text>
    </view>

    <!-- 出题浮层（族人共创 → 待审核） -->
    <view v-if="showCreate" class="mask" @tap="showCreate = false">
      <view class="sheet" @tap.stop>
        <text class="sheet-title">出道题（提交后待审核上架）</text>
        <input class="field" v-model="draft.question" placeholder="题目（必填）" maxlength="200" />
        <text class="opt-label">选项（至少 2 个）</text>
        <view v-for="(opt, i) in draft.choices" :key="i" class="choice-edit">
          <text class="choice-idx">{{ String.fromCharCode(65 + i) }}</text>
          <input class="field flex1" v-model="draft.choices[i].text" :placeholder="`选项 ${String.fromCharCode(65 + i)}`" maxlength="60" />
          <text class="pick-tag" :class="{ on: draft.correctIndex === i }" @tap="draft.correctIndex = i">
            {{ draft.correctIndex === i ? '✓ 答案' : '设为答案' }}
          </text>
        </view>
        <button v-if="draft.choices.length < 6" class="add-opt" @tap="draft.choices.push({ text: '' })">+ 添加选项</button>
        <input class="field" v-model="draft.explanation" placeholder="解析（选填）" maxlength="300" />
        <scroll-view scroll-x class="ind-scroll">
          <view class="ind-inner">
            <view v-for="ind in industries" :key="ind" class="ind-chip sm" :class="{ active: draft.industry === ind }" @tap="draft.industry = ind">
              <text>{{ ind }}</text>
            </view>
          </view>
        </scroll-view>
        <view class="sheet-ops">
          <button class="op-btn cancel" @tap="showCreate = false">取消</button>
          <button class="op-btn" :disabled="!canSubmit" @tap="submitCreate">提交</button>
        </view>
      </view>
    </view>

    <!-- 审核浮层（EDITOR+） -->
    <view v-if="showReview" class="mask" @tap="showReview = false">
      <view class="sheet" @tap.stop>
        <text class="sheet-title">待审题目（{{ pendingList.length }}）</text>
        <scroll-view scroll-y class="review-scroll">
          <view v-if="!pendingList.length" class="review-empty">暂无待审</view>
          <view v-for="q in pendingList" :key="q._id" class="review-item">
            <text class="review-q">[{{ q.industry }}] {{ q.question }}</text>
            <text class="review-ans">答案：{{ String.fromCharCode(65 + (q.correctIndex ?? 0)) }} · {{ q.choices[q.correctIndex]?.text }}</text>
            <text v-if="q.explanation" class="review-hint">解析：{{ q.explanation }}</text>
            <view class="review-ops">
              <button class="op-btn reject" @tap="review(q._id, false)">驳回</button>
              <button class="op-btn ok" @tap="review(q._id, true)">上架</button>
            </view>
          </view>
        </scroll-view>
      </view>
    </view>

    <view class="comp-tip">
      <text class="comp-text">知识问答纯娱乐 · 奖励仅家族积分 · 出题经编辑审核后上架</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useChildGuard } from '@/utils/child-guard.js';
import { quizList, quizAnswer, quizCreate, quizPending, quizApprove, quizReject } from '@/services/quiz';
useChildGuard();

const industries = ['百家', '农业', '商贾', '文教', '医道', '工造', '蚕桑', '茶艺'];
const currentIndustry = ref('百家');
const question = ref<any>(null);
const questions = ref<Array<any>>([]);
const selected = ref<number | null>(null);
const resultMsg = ref('');
const resultCorrect = ref(false);
const loading = ref(false);
let index = 0;

const showCreate = ref(false);
const showReview = ref(false);
const pendingList = ref<Array<any>>([]);
const draft = ref<{ question: string; choices: Array<{ text: string }>; correctIndex: number; industry: string; explanation: string }>({
  question: '', choices: [{ text: '' }, { text: '' }, { text: '' }, { text: '' }], correctIndex: 0, industry: '百家', explanation: ''
});
const canSubmit = computed(() => {
  const d = draft.value;
  const filled = d.choices.filter(c => c.text.trim()).length;
  return !!d.question.trim() && filled >= 2 && d.correctIndex >= 0 && d.correctIndex < filled;
});

onMounted(() => loadQuestions());

async function selectIndustry(ind: string) {
  if (currentIndustry.value === ind) return;
  currentIndustry.value = ind;
  await loadQuestions();
}

async function loadQuestions() {
  loading.value = true;
  resultMsg.value = '';
  selected.value = null;
  question.value = null;
  index = 0;
  try {
    const res = await quizList(currentIndustry.value, 1);
    questions.value = res.data?.questions || [];
    if (questions.value.length) question.value = questions.value[0];
  } catch (e: any) {
    uni.showToast({ title: e.message || '获取题目失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
}

async function submit() {
  if (!question.value || selected.value == null) return;
  try {
    const res = await quizAnswer(question.value._id, selected.value);
    if (res.data && res.data.correct != null) {
      resultCorrect.value = res.data.correct;
      if (res.data.already) resultMsg.value = res.data.correct ? '这题你已答对过啦 🎉' : '这题你已经答过啦';
      else resultMsg.value = res.data.correct ? `回答正确！+${res.data.score || 15} 分 🎉` : '回答错误，请看解析';
    } else {
      uni.showToast({ title: res.error?.message || '提交失败', icon: 'none' });
    }
  } catch (e: any) {
    uni.showToast({ title: e.message || '提交失败', icon: 'none' });
  }
}

function nextQuestion() {
  if (!questions.value.length) return;
  index = (index + 1) % questions.value.length;
  question.value = questions.value[index];
  selected.value = null;
  resultMsg.value = '';
  resultCorrect.value = false;
}

function openCreate() {
  draft.value = { question: '', choices: [{ text: '' }, { text: '' }, { text: '' }, { text: '' }], correctIndex: 0, industry: currentIndustry.value, explanation: '' };
  showCreate.value = true;
}

async function submitCreate() {
  const d = draft.value;
  const filled = d.choices.filter(c => c.text.trim());
  try {
    const res = await quizCreate({
      question: d.question.trim(),
      choices: filled.map(c => ({ text: c.text.trim() })),
      correctIndex: d.correctIndex,
      industry: d.industry,
      explanation: d.explanation.trim()
    });
    if (!res.error && res.data?.question) {
      uni.showToast({ title: '已提交，待编辑审核上架', icon: 'none' });
      showCreate.value = false;
    } else {
      uni.showToast({ title: res.error?.message || '提交失败', icon: 'none' });
    }
  } catch (e: any) {
    uni.showToast({ title: e.message || '提交失败', icon: 'none' });
  }
}

async function openReview() {
  showReview.value = true;
  pendingList.value = [];
  try {
    const res = await quizPending(1);
    pendingList.value = res.data?.questions || [];
  } catch (e: any) {
    uni.showToast({ title: e.message || '获取待审失败', icon: 'none' });
  }
}

async function review(id: string, approve: boolean) {
  try {
    const res = approve ? await quizApprove(id) : await quizReject(id);
    if (!res.error && res.data?.status) {
      uni.showToast({ title: approve ? '已上架 ✓' : '已驳回', icon: 'none' });
      pendingList.value = pendingList.value.filter(x => x._id !== id);
      if (approve && pendingList.value.some(x => x.industry === currentIndustry.value)) loadQuestions();
    } else {
      uni.showToast({ title: res.error?.message || '操作失败', icon: 'none' });
    }
  } catch (e: any) {
    uni.showToast({ title: e.message || '操作失败', icon: 'none' });
  }
}
</script>

<style scoped>
.quiz-page { flex: 1; min-height: 100vh; background: #FAF8F2; padding: 16px; box-sizing: border-box; }
.page-header { padding: 8px 0 12px; }
.header-row { display: flex; align-items: flex-start; justify-content: space-between; }
.page-title { display: block; font-size: 22px; font-weight: 700; color: #2B2723; }
.page-subtitle { display: block; font-size: 12px; color: #8A867F; margin-top: 4px; }
.header-ops { display: flex; gap: 8px; }
.mini-btn { background: #B03A2E; color: #FFF; border-radius: 14px; font-size: 12px; padding: 2px 14px; line-height: 2; margin: 0; }
.mini-btn.ghost { background: #F3EDE3; color: #6E6659; }

.industry-scroll { white-space: nowrap; margin-bottom: 10px; }
.industry-inner { display: inline-flex; gap: 8px; padding: 2px 0; }
.ind-chip { padding: 6px 14px; border: 1px solid #E0D9CB; border-radius: 16px; font-size: 13px; color: #5A5348; background: #FFF; }
.ind-chip.active { background: #B03A2E; border-color: #B03A2E; color: #FFF; }
.ind-chip.sm { padding: 4px 10px; font-size: 12px; }
.ind-scroll { white-space: nowrap; margin-bottom: 10px; }
.ind-inner { display: inline-flex; gap: 6px; padding: 2px 0; }

.question-card { background: #FFF; border-radius: 14px; padding: 18px 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
.q-industry { background: #F3EDE3; color: #6E6659; border-radius: 4px; padding: 2px 8px; font-size: 12px; }
.q-text { display: block; font-size: 16px; font-weight: 600; color: #2B2723; line-height: 1.6; margin: 10px 0 14px; }
.choice-row { display: flex; align-items: center; gap: 10px; padding: 12px 10px; border: 1px solid #EEE7DA; border-radius: 10px; margin-bottom: 8px; }
.choice-row.picked { border-color: #B03A2E; background: #FDF2F0; }
.choice-label { width: 22px; height: 22px; border-radius: 50%; background: #F3EDE3; text-align: center; line-height: 22px; font-size: 12px; color: #6E6659; }
.choice-text { flex: 1; font-size: 14px; color: #2B2723; }
.q-ops { margin-top: 6px; }
.q-submit { background: #B03A2E; color: #FFF; border-radius: 8px; width: 100%; }
.q-submit[disabled] { opacity: 0.5; }
.q-result { display: block; text-align: center; font-weight: 700; margin-top: 12px; font-size: 15px; }
.q-result.correct { color: #3E8E5A; }
.q-result:not(.correct) { color: #B03A2E; }
.q-expl { display: block; margin-top: 8px; font-size: 13px; color: #8A867F; background: #FBF9F4; padding: 8px 10px; border-radius: 8px; }
.q-next { margin-top: 12px; background: #7FA8A0; color: #FFF; border-radius: 8px; width: 100%; }
.empty-box { background: #FFF; border-radius: 12px; padding: 40px 0; text-align: center; color: #B0A99C; font-size: 14px; }

.mask { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: flex-end; z-index: 99; }
.sheet { width: 100%; background: #FFF; border-radius: 18px 18px 0 0; padding: 18px 16px 26px; box-sizing: border-box; max-height: 84vh; display: flex; flex-direction: column; }
.sheet-title { font-size: 16px; font-weight: 700; color: #2B2723; margin-bottom: 12px; }
.field { background: #F7F4EC; border-radius: 8px; padding: 10px 12px; height: 40px; font-size: 14px; margin-bottom: 10px; }
.flex1 { flex: 1; }
.opt-label { font-size: 13px; color: #8A867F; margin: 2px 0 6px; }
.choice-edit { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.choice-idx { width: 20px; text-align: center; font-weight: 700; color: #6E6659; }
.pick-tag { font-size: 11px; color: #8A867F; background: #F3EDE3; border-radius: 10px; padding: 4px 8px; }
.pick-tag.on { background: #3E8E5A; color: #FFF; }
.add-opt { background: #F3EDE3; color: #6E6659; border-radius: 8px; font-size: 13px; margin-bottom: 10px; }
.sheet-ops { display: flex; gap: 10px; margin-top: 4px; }
.op-btn { background: #7FA8A0; color: #FFF; border-radius: 8px; font-size: 13px; flex: 1; }
.op-btn.cancel { background: #D9D2C5; }
.op-btn.reject { background: #E5B8AE; color: #7A2E24; }
.op-btn.ok { background: #7FA8A0; }
.op-btn[disabled] { opacity: 0.5; }
.review-scroll { max-height: 56vh; }
.review-empty { text-align: center; color: #B0A99C; padding: 30px 0; font-size: 14px; }
.review-item { border: 1px solid #EEE7DA; border-radius: 10px; padding: 10px 12px; margin-bottom: 10px; }
.review-q { display: block; font-size: 15px; font-weight: 600; color: #2B2723; }
.review-ans { display: block; margin-top: 4px; font-size: 13px; color: #7A2E24; }
.review-hint { display: block; font-size: 12px; color: #8A867F; margin-top: 2px; }
.review-ops { display: flex; gap: 10px; margin-top: 10px; }
.comp-tip { background: #FBF3E8; border-radius: 8px; padding: 8px 12px; margin-top: 14px; text-align: center; }
.comp-text { font-size: 12px; color: #A8783B; }
</style>
