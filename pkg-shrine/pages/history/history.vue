<!-- pkg-shrine/pages/history/history.vue – 家族史记时间轴（Sprint R14：蓝图 8.0 history/index，按年份分组+行内展开，接 event.list） -->
<template>
  <view class="history-page">
    <!-- 年份筛选（横滑，来源 events 已有年份） -->
    <scroll-view scroll-x class="year-bar">
      <view
        v-for="y in yearOptions"
        :key="y"
        class="year-chip"
        :class="{ active: yearFilter === y }"
        @click="setYear(y)"
      >
        <text>{{ y === 0 ? '全部' : y + ' 年' }}</text>
      </view>
    </scroll-view>

    <!-- 时间轴（年份节点 + 竖线 + 事件卡） -->
    <view v-if="groups.length === 0 && !loading" class="empty">
      <text>暂无史记记录，族史委可在后台发布大事记</text>
    </view>
    <view v-for="g in groups" :key="g.year" class="year-group">
      <view class="year-node">
        <view class="year-dot" />
        <text class="year-text">{{ g.year }}</text>
      </view>
      <view v-for="ev in g.events" :key="ev._id" class="timeline-item">
        <view class="item-card" @click="toggle(ev)">
          <text class="item-title">{{ ev.title }}</text>
          <text class="item-content" :class="{ expanded: expandedId === ev._id }">{{ ev.content }}</text>
          <view v-if="expandedId === ev._id && ev.images && ev.images.length" class="item-images">
            <text class="images-tip">📎 {{ ev.images.length }} 张配图（谱库查看）</text>
          </view>
          <text class="expand-tip">{{ expandedId === ev._id ? '收起' : '展开全文' }}</text>
        </view>
      </view>
    </view>

    <view v-if="hasMore && groups.length" class="load-more" @click="loadMore">
      <text>{{ loading ? '加载中…' : '更早的记录' }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { read } from '@/services/request';

interface EventItem { _id: string; title: string; content: string; year: number; images: string[] }
interface YearGroup { year: number; events: EventItem[] }

const groups = ref<YearGroup[]>([]);
const yearOptions = ref<number[]>([0]);
const yearFilter = ref(0);
const page = ref(1);
const hasMore = ref(false);
const loading = ref(false);
const expandedId = ref('');

function regroup(list: EventItem[]) {
  const map = new Map<number, EventItem[]>();
  for (const ev of list) {
    const y = ev.year || 0;
    if (!map.has(y)) map.set(y, []);
    map.get(y)!.push(ev);
  }
  groups.value = [...map.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, events]) => ({ year, events }));
  const years = [...map.keys()].filter(y => y > 0).sort((a, b) => b - a);
  yearOptions.value = [0, ...years];
}

async function fetchList(p = 1) {
  loading.value = true;
  try {
    const params: Record<string, any> = { action: 'list', page: p };
    if (yearFilter.value) params.year = yearFilter.value;
    const res = await read('event', params, null, 0);
    if (res.success && res.data) {
      const list = res.data.events || [];
      regroup(p === 1 ? list : flatAll().concat(list));
      hasMore.value = !!res.data.hasMore;
      page.value = p;
    }
  } finally {
    loading.value = false;
  }
}

function flatAll(): EventItem[] {
  return groups.value.flatMap(g => g.events);
}

function loadMore() {
  if (loading.value || !hasMore.value) return;
  fetchList(page.value + 1);
}

function setYear(y: number) {
  if (yearFilter.value === y) return;
  yearFilter.value = y;
  expandedId.value = '';
  fetchList(1);
}

function toggle(ev: EventItem) {
  expandedId.value = expandedId.value === ev._id ? '' : ev._id;
}

fetchList(1);
</script>

<style scoped>
.history-page { min-height: 100vh; background: #F7F6F3; padding: 16px 0 24px; }

.year-bar { white-space: nowrap; padding: 0 16px 12px; }
.year-chip { display: inline-block; background: #FFFFFF; border: 1px solid #EAE4D6; border-radius: 14px; padding: 6px 14px; margin-right: 8px; }
.year-chip text { font-size: 13px; color: #6E6659; }
.year-chip.active { background: #B03A2E; border-color: #B03A2E; }
.year-chip.active text { color: #FFFFFF; }

.year-group { padding: 0 16px; }
.year-node { display: flex; align-items: center; gap: 8px; margin: 8px 0; }
.year-dot { width: 10px; height: 10px; border-radius: 50%; background: #C9A063; }
.year-text { font-size: 18px; font-weight: 700; color: #2B2723; }

.timeline-item { position: relative; margin-left: 4px; padding-left: 18px; border-left: 2px solid #EAE4D6; padding-bottom: 12px; }
.item-card { background: #FFFFFF; border-radius: 12px; padding: 12px; box-shadow: 0 2px 12px rgba(38, 34, 30, 0.06); }
.item-title { font-size: 15px; font-weight: 600; color: #2B2320; display: block; }
.item-content { font-size: 13px; color: #6E6659; margin-top: 4px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.item-content.expanded { -webkit-line-clamp: unset; }
.item-images { margin-top: 8px; }
.images-tip { font-size: 12px; color: #C9A063; }
.expand-tip { font-size: 11px; color: #B0A99A; margin-top: 6px; display: block; }

.empty { text-align: center; color: #B0A99A; font-size: 13px; padding: 40px 16px; }
.load-more { text-align: center; padding: 12px; font-size: 13px; color: #8A8378; }
</style>
