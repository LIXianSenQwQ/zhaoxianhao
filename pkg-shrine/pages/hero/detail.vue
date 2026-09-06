<!-- pkg-shrine/pages/hero/detail.vue – 英烈事迹详情（Sprint R18：蓝图 8.0 hero/detail，数据源 member.getDetail deeds/motto/heroNote） -->
<template>
  <view class="page">
    <view v-if="loading" class="card">
      <Skeleton rows="6" />
    </view>

    <view v-else-if="err" class="card error">
      <text>{{ err }}</text>
      <button size="mini" @click="loadDetail">重试</button>
    </view>

    <template v-else-if="m">
      <!-- 英烈牌位卡 -->
      <view class="card memorial">
        <view class="name-row">
          <text class="name">{{ m.genealogyName || m.name || '英烈' }}</text>
          <text v-if="m.generation" class="gen">第{{ m.generation }}世</text>
        </view>
        <view v-if="m.birthDate || m.deathDate" class="dates">
          <text v-if="m.birthDate">{{ m.birthDate }}</text>
          <text v-if="m.birthDate && m.deathDate"> ── </text>
          <text v-if="m.deathDate">{{ m.deathDate }}</text>
          <text v-if="m.lifespan" class="lifespan">（享年 {{ m.lifespan }}）</text>
        </view>
        <view class="flower-row">
          <text class="flower-count">{{ worshipCount }}</text>
          <text class="flower-label">献花</text>
          <view class="flower-btn" @click="doFlower">
            <text>🌸 献花致敬</text>
          </view>
        </view>
      </view>

      <!-- 英烈事迹（朱砂左条） -->
      <view v-if="m.heroNote" class="card hero-card">
        <text class="section-title hero-title">英烈事迹</text>
        <text class="hero-text">{{ m.heroNote }}</text>
      </view>

      <!-- 善行事迹 -->
      <view v-if="m.deeds && m.deeds.length" class="card">
        <text class="section-title">生平事迹</text>
        <view v-for="(d, i) in m.deeds" :key="i" class="deed">
          <view class="deed-head">
            <text class="deed-title">{{ d.title || '事迹' }}</text>
            <text v-if="d.date" class="deed-date">{{ d.date }}</text>
          </view>
          <text v-if="d.desc" class="deed-desc">{{ d.desc }}</text>
        </view>
      </view>

      <!-- 家风家训 -->
      <view v-if="m.motto" class="card">
        <text class="section-title">家风家训</text>
        <view class="motto-card">
          <text class="motto-text">{{ m.motto }}</text>
        </view>
      </view>

      <!-- 留言板（R21: content.sendMessage + listMessages，蓝图 8.0） -->
      <view class="card">
        <text class="section-title">缅怀留言</text>
        <view class="msg-input-row">
          <input
            v-model="msgDraft"
            class="msg-input"
            placeholder="写一段缅怀的话（1-500 字）"
            maxlength="500"
            confirm-type="send"
            @confirm="doSendMessage"
          />
          <button size="mini" class="msg-send" :disabled="sending || !msgDraft.trim()" @click="doSendMessage">发送</button>
        </view>
        <view v-if="messages.length" class="msg-list">
          <view v-for="(msg, i) in messages" :key="msg._id || i" class="msg-item" :class="{ pending: msg.status === 'PENDING' }">
            <view class="msg-head">
              <text class="msg-author">{{ msg.authorName || '族人' }}</text>
              <text v-if="msg.status === 'PENDING'" class="msg-status">待审核</text>
              <text class="msg-time">{{ shortTime(msg.publishAt) }}</text>
            </view>
            <text class="msg-content">{{ msg.content }}</text>
          </view>
        </view>
        <view v-else-if="!msgLoading" class="msg-empty">
          <text class="msg-empty-text">暂无留言，写下第一条缅怀吧</text>
        </view>
        <button v-if="msgHasMore" size="mini" plain class="msg-more" @click="loadMessages(msgPage + 1)">加载更多</button>
      </view>

      <!-- 无内容空态 -->
      <view v-if="!m.heroNote && !(m.deeds && m.deeds.length) && !m.motto" class="card">
        <EmptyState text="暂无详细事迹，待族史委补充" />
      </view>

      <text class="page-tip">献花需认证族人（MEMBER+）· 留言经审核后展示</text>
    </template>

    <view v-else class="card">
      <EmptyState text="族人不存在" />
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { read, write } from '@/services/request';
import Skeleton from '@/components/common/Skeleton.vue';
import EmptyState from '@/components/common/EmptyState.vue';

