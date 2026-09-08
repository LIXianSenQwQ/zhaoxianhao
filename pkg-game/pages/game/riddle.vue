<template>
  <view class="riddle-page">
    <view class="page-header">
      <view class="header-row">
        <view>
          <text class="page-title">家族灯谜会</text>
          <text class="page-subtitle">族人出题 · 编辑审核 · 无现金奖池</text>
        </view>
        <view class="header-ops">
          <button class="mini-btn" @tap="showCreate = true">出题</button>
          <button class="mini-btn ghost" @tap="openReview">待审</button>
        </view>
      </view>
    </view>

    <!-- 猜谜 -->
    <view v-if="currentRiddle" class="riddle-card">
      <view class="riddle-meta">
        <text class="riddle-cat">{{ currentRiddle.category || '通用' }}</text>
        <text class="riddle-diff">难度 ★{{ currentRiddle.difficulty || 1 }}</text>
        <text class="riddle-solved" v-if="currentRiddle.solvedCount">已解 {{ currentRiddle.solvedCount }}</text>
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
      <text>暂无进行中的灯谜 —— 点右上「出题」抛一个谜面吧</text>
    </view>

    <view class="ops" v-if="currentRiddle">
      <button class="op-btn" @tap="loadNext">下一谜</button>
    </view>

    <!-- 出题浮层（族人共创） -->
    <view v-if="showCreate" class="mask" @tap="showCreate = false">
      <view class="sheet" @tap.stop>
        <text class="sheet-title">出个灯谜（提交后待审核上架）</text>
        <input class="field" v-model="draft.question" placeholder="谜面（必填）" maxlength="100" />
        <input class="field" v-model="draft.answer" placeholder="谜底（必填，审核可见）" maxlength="40" />
        <input class="field" v-model="draft.hint" placeholder="提示（选填）" maxlength="100" />
        <input class="field" v-model="draft.category" placeholder="类别（选填，如 字谜/成语/节气）" maxlength="12" />
        <view class="diff-row">
          <text class="diff-label">难度</text>
          <text v-for="n in 5" :key="n" class="star" :class="{ on: n <= (draft.difficulty || 1) }" @tap="draft.difficulty = n">★</text>
        </view>
        <view class="sheet-ops">
          <button class="op-btn cancel" @tap="showCreate = false">取消</button>
          <button class="op-btn" :disabled="!draft.question.trim() || !draft.answer.trim()" @tap="submitCreate">提交</button>
        </view>
      </view>
    </view>

    <!-- 审核浮层（EDITOR+） -->
    <view v-if="showReview" class="mask" @tap="showReview = false">
      <view class="sheet" @tap.stop>
        <text class="sheet-title">待审灯谜（{{ pendingList.length }}）</text>
        <scroll-view scroll-y class="review-scroll">
          <view v-if="!pendingList.length" class="review-empty">暂无待审</view>
          <view v-for="r in pendingList" :key="r._id" class="review-item">
            <text class="review-q">{{ r.question }}</text>
            <text class="review-ans">谜底：{{ r.answer }}</text>
            <text v-if="r.hint" class="review-hint">提示：{{ r.hint }}</text>
            <view class="review-ops">
              <button class="op-btn reject" @tap="review(r._id, false)">驳回</button>
              <button class="op-btn ok" @tap="review(r._id, true)">上架</button>
            </view>
          </view>
        </scroll-view>
      </view>
    </view>

    <view class="comp-tip">
      <text class="comp-text">灯谜为家族娱乐内容 · 无现金奖池 · 出题经编辑审核后上架</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useChildGuard } from '@/utils/child-guard.js';
import { riddleList, riddleAnswer, riddleCreate, riddlePending, riddleApprove, riddleReject } from '@/services/riddle';
useChildGuard();

const riddles = ref<Array<any>>([]);
const currentRiddle = ref<any>(null);
const guess = ref('');
const resultMsg = ref('');
const resultCorrect = ref(false);
const showHint = ref(false);
const loading = ref(false);
let index = 0;

const showCreate = ref(false);
const draft = ref<{ question: string; answer: string; hint: string; category: string; difficulty: number }>({
  question: '', answer: '', hint: '', category: '', difficulty: 1
});
const showReview = ref(false);
const pendingList = ref<Array<any>>([]);

onMounted(loadRiddles);

