/**
 * cloud/functions/member/index.js
 * 族人档案：详情（L 级隐私）/ 族谱树（物化路径前缀查询）
 * Sprint R2 重构：
 *   - 修复角色比较漏洞（旧版 'EDITOR'>='CHIEF' 字典序为 true，越权暴露私密字段）
 *   - 隐私判定统一走 common/privacy.js（口径唯一）
 *   - tree 采用物化路径：一次前缀查询取代双向 BFS 递归（P95 预算）
 */
const wx = require('wx-server-sdk');
const { OK, BAD_REQUEST, FORBIDDEN, NOT_FOUND } = require('./common/response');
const { hasRole } = require('./common/roles');
const { privacyCheck } = require('./common/privacy');
const { rowsToCsv, buildExportPath } = require('./common/csv');
const {
  generationOf, relationSteps, paginateTree, subtreeRegex, TREE_PAGE_BUDGET
} = require('./common/tree');

wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

const LIST_LIMIT = 50;
const EXPORT_BATCH = 500; // 单批导出上限（内存峰值保护）
const EXPORT_MAX_BATCHES = 10; // 全量落盘上限 = 5000 行

async function main(event, context) {
  const openid = context.OPENID || context.openid;
  if (!openid) return FORBIDDEN('请先登录');
  const db = wx.getDatabase();
  const { action } = event;

  switch (action) {
    case 'getDetail':
      return await getDetail(db, openid, event.memberId);
    case 'tree':
      return await buildTree(db, openid, event.focusId, event.page, event.cursor);
    case 'export':
      return await exportCsv(db, openid, event);
    case 'exportFile':
      return await exportToFile(db, openid, event);
    case 'applyAuth':
      return await applyAuth(db, openid, event);
    case 'reviewAuth':
      return await reviewAuth(db, openid, event);
    default:
      return BAD_REQUEST(`unknown action: ${action}`);
  }
}

/** 导出字段投影（Sprint R7 抽离：exportCsv / exportToFile 共用，口径唯一） */
function toExportRow(m) {
  return {
    谱名: m.genealogyName || '',
    本名: m.name || '',
    世代: m.generation ?? '',
    房支: m.branchId ?? '',
    性别: m.gender ?? '',
    生卒: [m.birthDate, m.deathDate].filter(Boolean).join(' ~ '),
    状态: m.status ?? '',
    世系路径: m.path ?? ''
  };
}

/** 导出审计落 audit_log（失败不阻塞业务） */
async function writeExportAudit(db, openid, action, detail) {
  try {
    await db.collection('audit_log').add({
      data: { userId: openid, action, detail }
    });
  } catch (e) { /* 忽略 */ }
}

/**
 * 批量导出 CSV（CHIEF 专属；分批 + 字段投影减体积）
 * 返回 { csv, total }——前端 uni.setClipboardData 交付（≤500 行场景）
 */
async function exportCsv(db, openid, { branchId, page = 1 }) {
  const ctx = await requesterCtx(db, openid);
  if (!hasRole(ctx.role, 'CHIEF')) return FORBIDDEN('仅族长可批量导出成员档案');

  const p = Math.max(1, Number(page) || 1);
  const where = branchId ? { branchId } : {};
  const res = await db.collection('members')
    .where(where)
    .orderBy('path', 'asc') // 物化路径序 = 族谱序
    .skip((p - 1) * EXPORT_BATCH).limit(EXPORT_BATCH)
    .get();

  const rows = res.data.map(toExportRow);
  const csv = rowsToCsv(rows);
  await writeExportAudit(db, openid, 'member.export_csv', `branch=${branchId || 'all'} page=${p} total=${rows.length}`);
  return OK({ csv, total: rows.length, page: p, hasMore: rows.length === EXPORT_BATCH });
}

/**
 * 全量导出 → 云存储落盘（CHIEF 专属；Sprint R7：>2k 行场景，前端拿 fileURL 下载）
 * 上限 EXPORT_MAX_BATCHES × EXPORT_BATCH = 5000 行
 */
