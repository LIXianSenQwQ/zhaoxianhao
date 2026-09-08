/**
 * cloud/functions/rootseek/index.js — 寻根问祖模块（R32）
 *
 * 功能：
 *   - searchKin: 同宗查询（姓名 + 世代 + 父名/母名 + 地域多维匹配）
 *   - traceAncestry: 分支溯源（向上追溯到总谱路径）
 *   - dna.link: DNA 数据登记占位（R32+ 预留）
 *
 * 权限：MEMBER+ 读 / EDITOR+ 写（DNA 登记）
 */
const wx = require('wx-server-sdk');
wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

const { OK, BAD_REQUEST, FORBIDDEN, NOT_FOUND } = require('./common/response');
const { hasRole } = require('./common/roles');
const { writeAudit } = require('./common/audit');

// ─── 工具 ───
function pickDoc(res) {
  const arr = res && res.data;
  if (Array.isArray(arr)) return arr.length ? arr[0] : null;
  return arr || null;
}

/** 请求者上下文（角色解析） */
async function requesterCtx(db, openid) {
  const userRes = await db.collection('users').where({ openid }).limit(1).get();
  const role = (userRes.data[0] && userRes.data[0].role) || 'VISITOR';
  return { openid, role };
}

/**
 * R32-1: 同宗查询（searchKin）
 * 多维匹配：关键词（谱名/本名）+ 世代 + 地域；四维匹配中的「父名/母名」
 * 依赖 relations 反查，V2.0 简化版先以本名/谱名 + 世代 + 地域三维落地。
 */
async function searchKin(ctx, { keyword, generation, region, limit = 50 } = {}) {
  const db = wx.getDatabase();
  if (!hasRole(ctx.role, 'MEMBER')) return FORBIDDEN('认证族人方可进行同宗查询');
  if (!keyword && generation === undefined && !region) {
    return BAD_REQUEST('keyword/generation/region 至少其一');
  }

  const where = {};
  const orClauses = [];

  if (keyword && String(keyword).trim()) {
    const k = String(keyword).trim();
    orClauses.push({ genealogyName: db.command.regexp(`.*${k}.*`) });
    orClauses.push({ name: db.command.regexp(`.*${k}.*`) });
  }
  if (generation !== undefined && Number.isFinite(Number(generation))) {
    where.generation = Number(generation);
  }
  if (region && String(region).trim()) {
    const r = String(region).trim();
    orClauses.push({ birthPlace: db.command.regexp(`.*${r}.*`) });
    orClauses.push({ deathPlace: db.command.regexp(`.*${r}.*`) });
  }
  if (orClauses.length > 0) where.$or = orClauses;

  const res = await db.collection('members')
    .where(where)
    .limit(Math.min(Number(limit) || 50, 50))
    .get();

  const hits = (res.data || []).map(m => ({
    id: m._id,
    genealogyName: m.genealogyName || m.name,
    name: m.name,
    generation: m.generation ?? null,
    gender: m.gender,
    branchId: m.branchId,
    path: m.path,
    status: m.status
  }));

  await writeAudit(db, {
    userId: ctx.openid,
    action: 'rootseek.searchKin',
    target: `${hits.length} matches`,
    detail: JSON.stringify({ keyword, generation, region }),
    time: new Date()
  });

  return OK({ hits, total: hits.length, page: 1 });
}

/**
 * R32-2: 分支溯源（traceAncestry）
 * 物化路径向上追溯：/001/002/003/ → 逐级回溯到总谱根
 */