const loading = ref(true);
const err = ref('');
const m = ref<any>(null);
const worshipCount = ref(0);
let memberId = '';

// R21: 留言板相关
const msgDraft = ref('');
const sending = ref(false);
const messages = ref<any[]>([]);
const msgLoading = ref(false);
const msgPage = ref(1);
const msgHasMore = ref(false);

onLoad((q: any = {}) => {
  memberId = String(q.memberId || q.id || '');
  if (!memberId) {
    err.value = '缺少族人编号';
    loading.value = false;
    return;
  }
  loadDetail();
  loadMessages(1); // 初页加载留言
});

async function loadDetail() {
  loading.value = true; err.value = ''; m.value = null;
  try {
    const res = await read('member', { action: 'getDetail', memberId }, `heroDetail:${memberId}`, 5 * 60 * 1000);
    if (res.success && res.data?.member) {
      m.value = res.data.member;
      worshipCount.value = m.value.worshipCount || 0;
    } else if (!res.success && res.code === 403 && res.needAuthCard) {
      // 英烈公开级可读（蓝图 6.3），403 视为不存在
      err.value = res.message || '该资料需授权查看';
    } else {
      err.value = res.message || '加载失败';
    }
  } catch (e: any) {
    err.value = e.message || '网络错误';
  } finally {
    loading.value = false;
  }
}

/** 献花：ceremony.worship type=flower（MEMBER+，按日幂等；复用 R15 口径） */
async function doFlower() {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const res = await write(
    'ceremony',
    { action: 'worship', type: 'flower', targetMemberId: memberId },
    'ceremony.worship',
    `flower:${memberId}:${dateStr}`
  );
  if (res.success && res.data) {
    worshipCount.value = res.data.worshipCount;
    uni.vibrateShort?.();
    uni.showToast({
      title: res.data.blessing && !res.data.blessing.duplicated ? '献花敬上 · 功德+1' : '献花敬上',
      icon: 'none'
    });
  } else {
    uni.showToast({ title: res.message || '献花失败，请重试', icon: 'none' });
  }
}

// R21: 发送留言
async function doSendMessage() {
  if (sending.value || !msgDraft.value.trim()) return;
  sending.value = true;
  try {
    const res = await write(
      'content',
      { action: 'sendMessage', targetMemberId: memberId, content: msgDraft.value.trim() },
      'content.sendMessage',
      ''
    );
    if (res.success) {
      msgDraft.value = '';
      uni.showToast({ title: '留言已提交审核', icon: 'none' });
      loadMessages(msgPage.value); // 刷新列表
    } else {
      uni.showToast({ title: res.message || '发送失败', icon: 'none' });
    }
  } catch (e: any) {
    uni.showToast({ title: e.message || '网络错误', icon: 'none' });
  } finally {
    sending.value = false;
  }
}

// R21: 加载留言列表
async function loadMessages(page = 1) {
  msgLoading.value = true;
  try {
    const res = await read('content', { action: 'listMessages', targetMemberId: memberId, page, pageSize: 20 }, '', 1 * 60 * 1000);
    if (res.success && res.data) {
      messages.value = page === 1 ? res.data.messages : [...messages.value, ...res.data.messages];
      msgHasMore.value = !!res.data.hasMore;
      msgPage.value = page;
    } else {
      uni.showToast({ title: res.message || '加载失败', icon: 'none' });
    }
  } catch (e: any) {
    uni.showToast({ title: e.message || '网络错误', icon: 'none' });
  } finally {
    msgLoading.value = false;
  }
}