async function exportToFile(db, openid, { branchId }) {
  const ctx = await requesterCtx(db, openid);
  if (!hasRole(ctx.role, 'CHIEF')) return FORBIDDEN('仅族长可导出成员档案');

  const where = branchId ? { branchId } : {};
  let all = [];
  for (let p = 1; p <= EXPORT_MAX_BATCHES; p++) {
    const res = await db.collection('members')
      .where(where)
      .orderBy('path', 'asc')
      .skip((p - 1) * EXPORT_BATCH).limit(EXPORT_BATCH)
      .get();
    all = all.concat(res.data);
    if (res.data.length < EXPORT_BATCH) break;
  }

  const rows = all.map(toExportRow);
  const csv = rowsToCsv(rows);
  const cloudPath = buildExportPath(branchId, Date.now());

  let fileID = '';
  let fileURL = '';
  try {
    const up = await wx.cloud.uploadFile({
      cloudPath,
      fileContent: Buffer.from(csv, 'utf8')
    });
    fileID = up.fileID || '';
    const g = await wx.cloud.getTempFileURL({ fileList: [fileID] });
    fileURL = (g.fileList && g.fileList[0] && g.fileList[0].tempFileURL) || '';
  } catch (e) {
    // 降级策略（Sprint R8）：上传失败不白错误，回落 CSV 剪贴板模式
    await writeExportAudit(db, openid, 'member.export_file_fallback', `path=${cloudPath} total=${rows.length}`);
    return OK({ fallback: true, csv, total: rows.length, reason: '云存储上传失败，已降级为剪贴板模式' });
  }

  await writeExportAudit(db, openid, 'member.export_file', `branch=${branchId || 'all'} total=${rows.length} path=${cloudPath}`);
  return OK({ fileID, fileURL, total: rows.length, cloudPath });
}

/**
 * 授权申请（Sprint R7：needAuthCard 授权卡闭环）
 * MEMBER+ 可对不可见族人发起申请 → auth_requests 集合，族长审批后生效
 */
async function applyAuth(db, openid, { memberId, reason }) {
  // 鉴权先行：未授权者不暴露参数校验细节
  const ctx = await requesterCtx(db, openid);
  if (!hasRole(ctx.role, 'MEMBER')) return FORBIDDEN('仅注册族人可申请授权');

  if (!memberId) return BAD_REQUEST('缺少 memberId');
  const reasonText = String(reason || '').trim();
  if (reasonText.length < 5) return BAD_REQUEST('申请理由至少 5 个字');
  if (reasonText.length > 500) return BAD_REQUEST('申请理由过长（≤500 字）');

  const targetRes = await db.collection('members').doc(memberId).get().catch(() => null);
  const target = targetRes && targetRes.data && !Array.isArray(targetRes.data) ? targetRes.data : (targetRes && targetRes.data && targetRes.data[0]);
  if (!target) return NOT_FOUND('族人不存在');

  // 幂等：同一申请人对同一目标存在 PENDING 申请时直接返回
  const dup = await db.collection('auth_requests').where({ grantee: openid, target: memberId, status: 'PENDING' }).limit(1).get();
  if (dup && Array.isArray(dup.data) && dup.data.length) {
    return OK({ duplicate: true, message: '已存在待审申请，请耐心等待族长审批' });
  }

  await db.collection('auth_requests').add({
    data: {
      grantee: openid,
      target: memberId,
      targetName: target.genealogyName || target.name || '',
      reason: reasonText,
      status: 'PENDING',
      createdAt: new Date().toISOString()
    }
  });
  await writeExportAudit(db, openid, 'member.apply_auth', `target=${memberId}`);
  return OK({ submitted: true });
}

/**
 * 授权审批（CHIEF 专属；Sprint R8：申请闭环最后一环）
 * op: 'list'（待审列表）| 'approve'（批准→authorizations 授予）| 'reject'（驳回）
 */