async function traceAncestry(ctx, { memberId } = {}) {
  const db = wx.getDatabase();
  if (!hasRole(ctx.role, 'MEMBER')) return FORBIDDEN('认证族人方可追溯祖先');
  if (!memberId) return BAD_REQUEST('memberId required');

  // 1. 获取成员信息（doc().get() 失败兼容：stub 可能返回数组）
  let member = null;
  try {
    const mRes = await db.collection('members').doc(memberId).get();
    member = mRes && mRes.data && !Array.isArray(mRes.data) ? mRes.data : (mRes && mRes.data && mRes.data[0]) || null;
  } catch (e) {
    member = null;
  }
  if (!member) {
    // 回退：按 _id where 查询
    const alt = await db.collection('members').where({ _id: memberId }).limit(1).get();
    member = pickDoc(alt);
  }
  if (!member) return NOT_FOUND('成员不存在');

  // 2. 物化路径解析祖先链：path '/001/002/003/' → segments [001,002,003]
  const pathSegments = String(member.path || '').split('/').filter(Boolean);

  // 3. 逐级构造祖先路径并查询
  const ancestors = [];
  for (let i = 1; i < pathSegments.length; i++) {
    const ancestorPath = '/' + pathSegments.slice(0, i).join('/') + '/';
    const pRes = await db.collection('members').where({ path: ancestorPath }).limit(1).get();
    const p = pickDoc(pRes);
    if (p) {
      ancestors.push({
        id: p._id,
        genealogyName: p.genealogyName || p.name,
        generation: p.generation,
        lifespan: p.lifespan || null,
        relationDepth: i // 第 i 代祖先
      });
    }
  }

  // 4. 按世代升序（始祖在前）
  ancestors.sort((a, b) => (a.generation || 0) - (b.generation || 0));

  const result = {
    currentMember: {
      id: member._id,
      genealogyName: member.genealogyName || member.name,
      generation: member.generation,
      branchId: member.branchId
    },
    ancestryChain: ancestors,
    directAncestorCount: ancestors.length
  };

  await writeAudit(db, {
    userId: ctx.openid,
    action: 'rootseek.traceAncestry',
    target: `${result.currentMember.genealogyName}`,
    detail: JSON.stringify({ depth: ancestors.length }),
    time: new Date()
  });

  return OK(result);
}

/**
 * R32-3: DNA 数据登记（dna.link）— 占位接口
 * 框架 §4.1 寻根问祖 P2：DNA 对接预留；真实检测机构对接在 V3.0 规划
 */
async function dnaLink(ctx, { subjectId, testType, marker, result, sourceTags } = {}) {
  const db = wx.getDatabase();
  if (!hasRole(ctx.role, 'EDITOR')) return FORBIDDEN('仅编辑及以上可登记 DNA 数据');
  if (!subjectId) return BAD_REQUEST('subjectId required');

  const mRes = await db.collection('members').where({ _id: subjectId }).limit(1).get();
  if (!pickDoc(mRes)) return NOT_FOUND('关联成员不存在');

  const ALLOWED_TYPES = ['Y-DNA', 'MT-DNA', 'AUTOSOMAL'];
  const type = ALLOWED_TYPES.includes(testType) ? testType : 'Y-DNA';

  const now = new Date();
  const addRes = await db.collection('dna_records').add({
    data: {
      subjectId,
      testType: type,
      marker: String(marker || '').slice(0, 200),
      result: String(result || '').slice(0, 200),
      sourceTags: Array.isArray(sourceTags) ? sourceTags.slice(0, 10) : [],
      createdAt: now,
      createdBy: ctx.openid,
      updatedAt: now,
      updatedBy: ctx.openid
    }
  });

  await writeAudit(db, {
    userId: ctx.openid,
    action: 'rootseek.dna.link',
    target: String(subjectId),
    detail: JSON.stringify({ testType: type }),
    sensitive: true,
    time: now
  });

  return OK({ _id: addRes._id, testType: type, message: 'DNA 数据登记成功（占位）' });
}

// ─── 主路由 ───
module.exports = { main: async (event = {}, context = {}) => {
  const openid = context.OPENID || context.openid;
  if (!openid) return FORBIDDEN('请先登录');

  const db = wx.getDatabase();
  const ctx = await requesterCtx(db, openid);
  const { action } = event;

  try {
    switch (action) {
      case 'searchKin': return await searchKin(ctx, event || {});
      case 'traceAncestry': return await traceAncestry(ctx, event || {});
      case 'dna.link': return await dnaLink(ctx, event || {});
      default: return BAD_REQUEST(`未知 action: ${action}`);
    }
  } catch (e) {
    console.error('[rootseek.main] error:', e);
    return BAD_REQUEST(e.message);
  }
} };
