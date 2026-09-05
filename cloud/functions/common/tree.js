/**
 * cloud/functions/common/tree.js
 * 族谱树物化路径方案（纯函数，Sprint R2 功能完整性核心）
 *
 * 方案：members.path = '/001/003/007/'（各段为 memberNo，固定 3 位）
 * - 子树查询：path 前缀匹配（云数据库正则 ^，走 path 索引）
 * - 世代数：分段数（始祖为 1 世）
 * - LCA：两路径最长公共前缀 → 关系推导（n 上溯 / m 下溯，配 kindship.kinshipTitle）
 * - 分页预算：单页 ≤200 节点（渲染与传输预算，文档 2.2 性能口径）
 */

const PATH_SEP = '/';
const SEG_LEN = 3;
/** 单页节点预算：树分页硬上限 */
const TREE_PAGE_BUDGET = 200;

/** 校验并规整 memberNo 为 3 位段 */
function segmentOf(memberNo) {
  const s = String(memberNo);
  if (!/^\d{1,3}$/.test(s)) throw new Error(`invalid memberNo: ${memberNo}`);
  return s.padStart(SEG_LEN, '0');
}

/** 构造子路径：父路径 + 本序号 */
function buildPath(parentPath, memberNo) {
  if (parentPath === '') parentPath = '/'; // 始祖
  if (!/^\/(\d{3}\/)*$/.test(parentPath)) {
    throw new Error(`invalid parentPath: ${parentPath}`);
  }
  return `${parentPath}${segmentOf(memberNo)}/`;
}

/** 始祖路径 */
const ROOT_PATH = '/';

/** 世代数：/001/003/ → 2 世 */
function generationOf(path) {
  if (!path || path === '/') return 0; // 空为未挂接
  const n = path.split(PATH_SEP).filter(Boolean).length;
  return n;
}

/** descendant 是否为 ancestor 的后代（含自身） */
function isDescendantOf(ancestorPath, descendantPath) {
  if (!ancestorPath || !descendantPath) return false;
  return descendantPath === ancestorPath || descendantPath.startsWith(ancestorPath);
}

/** 最近共同祖先路径（LCA） */
function commonAncestorPath(pathA, pathB) {
  const a = pathA.split(PATH_SEP).filter(Boolean);
  const b = pathB.split(PATH_SEP).filter(Boolean);
  const common = [];
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) break;
    common.push(a[i]);
  }
  return common.length ? `${PATH_SEP}${common.join(PATH_SEP)}${PATH_SEP}` : ROOT_PATH;
}

/**
 * 关系步数：self → LCA 上溯 up 代，LCA → other 下溯 down 代
 * 与 kindship.kinshipTitle(n,m) 对齐：n=up, m=down；up=0&&down=0 为本人
 */
function relationSteps(selfPath, otherPath) {
  const lca = commonAncestorPath(selfPath, otherPath);
  const up = generationOf(selfPath) - generationOf(lca);
  const down = generationOf(otherPath) - generationOf(lca);
  return { lca, up, down };
}

/**
 * 树分页：按路径字典序展平列表切页（保证同层同父相邻，前端局部渲染）
 * 返回 { items, nextCursor, hasMore, total }
 */
function paginateTree(sortedNodes, cursor = '', pageSize = TREE_PAGE_BUDGET) {
  if (pageSize > TREE_PAGE_BUDGET) pageSize = TREE_PAGE_BUDGET; // 预算封顶
  const start = cursor ? sortedNodes.findIndex(n => n.path === cursor) : 0;
  const from = start < 0 ? 0 : start;
  const items = sortedNodes.slice(from, from + pageSize);
  const nextIdx = from + items.length;
  return {
    items,
    nextCursor: nextIdx < sortedNodes.length ? sortedNodes[nextIdx].path : null,
    hasMore: nextIdx < sortedNodes.length,
    total: sortedNodes.length
  };
}

/**
 * 子树前缀正则（云数据库 db.RegExp 用）：
 * subtreeRegex('/001/003/') → ^\/001\/003（匹配该节点及其全部后代）
 */
