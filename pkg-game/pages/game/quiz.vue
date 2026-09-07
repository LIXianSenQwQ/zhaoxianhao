<template>
  <view class="quiz-page">
    <view class="page-header">
      <text class="page-title">百业问学</text>
      <text class="page-subtitle">行业知识问答 · 闯关积累</text>
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
      <text>本行业暂无题目，敬请期待</text>
    </view>

    <view class="comp-tip">
      <text class="comp-text">知识问答纯娱乐 · 奖励仅家族积分</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useChildGuard } from '@/utils/child-guard.js';
import { quizList, quizAnswer } from '@/services/quiz';
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
      resultMsg.value = res.data.correct ? `回答正确！+${res.data.score || 15} 分 🎉` : '回答错误，请看解析';
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
</script>

<style scoped>
.quiz-page { flex: 1; min-height: 100vh; background: #FAF8F2; padding: 16px; box-sizing: border-box; }
.page-header { padding: 8px 0 12px; }
.page-title { display: block; font-size: 22px; font-weight: 700; color: #2B2723; }
.page-subtitle { display: block; font-size: 12px; color: #8A867F; margin-top: 4px; }
.industry-scroll { margin: 0 -16px 12px; padding: 0 16px; }
.industry-inner { display: flex; gap: 8px; padding-bottom: 4px; }
.ind-chip { flex-shrink: 0; background: #FFF; border: 1px solid #E8DFD0; border-radius: 16px; padding: 6px 14px; font-size: 13px; color: #5A5348; }
.ind-chip.active { background: #B03A2E; border-color: #B03A2E; color: #FFF; }
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
.comp-tip { background: #FBF3E8; border-radius: 8px; padding: 8px 12px; margin-top: 14px; text-align: center; }
.comp-text { font-size: 12px; color: #A8783B; }
</style>