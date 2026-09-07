<template>
  <view class="login-page">
    <!-- 顶部品牌区：晨光渐变 -->
    <view class="login-header">
      <view class="brand-emblem">郝</view>
      <text class="brand-title">好诚事家风</text>
      <text class="brand-sub">数字祠堂 · 掌上家园</text>
    </view>

    <!-- 未登录：微信一键登录 -->
    <block v-if="!userStore.isLoggedIn">
      <view class="login-card">
        <button class="btn-primary" @click="handleWxLogin" :loading="logging">
          {{ logging ? '登录中…' : '微信一键登录' }}
        </button>
        <text class="agreement">
          登录即同意
          <text class="link" @click="navTo('privacy')">《隐私政策》</text>
          与
          <text class="link" @click="showTerms">《用户协议》</text>
        </text>
      </view>
    </block>

    <!-- 已登录但未认证：认证三选一 -->
    <block v-else-if="needCertify">
      <view class="certify-card">
        <text class="certify-title">族人身份认证</text>
        <text class="certify-desc">完成认证后可查看族谱、请安、参与族务（双人审核制）</text>

        <!-- ① 房长扫码邀请 -->
        <view class="certify-option" @click="chooseCertify('INVITE_CODE')">
          <view class="option-icon option-gold">扫</view>
          <view class="option-body">
            <text class="option-title">房长扫码邀请</text>
            <text class="option-desc">输入房长提供的邀请码，最快认证</text>
          </view>
          <text class="option-arrow">›</text>
        </view>

        <!-- ② 资料人工审核 -->
        <view class="certify-option" @click="chooseCertify('MANUAL_REVIEW')">
          <view class="option-icon option-cinnabar">核</view>
          <view class="option-body">
            <text class="option-title">填写资料人工审核</text>
            <text class="option-desc">填写「父亲姓名 + 房支」，族史委双人核验</text>
          </view>
          <text class="option-arrow">›</text>
        </view>

        <!-- ③ 族人邀请链接 -->
        <view class="certify-option" @click="chooseCertify('FAMILY_LINK')">
          <view class="option-icon option-fresh">链</view>
          <view class="option-body">
            <text class="option-title">族人邀请链接</text>
            <text class="option-desc">点击族人分享的邀请链接自动认证</text>
          </view>
          <text class="option-arrow">›</text>
        </view>

        <!-- 访客提示 -->
        <view class="visitor-tip">
          <text>暂不认证？可先浏览</text>
          <text class="link" @click="navTo('hero')">英烈名录</text>
        </view>
      </view>
    </block>

    <!-- 已认证：直接进首页 -->
    <block v-else>
      <view class="login-card">
        <text class="welcome">欢迎回家，{{ userStore.userInfo?.nickName || '族人' }}</text>
        <button class="btn-primary" @click="enterHome">进入首页</button>
      </view>
    </block>

    <!-- 认证码弹层 -->
    <view v-if="showCodeModal" class="modal-mask" @click="showCodeModal = false">
      <view class="modal-body" @click.stop>
        <text class="modal-title">输入邀请码</text>
        <input
          class="code-input"
          v-model="inviteCode"
          placeholder="请输入房长提供的 6 位邀请码"
          maxlength="6"
        />
        <button class="btn-primary" @click="submitInviteCode" :loading="submitting">提交认证</button>
        <button class="btn-cancel" @click="showCodeModal = false">取消</button>
      </view>
    </view>

    <!-- 资料审核弹层 -->
    <view v-if="showFormModal" class="modal-mask" @click="showFormModal = false">
      <view class="modal-body" @click.stop>
        <text class="modal-title">填写认证资料</text>
        <input class="form-input" v-model="certifyForm.fatherName" placeholder="父亲姓名" />
        <input class="form-input" v-model="certifyForm.branchName" placeholder="所属房支（如：长房）" />
        <input class="form-input" v-model="certifyForm.contact" placeholder="联系电话（供族史委联系核验）" />
        <button class="btn-primary" @click="submitManualReview" :loading="submitting">提交审核</button>
        <text class="form-tip">提交后由族史委双人审核，结果将通过通知中心告知</text>
        <button class="btn-cancel" @click="showFormModal = false">取消</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useUserStore } from '@/stores/user';
import { navTo } from '@/utils/routes';
import { certify } from '@/services/auth';

const userStore = useUserStore();

const logging = ref(false);
const submitting = ref(false);
const showCodeModal = ref(false);
const showFormModal = ref(false);
const inviteCode = ref('');
const certifyForm = ref({ fatherName: '', branchName: '', contact: '' });

const needCertify = computed(() => userStore.userInfo?.status === 'PENDING');

// 微信一键登录
async function handleWxLogin() {
  logging.value = true;
  try {
    await userStore.login();
    if (!needCertify.value) {
      enterHome();
    }
  } catch (e) {
    uni.showToast({ title: '登录失败，请重试', icon: 'none' });
  } finally {
    logging.value = false;
  }
}

// 认证三选一
function chooseCertify(type: string) {
  if (type === 'INVITE_CODE') {
    showCodeModal.value = true;
  } else if (type === 'MANUAL_REVIEW') {
    showFormModal.value = true;
  } else if (type === 'FAMILY_LINK') {
    uni.showToast({ title: '请从族人分享的邀请链接进入', icon: 'none' });
  }
}

