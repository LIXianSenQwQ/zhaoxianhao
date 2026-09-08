/**
 * utils/auth.js — 角色门禁工具（轻量级非响应式）
 * 与云函数 cloud/functions/common/roles.js 同口径
 */

// 角色层级顺序（用于判断权限级别）
// 与 cloud/functions/common/roles.js 同口径：EDITOR(3) < HISTORIAN(4)
// 依据 docs/API.md admin.heroTag(HISTORIAN+)：EDITOR 及以下 403 族史委专属
export const ROLE_ORDER = {
  VISITOR: 0,    // 访客
  MEMBER: 1,     // 族人
  BRANCH_HEAD: 2, // 支系负责人
  EDITOR: 3,      // 编辑
  HISTORIAN: 4,   // 族史委
  CHIEF: 5        // 族长（最高权限）
};

// 角色名称映射
export const ROLE_NAMES = {
  VISITOR: '访客',
  MEMBER: '族人',
  BRANCH_HEAD: '支系负责人',
  HISTORIAN: '族史委',
  EDITOR: '编辑',
  CHIEF: '族长'
};

// 缓存 key
const USER_INFO_KEY = 'hcs:user';

/** 获取我的当前角色（优先从本地存储读，不触发网络请求） */
export async function getMyRole() {
  try {
    const raw = uni.getStorageSync(USER_INFO_KEY);
    if (!raw) return 'MEMBER'; // 默认已认证为族人（登录成功后 stores/user.ts 会写入）
    const info = JSON.parse(raw);
    return info.role || 'MEMBER';
  } catch (err) {
    console.warn('getMyRole storage failed:', err.message);
    return 'MEMBER';
  }
}

/** 保存用户信息到本地存储（供后续使用） */
export function saveUserInfo(userInfo) {
  try {
    uni.setStorageSync(USER_INFO_KEY, JSON.stringify({
      ...userInfo,
      ts: Date.now()
    }));
  } catch (err) {
    console.warn('saveUserInfo failed:', err.message);
  }
}

/** 清除本地缓存的用户信息（登出时调用） */
export function clearUserInfo() {
  try {
    uni.removeStorageSync(USER_INFO_KEY);
  } catch (err) {
    console.warn('clearUserInfo failed:', err.message);
  }
}

/** 判断是否有指定角色或更高 */
export function hasRole(role, minRole) {
  const myLevel = ROLE_ORDER[role] ?? -1;
  const minLevel = ROLE_ORDER[minRole] ?? -1;
  return myLevel >= minLevel && myLevel !== -1 && minLevel !== -1;
}

/** 判断是否为管理角色（EDITOR/CHIEF/HISTORIAN） */
export function isAdminRole(role) {
  return ['EDITOR', 'CHIEF', 'HISTORIAN'].includes(role);
}

/** 判断是否为族长 */
export function isChief(role) {
  return role === 'CHIEF';
}

/** 根据角色返回显示文本 */
export function roleName(role) {
  return ROLE_NAMES[role] || '未知';
}

/** 角色比较：检查是否满足要求（用于权限守卫） */
export function checkMinRole(userRole, requiredRole) {
  return hasRole(userRole, requiredRole);
}