async function reviewAuth(db, openid, { op = 'list', requestId, comment }) {
  const ctx = await requesterCtx(db, openid);
  if (!hasRole(ctx.role, 'CHIEF')) return FORBIDDEN('仅族长可审批授权申请');

  if (op === 'list') {
    const res = await db.collection('auth_requests')
      .where({ status: 'PENDING' })
      .orderBy('createdAt', 'desc')
      .limit(LIST_LIMIT)
      .get();
    return OK({ requests: (res && res.data) || [] });
  }

  if (!requestId) return BAD_REQUEST('缺少 requestId');
  if (op !== 'approve' && op !== 'reject') return BAD_REQUEST(`unknown op: ${op}`);

  const reqRes = await db.collection('auth_requests').doc(requestId).get().catch(() => null);
  const req = reqRes && reqRes.data && !Array.isArray(reqRes.data) ? reqRes.data : (reqRes && reqRes.data && reqRes.data[0]);
  if (!req) return NOT_FOUND('申请不存在');
  if (req.status !== 'PENDING') return BAD_REQUEST('该申请已处理（幂等保护）');

  const newStatus = op === 'approve' ? 'APPROVED' : 'REJECTED';
  await db.collection('auth_requests').doc(requestId).update({
    data: {
      status: newStatus,
      reviewer: openid,
      reviewedAt: new Date().toISOString(),
      comment: String(comment || '').slice(0, 200)
    }
  });

  // 批准 → 授予 authorizations（getDetail 的 authedMemberIds 即读此集合）
  if (op === 'approve') {
    await db.collection('authorizations').add({
      data: { grantee: req.grantee, target: req.target, grantedBy: openid, createdAt: new Date().toISOString() }
    });
  }

  await writeExportAudit(db, openid, `member.review_auth_${op}`, `request=${requestId} target=${req.target}`);
  return OK({ status: newStatus });
}

/**
 * 批量导出 CSV（CHIEF 专属；分批 + 字段投影减体积）
 * 返回 { csv, total, batches }——前端 uni.setClipboardData 或云存储落盘
 */
async function exportCsv(db, openid, { branchId, page = 1 }) {
  const ctx = await requesterCtx(db, openid);
  if (!hasRole(ctx.role, 'CHIEF')) return FORBIDDEN('仅族长可批量导出成员档案');

  const p = Math.max(1, Number(page) || 1);
  const where = branchId ? { branchId } : {};
  const res = await db.collection('members')
    .where(where)
    .orderBy('path', 'asc') // 物化路径序 = 族谱序
    .skip((p - 1) * EXPORT_BATCH).limit(EXPORT_BATCH)
    .get();

  // 字段投影：只导出非私密字段（导出物仍受隐私分级约束）
  const rows = res.data.map(m => ({
    谱名: m.genealogyName || '',
    本名: m.name || '',
    世代: m.generation ?? '',
    房支: m.branchId ?? '',
    性别: m.gender ?? '',
    生卒: [m.birthDate, m.deathDate].filter(Boolean).join(' ~ '),
    状态: m.status ?? '',
    世系路径: m.path ?? ''
  }));

  const csv = rowsToCsv(rows);
  // Audit trail (Sprint R6 closure)
  try {
    const auditRes = await db.collection('audit_log').add({
      data: { userId: openid, action: 'member.export_csv', target: `${branchId || 'all'}:${p}`, detail: `total=${rows.length}` }
    }).catch(() => null);
  } catch (e) { /* 审计失败不阻塞导出 */ }

  return OK({
    csv,
    total: rows.length,
    page: p,
    hasMore: rows.length === EXPORT_BATCH
  });
}

/** 请求者上下文：角色 + 房支 + 授权名单（一次查齐） */
async function requesterCtx(db, openid) {
  const [userRes, authRes] = await Promise.all([
    db.collection('users').where({ openid }).limit(1).get(),
    db.collection('authorizations').where({ grantee: openid }).limit(LIST_LIMIT).get()
  ]);
  const user = userRes.data[0] || { role: 'VISITOR' };
  return {
    openid,
    role: user.role || 'VISITOR',
    branchId: user.branchId,
    authedMemberIds: new Set(authRes.data.map(a => a.target))
  };
}