// 提交邀请码认证
async function submitInviteCode() {
  if (inviteCode.value.length !== 6) {
    uni.showToast({ title: '请输入 6 位邀请码', icon: 'none' });
    return;
  }
  submitting.value = true;
  try {
    const res = await certify('INVITE_CODE', { code: inviteCode.value });
    if (res && res.data?.success) {
      uni.showToast({ title: '认证成功！' });
      userStore.userInfo = res.data.userInfo;
      showCodeModal.value = false;
      enterHome();
    } else {
      uni.showToast({ title: res?.error?.message || '邀请码无效', icon: 'none' });
    }
  } finally {
    submitting.value = false;
  }
}

// 提交人工审核
async function submitManualReview() {
  const { fatherName, branchName, contact } = certifyForm.value;
  if (!fatherName || !branchName) {
    uni.showToast({ title: '请填写父亲姓名与房支', icon: 'none' });
    return;
  }
  submitting.value = true;
  try {
    const res = await certify('MANUAL_REVIEW', { fatherName, branchName, contact });
    if (res && res.data?.success) {
      uni.showToast({ title: '已提交，等待双人审核', icon: 'none' });
      showFormModal.value = false;
    }
  } finally {
    submitting.value = false;
  }
}

function enterHome() {
  // 项目未配置 tabBar，switchTab 会失败；reLaunch 可跳转任意页面并清空页面栈
  uni.reLaunch({ url: '/pages/index/index' });
}

function showTerms() {
  uni.showToast({ title: '用户协议（占位）', icon: 'none' });
}
</script>

<style lang="scss" scoped>
@import '@/styles/tokens.scss';

.login-page {
  min-height: 100vh;
  background: var(--paper);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 16px;
}

.login-header {
  width: 100%;
  padding: 64px 0 32px;
  text-align: center;
  background: linear-gradient(165deg, #fdfcf8 0%, #f5f1e6 45%, #edf2ec 100%);
  border-radius: 0 0 12px 12px;
}

.brand-emblem {
  width: 72px;
  height: 72px;
  margin: 0 auto 12px;
  border-radius: 50%;
  background: var(--home-gold, linear-gradient(135deg, #d4b06a, #c9a063, #b8924f));
  color: #fff;
  font-size: 36px;
  font-weight: 700;
  line-height: 72px;
}

.brand-title {
  display: block;
  font-size: 24px;
  font-weight: 700;
  color: var(--home-text, #2b2723);
}

.brand-sub {
  display: block;
  margin-top: 4px;
  font-size: 14px;
  color: var(--home-text-2, #6e6659);
}

.login-card,
.certify-card {
  width: 100%;
  margin-top: 24px;
  padding: 24px 16px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(38, 34, 30, 0.06);
}

.btn-primary {
  width: 100%;
  height: 44px;
  background: var(--cinnabar, #b03a2e);
  color: #fff;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 500;
  line-height: 44px;
}

.btn-cancel {
  width: 100%;
  height: 44px;
  margin-top: 8px;
  background: var(--home-card-2, #f7f4ec);
  color: var(--text-sub, #666);
  border-radius: 8px;
  font-size: 14px;
  line-height: 44px;
}

.agreement {
  display: block;
  margin-top: 12px;
  font-size: 12px;
  color: var(--text-aux, #999);
  text-align: center;
}

.link {
  color: var(--river, #3a4a56);
}

.welcome {
  display: block;
  text-align: center;
  font-size: 18px;
  font-weight: 700;
  color: var(--home-text, #2b2723);
  margin-bottom: 16px;
}

.certify-title {
  display: block;
  font-size: 18px;
  font-weight: 700;
  color: var(--home-text, #2b2723);
}

.certify-desc {
  display: block;
  margin: 8px 0 16px;
  font-size: 13px;
  color: var(--text-sub, #666);
}

.certify-option {
  display: flex;
  align-items: center;
  padding: 14px 12px;
  margin-bottom: 12px;
  background: var(--home-card-2, #f7f4ec);
  border-radius: 12px;
}

.option-icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  color: #fff;
  font-size: 18px;
  font-weight: 700;
  text-align: center;
  line-height: 40px;
  flex-shrink: 0;
}

.option-gold { background: linear-gradient(135deg, #d4b06a, #b8924f); }
.option-cinnabar { background: var(--cinnabar, #b03a2e); }
.option-fresh { background: var(--home-fresh, #7fa8a0); }

.option-body {
  flex: 1;
  margin-left: 12px;
}

.option-title {
  display: block;
  font-size: 15px;
  font-weight: 500;
  color: var(--home-text, #2b2723);
}

.option-desc {
  display: block;
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-sub, #666);
}

.option-arrow {
  color: var(--text-aux, #999);
  font-size: 20px;
}

.visitor-tip {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-aux, #999);
  text-align: center;
}

.modal-mask {
  position: fixed;
  inset: 0;
  background: rgba(38, 34, 30, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
}

.modal-body {
  width: 80%;
  padding: 24px 16px;
  background: #fff;
  border-radius: 12px;
}

.modal-title {
  display: block;
  margin-bottom: 16px;
  font-size: 16px;
  font-weight: 700;
  text-align: center;
  color: var(--home-text, #2b2723);
}

.code-input,
.form-input {
  width: 100%;
  height: 44px;
  margin-bottom: 12px;
  padding: 0 12px;
  border: 1px solid var(--home-line, #eae4d6);
  border-radius: 8px;
  font-size: 14px;
  box-sizing: border-box;
}

.form-tip {
  display: block;
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-aux, #999);
  text-align: center;
}
</style>
