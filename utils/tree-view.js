/**
 * utils/tree-view.js - 族谱树视图逻辑纯函数（Sprint R5，可单测）
 * 
 * 职责：维护树视图折叠态/缓存命中判定/分页续载判定
 * 与 uni-app API 解耦，供 stores/tree-store.ts 引用
 */

const CACHE_KEY_ROOT = (path) => `tree:${path}:r`;
const CACHE_KEY_CHILDREN = (path) => `tree:${path}:c`;
const PAGE_KEY = (path, p) => `tree:${path}:${p}`;

// ─── 折叠态机 ───
/** collapsedMap: path -> true/false → toggleCollapse → 更新后新 map */
function toggleCollapse(collapsedMap, path) {
  const prev = !!collapsedMap[path];
  return { ...collapsedMap, [path]: !prev };
}

function isExpanded(collapsedMap, path) {
  return !collapsedMap[path];
}

function setCollapse(collapsedMap, path, collapse) {
  return { ...collapsedMap, [path]: collapse };
}

function resetCollapsed() {
  return {};
}

// ─── 缓存映射器 ───
/** pages: Map<string, TreePage> → getPage / hasCache / cacheSet */
function getPage(pages, key) {
  const val = pages.get(key);
  if (!val || val === null) return null;
  // 空对象占位也视为有
  return val;
}

function hasCache(pages, key) {
  return pages.has(key) && pages.get(key) !== undefined && pages.get(key) !== null;
}

function cacheSet(pages, key, value) {
  const next = new Map(pages);
  next.set(key, value);
  return next;
}

function cacheClear(pages, rootPath) {
  const next = new Map(pages);
  // 统一前缀：根页 tree:{path}:r / 子树 tree:{path}:c / 分页 tree:{path}:{n}
  const prefix = `tree:${rootPath}:`;
  for (const k of next.keys()) {
    if (k.startsWith(prefix)) {
      next.delete(k);
    }
  }
  return next;
}

// ─── 分页续载判定 ───
function hasNextPage(cacheKey, pages) {
  const pageData = getPage(pages, cacheKey);
  if (!pageData) return false;
  return !!pageData.hasMore;
}

function getNextPageParam(rootPath, p, pages) {
  const current = getPage(pages, `${rootPath}:${p}`);
  return current ? null : p; // 若当前页无数据则返回页码请求
}

module.exports = {
  CACHE_KEY_ROOT, CACHE_KEY_CHILDREN, PAGE_KEY,
  toggleCollapse,
  isExpanded,
  setCollapse,
  resetCollapsed,
  getPage,
  hasCache,
  cacheSet,
  cacheClear,
  hasNextPage,
  getNextPageParam
};