async function loadRiddles() {
  loading.value = true;
  try {
    const res = await riddleList(1);
    riddles.value = res.data?.riddles || [];
    index = 0;
    currentRiddle.value = riddles.value.length ? riddles.value[0] : null;
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
  resetAnswer();
}

function toggleHint() {
  showHint.value = !showHint.value;
}

function resetAnswer() {
  guess.value = '';
  resultMsg.value = '';
  resultCorrect.value = false;
  showHint.value = false;
}

async function submitAnswer() {
  if (!currentRiddle.value || !guess.value.trim()) return;
  try {
    const res = await riddleAnswer(currentRiddle.value._id, guess.value.trim());
    if (res.data && res.data.correct != null) {
      resultCorrect.value = res.data.correct;
      if (res.data.already) resultMsg.value = '这一谜你已答对过啦 🎉';
      else resultMsg.value = res.data.correct ? `答对了！+${res.data.score || 10} 分 🎉` : '再想想，继续加油';
    } else {
      uni.showToast({ title: res.error?.message || '提交失败', icon: 'none' });
    }
  } catch (e: any) {
    uni.showToast({ title: e.message || '提交失败', icon: 'none' });
  }
}

async function submitCreate() {
  try {
    const res = await riddleCreate({
      question: draft.value.question.trim(),
      answer: draft.value.answer.trim(),
      hint: draft.value.hint.trim(),
      category: draft.value.category.trim(),
      difficulty: draft.value.difficulty
    });
    if (!res.error && res.data?.riddle) {
      uni.showToast({ title: '已提交，待编辑审核上架', icon: 'none' });
      showCreate.value = false;
      draft.value = { question: '', answer: '', hint: '', category: '', difficulty: 1 };
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
    const res = await riddlePending(1);
    pendingList.value = res.data?.riddles || [];
  } catch (e: any) {
    uni.showToast({ title: e.message || '获取待审失败', icon: 'none' });
  }
}

async function review(id: string, approve: boolean) {
  try {
    const res = approve ? await riddleApprove(id) : await riddleReject(id);
    if (!res.error && res.data?.status) {
      uni.showToast({ title: approve ? '已上架 ✓' : '已驳回', icon: 'none' });
      pendingList.value = pendingList.value.filter(x => x._id !== id);
      if (approve) loadRiddles();
    } else {
      uni.showToast({ title: res.error?.message || '操作失败', icon: 'none' });
    }
  } catch (e: any) {
    uni.showToast({ title: e.message || '操作失败', icon: 'none' });
  }
}
</script>

<style scoped>
.riddle-page { flex: 1; min-height: 100vh; background: #FAF8F2; padding: 16px; box-sizing: border-box; }
.page-header { padding: 8px 0 12px; }
.header-row { display: flex; align-items: flex-start; justify-content: space-between; }
.page-title { display: block; font-size: 22px; font-weight: 700; color: #2B2723; }
.page-subtitle { display: block; font-size: 12px; color: #8A867F; margin-top: 4px; }
.header-ops { display: flex; gap: 8px; }
.mini-btn { background: #B03A2E; color: #FFF; border-radius: 14px; font-size: 12px; padding: 2px 14px; line-height: 2; margin: 0; }
.mini-btn.ghost { background: #F3EDE3; color: #6E6659; }

.riddle-card { background: #FFF; border-radius: 14px; padding: 20px 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
.riddle-meta { display: flex; gap: 8px; margin-bottom: 10px; align-items: center; }
.riddle-cat { background: #F3EDE3; color: #6E6659; border-radius: 4px; padding: 2px 8px; font-size: 12px; }
.riddle-diff { background: #FBE9E5; color: #B03A2E; border-radius: 4px; padding: 2px 8px; font-size: 12px; }
.riddle-solved { background: #E8F1EC; color: #3E8E5A; border-radius: 4px; padding: 2px 8px; font-size: 12px; }
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
.op-btn { background: #7FA8A0; color: #FFF; border-radius: 8px; font-size: 13px; flex: 1; }
.op-btn.cancel { background: #D9D2C5; }
.op-btn.reject { background: #E5B8AE; color: #7A2E24; }
.op-btn.ok { background: #7FA8A0; }
.empty-box { background: #FFF; border-radius: 12px; padding: 40px 0; text-align: center; color: #B0A99C; font-size: 14px; }

.mask { position: fixed; inset: 0; background: rgba(0,0,0,0.45); display: flex; align-items: flex-end; z-index: 99; }
.sheet { width: 100%; background: #FFF; border-radius: 18px 18px 0 0; padding: 18px 16px 26px; box-sizing: border-box; max-height: 82vh; display: flex; flex-direction: column; }
.sheet-title { font-size: 16px; font-weight: 700; color: #2B2723; margin-bottom: 12px; }
.field { background: #F7F4EC; border-radius: 8px; padding: 10px 12px; height: 40px; font-size: 14px; margin-bottom: 10px; }
.diff-row { display: flex; align-items: center; gap: 4px; margin-bottom: 12px; }
.diff-label { font-size: 13px; color: #8A867F; margin-right: 6px; }
.star { font-size: 20px; color: #E0D9CB; }
.star.on { color: #D9A441; }
.sheet-ops { display: flex; gap: 10px; }
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
