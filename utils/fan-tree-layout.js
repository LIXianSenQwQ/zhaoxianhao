/**
 * utils/fan-tree-layout.js — 族谱树扇形视图布局纯函数（P1 一期：静态布局）
 *
 * 设计（对齐 docs/p1-fan-view-review.md §3）：
 *   焦点人物在环 0；祖先代向内收缩环（半径更小，环上人数通常更少，周长匹配），
 *   后代代向外扩展环（半径更大，可容纳更多扇区）。
 *   每个「家庭单元」（夫+妻）占据一段角度扇区；兄弟按 birthOrder 顺时针排列；
 *   输出节点笛卡尔坐标 + 同心环元数据 + 连线端点，供 TreeGraph Canvas 直接绘制。
 *
 * 全部纯函数、可单测、无 uni-app 依赖；复用 family-tree-layout 的路径/家庭通用件。
 * 注意：本文件为 ESM（与 family-tree-layout.js 一致），Node ≥22 可用 require 加载。
 */

import { parsePath, generationOf } from './family-tree-layout.js';

// 可调参数（TreeGraph 渲染时可按视口重设）
const RING_STEP = 96;      // 相邻世代环半径差（px）
const R0 = 240;            // 焦点环半径（px）——给向内收缩的祖辈环留出空间
const MIN_R = 60;          // 最小环半径下限（防祖辈环过度内缩）
const NODE_W = 120;        // 卡片宽（与树形一致，便于复用绘制）
const NODE_H = 50;         // 卡片高
const PAIR_GAP = 24;       // 夫妻双卡在环向的间距（px）

// 半径 = 焦点环 + 代差×步长；负代差向内收缩，且设下限
function ringRadius(delta) {
  const r = R0 + delta * RING_STEP;
  return Math.max(MIN_R, r);
}

// 某半径下一张卡的环向半张角（弧度）：卡宽 近似 弧长 w ≈ r·Δθ → Δθ = NODE_W / (2r)
function halfAngleAt(radius) {
  return (NODE_W / 2 + PAIR_GAP / 2) / Math.max(radius, 1);
}

/**
 * fanLayout — 扇形布局
 * @param {Array} nodes    五世窗口节点集 [{ _id, path, genealogyName?, gender?, spouseId?, birthOrder? }]
 * @param {String} focusPath 焦点成员 path（如 '/a1/b2/'），其所在环为 Δ=0
 * @returns {{
 *   nodes: Array<{ _id,path,x,y,r,theta,ring,gender,name }>,  // x/y 为卡片中心
 *   families: Array<{ ring, angleFrom, angleTo, members:[...] }>,
 *   edges: Array<{ from, to, x1,y1,x2,y2 }>,                  // 父→子连线端点（环间）
 *   rings: Array<{ delta, radius }>, focusPath
 * }}
 */