/** 人物详情：按 L 级过滤字段，未授权返回 needAuthCard */
async function getDetail(db, openid, memberId) {
  if (!memberId) return BAD_REQUEST('缺少 memberId');

  const res = await db.collection('members').doc(memberId).get().catch(() => null);
  const member = res && res.data && !Array.isArray(res.data) ? res.data : (res && res.data && res.data[0]);
  if (!member) return NOT_FOUND('族人不存在');

  const ctx = await requesterCtx(db, openid);

  // 字段级 L 级判定（口径：privacyCheck 纯函数）
  const view = {};
  const PUBLIC = { _id: 1, genealogyName: 1, generation: 1, gender: 1, branchId: 1, lifespan: 1, status: 1 };
  const LIMITED = { name: 1, birthDate: 1, deathDate: 1, birthPlace: 1 };
  const PRIVATE = { tomb: 1, marriage: 1, occupation: 1, specialNotes: 1 };

  for (const [level, fields] of [['公开', PUBLIC], ['限制', LIMITED], ['私密', PRIVATE]]) {
    if (privacyCheck(ctx, member, level) === 'allow') {
      for (const k of Object.keys(fields)) {
        if (member[k] !== undefined) view[k] = member[k];
      }
    }
  }

  // 完全不可见时返回授权卡路由（不白屏）
  if (!view._id) {
    return { success: false, code: 403, message: '该族人资料需授权查看', needAuthCard: true, applyRoute: '/pages/privacy/privacy' };
  }
  return OK({ member: view });
}

/**
 * 族谱树（焦点视图）：向上 2 代 + 向下 2 代 + 同辈全取
 * 物化路径一次前缀查询（focus.path 截断至祖父层）→ 内存过滤 → 分页（≤200 节点）
 */
async function buildTree(db, openid, focusId, page, cursor = '') {
  if (!focusId) return BAD_REQUEST('缺少 focusId');

  const ctx = await requesterCtx(db, openid);
  const focusRes = await db.collection('members').doc(focusId).get().catch(() => null);
  const focus = focusRes && focusRes.data && !Array.isArray(focusRes.data) ? focusRes.data : (focusRes && focusRes.data && focusRes.data[0]);
  if (!focus || !focus.path) return NOT_FOUND('族人不存在或未挂接世系');

  // 1. 焦点向上截 2 代作为子树根：/001/003/007/ → /001/003/
  const segs = focus.path.split('/').filter(Boolean);
  const rootSegs = segs.slice(0, Math.max(0, segs.length - 2));
  const subtreeRoot = rootSegs.length ? `/${rootSegs.join('/')}/` : '/';

  // 2. 一次前缀查询拿子树（path 索引 + limit 预算封顶）
  const res = await db.collection('members')
    .where({ path: db.RegExp({ regexp: subtreeRegex(subtreeRoot).source, options: 'i' }) })
    .field({ path: 1, genealogyName: 1, generation: 1, gender: 1, branchId: 1, status: 1, lifespan: 1 })
    .limit(TREE_PAGE_BUDGET * 2) // 查询上限 = 2 页预算，超出提示缩小范围
    .get();

  // 3. 焦点视图过滤：|up|≤2 且 |down|≤2（relationSteps 与称谓矩阵同口径）
  const viewNodes = res.data.filter(m => {
    const { up, down } = relationSteps(focus.path, m.path);
    return up <= 2 && down <= 2;
  });

  // 4. 公开层字段 + 分页
  const sorted = viewNodes
    .map(m => ({ ...m, gen: generationOf(m.path) }))
    .sort((a, b) => (a.path < b.path ? -1 : 1));

  const paged = paginateTree(sorted, cursor || '', TREE_PAGE_BUDGET);
  return OK({
    focusId,
    focusPath: focus.path,
    nodes: paged.items,
    nextCursor: paged.nextCursor,
    hasMore: paged.hasMore,
    total: paged.total
  });
}

module.exports = { main };
