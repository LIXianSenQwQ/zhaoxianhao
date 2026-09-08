/**
 * cloud/functions/analytics/index.js — 统计分析模块（R32）
 *
 * 功能（框架 §4.1 统计分析 P2）：
 *   - overview: 人口总览（总数/男女比例/在世故世/分支数）
 *   - generationDist: 世代分布（每世代人数柱状图数据）
 *   - branchCompare: 分支对比（各分支人口/世代深度/男女比例）
 *
 * 权限：MEMBER+ 读（家族速览）；EDITOR+ 可看全量字段投影
 */
const wx = require('wx-server-sdk');
wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

const { OK, BAD_REQUEST, FORBIDDEN } = require('./common/response');
const { hasRole } = require('./common/roles');

// ─── 工具 ───
async function requesterCtx(db, openid) {
  const userRes = await db.collection('users').where({ openid }).limit(1).get();
  const role = (userRes.data[0] && userRes.data[0].role) || 'VISITOR';
  return { openid, role };
}

/** 游标分页拉取成员投影（复用 branch.stats R28 模式） */
async function fetchAllMembers(db) {
  const PAGE_SIZE = 100;
  const members = [];
  let skip = 0;
  for (;;) {
    let pageQuery = db.collection('members').skip(skip).limit(PAGE_SIZE);
    if (typeof pageQuery.field === 'function') {
      pageQuery = pageQuery.field({ gender: true, status: true, generation: true, branchId: true, path: true, genealogyName: true });
    }
    const pageRes = await pageQuery.get();
    const page = (pageRes && pageRes.data) || [];
    if (page.length === 0) break;
    members.push(...page);
    if (page.length < PAGE_SIZE) break;
    skip += PAGE_SIZE;
  }
  return members;
}

/**
 * 通用聚合器：从成员列表计算统计指标（纯函数，可单测）
 * 独立导出供测试使用
 */
export function aggregate(members) {
  const total = members.length;
  const male = members.filter(m => m.gender === 'MALE').length;
  const female = members.filter(m => m.gender === 'FEMALE').length;
  const unknownGender = total - male - female;
  const alive = members.filter(m => m.status === 'ALIVE').length;
  const deceased = total - alive;

  // 世代分布
  const genMap = new Map();
  for (const m of members) {
    const g = m.generation ?? 0;
    genMap.set(g, (genMap.get(g) || 0) + 1);
  }
  const generationDist = [...genMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([generation, count]) => ({ generation, count }));

  // 分支聚合
  const branchMap = new Map();
  for (const m of members) {
    const b = m.branchId || 'UNASSIGNED';
    if (!branchMap.has(b)) {
      branchMap.set(b, { branchId: b, total: 0, male: 0, female: 0, alive: 0, minGen: Infinity, maxGen: 0 });
    }
    const agg = branchMap.get(b);
    agg.total += 1;
    if (m.gender === 'MALE') agg.male += 1;
    if (m.gender === 'FEMALE') agg.female += 1;
    if (m.status === 'ALIVE') agg.alive += 1;
    if (m.generation) {
      agg.minGen = Math.min(agg.minGen, m.generation);
      agg.maxGen = Math.max(agg.maxGen, m.generation);
    }
  }
  const branches = [...branchMap.values()].map(b => ({
    ...b,
    minGen: b.minGen === Infinity ? 0 : b.minGen,
    generationDepth: b.maxGen - (b.minGen === Infinity ? b.maxGen : b.minGen),
    malePct: b.total ? Math.round((b.male / b.total) * 1000) / 10 : 0
  })).sort((a, b) => b.total - a.total);

  return {
    total, male, female, unknownGender, alive, deceased,
    malePct: total ? Math.round((male / total) * 1000) / 10 : 0,
    femalePct: total ? Math.round((female / total) * 1000) / 10 : 0,
    generationCount: genMap.size,
    maxGeneration: generationDist.length ? generationDist[generationDist.length - 1].generation : 0,
    generationDist,
    branchCount: branches.filter(b => b.branchId !== 'UNASSIGNED').length,
    unassignedCount: (branchMap.get('UNASSIGNED') || {}).total || 0,
    branches
  };
}

module.exports.aggregate = aggregate;

// ─── R32-1: 人口总览 ───
async function overview(ctx) {
  const db = wx.getDatabase();
  if (!hasRole(ctx.role, 'MEMBER')) return FORBIDDEN('认证族人方可查看统计分析');

  const members = await fetchAllMembers(db);
  const stats = aggregate(members);

  // EDITOR+ 才能看分支明细（族人只看汇总）
  const payload = {
    total: stats.total,
    male: stats.male,
    female: stats.female,
    unknownGender: stats.unknownGender,
    alive: stats.alive,
    deceased: stats.deceased,
    malePct: stats.malePct,
    femalePct: stats.femalePct,
    generationCount: stats.generationCount,
    maxGeneration: stats.maxGeneration,
    branchCount: stats.branchCount
  };
  if (hasRole(ctx.role, 'EDITOR')) {
    payload.generationDist = stats.generationDist;
    payload.unassignedCount = stats.unassignedCount;
  }

  return OK(payload);
}

// ─── R32-2: 世代分布 ───
async function generationDist(ctx) {
  const db = wx.getDatabase();
  if (!hasRole(ctx.role, 'MEMBER')) return FORBIDDEN('认证族人方可查看世代分布');

  const members = await fetchAllMembers(db);
  const stats = aggregate(members);

  // 对齐字辈诗：附加每世代字辈字（generations 集合 order → char）
  const genRes = await db.collection('generations').limit(200).get();
  const genCharByOrder = new Map((genRes.data || []).map(g => [g.order, g.char || g.generationChar || '']));

  const dist = stats.generationDist.map(d => ({
    ...d,
    generationChar: genCharByOrder.get(d.generation) || ''
  }));

  return OK({ dist, peakGeneration: dist.length ? dist.reduce((a, b) => (b.count > a.count ? b : a)) : null });
}

// ─── R32-3: 分支对比 ───
async function branchCompare(ctx) {
  const db = wx.getDatabase();
  if (!hasRole(ctx.role, 'EDITOR')) return FORBIDDEN('编辑及以上可查看分支对比');

  const members = await fetchAllMembers(db);
  const stats = aggregate(members);

  // 挂接分支名称（branches 集合 code → name）
  const bRes = await db.collection('branches').where({ status: 'ACTIVE' }).limit(500).get();
  const nameByCode = new Map((bRes.data || []).map(b => [b.code, b.name]));

  const branches = stats.branches.map(b => ({
    ...b,
    branchName: nameByCode.get(b.branchId) || (b.branchId === 'UNASSIGNED' ? '未分配' : b.branchId)
  }));

  return OK({ branches, totalBranches: branches.length });
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
      case 'overview': return await overview(ctx);
      case 'generationDist': return await generationDist(ctx);
      case 'branchCompare': return await branchCompare(ctx);
      default: return BAD_REQUEST(`未知 action: ${action}`);
    }
  } catch (e) {
    console.error('[analytics.main] error:', e);
    return BAD_REQUEST(e.message);
  }
} };

// 导出纯函数供单测
module.exports.aggregate = aggregate;
module.exports.fetchAllMembers = fetchAllMembers;
