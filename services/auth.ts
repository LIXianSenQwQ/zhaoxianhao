/**
 * services/auth.ts — 认证/授权/密码 统一封装
 * 对应云函数：login（登录注册）/ auth（认证/授权/密码）
 * V1.1 扩展：setDelegates/setReversePassword/verifyReverse
 */
import { call, write } from './request';

/** 微信登录（login 云函数） */
export function login() {
  // wx.login → 获取 code → 调云函数
  return new Promise<{ token: string; userInfo: { id: string; role: string; needCertify: boolean } }>((resolve, reject) => {
    wx.login({
      success: res => {
        if (!res.code) return reject(new Error('wx.login 失败'));
        call('login', { code: res.code }, { timeout: 5000 }).then(r => {
          if (r.data) resolve(r.data as any);
          else reject(r.error || new Error('登录失败'));
        });
      },
      fail: err => reject(err)
    });
  });
}

/** 认证三选一（auth.certify）：INVITE_CODE 邀请码 / MANUAL_REVIEW 人工审核 / FAMILY_LINK 房支链接 */
export function certify(method: 'INVITE_CODE' | 'MANUAL_REVIEW' | 'FAMILY_LINK', payload: Record<string, any>) {
  return write('auth', { action: 'certify', method, ...payload }, 'auth', `certify_${method}_${Date.now()}`);
}

/** 审核认证（auth.auditCertify） */
export function auditCertify(recordId: string, action: 'pass' | 'reject', comment?: string) {
  return write('auth', { action: 'auditCertify', recordId, action: action === 'pass' ? 'FIRST_PASS' : 'REJECTED', comment }, 'auth', `audit_${recordId}`);
}

/** 授权他人查看私密内容（auth.grantAuth） */
export function grantAuth(grantee: string, scope: { targetType: string; targetId: string }[]) {
  return write('auth', { action: 'grantAuth', grantee, scope }, 'auth', `grant_${grantee}`);
}

/** 设置私密委托代理人（auth.setDelegates） */
export function setDelegates(delegates: { userId: string; scopes: string[] }[]) {
  return write('auth', { action: 'setDelegates', delegates }, 'auth', 'setDel');
}

/** 撤销委托（auth.revokeDelegate） */
export function revokeDelegate(delegateId: string, scope?: string[]) {
  return write('auth', { action: 'revokeDelegate', delegateId, scope }, 'auth', `revDel_${delegateId}`);
}

/** 设置反向密码（auth.setReversePassword） */
export function setReversePassword(oldMainPwd: string, newReversePwd: string) {
  return write('auth', { action: 'setReversePassword', oldMainPwd, newReversePwd }, 'auth', 'setRev');
}

/** 验证反向密码返回短时效令牌（auth.verifyReverse） */
export function verifyReverse(reversePwd: string) {
  return call('auth', { action: 'verifyReverse', reversePwd }, undefined);
}