function fanLayout(nodes, focusPath) {
  const list = Array.isArray(nodes) ? nodes.filter(n => n && typeof n.path === 'string') : [];
  const empty = { nodes: [], families: [], edges: [], rings: [], focusPath };
  if (!list.length || !focusPath) return empty;

  const pathSet = new Set(list.map(n => n.path));
  const fSegs = parsePath(focusPath);
  const focusGen = fSegs.length; // 焦点世代数（路径段数即世代）

  // ── 1. 配偶在场 + 家庭单元聚合 ──
  for (const n of list) {
    if (n.spouseId && pathSet.has(n.spouseId)) n._spousePresent = true;
  }
  const used = new Set();
  const fams = [];
  for (const n of list) {
    if (used.has(n.path)) continue;
    used.add(n.path);
    if (n._spousePresent) {
      const sp = list.find(x => x.path === n.spouseId);
      if (sp) {
        used.add(sp.path);
        fams.push({ members: [n, sp], delta: generationOf(n.path) - focusGen });
        continue;
      }
    }
    fams.push({ members: [n], delta: generationOf(n.path) - focusGen });
  }

  // ── 2. 每环子代数（用于环内角度加权）──
  const childrenOf = new Map();
  for (const n of list) {
    const segs = parsePath(n.path);
    if (segs.length <= 1) continue;
    const pp = '/' + segs.slice(0, -1).join('/') + '/';
    if (pathSet.has(pp)) {
      if (!childrenOf.has(pp)) childrenOf.set(pp, []);
      childrenOf.get(pp).push(n);
    }
  }
  // 家庭主成员 path（取 members 中 generation 更小者，通常为记录者/父）
  const familyHead = (fam) => {
    const byGen = [...fam.members].sort((a, b) =>
      generationOf(a.path) - generationOf(b.path) || a.path.localeCompare(b.path));
    return byGen[0];
  };

  // ── 3. 按环分组并分配角度 ──
  const rings = new Map(); // delta → { radius, fams }
  for (const fam of fams) {
    if (!rings.has(fam.delta)) rings.set(fam.delta, []);
    rings.get(fam.delta).push(fam);
  }

  const ringMeta = [];
  const ringOrder = [...rings.keys()].sort((a, b) => a - b); // 祖辈负Δ在前（内），后辈正Δ在后（外）
  for (const delta of ringOrder) {
    const famArr = rings.get(delta);
    const radius = ringRadius(delta);
    ringMeta.push({ delta, radius, familyCount: famArr.length });

    // 角度排序：家庭头按 birthOrder 升序（平辈长幼，顺时针自 12 点）
    famArr.sort((a, b) => {
      const ha = familyHead(a), hb = familyHead(b);
      const ao = ha && ha.birthOrder != null ? Number(ha.birthOrder) : 1e9;
      const bo = hb && hb.birthOrder != null ? Number(hb.birthOrder) : 1e9;
      if (ao !== bo) return ao - bo;
      return (ha && ha.path || '').localeCompare(hb && hb.path || '');
    });

    // 环内总权重 = Σ(1 + 0.6×该家庭直系子代数)
    const weights = famArr.map(f => {
      const head = familyHead(f);
      const kids = head && childrenOf.get(head.path) ? childrenOf.get(head.path).length : 0;
      return 1 + 0.6 * kids;
    });
    const wSum = weights.reduce((a, b) => a + b, 0);
    const full = Math.PI * 2;
    let theta = -Math.PI / 2; // 自 12 点（-π/2）起顺时针
    famArr.forEach((fam, i) => {
      const span = (weights[i] / wSum) * full;
      fam.thetaFrom = theta;
      fam.thetaTo = theta + span;
      fam.angle = theta + span / 2; // 扇区中线角
      fam.radius = radius;
      theta += span;
    });
  }

  // ── 4. 家庭 → 成员坐标（夫妻沿扇区中线两侧错开）──
  const outNodes = [];
  const outFams = [];
  for (const fam of fams) {
    const r = fam.radius;
    const mid = fam.angle;
    let offset = 0;
    const placed = [];
    // 主成员先摆中线，配偶偏移（环向上按半径差微调防重叠）
    const ordered = [...fam.members].sort((a, b) =>
      generationOf(a.path) - generationOf(b.path));
    for (const m of ordered) {
      const t = mid + (offset * halfAngleAt(r) * 0.5);
      const x = Math.round(r * Math.cos(t));
      const y = -Math.round(r * Math.sin(t));
      placed.push({
        _id: m._id, path: m.path, name: m.genealogyName || m.name || '',
        gender: m.gender, ring: fam.delta, r, theta: t, x, y,
        generation: m.generation || generationOf(m.path),
        fiveFu: m.fiveFu,
        spouseId: m.spouseId
      });
      offset += 1;
    }
    outFams.push({
      ring: fam.delta, angleFrom: fam.thetaFrom, angleTo: fam.thetaTo,
      members: placed, cx: Math.round(r * Math.cos(mid)), cy: -Math.round(r * Math.sin(mid))
    });
    outNodes.push(...placed);
  }

  // ── 5. 连线：父家庭扇区中心 → 子家庭扇区中心（端点取实际父/子成员 path）──
  const edges = [];
  for (const n of list) {
    const segs = parsePath(n.path);
    if (segs.length <= 1) continue;
    const pp = '/' + segs.slice(0, -1).join('/') + '/';
    if (!pathSet.has(pp)) continue;
    const parentFam = outFams.find(f => f.members.some(m => m.path === pp));
    const childFam = outFams.find(f => f.members.some(m => m.path === n.path));
    if (!parentFam || !childFam || parentFam === childFam) continue;
    edges.push({
      from: pp, to: n.path,
      x1: parentFam.cx, y1: parentFam.cy,
      x2: childFam.cx, y2: childFam.cy
    });
  }

  return {
    nodes: outNodes,
    families: outFams,
    edges,
    rings: ringMeta,
    focusPath
  };
}

