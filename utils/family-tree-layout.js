/**
 * utils/family-tree-layout.js
 * 族谱树布局纯函数（蓝图 §7.1 · P3 增强收口）
 *
 * 职责：将 member.tree 返回的物化路径节点集转换为带 x/y 坐标 + 连线的布局数据，
 *       供 Canvas 2D / DOM 树形展示复用；全部为纯函数、可单测、无 uni-app 依赖。
 *
 * 布局算法（对齐蓝图 7.1「树形视图」）：
 *   1. 世代为行：Y = (generation − minGen) × (NODE_H + V_GAP)，同代同 Y；
 *   2. 家庭单元：节点带 spouseId 且在集合内时横向占位 NODE_W×2+H_GAP；
 *   3. 子女按 birthOrder（缺省按 path 字典序）排序；
 *   4. 子树宽度递归：width(node) = max(家庭宽, Σ width(children) + 间隙)，
 *      兄弟从左到右排列、父节点水平居中于子女上方（tidy 布局）；
 *   5. 多根（孤儿/分页窗口）顺序横排；
 *   6. 输出 nodes(带 x/y)、edges(from→to 父→子)、width/height、families。
 *
 * 视图辅助：
 *   · filterDirectLine  直系链（祖先 + focus + 其后代）
 *   · timelineFilter    时间轴滑块（birthDate ≤ Y 且 (deathDate 空或 ≥ Y)）
 */

const NODE_W = 120;
const NODE_H = 50;
const H_GAP = 20; // 同代兄弟水平间隙
const V_GAP = 80; // 世代垂直间距
const WU_FU_COLORS = Object.freeze({
  '斩衰': '#2C2A29',
  '齐衰': '#6B5B3E',
  '大功': '#8C6A4F',
  '小功': '#A8926E',
  '缌麻': '#C4B391',
  '出五服': '#E3DCCB',
  '本人': '#B03A2E'
});

// ─── 路径工具 ───
function parsePath(path) {
  if (!path || path === '/') return [];
  return path.split('/').filter(Boolean);
}

function parentPathOf(path) {
  if (!path || path === '/') return null;
  const parts = parsePath(path);
  if (parts.length <= 1) return null;
  return '/' + parts.slice(0, -1).join('/') + '/';
}

function generationOf(path) {
  if (!path || path === '/') return 0;
  return parsePath(path).length;
}

// 家庭单元宽度（配偶同代横排 = 双卡宽 + 间隙）
function familyWidth(node) {
  if (node && node.spouseId && node._spousePresent) return NODE_W * 2 + H_GAP;
  return NODE_W;
}

function spouseIdOf(nodes, path) {
  const n = nodes.find(x => x.path === path);
  return n && n.spouseId ? n.spouseId : null;
}

/**
 * computeLayout - 核心布局
 * @param {Array} nodes [{ _id, path, genealogyName?, gender?, generation?, birthOrder?, spouseId? }]
 * @returns {{ nodes, edges, width, height, families }}
 */
