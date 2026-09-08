/**
 * cloud/functions/common/version.js
 * R36：members.version 乐观锁工具（框架 §3.1 version 字段，对齐报告「待议事项 3」方案 A）
 *
 * 方案 A 语义：每次成功编辑 update → version++（db.command.inc 原子递增）。
 * 编辑方可携带 expectedVersion（最后一次读取时的版本号），服务端不匹配即 409 CONFLICT，
 * 前端提示「该记录已被他人修改，请刷新后重试」。
 *
 * 豁免场景（非「编辑冲突」域，不参与乐观锁）：
 *   - ceremony.worshipCount：纯计数器，db.command.inc 本身并发安全；
 *   - 入谱审核流转（entry_records 审核链）：单据独占，双人复核门禁已防并发。
 *
 * 历史数据兼容：存量 members 缺 version 字段 → 视为 version=1（读兼容，框架§18）。
 */

/** 当前版本号兜底：缺失/非法 → 1 */
function currentVersion(member) {
  const v = member && member.version;
  return Number.isInteger(v) && v >= 1 ? v : 1;
}

/**
 * expectedVersion 冲突判定。
 * @param {object} member 库中成员（可含 version）
 * @param {number|undefined} expectedVersion 编辑方携带的期望版本（不传 = 不校验，向后兼容）
 * @returns {boolean} true = 冲突（应返回 409）
 */
function versionConflict(member, expectedVersion) {
  if (expectedVersion === undefined || expectedVersion === null || expectedVersion === '') return false;
  const expected = Number(expectedVersion);
  if (!Number.isInteger(expected) || expected < 1) return false; // 非法值不拦截，交由字段校验
  return expected !== currentVersion(member);
}

/**
 * 更新数据合入 version++（原子递增：真机 db.command.inc / stub {__inc} 双兼容）。
 * @param {object} cmd db.command（调用方传 db.command 或 dbo.command）
 * @param {object} data 原 update data
 * @returns {object} 合成后的 update data（version: inc(1)）
 */
function withVersionBump(cmd, data) {
  return { ...(data || {}), version: cmd.inc(1) };
}

module.exports = { currentVersion, versionConflict, withVersionBump };
