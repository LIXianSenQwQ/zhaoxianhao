<!-- pkg-family/pages/memberDetail/detail.vue – 成员详情（L 级隐私 + 授权卡路由，Sprint R6） -->
<template>
  <view class="detail-page">
    <!-- 加载骨架 -->
    <Skeleton v-if="loading" :rows="10" />

    <!-- 404 兜底 -->
    <ErrorPage v-else-if="notFound" message="族人不存在" @retry="loadMember" />

    <!-- 错误/需要授权：显示 PrivacyCard -->
    <PrivacyCard
      v-else-if="needAuthCard || authError"
      :level="privacyLevel"
      :desc="authDesc"
      style="padding: 24px;"
      @tap="openApply"
    />

    <!-- 正常数据展示 -->
    <template v-else>
      <!-- 头像卡 -->
      <BaseCard>
        <view class="avatar-row">
          <image class="avatar" :src="getAvatar(member)" mode="aspectFit" />
          <view class="info">
            <text class="name">{{ member.genealogyName || member.name }}</text>
            <text class="meta">{{ member.branchId }} · {{ member.generation }}世</text>
          </view>
        </view>
      </BaseCard>

      <!-- 基本信息 -->
      <BaseCard title="基本信息">
        <view class="row"><text class="label">本名：</text><text class="value">{{ member.name || '未记录' }}</text></view>
        <view class="row"><text class="label">性别：</text><text class="value">{{ genderLabel(member.gender) }}</text></view>
        <view class="row"><text class="label">生卒：</text><text class="value">{{ genDate(member.birthDate, member.deathDate) }}</text></view>
        <view class="row"><text class="label">出生地：</text><text class="value">{{ member.birthPlace || '-' }}</text></view>
      </BaseCard>

      <!-- 族系关系 -->
      <BaseCard title="族系信息">
        <view class="row"><text class="label">房支：</text><text class="value">{{ member.branchId || '-' }}</text></view>
        <view class="row"><text class="label">状态：</text><text class="value" :class="statusClass(member.status)">{{ statusLabel(member.status) }}</text></view>
        <view class="row"><text class="label">世系路径：</text><text class="path-value">{{ member.path || '-' }}</text></view>
      </BaseCard>

      <!-- R17：快捷入口 → 申请关系变更/人生书（蓝图 8.0/9.1） -->
      <BaseCard v-if="user.isAdmin" title="管理操作">
        <view class="btn-row">
          <button size="mini" class="btn-primary" @click="goRelationEditor">申请关系变更</button>
          <button size="mini" class="btn-primary" @click="goLifebook">查看人生书</button>
        </view>
      </BaseCard>

      <!-- 受限字段模糊遮罩（Sprint R9：字段级权限提示） -->
      <BaseCard v-if="hiddenFields.length" title="受限信息">
        <view v-for="f in hiddenFields" :key="f" class="row">
          <text class="label">{{ FIELD_LABEL[f] || f }}：</text>
          <text class="value masked">████████</text>
        </view>
        <view class="unlock-row" @tap="openApply">
          <text class="unlock-text">🔒 申请授权查看 {{ hiddenFields.length }} 项受限字段</text>
        </view>
      </BaseCard>

      <!-- 扩展字段（仅可见时显示） -->
      <template v-if="showMarriage">
        <BaseCard title="婚姻状况">
          <view class="row"><text class="label">配偶：</text><text class="value">{{ member.marriage?.spouseName || '-' }}</text></view>
        </BaseCard>
      </template>

      <!-- 族史备注（私密级） -->
      <template v-if="showSpecialNotes">
        <BaseCard title="族史备注">
          <text class="notes-value">{{ member.specialNotes || '暂无' }}</text>
        </BaseCard>
      </template>

      <!-- 编辑入口（本人为会员或管理员） -->
      <view v-if="user.isLoggedIn && (user.isAdmin || isSelf)" class="edit-btn" @click="goEdit">
        <button class="btn-primary btn-edit" size="mini">申请修订</button>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useUserStore } from '@/stores/user';
import { read } from '@/services/request';
import BaseCard from '@/components/common/BaseCard.vue';
import Skeleton from '@/components/common/Skeleton.vue';
import ErrorPage from '@/components/common/ErrorPage.vue';
import PrivacyCard from '@/components/common/PrivacyCard.vue';

const user = useUserStore();
const loading = ref(true);
const notFound = ref(false);
const needAuthCard = ref(false);
const authError = ref(false);
const applyRoute = ref('/pages/privacy/privacy'); // 默认授权页
const member = ref<any>({});
const hiddenFields = ref<string[]>([]); // Sprint R9: 被隐私分级隐藏的字段

// 受限字段中文标签
const FIELD_LABEL: Record<string, string> = {
  name: '本名', birthDate: '生年', deathDate: '卒年', birthPlace: '出生地',
  tomb: '墓地', marriage: '婚姻', occupation: '职业', specialNotes: '族史备注'
};