// 五服环序标签（由内向外的血缘亲疏近似，实际以 wufuColor 精确着色）
function ringLabel(delta) {
  if (delta === 0) return '本人';
  if (delta === -1) return '父母';
  if (delta === -2) return '祖辈';
  if (delta === 1) return '子女';
  if (delta === 2) return '孙辈';
  return delta > 0 ? `后${delta}代` : `上${-delta}代`;
}

// ─── 五服环着色（P1 二期）：|世代差| → 五服标签（本人最内朱砂，越外越疏） ───
// 同心环 = 世代亲疏：|Δ|0 本人 · 1 近(斩衰) · 2 齐衰 · 3 大功 · 4 小功 · 5 缌麻 · ≥6 出五服
const RING_FU_ORDER = ['本人', '斩衰', '齐衰', '大功', '小功', '缌麻', '出五服'];

/**
 * fanRingWuFu — 按环深度（世代差绝对值）映射五服标签（供 wufuColor 取色）
 * @param {number} delta 世代差（fanLayout 节点 ring）
 * @returns {string} 本人/斩衰/齐衰/大功/小功/缌麻/出五服
 */
function fanRingWuFu(delta) {
  const n = Number(delta);
  if (!Number.isFinite(n)) return '出五服'; // 未知/异常 → 最疏
  const d = Math.abs(n);
  return RING_FU_ORDER[Math.min(d, RING_FU_ORDER.length - 1)];
}

/**
 * toGraphData — 将 fanLayout 结果适配为 TreeGraph 扇形模式的输入契约
 * @param {ReturnType<typeof fanLayout>} res fanLayout 输出
 * @returns {{ nodes:Array<{id,name,generation,isMale,x,y,path,fiveFu,ring}>, edges:Array<{from:{x,y},to:{x,y}}>, rings:Array<{delta,radius,familyCount}> }}
 */
function toGraphData(res) {
  if (!res || !Array.isArray(res.nodes)) {
    return { nodes: [], edges: [], rings: [], focusPath: null };
  }
  return {
    focusPath: res.focusPath || null,
    nodes: res.nodes.map(n => ({
      id: n._id || n.path,
      name: n.name || '',
      generation: n.generation != null ? n.generation : n.ring,
      isMale: n.gender === 'MALE',
      x: n.x, y: n.y,
      path: n.path,
      ring: n.ring,
      fiveFu: n.fiveFu || fanRingWuFu(n.ring) // 无精确五服数据时按环深度近似
    })),
    edges: (res.edges || []).map(e => ({
      from: { x: e.x1, y: e.y1 },
      to: { x: e.x2, y: e.y2 }
    })),
    rings: res.rings || []
  };
}

export {
  RING_STEP, R0, MIN_R,
  ringRadius, halfAngleAt,
  fanLayout, ringLabel, fanRingWuFu, toGraphData
};