function computeLayout(nodes) {
  const list = Array.isArray(nodes) ? nodes.filter(n => n && typeof n.path === 'string') : [];
  if (!list.length) return { nodes: [], edges: [], width: 0, height: 0, families: [] };

  // 配偶在场标记：spouseId 指向的 path 是否也在本次集合
  const pathSet = new Set(list.map(n => n.path));
  for (const n of list) {
    if (n.spouseId && pathSet.has(n.spouseId)) n._spousePresent = true;
  }

  // 世代范围
  let minGen = Infinity;
  const genMap = new Map();
  for (const n of list) {
    const g = generationOf(n.path);
    n.generation = g;
    genMap.set(n.path, g);
    if (g < minGen) minGen = g;
  }
  if (minGen === Infinity) minGen = 1;

  // 父子映射（path 前缀）+ 兄弟排序
  const childrenOf = new Map();
  const parents = new Map();
  for (const n of list) {
    const pp = parentPathOf(n.path);
    if (pp) {
      parents.set(n.path, pp);
      if (!childrenOf.has(pp)) childrenOf.set(pp, []);
      childrenOf.get(pp).push(n);
    }
  }
  const sortChildren = (arr) => arr.sort((a, b) => {
    const ao = a.birthOrder != null ? Number(a.birthOrder) : 1e9;
    const bo = b.birthOrder != null ? Number(b.birthOrder) : 1e9;
    if (ao !== bo) return ao - bo;
    return a.path.localeCompare(b.path);
  });
  for (const arr of childrenOf.values()) sortChildren(arr);

  // 根集合：路径的父不在集合内
  const roots = list.filter(n => {
    const pp = parentPathOf(n.path);
    return !pp || !pathSet.has(pp);
  });

  // 子树横向跨度（含自身家庭单元 + 全部后代）
  const span = new Map();
  function subtreeSpan(node) {
    if (span.has(node.path)) return span.get(node.path);
    const kids = childrenOf.get(node.path) || [];
    let w = familyWidth(node);
    if (kids.length) {
      const kidsW = kids.reduce((acc, k) => acc + subtreeSpan(k), 0) + H_GAP * (kids.length - 1);
      w = Math.max(w, kidsW);
    }
    span.set(node.path, w);
    return w;
  }
  for (const r of roots) subtreeSpan(r);

  // 递归布局（tidy）：父居中于子女上方，兄弟从左到右铺开
  function place(node, left) {
    const kids = childrenOf.get(node.path) || [];
    if (!kids.length) {
      node.x = left;
      node.y = (generationOf(node.path) - minGen) * (NODE_H + V_GAP);
      return;
    }
    let cursor = left;
    for (const k of kids) {
      place(k, cursor);
      cursor += subtreeSpan(k) + H_GAP;
    }
    const first = kids[0].x;
    const last = kids[kids.length - 1].x + subtreeSpan(kids[kids.length - 1]);
    node.x = (first + last) / 2 - familyWidth(node) / 2;
    node.y = (generationOf(node.path) - minGen) * (NODE_H + V_GAP);
  }

  let rootCursor = 0;
  for (const r of roots) {
    place(r, rootCursor);
    rootCursor += subtreeSpan(r) + H_GAP * 2;
  }

  // 归一化：整体平移至 x ≥ 0
  let minX = Infinity;
  for (const n of list) if (n.x < minX) minX = n.x;
  if (minX < 0) for (const n of list) n.x -= minX;

  // 输出边界
  let maxX = 0;
  let maxY = 0;
  for (const n of list) {
    const right = n.x + familyWidth(n);
    if (right > maxX) maxX = right;
    if (n.y + NODE_H > maxY) maxY = n.y + NODE_H;
  }

  // 连线（父 → 子）
  const edges = [];
  for (const n of list) {
    const pp = parents.get(n.path);
    if (!pp) continue;
    const parent = list.find(x => x.path === pp);
    if (!parent) continue;
    edges.push({
      from: { x: parent.x + familyWidth(parent) / 2, y: parent.y + NODE_H },
      to: { x: n.x + familyWidth(n) / 2, y: n.y }
    });
  }

  // 家庭单元列表
  const seen = new Set();
  const families = [];
  for (const n of list) {
    if (seen.has(n.path)) continue;
    if (n.spouseId && pathSet.has(n.spouseId)) {
      const sp = list.find(x => x.path === n.spouseId);
      if (sp) {
        families.push([n, sp]);
        seen.add(n.path); seen.add(sp.path);
        continue;
      }
    }
    families.push([n]);
    seen.add(n.path);
  }

  return {
    nodes: list,
    edges,
    width: Math.ceil(maxX),
    height: Math.ceil(maxY),
    families
  };
}

/**
 * 直系链过滤（蓝图 7.1 直系视图）：
 * 返回 focus 的全部祖先 + focus 自身 + focus 直系后代（按 path 前缀，含整支子系）。
 * 注意：focusPath 以 '/' 结尾，直接用 startsWith(focusPath) 匹配后代，勿再拼接 '/'。
 */
function filterDirectLine(nodes, focusPath) {
  const list = Array.isArray(nodes) ? nodes : [];
  if (!focusPath || !list.length) return list.slice();
  const fSegs = parsePath(focusPath);
  const ancestry = new Set();
  for (let i = 1; i <= fSegs.length; i++) ancestry.add('/' + fSegs.slice(0, i).join('/') + '/');
  return list.filter(n => ancestry.has(n.path) || (n.path !== focusPath && n.path.startsWith(focusPath)));
}

/**
 * 时间轴滑块过滤（蓝图 7.1）：出生年份 ≤ Y 且 (未记录死亡 或 死亡年份 ≥ Y)
 */
function timelineFilter(nodes, yearY, birthKey = 'birthDate', deathKey = 'deathDate') {
  const list = Array.isArray(nodes) ? nodes : [];
  const y = Number(yearY);
  if (!Number.isFinite(y)) return list.slice();
  return list.filter(n => {
    const b = n && n[birthKey];
    if (!b || typeof b !== 'string') return true; // 无出生记录：不排除（保守显示）
    const by = parseInt(b.slice(0, 4), 10);
    if (!Number.isFinite(by) || by > y) return false;
    const d = n[deathKey];
    if (!d || typeof d !== 'string') return true;
    const dy = parseInt(d.slice(0, 4), 10);
    return !Number.isFinite(dy) || dy >= y;
  });
}

/**
 * 五服 → 色板映射（蓝图 7.3 族谱树五服模式着色，五色见蓝本卷）
 * fiveFu 取值：斩衰/齐衰/大功/小功/缌麻/出五服/本人
 */
function wufuColor(fiveFuLabel) {
  return WU_FU_COLORS[fiveFuLabel] || WU_FU_COLORS['出五服'];
}

export {
  NODE_W, NODE_H, H_GAP, V_GAP,
  parsePath, parentPathOf, generationOf,
  computeLayout, filterDirectLine, timelineFilter,
  familyWidth, wufuColor, WU_FU_COLORS
};
