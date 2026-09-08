<!-- pkg-family/pages/plaza/plaza.vue – 家族广场动态（Sprint R12：蓝图页面 plaza/index，接 plaza.list/publish/like） -->
<template>
  <view class="plaza-page">
    <!-- 导航入口（按角色） -->
    <view class="plaza-nav">
      <navigator url="/pkg-family/pages/tree/tree" class="nav-item">
        <text class="nav-icon">🌳</text>
        <text class="nav-label">族谱</text>
      </navigator>
      <navigator url="/pkg-family/pages/members/members" class="nav-item">
        <text class="nav-icon">👥</text>
        <text class="nav-label">族人</text>
      </navigator>
      <navigator url="/pkg-family/pages/kinship/kinship" class="nav-item">
        <text class="nav-icon">🔗</text>
        <text class="nav-label">关系</text>
      </navigator>
      <navigator url="/pkg-family/pages/branches/branches" class="nav-item" v-if="canBranch">
        <text class="nav-icon">📂</text>
        <text class="nav-label">分支</text>
      </navigator>
    </view>
    <!-- 发布框（≤3 步：输入 → 发布；蓝图 C.3） -->
    <BaseCard title="发布动态">
      <textarea
        class="publish-input"
        v-model="draft"
        :maxlength="5000"
        placeholder="记录家事、分享喜悦（≤5000 字）…"
        :auto-height="true"
      />
      <view class="publish-foot">
        <text class="char-count" :class="{ over: draft.length >= 4900 }">{{ draft.length }}/5000</text>
        <button class="btn-primary pub-btn" :disabled="!draft.trim() || publishing" @click="publish">
          {{ publishing ? '发布中…' : '发布' }}
        </button>
      </view>
    </BaseCard>

    <!-- 动态流（瀑布流列表，分页 20/页，publishAt 倒序，蓝图 C.5） -->
    <view v-if="posts.length === 0 && !loading" class="empty-wrap">
      <EmptyState desc="广场还没有动态，来发第一条吧。" />
    </view>
    <BaseCard v-for="p in posts" :key="p._id" class="post-card">
      <view class="post-head">
        <text class="post-author">{{ p.authorId === myId ? '我' : '族人 ' + p.authorId.slice(0, 6) }}</text>
        <text class="post-time">{{ fmtTime(p.publishAt) }}</text>
      </view>
      <text class="post-content">{{ p.content }}</text>
      <view class="post-foot">
        <view class="like-btn" :class="{ liked: p._liked }" @click="like(p)">
          <text>{{ p._liked ? '❤' : '♡' }} {{ p.stats?.like || 0 }}</text>
        </view>
      </view>
    </BaseCard>

    <view v-if="hasMore && posts.length" class="load-more" @click="loadMore">
      <text>{{ loading ? '加载中…' : '加载更多' }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { read, write } from '@/services/request';
import BaseCard from '@/components/common/BaseCard.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import { hasRole } from '@/utils/auth';

const PAGE = 20;
const posts = ref<any[]>([]);
const draft = ref('');
const publishing = ref(false);
const loading = ref(false);
const page = ref(1);
const hasMore = ref(true);
const myId = ref(uni.getStorageSync('openid') || '');
const userRole = ref<string>('VISITOR');

onMounted(async () => {
  try {
    const { data: userData } = await (uni as any).cloud.callFunction({ name: 'auth', data: { action: 'me' } });
    userRole.value = userData?.role || 'VISITOR';
  } catch {}
});

const canBranch = computed(() => ['BRANCH_HEAD', 'EDITOR', 'HISTORIAN', 'CHIEF'].includes(userRole.value));

function fmtTime(t: string) {
  if (!t) return '';
  const d = new Date(t);
  return isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}-${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

async function fetchPosts(p = 1) {
  loading.value = true;
  try {
    const res = await read('plaza', { action: 'list', filterPage: p }, null, 0);
    if (res.success && res.data) {
      const list = res.data.posts || [];
      posts.value = p === 1 ? list : posts.value.concat(list);
      hasMore.value = !!res.data.hasMore;
      page.value = p;
    } else if (res.code === 403) {
      uni.showToast({ title: '认证族人方可浏览广场', icon: 'none' });
    } else {
      uni.showToast({ title: res.message || '加载失败', icon: 'none' });
    }
  } finally {
    loading.value = false;
  }
}

function loadMore() {
  if (loading.value || !hasMore.value) return;
  fetchPosts(page.value + 1);
}

async function publish() {
  if (publishing.value || !draft.value.trim()) return;
  publishing.value = true;
  try {
    const res = await write('plaza', { action: 'publish', type: 'text', content: draft.value.trim() }, 'plaza.publish', String(Date.now()));
    if (res.success) {
      draft.value = '';
      uni.showToast({ title: '已发布', icon: 'success' });
      fetchPosts(1);
    } else {
      uni.showToast({ title: res.message || '发布失败', icon: 'none' });
    }
  } finally {
    publishing.value = false;
  }
}

/** 点赞：乐观更新 + 后台原子 +1（失败回滚） */
async function like(p: any) {
  if (p._liked || p._liking) return;
  p._liking = true;
  const prev = p.stats?.like || 0;
  p.stats = { ...(p.stats || {}), like: prev + 1 };
  p._liked = true;
  try {
    const res = await write('plaza', { action: 'like', postId: p._id }, 'plaza.like', p._id);
    if (!res.success) {
      p.stats = { ...(p.stats || {}), like: prev };
      p._liked = false;
      uni.showToast({ title: res.message || '点赞失败', icon: 'none' });
    }
  } catch (e) {
    p.stats = { ...(p.stats || {}), like: prev };
    p._liked = false;
  } finally {
    p._liking = false;
  }
}

fetchPosts(1);
</script>

<style scoped>
.plaza-page { min-height: 100vh; background: #F7F6F3; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.publish-input { width: 100%; min-height: 72px; box-sizing: border-box; background: #F7F4EC; border-radius: 8px; padding: 10px; font-size: 14px; }
.publish-foot { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; }
.char-count { font-size: 11px; color: #B0A99A; }
.char-count.over { color: #C0392B; }
.pub-btn { min-width: 88px; margin: 0; }
.post-card :deep(.card-body) { padding: 12px; }
.post-head { display: flex; justify-content: space-between; margin-bottom: 6px; }
.post-author { font-size: 14px; font-weight: 600; color: #2B2320; }
.post-time { font-size: 11px; color: #B0A99A; }
.post-content { font-size: 14px; color: #4A443C; line-height: 1.6; word-break: break-all; }
.post-foot { margin-top: 10px; display: flex; justify-content: flex-end; }
.like-btn { padding: 4px 12px; border-radius: 14px; background: #F7F4EC; font-size: 13px; color: #6E6659; }
.like-btn.liked { color: #B03A2E; background: #F9EDEB; }
.empty-wrap { padding-top: 48px; }
.load-more { text-align: center; padding: 10px; font-size: 13px; color: #8A8378; }
</style>
