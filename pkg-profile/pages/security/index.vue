<!--
  pkg-profile/pages/security/index.vue — 账号与安全（蓝图 V1.1 §24.4 反向密码）
  数据：auth.setReversePassword / auth.verifyReverse
  交互：
    · 设置/更新反向密码（≥8 位含大小写字母与数字；与微信登录主认证体系相互独立）
    · 校验反向密码（模拟敏感操作二次验证，返回 5 分钟短效令牌）
  说明：主密码管理在微信平台侧；反向密码仅用于族谱内敏感操作（如批量导出、删除）二次确认。
-->
<template>
  <view class="security-page">
    <!-- 反向密码设置 -->
    <view class="card">
      <text class="card-title">反向密码</text>
      <text class="card-sub">为族谱内敏感操作设置的第二道验证；独立于微信登录，仅在您主动输入时校验。</text>
      <view class="field">
        <text class="field-label">新反向密码</text>
        <input class="field-input" v-model="pwd" password placeholder="≥8 位，含大小写字母与数字" maxlength="32" />
      </view>
      <view class="field">
        <text class="field-label">确认反向密码</text>
        <input class="field-input" v-model="pwd2" password placeholder="再次输入" maxlength="32" />
      </view>
      <view class="strength" v-if="pwd">
        <text class="strength-label">强度：{{ strengthLabel }}</text>
        <view class="bar"><view class="bar-fill" :class="strengthClass" :style="{ width: strengthPct + '%' }" /></view>
      </view>
      <button class="primary-btn" :disabled="saving" @click="savePwd">
        {{ saving ? '保存中…' : (hasReverse ? '更新反向密码' : '设置反向密码') }}
      </button>
      <text class="tip">反向密码校验通过后返回 5 分钟短效令牌，用于单次敏感操作。</text>
    </view>

    <!-- 校验反向密码（二次验证演示） -->
    <view class="card">
      <text class="card-title">二次验证</text>
      <view class="field">
        <text class="field-label">反向密码</text>
        <input class="field-input" v-model="verifyPwd" password placeholder="输入反向密码以验证" maxlength="32" />
      </view>
      <button class="ghost-btn" :disabled="verifying" @click="doVerify">
        {{ verifying ? '验证中…' : '验证反向密码' }}
      </button>
      <view v-if="token" class="token-box">
        <text class="token-label">验证通过，令牌有效期 5 分钟</text>
        <text class="token-val">{{ token.slice(0, 24) }}…</text>
      </view>
    </view>

    <!-- 安全须知 -->
    <view class="note-card">
      <text class="note-t">安全须知</text>
      <view class="note-line">· 主认证沿用微信登录，无需单独设主密码。</view>
      <view class="note-line">· 反向密码丢失可联系族史委重置（人工核验身份）。</view>
      <view class="note-line">· 委托与授权请先在「私密委托」中完成设置。</view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { setReversePassword, verifyReverse } from '@/services/auth';

const PWD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

const pwd = ref('');
const pwd2 = ref('');
const verifyPwd = ref('');
const saving = ref(false);
const verifying = ref(false);
const hasReverse = ref(false);
const token = ref('');

const strengthPct = computed(() => {
  let s = 0;
  if (pwd.value.length >= 8) s += 40;
  if (/[a-z]/.test(pwd.value) && /[A-Z]/.test(pwd.value)) s += 30;
  if (/\d/.test(pwd.value)) s += 15;
  if (/[^A-Za-z0-9]/.test(pwd.value)) s += 15;
  return Math.min(100, s);
});
const strengthLabel = computed(() => (strengthPct.value < 40 ? '弱' : strengthPct.value < 85 ? '中' : '强'));
const strengthClass = computed(() => (strengthPct.value < 40 ? 'weak' : strengthPct.value < 85 ? 'mid' : 'strong'));

async function savePwd() {
  if (!PWD_RE.test(pwd.value)) {
    return uni.showToast({ title: '需 ≥8 位且含大小写字母与数字', icon: 'none' });
  }
  if (pwd.value !== pwd2.value) return uni.showToast({ title: '两次输入不一致', icon: 'none' });
  saving.value = true;
  const res = await setReversePassword(pwd.value);
  saving.value = false;
  if (res.error && !res.data) {
    uni.showToast({ title: (res.error as any)?.message || '设置失败', icon: 'none' });
  } else {
    uni.showToast({ title: '反向密码已设置', icon: 'success' });
    hasReverse.value = true;
    pwd.value = ''; pwd2.value = '';
  }
}

async function doVerify() {
  if (!verifyPwd.value) return uni.showToast({ title: '请输入反向密码', icon: 'none' });
  verifying.value = true;
  const res = await verifyReverse(verifyPwd.value);
  verifying.value = false;
  if (res.data?.token) {
    token.value = res.data.token;
    uni.showToast({ title: '验证通过', icon: 'success' });
  } else {
    token.value = '';
    uni.showToast({ title: (res.error as any)?.message || '验证失败', icon: 'none' });
  }
}
</script>

<style lang="scss" scoped>
.security-page { min-height: 100vh; background: #FAF8F2; padding: 16px 12px 32px; box-sizing: border-box; }
.card { background: #FFF; border-radius: 12px; padding: 14px 16px; margin-bottom: 12px; box-shadow: 0 2px 12px rgba(38,34,30,.06); }
.card-title { display: block; font-size: 14px; font-weight: 700; color: #2B2723; margin-bottom: 6px; }
.card-sub { display: block; font-size: 12px; color: #8A7B5A; line-height: 1.7; margin-bottom: 12px; }
.field { margin-bottom: 12px; }
.field-label { display: block; font-size: 12px; color: #6E6659; margin-bottom: 6px; }
.field-input { background: #FAF8F2; border-radius: 8px; padding: 10px; font-size: 13px; color: #2B2723; }
.strength { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.strength-label { font-size: 11px; color: #8A7B5A; flex-shrink: 0; }
.bar { flex: 1; height: 6px; background: #F0EEE8; border-radius: 3px; overflow: hidden; }
.bar-fill { height: 100%; border-radius: 3px; transition: width .2s ease; }
.bar-fill.weak { background: #B03A2E; }
.bar-fill.mid { background: #C9A063; }
.bar-fill.strong { background: #2E6B46; }
.primary-btn { width: 100%; height: 42px; line-height: 42px; font-size: 14px; font-weight: 600; color: #FFF; background: #B03A2E; border-radius: 8px; padding: 0; }
.primary-btn[disabled] { background: #D8A59D; }
.ghost-btn { width: 100%; height: 42px; line-height: 42px; font-size: 14px; color: #B03A2E; background: #FFF; border: 1px solid #E5C5C0; border-radius: 8px; padding: 0; }
.ghost-btn[disabled] { opacity: .6; }
.tip { display: block; font-size: 11px; color: #B0A99A; margin-top: 8px; line-height: 1.6; }
.token-box { margin-top: 12px; background: #F7F4EC; border-radius: 8px; padding: 10px; }
.token-label { display: block; font-size: 12px; color: #2E6B46; font-weight: 600; }
.token-val { display: block; font-size: 12px; color: #8A7B5A; margin-top: 4px; word-break: break-all; }
.note-card { margin-top: 4px; padding: 0 4px; }
.note-t { display: block; font-size: 12px; font-weight: 700; color: #8A7B5A; margin-bottom: 4px; }
.note-b { font-size: 11px; color: #B0A99A; line-height: 1.8; white-space: pre-line; }
</style>
