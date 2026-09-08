/**
 * cloud/functions/common/roles.js
 * 角色等级体系（纯函数，零依赖，可单测）
 * 来源：文档 5.1 users.role / 6.2 权限中间件
 */

const ROLE_LEVEL = Object.freeze({
  VISITOR: 0,
  MEMBER: 1,
  BRANCH_HEAD: 2,    // 支长 - 支谱级
  EDITOR: 3,         // 编辑
  HOUSE_HEAD: 4,     // R31 新增：房长 - 分谱级（对齐框架 §6.2）
  HISTORIAN: 5,      // 族史委
  CHIEF: 6           // 族长
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

/**
 * 从 users 集合查询用户角色（带上下文降级）
 * @param {object} db - wx.getDatabase() 实例
 * @param {string} openid
 * @param {string} [defaultRole='VISITOR'] DB 不可用时的回退角色
 * @returns {Promise<string>}
 */
async function roleOf(db, openid, defaultRole = 'VISITOR') {
  try {
    const res = await db.collection('users').where({ openid }).limit(1).get();
    if (res.data && res.data.length > 0) {
      return res.data[0].role || defaultRole;
    }
  } catch (e) {
    console.warn('[roles.roleOf] DB query failed:', e.message);
  }
  return defaultRole;
}

module.exports = { ROLE_LEVEL, hasRole, canAudit, isHistorian, isChief, roleOf };