function subtreeRegex(ancestorPath) {
  const escaped = ancestorPath.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
  // 去掉尾部斜杠后匹配前缀，保证恰好是"该节点+后代"而非同前缀数字的兄弟
  const trimmed = escaped.replace(/\\\/$/, '');
  return new RegExp(`^${trimmed}(/|$)`);
}

/**
 * rebuildPaths - 存量数据物化路径回填（纯函数，Sprint R3）
 * @param {Array} members [{_id, memberNo?}] 成员列表（顺序即默认编号序）
 * @param {Array} edges   [{childId, parentId}] 父子边（方向显式）
 * @param {Function} [memberNoOf] 从 member 取编号的函数，默认用 memberNo 或序号
 * @returns {{ patches: Array<{_id, path}>, conflicts: string[], roots: string[] }}
 *   patches  → 批量 update 计划（dry-run 打印 / apply 写库）
 *   conflicts → 编号冲突 / 成环 / 缺父 引用问题清单（阻断 apply）
 */
function rebuildPaths(members, edges, memberNoOf) {
  const noOf = memberNoOf || ((m, i) => m.memberNo ?? String(i + 1));
  const conflicts = [];
  const byId = new Map(members.map((m, i) => [m._id, m]));

  // childId → parentId
  const parentMap = new Map();
  for (const e of edges || []) {
    if (!byId.has(e.childId) || !byId.has(e.parentId)) {
      conflicts.push(`边引用不存在的成员: ${e.childId} -> ${e.parentId}`);
      continue;
    }
    if (parentMap.has(e.childId)) {
      conflicts.push(`成员 ${e.childId} 存在多个父亲声明（旧=${parentMap.get(e.childId)} 新=${e.parentId}）`);
      continue;
    }
    if (e.childId === e.parentId) {
      conflicts.push(`自引用成环: ${e.childId}`);
      continue;
    }
    parentMap.set(e.childId, e.parentId);
  }

  // 编号分配（先算全部，冲突只记不抛）
  const segOf = new Map();
  const usedBySeg = new Map(); // "parentId:seg" -> memberId 防同父下编号重复
  members.forEach((m, i) => {
    try {
      const seg = segmentOf(noOf(m, i));
      const parent = parentMap.get(m._id) || null;
      const k = `${parent || 'ROOT'}:${seg}`;
      if (usedBySeg.has(k)) {
        conflicts.push(`同父下编号重复 ${seg}: ${usedBySeg.get(k)} 与 ${m._id}`);
      } else {
        usedBySeg.set(k, m._id);
      }
      segOf.set(m._id, seg);
    } catch (err) {
      conflicts.push(`成员 ${m._id}: ${err.message}`);
    }
  });

  // 森林：根 = 无父者
  const roots = members.filter(m => !parentMap.has(m._id)).map(m => m._id);
  const childrenOf = new Map();
  for (const [child, parent] of parentMap) {
    if (!childrenOf.has(parent)) childrenOf.set(parent, []);
    childrenOf.get(parent).push(child);
  }

  // BFS 自根向下构造 path（迭代防爆栈）
  const patches = [];
  const visited = new Set();
  const queue = roots.map(id => ({ id, parentPath: ROOT_PATH }));
  while (queue.length) {
    const { id, parentPath } = queue.shift();
    if (visited.has(id)) {
      conflicts.push(`检测到环: ${id} 被二次访问`);
      continue;
    }
    visited.add(id);
    const seg = segOf.get(id);
    if (!seg) continue; // 编号失败者跳过（已记冲突）
    const p = buildPath(parentPath, seg);
    patches.push({ _id: id, path: p });
    for (const child of childrenOf.get(id) || []) {
      queue.push({ id: child, parentPath: p });
    }
  }
  for (const m of members) {
    if (!visited.has(m._id) && parentMap.has(m._id)) {
      conflicts.push(`成员 ${m._id} 不可达（父亲链断裂或成环）`);
    }
  }

  return { patches, conflicts, roots };
}

module.exports = {
  ROOT_PATH,
  TREE_PAGE_BUDGET,
  buildPath,
  generationOf,
  isDescendantOf,
  commonAncestorPath,
  relationSteps,
  paginateTree,
  subtreeRegex,
  segmentOf,
  rebuildPaths
};
