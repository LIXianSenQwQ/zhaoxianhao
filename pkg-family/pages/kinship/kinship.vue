<!-- pkg-family/pages/kinship/kinship.vue – 称谓计算（Sprint R11：蓝图页面 relation/calc，两人称谓+五服） -->
<template>
  <view class="kinship-page">
    <BaseCard title="称谓计算">
      <text class="desc">选择两位族人，计算相互称谓与五服等第（蓝图 7.2 / 7.3 口径）。</text>

      <member-slot
        label="本人（A）"
        :picked="aPick"
        :results="aResults"
        :searching="aSearching"
        :open="aOpen"
        @tap="aOpen = true; bOpen = false"
        @search="kw => doSearch('a', kw)"
        @pick="p => { aPick = p; aOpen = false; }"
      />
      <member-slot
        label="对方（B）"
        :picked="bPick"
        :results="bResults"
        :searching="bSearching"
        :open="bOpen"
        @tap="bOpen = true; aOpen = false"
        @search="kw => doSearch('b', kw)"
        @pick="p => { bPick = p; bOpen = false; }"
      />

      <button class="btn-primary calc-btn" :disabled="!aPick || !bPick || aPick._id === bPick._id || loading" @click="calc">
        {{ loading ? '计算中…' : '计算称谓' }}
      </button>
      <text v-if="aPick && bPick && aPick._id === bPick._id" class="warn">A 与 B 为同一人，请重新选择。</text>
    </BaseCard>

    <BaseCard v-if="result" :title="resultTitle">
      <view class="res-grid">
        <view class="res-item">
          <text class="res-label">称谓（A 看对方）</text>
          <text class="res-value" :class="result.fiveFu === '同宗' ? 'muted' : 'accent'">{{ result.formalTitle }}</text>
        </view>
        <view class="res-item">
          <text class="res-label">辈分差</text>
          <text class="res-value small">{{ seniorityText(result) }}</text>
        </view>
        <view class="res-item">
          <text class="res-label">五服等第</text>
          <text class="res-value" :class="result.fiveFu === '同宗' ? 'muted' : 'accent'">{{ result.fiveFu || '不同宗' }}</text>
        </view>
        <view class="res-item" v-if="result.related">
          <text class="res-label">世系距离</text>
          <text class="res-value small">A 上溯 {{ result.upSteps }} 代 · 祖先下溯 B {{ result.downSteps }} 代</text>
        </view>
      </view>
      <view class="fu-bar" v-if="result.related && result.fiveFu">
        <view
          v-for="seg in FU_SEGMENTS"
          :key="seg.name"
          class="fu-seg"
          :class="{ active: result.fiveFu === seg.name }"
          :style="{ background: seg.color }"
        >
          <text>{{ seg.name }}</text>
        </view>
      </view>
      <text v-if="!result.related" class="warn">两位族人分属不同世系支，按「同宗」处理（fail-closed 口径）。</text>
    </BaseCard>

    <EmptyState v-if="searchFailed" desc="称谓计算失败，请稍后重试或联系管理员。" />
  </view>
</template>

<script setup lang="ts">
import { ref, computed, defineComponent, h } from 'vue';
import { read } from '@/services/request';
import BaseCard from '@/components/common/BaseCard.vue';
import EmptyState from '@/components/common/EmptyState.vue';

const aPick = ref<any>(null);
const bPick = ref<any>(null);
const aResults = ref<any[]>([]);
const bResults = ref<any[]>([]);
const aSearching = ref(false);
const bSearching = ref(false);
const aOpen = ref(false);
const bOpen = ref(false);
const result = ref<any>(null);
const loading = ref(false);
const searchFailed = ref(false);

/** 辈分差文案（蓝图 7.2 口径：seniorityDiff 优先，其次按上下溯步数推导；复杂逻辑不进模板表达式） */
function seniorityText(r: any): string {
  if (!r) return '—';
  if (r.seniorityDiff) return String(r.seniorityDiff);
  if (r.upSteps == null) return '—';
  if (r.upSteps > r.downSteps) return '高出' + (r.upSteps - r.downSteps) + '代';
  if (r.upSteps < r.downSteps) return '低出' + (r.downSteps - r.upSteps) + '代';
  return '同代';
}

const resultTitle = computed(() =>
  `计算结果（${aPick.value?.name ?? '?'} → ${bPick.value?.name ?? '?'}）`
);

/** 五服着色（蓝图 7.3 五色 + 出五服灰） */
const FU_SEGMENTS = [
  { name: '斩衰', color: '#B03A2E' },
  { name: '齐衰', color: '#C9A063' },
  { name: '大功', color: '#D9A441' },
  { name: '小功', color: '#7FA8A0' },
  { name: '缌麻', color: '#3A4A56' },
  { name: '出五服', color: '#999999' }
];