const props = defineProps({ id: String });

onMounted(() => { if (props.id) loadMember(props.id); });

async function loadMember(id: string) {
  loading.value = true;
  notFound.value = false;
  needAuthCard.value = false;
  authError.value = false;
  try {
    const res = await read('member', { action: 'getDetail', memberId: id }, `detail:${id}`, 30000);
    if (!res.success && res.code === 403 && res.needAuthCard) {
      needAuthCard.value = true;
      applyRoute.value = res.applyRoute || '/pages/privacy/privacy';
      return; // 授权卡渲染
    } else if (!res.success && res.code === 404) {
      notFound.value = true;
      return;
    } else if (res.error || !res.data) {
      authError.value = true;
      return;
    }
    member.value = res.data.member || res.data;
    hiddenFields.value = res.data.hiddenFields || [];
  } catch (e: any) {
    authError.value = true;
  } finally {
    loading.value = false;
  }
}

// 权限与可见性判定
const privacyLevel = computed(() => (needAuthCard.value ? '限制' : '公开'));
const authDesc = computed(() => needAuthCard.value ? '该资料包含私密字段，需授权查看' : '');

const showMarriage = computed(() => !!member.value.marriage);
const showSpecialNotes = computed(() => !!member.value.specialNotes);
const isSelf = computed(() => user.isLoggedIn && user.userInfo?.openid && member.value.openid === user.userInfo.openid);

function genderLabel(g?: string): string {
  return g === 'FEMALE' ? '女' : g === 'MALE' ? '男' : '?';
}
function statusLabel(s?: string): string {
  return { ACTIVE: '在世', DECEASED: '已故', UNKNOWN: '待核实' }[s] || '-';
}
function statusClass(s?: string): string {
  return s === 'ACTIVE' ? 'status-ok' : s === 'DECEASED' ? 'status-deceased' : '';
}
function genDate(b?: string, d?: string): string {
  return [b, d].filter(Boolean).join(' ~ ') || '-';
}

/** avatar fallback（Sprint R7） */
function getAvatar(m: any): string {
  return m.avatarUrl || (m.gender === 'FEMALE' ? '/static/female.png' : '/static/male.png');
}

/** R17：跳转关系变更表单（relation.edit 工单）与人生书（传记查看） */
function goRelationEditor() {
  uni.navigateTo({ url: `/pkg-family/pages/relationeditor/relationeditor?memberId=${member.value._id}` });
}
function goLifebook() {
  uni.navigateTo({ url: `/pkg-family/pages/lifebook/lifebook?memberId=${member.value._id}` });
}

/** 打开授权申请页（Sprint R7：needAuthCard 授权卡闭环） */
async function openApply() {
  if (!props.id) return;
  const q = `?memberId=${encodeURIComponent(props.id)}&name=${encodeURIComponent(member.value.genealogyName || member.value.name || '')}`;
  uni.navigateTo({ url: `/pages/privacy/privacy${q}` });
}

function goEdit() {
  uni.navigateTo({ url: `/pkg-growth/pages/task/task?action=update_member&memberId=${props.id}` });
}
</script>

<style scoped>
.detail-page { flex: 1; background: #F7F6F3; padding-bottom: 20px; }
.avatar-row { display: flex; align-items: center; gap: 12px; }
.avatar { width: 56px; height: 56px; border-radius: 50%; background: #EEE7DA; }
.info { flex: 1; }
.name { font-size: 18px; font-weight: 600; display: block; }
.meta { font-size: 12px; color: #8A8378; margin-top: 2px; display: block; }

/* 受限字段遮罩（Sprint R9） */
.value.masked { filter: blur(3px); color: #B0A99A; user-select: none; letter-spacing: 2px; }
.unlock-row { margin-top: 10px; padding: 8px 12px; background: #EFECE4; border-radius: 8px; text-align: center; }
.unlock-text { font-size: 12px; color: #2E7D32; }

.row { display: flex; align-items: center; justify-content: space-between; padding: 8px 0; }
.label { font-size: 14px; color: #8A8378; }
.value { font-size: 14px; color: #2B2320; }
.notes-value { font-size: 13px; color: #2B2320; white-space: pre-wrap; }
.path-value { font-size: 12px; color: #999; font-family: monospace; }

.status-ok { color: #4E6E3F; }
.status-deceased { color: #8A5A2B; }

.edit-btn { text-align: center; padding: 16px; background: #FFF; border-top: 1px solid #EEE7DA; }

/* R17：管理操作按钮行 */
.btn-row { display: flex; gap: 8px; justify-content: space-between; margin-top: 12px; }
.btn-primary { flex: 1; height: 36px; font-size: 13px; background: linear-gradient(135deg,#D4B06A 0%,#C9A063 50%,#B8924F 100%); color: #FFF; border-radius: 6px; border: none; }
</style>
