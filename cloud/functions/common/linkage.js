/**
 * cloud/functions/common/linkage.js
 * 挂接校验中间件（纯函数，Sprint R3）
 * 职责：新成员挂到父亲/母亲前的口径统一校验——
 *   1. 世代互指：子世代 = 父世代 + 1（文档 5.1 世系铁律）
 *   2. 同支校验：父子必须同房支（异支入谱走族史委特批，本中间件直接拒绝）
 *   3. 物化路径 patch：调 tree.buildPath 产出待写 path
 * 使用方：entry.finalizeApprovedMember / entry.importExcel / member 挂接接口
 */
const { buildPath, generationOf } = require('./tree');

/**
 * validateLink - 挂接前校验
 * @param {Object} child  {generation, branchId, name?}
 * @param {Object|null} parent {path, generation, branchId, gender?} 为 null 表示挂为始祖/根
 * @param {Object} [opts] { memberNo, allowCrossBranch }
 * @returns {{ ok: boolean, reasons: string[], path?: string }}
 */
function validateLink(child, parent, opts = {}) {
  const reasons = [];

  // 基本字段
  if (!child || !Number.isInteger(Number(child.generation)) || Number(child.generation) < 1) {
    reasons.push('子代世代数非法（须为正整数）');
  }
  if (child && (child.branchId === null || child.branchId === undefined)) reasons.push('子代缺房支');

  if (!parent) {
    // 挂为根：只允许第 1 世
    if (child && Number(child.generation) !== 1) {
      reasons.push('无父挂接（根节点）仅允许第 1 世');
    }
    return { ok: reasons.length === 0, reasons, path: reasons.length ? undefined : buildPath('', opts.memberNo ?? 1) };
  }

  if (!parent.path) reasons.push('父成员未挂接世系（path 为空），请先回填父代 path');
  if (parent.generation === null || parent.generation === undefined) reasons.push('父成员缺世代数');

  if (reasons.length === 0) {
    // 1. 世代互指
    if (Number(child.generation) !== Number(parent.generation) + 1) {
      reasons.push(`世代互指失败: 子=${child.generation} 应为父(${parent.generation})+1`);
    }
    // 2. 同支
    if (!opts.allowCrossBranch && String(child.branchId) !== String(parent.branchId)) {
      reasons.push(`跨支挂接: 子支=${child.branchId} 父支=${parent.branchId}（异支需族史委特批）`);
    }
  }

  const ok = reasons.length === 0;
  return {
    ok,
    reasons,
    path: ok ? buildPath(parent.path, opts.memberNo) : undefined
  };
}

/**
 * finalizePatch - 由挂接校验结果产出 members 集合的写入补丁
 * 统一出口，避免各调用方手拼字段漂移
 */
function finalizePatch({ child, parent, memberNo, allowCrossBranch }) {
  const v = validateLink(child, parent, { memberNo, allowCrossBranch });
  if (!v.ok) return { ok: false, reasons: v.reasons };
  return {
    ok: true,
    patch: {
      path: v.path,
      generation: Number(child.generation),
      branchId: child.branchId,
      linkedAt: new Date().toISOString()
    }
  };
}

module.exports = { validateLink, finalizePatch };
