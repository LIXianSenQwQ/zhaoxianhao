/**
 * cloud/functions/common/audit.js
 * 审计日志统一写入（文档 26.3：关键操作保留 ≥1 年，不可删除）
 * db 由调用方传入，便于测试时注入 mock
 */

/** 审计保留期（毫秒）：≥1 年 */
const RETENTION_MS = 366 * 24 * 60 * 60 * 1000;

const SENSITIVE_ACTIONS = new Set([
  'auth.certify.approved',
  'auth.grantAuth',
  'auth.setDelegates',
  'auth.revokeDelegate',
  'auth.assistReset',
  'auth.setReversePassword',
  'auth.verifyReverse',
  'capsule.create',
  'capsule.unlock',
  'visibility.change',
  'featureFlag.update',
  'password.change'
]);

/** 是否关键操作（保留 ≥1 年的判定口径） */
function isSensitiveAction(action) {
  return SENSITIVE_ACTIONS.has(action);
}

/**
 * writeAudit - 写一条审计日志
 * @param {object} db     wx.getDatabase()
 * @param {object} entry  { userId, action, target, detail, ip }
 * @returns {Promise<string>} logId
 */
async function writeAudit(db, entry) {
  const { userId, action, target, detail, ip } = entry;
  if (!userId || !action) {
    throw new Error('audit entry requires userId and action');
  }
  const res = await db.collection('audit_logs').add({
    data: {
      userId,
      action,
      target: target || null,
      detail: typeof detail === 'string' ? detail : JSON.stringify(detail ?? null),
      ip: ip || null,
      sensitive: isSensitiveAction(action),
      time: new Date()
    }
  });
  return res._id;
}

module.exports = { writeAudit, isSensitiveAction, SENSITIVE_ACTIONS, RETENTION_MS };
