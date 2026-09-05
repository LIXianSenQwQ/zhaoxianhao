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
  segmentOf
};
