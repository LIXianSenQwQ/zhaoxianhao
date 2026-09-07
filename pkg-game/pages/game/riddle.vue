<template>
  <view class="riddle-page">
    <view class="page-header">
      <text class="page-title">家族灯谜会</text>
      <text class="page-subtitle">题库 · 节庆灯谜 · 房支对抗</text>
    </view>

    <!-- 谜面 -->
    <view v-if="currentRiddle" class="riddle-card">
      <view class="riddle-meta">
        <text class="riddle-cat">{{ currentRiddle.category || '通用' }}</text>
        <text class="riddle-diff">难度 ★{{ currentRiddle.difficulty || 1 }}</text>
      </view>
      <text class="riddle-question">{{ currentRiddle.question }}</text>
      <text v-if="showHint && currentRiddle.hint" class="riddle-hint">提示：{{ currentRiddle.hint }}</text>

      <view class="answer-row">
        <input class="answer-input" v-model="guess" placeholder="输入你的谜底" maxlength="20" />
        <button class="answer-btn" :disabled="!guess.trim()" @tap="submitAnswer">作答</button>
      </view>
      <button class="hint-btn" @tap="toggleHint">{{ showHint ? '隐藏提示' : '查看提示' }}</button>

      <text v-if="resultMsg" class="result-msg" :class="{ correct: resultCorrect }">{{ resultMsg }}</text>
    </view>
    <view v-else-if="!loading && !riddles.length" class="empty-box">
      <text>暂无进行中的灯谜，晚点再来看看</text>
    </view>

    <!-- 操作 -->
    <view class="ops" v-if="currentRiddle">
      <button class="op-btn" @tap="loadNext">下一谜</button>
    </view>

    <view class="comp-tip">
      <text class="comp-text">灯谜为家族娱乐内容 · 无现金奖池 · 奖励仅家族积分</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useChildGuard } from '@/utils/child-guard.js';
import { riddleList, riddleAnswer } from '@/services/riddle';
useChildGuard();

const riddles = ref<Array<any>>([]);
const currentRiddle = ref<any>(null);
const guess = ref('');
const resultMsg = ref('');
const resultCorrect = ref(false);
const showHint = ref(false);
const loading = ref(false);
let index = 0;

onMounted(loadRiddles);

async function loadRiddles() {
  loading.value = true;
  try {
    const res = await riddleList(1);
    riddles.value = res.data?.riddles || [];
    index = 0;
    if (riddles.value.length) currentRiddle.value = riddles.value[0];
  } catch (e: any) {
    uni.showToast({ title: e.message || '获取灯谜失败', icon: 'none' });
  } finally {
    loading.value = false;
  }
}

function loadNext() {
  if (!riddles.value.length) return;
  index = (index + 1) % riddles.value.length;
  currentRiddle.value = riddles.value[index];
  guess.value = '';
  resultMsg.value = '';
  resultCorrect.value = false;
  showHint.value = false;
}

function toggleHint() {
  showHint.value = !showHint.value;
}

async function submitAnswer() {
  if (!currentRiddle.value || !guess.value.trim()) return;
  try {
    const res = await riddleAnswer(currentRiddle.value._id, guess.value.trim());
    if (res.data && res.data.correct != null) {
      resultCorrect.value = res.data.correct;
      resultMsg.value = res.data.correct ? `答对了！+${res.data.score || 10} 分 🎉` : '再想想，继续加油';
    } else {
      uni.showToast({ title: res.error?.message || '提交失败', icon: 'none' });
    }
  } catch (e: any) {
    uni.showToast({ title: e.message || '提交失败', icon: 'none' });
  }
}
</script>

<style scoped>
.riddle-page { flex: 1; min-height: 100vh; background: #FAF8F2; padding: 16px; box-sizing: border-box; }
.page-header { padding: 8px 0 12px; }
.page-title { display: block; font-size: 22px; font-weight: 700; color: #2B2723; }
.page-subtitle { display: block; font-size: 12px; color: #8A867F; margin-top: 4px; }
.riddle-card { background: #FFF; border-radius: 14px; padding: 20px 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
.riddle-meta { display: flex; gap: 8px; margin-bottom: 10px; }
.riddle-cat { background: #F3EDE3; color: #6E6659; border-radius: 4px; padding: 2px 8px; font-size: 12px; }
.riddle-diff { background: #FBE9E5; color: #B03A2E; border-radius: 4px; padding: 2px 8px; font-size: 12px; }
.riddle-question { display: block; font-size: 18px; font-weight: 600; color: #2B2723; line-height: 1.6; margin: 6px 0 12px; }
.riddle-hint { display: block; font-size: 13px; color: #A8783B; background: #FBF3E8; border-radius: 6px; padding: 8px 10px; margin-bottom: 12px; }
.answer-row { display: flex; gap: 8px; margin-top: 8px; }
.answer-input { flex: 1; background: #F7F4EC; border-radius: 8px; padding: 8px 12px; height: 40px; font-size: 14px; }
.answer-btn { background: #B03A2E; color: #FFF; border-radius: 8px; min-width: 88px; font-size: 14px; }
.answer-btn[disabled] { opacity: 0.5; }
.hint-btn { margin-top: 10px; background: #F3EDE3; color: #6E6659; border-radius: 6px; font-size: 13px; width: 100%; }
.result-msg { display: block; margin-top: 12px; font-size: 14px; font-weight: 600; text-align: center; }
.result-msg.correct { color: #3E8E5A; }
.result-msg:not(.correct) { color: #B03A2E; }
.ops { margin-top: 12px; }
.op-btn { background: #7FA8A0; color: #FFF; border-radius: 8px; width: 100%; }
.empty-box { background: #FFF; border-radius: 12px; padding: 40px 0; text-align: center; color: #B0A99C; font-size: 14px; }
.comp-tip { background: #FBF3E8; border-radius: 8px; padding: 8px 12px; margin-top: 14px; text-align: center; }
.comp-text { font-size: 12px; color: #A8783B; }
</style>