// 辅助：短时间格式化（如“2 分钟前”）
function shortTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = Math.max(0, now - then);
  if (diff < 60 * 1000) return `${Math.floor(diff / 1000)}秒前`;
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60 / 1000)}分钟前`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))}小时前`;
  return new Date(iso).toLocaleDateString().replace(/\//g, '-');
}
</script>

<style scoped>
.page { background: #F7F4EC; min-height: 100vh; padding: 16px; }
.card { background: #FFFFFF; border-radius: 12px; padding: 16px; box-shadow: 0 2px 12px rgba(38, 34, 30, 0.06); margin-bottom: 12px; }
.memorial { background: linear-gradient(165deg, #FDFCF8 0%, #F5F1E6 45%, #EDF2EC 100%); text-align: center; padding: 24px 16px; }
.name-row { display: flex; align-items: baseline; justify-content: center; gap: 8px; }
.name { font-size: 24px; font-weight: 700; color: #B03A2E; }
.gen { font-size: 12px; color: #B0A99A; }
.dates { font-size: 13px; color: #6E6659; margin-top: 8px; }
.lifespan { font-size: 12px; }
.flower-row { display: flex; flex-direction: column; align-items: center; margin-top: 16px; gap: 2px; }
.flower-count { font-size: 26px; font-weight: 700; color: #C9A063; }
.flower-label { font-size: 11px; color: #B0A99A; }
.flower-btn { margin-top: 8px; background: #F7F1E3; border-radius: 16px; padding: 8px 18px; }
.flower-btn text { font-size: 14px; color: #B03A2E; }
.section-title { font-size: 15px; font-weight: 700; color: #2B2723; display: block; margin-bottom: 10px; }
.hero-card { border-left: 4px solid #B03A2E; }
.hero-title { color: #B03A2E; }
.hero-text { font-size: 14px; color: #2B2723; line-height: 1.8; }
.deed { background: #FAF8F2; border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; }
.deed-head { display: flex; justify-content: space-between; align-items: baseline; }
.deed-title { font-size: 14px; font-weight: 600; color: #2B2723; }
.deed-date { font-size: 11px; color: #B0A99A; }
.deed-desc { font-size: 12px; color: #6E6659; display: block; margin-top: 4px; line-height: 1.6; }
.motto-card { background: linear-gradient(135deg, #D4B06A 0%, #C9A063 50%, #B8924F 100%); border-radius: 8px; padding: 14px; }
.motto-text { font-size: 15px; color: #FFFFFF; line-height: 1.7; letter-spacing: 1px; }
.error { color: #B03A2E; font-size: 14px; line-height: 1.6; }
.page-tip { display: block; text-align: center; font-size: 11px; color: #B0A99A; padding: 8px 16px; }

/* R21: 留言板 */
.msg-input-row { display: flex; gap: 8px; }
.msg-input { flex: 1; background: #FAF8F2; border-radius: 12px; padding: 8px 12px; font-size: 14px; border: none; outline: none; }
.msg-send { height: 36px; font-size: 13px; background: #B03A2E; color: #FFFFFF; opacity: 0.9; }
.msg-list { max-height: 360px; overflow-y: auto; }
.msg-item { border-bottom: 1px dashed #EAE4D6; padding: 12px 0; }
.msg-item.pending { background: #FFFBE6; border-left: 3px solid #B0A99A; padding-left: 10px; }
.msg-head { display: flex; gap: 8px; align-items: center; margin-bottom: 6px; }
.msg-author { font-size: 13px; font-weight: 600; color: #2B2723; }
.msg-status { font-size: 11px; color: #B0A99A; background: #F7F4EC; padding: 2px 6px; border-radius: 4px; }
.msg-time { font-size: 11px; color: #999; margin-left: auto; }
.msg-content { font-size: 13px; color: #555; line-height: 1.6; word-break: break-word; }
.msg-empty { text-align: center; color: #999; font-size: 13px; padding: 24px 0; }
.msg-more { width: calc(100% - 32px); margin: 12px 16px; }
</style>