/** 成员搜索（蓝图 member.search L2；防抖 300ms） */
let searchTimer: any = null;
function doSearch(side: 'a' | 'b', kw: string) {
  clearTimeout(searchTimer);
  if (!kw || kw.trim().length < 1) {
    if (side === 'a') aResults.value = [];
    else bResults.value = [];
    return;
  }
  searchTimer = setTimeout(async () => {
    if (side === 'a') aSearching.value = true;
    else bSearching.value = true;
    try {
      const res = await read('member', { action: 'search', keyword: kw.trim() }, null, 0);
      const list = (res.success && res.data && res.data.results) || [];
      if (side === 'a') aResults.value = list.slice(0, 5);
      else bResults.value = list.slice(0, 5);
    } catch (e) { /* 静默 */ } finally {
      aSearching.value = false;
      bSearching.value = false;
    }
  }, 300);
}

async function calc() {
  if (loading.value || !aPick.value || !bPick.value) return;
  loading.value = true;
  searchFailed.value = false;
  try {
    const res = await read('relation', { action: 'calc', aId: aPick.value._id, bId: bPick.value._id }, null, 0);
    if (res.success && res.data) {
      result.value = res.data;
    } else {
      uni.showToast({ title: res.message || res.error?.message || '计算失败', icon: 'none' });
    }
  } catch (e: any) {
    searchFailed.value = true;
  } finally {
    loading.value = false;
  }
}

/** 内嵌成员选择槽（搜索输入 + 结果行 + 已选回显，复用两处） */
const MemberSlot = defineComponent({
  name: 'MemberSlot',
  props: {
    label: String,
    picked: Object,
    results: Array,
    searching: Boolean,
    open: Boolean
  },
  emits: ['tap', 'search', 'pick'],
  setup(props, { emit }) {
    const kw = ref('');
    return () =>
      h('view', { class: 'pick-row', onClick: () => emit('tap') }, [
        h('text', { class: 'pick-label' }, props.label || ''),
        props.picked
          ? h('view', { class: 'picked' }, [
              h('text', { class: 'picked-name' }, `${props.picked.name}（${props.picked.generation ?? '?'} 世）`),
              h('text', { class: 'picked-change' }, '重选')
            ])
          : props.open
            ? h('view', { class: 'search-box' }, [
                h('input', {
                  class: 'search-input',
                  placeholder: '输入姓名搜索',
                  onInput: (e: any) => { kw.value = e.detail.value; emit('search', kw.value); }
                }),
                props.searching ? h('text', { class: 'searching' }, '搜索中…') : null,
                ...((props.results || []) as any[]).map(r =>
                  h('view', { class: 'result-row', key: r._id, onClick: (e: any) => { e.stopPropagation(); emit('pick', r); } }, [
                    h('text', { class: 'result-name' }, `${r.name}（${r.generation ?? '?'} 世）`)
                  ])
                )
              ])
            : h('text', { class: 'pick-hint' }, '点击搜索并选择族人')
      ]);
  }
});
</script>

<style scoped>
.kinship-page { min-height: 100vh; background: #F7F6F3; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.desc { font-size: 13px; color: #8A8378; display: block; margin-bottom: 12px; }
.pick-row { margin-bottom: 12px; background: #F7F4EC; border-radius: 8px; padding: 12px; }
.pick-label { font-size: 14px; color: #2B2320; display: block; margin-bottom: 6px; font-weight: 500; }
.pick-hint { font-size: 12px; color: #B0A99A; }
.picked { display: flex; align-items: center; justify-content: space-between; }
.picked-name { font-size: 15px; color: #2B2320; font-weight: 600; }
.picked-change { font-size: 12px; color: #B03A2E; }
.search-box { margin-top: 6px; }
.search-input { width: 100%; box-sizing: border-box; padding: 8px 10px; border-radius: 6px; background: #FFF; font-size: 14px; }
.searching { font-size: 11px; color: #B0A99A; margin-top: 4px; display: block; }
.result-row { padding: 8px 6px; border-bottom: 1px solid #EAE4D6; }
.result-row:last-child { border-bottom: none; }
.result-name { font-size: 14px; color: #2B2320; }
.calc-btn { margin-top: 8px; }
.warn { font-size: 12px; color: #C0392B; margin-top: 8px; display: block; }

.res-grid { display: flex; flex-wrap: wrap; gap: 12px; }
.res-item { flex: 1 1 45%; background: #F7F4EC; border-radius: 8px; padding: 12px; }
.res-label { font-size: 12px; color: #6E6659; display: block; margin-bottom: 4px; }
.res-value { font-size: 20px; font-weight: 700; display: block; }
.res-value.small { font-size: 14px; font-weight: 400; }
.res-value.accent { color: #B03A2E; }
.res-value.muted { color: #999999; }

/* 五服色带（蓝图 7.3 五色 + 同宗灰） */
.fu-bar { display: flex; gap: 4px; margin-top: 14px; }
.fu-seg { flex: 1; padding: 8px 0; border-radius: 6px; text-align: center; opacity: 0.35; }
.fu-seg text { color: #FFF; font-size: 11px; }
.fu-seg.active { opacity: 1; font-weight: 600; }
</style>
