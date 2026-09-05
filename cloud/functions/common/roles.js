/**
 * cloud/functions/common/roles.js
 * 角色等级体系（纯函数，零依赖，可单测）
 * 来源：文档 5.1 users.role / 6.2 权限中间件
 */

const ROLE_LEVEL = Object.freeze({
  VISITOR: 0,
  MEMBER: 1,
  BRANCH_HEAD: 2,
  EDITOR: 3,
  HISTORIAN: 4,
  CHIEF: 5
});

/** 角色是否达到最低要求 */
function hasRole(role, minRole) {
  const level = ROLE_LEVEL[role];
  const required = ROLE_LEVEL[minRole];
  if (level === undefined || required === undefined) return false;
  return level >= required;
}

/** 审核权限：BRANCH_HEAD 及以上（文档 W2 双人审核） */
function canAudit(role) {
  return hasRole(role, 'BRANCH_HEAD');
}

/** 族史委权限：HISTORIAN 及以上 */
function isHistorian(role) {
  return hasRole(role, 'HISTORIAN');
}

/** 族长权限 */
function isChief(role) {
  return role === 'CHIEF';
}

module.exports = { ROLE_LEVEL, hasRole, canAudit, isHistorian, isChief };
