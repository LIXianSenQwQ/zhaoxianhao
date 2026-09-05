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
const { rowsToCsv } = require('./common/csv');
const {
  generationOf, relationSteps, paginateTree, subtreeRegex, TREE_PAGE_BUDGET
} = require('./common/tree');

wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

const LIST_LIMIT = 50;
const EXPORT_BATCH = 500; // 单批导出上限（内存峰值保护）

async function main(event, context) {
  const openid = context.OPENID || context.openid;
  if (!openid) return FORBIDDEN('请先登录');
  const db = wx.getDatabase();
  const { action } = event;

  switch (action) {
    case 'getDetail':
      return await getDetail(db, openid, event.memberId);
    case 'tree':
      return await buildTree(db, openid, event.focusId, event.page);
    case 'export':
      return await exportCsv(db, openid, event);
    default:
      return BAD_REQUEST(`unknown action: ${action}`);
  }
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
async function buildTree(db, openid, focusId, page) {
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

  const paged = paginateTree(sorted, event.cursor || '', TREE_PAGE_BUDGET);
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
