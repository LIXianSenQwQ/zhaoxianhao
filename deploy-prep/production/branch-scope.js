/**
 * cloud/functions/common/branch-scope.js
 * R34(B6): 支谱范围门禁（蓝图 7.6 + §6.5 branchScope RBAC）
 * 
 * Design:
 * - GLOBAL_ROLES = HISTORIAN+, EDITOR(过渡), CHIEF — 全域操作权限
 * - SCOPE_ROLES = BRANCH_HEAD — 仅限本支操作（users.branchCode === targetBranchId）
 * - MEMBER/VISITOR — 无写权限
 */

// ─── 常量 ───
const GLOBAL_ROLES = ['EDITOR', 'HISTORIAN', 'CHIEF']; // EDITOR 作过渡：全域编辑（待族务裁决是否限定）
const SCOPE_ROLES = ['BRANCH_HEAD'];
const ROLE_LEVELS = { VISITOR: 0, MEMBER: 1, BRANCH_HEAD: 2, EDITOR: 3, HISTORIAN: 4, CHIEF: 5 }; // 与 roles.js 同步但独立，防循环依赖

// ─── 辅助函数 ───

/** 角色是否全局授权（跨支操作） */
function isGlobalRole(role) {
  return GLOBAL_ROLES.includes(role);
}

/** 角色是否需要 scope 校验（支级限制） */
function requiresScopeCheck(role) {
  return SCOPE_ROLES.includes(role);
}

/**
 * scopeOf: 检查用户在指定分支范围内的操作权限
 * @param {object} userContext — { openid, role, branchCode? }
 * @param {string} targetBranchId — 目标分支 ID/code
 * @returns {{ allowed: boolean, reason?: string }}
 */
function scopeOf({ openid, role, branchCode }, targetBranchId) {
  if (!openid || !role || !targetBranchId) {
    return { allowed: false, reason: 'missing required context' };
  }

  // 全局角色直接放行
  if (isGlobalRole(role)) {
    return { allowed: true };
  }

  // 支级角色需 exact match
  if (requiresScopeCheck(role)) {
    // BRANCH_HEAD: users.branchCode === targetBranchId (exact, not descendant)
    if (branchCode && branchCode === targetBranchId) {
      return { allowed: true };
    }
    return { allowed: false, reason: 'scope mismatch: cross-branch access denied for BRANCH_HEAD' };
  }

  // MEMBER/VISITOR: 无写权限
  return { allowed: false, reason: 'insufficient role level' };
}

/**
 * assertScope: throw if denied (or return FORBIDDEN object compatible pattern)
 * @param {string} role
 * @param {string|null} userBranchCode
 * @param {string} targetBranchId
 * @param {string} actionDescription — e.g., "member update", "entry audit"
 */
function assertScope(role, userBranchCode, targetBranchId, actionDescription) {
  const result = scopeOf({ role, branchCode: userBranchCode }, targetBranchId);
  if (result.allowed) return;

  // throw a FORBIDDEN-like error
  const error = new Error(result.reason || 'access denied');
  error.code = 403;
  error.message = `${actionDescription} failed: ${result.reason}`;
  throw error;
}

module.exports = { scopeOf, assertScope, isGlobalRole, requiresScopeCheck };
