/**
 * utils/tree-flow.js - 族谱树视图编排层（Sprint R6）
 *
 * 职责：懒加载/续载/缓存失效的全链路编排；状态就地变更（配合 Vue reactive），
 *       依赖注入 read（services/request 同签名）→ 可在 node:test 中 mock 全链路。
 *
 * state 形状（由调用方创建，可为 Vue reactive 代理）：
 *   { collapsed: {path:boolean}, pages: Map<key,TreePage>, loading: Set<key> }
 */
const V = require('./tree-view');

/**
 * @param {object}   opts
 * @param {object}   opts.state  可变状态容器（reactive 或普通对象）
 * @param {Function} opts.read   (name, data, cacheKey, cacheTTL) => Promise<CallResult>
 */
function createTreeFlow({ state, read }) {
  // ── 折叠态（委托 tree-view 纯函数，就地写回 state） ──
  const isExpanded = (path) => V.isExpanded(state.collapsed, path);
  const toggleCollapse = (path) => { state.collapsed = V.toggleCollapse(state.collapsed, path); };
  const setCollapse = (path, collapse) => { state.collapsed = V.setCollapse(state.collapsed, path, collapse); };

  // ── 页缓存（就地变更，Vue reactive 可追踪 Map） ──
  const getPage = (key) => V.getPage(state.pages, key);
  const hasCache = (key) => V.hasCache(state.pages, key);
  function cachePut(key, value) { state.pages.set(key, value); }

  function markLoading(key) { state.loading.add(key); }
  function unmarkLoading(key) { state.loading.delete(key); }

  /** 错误不缓存：返回 null 且不写 pages，保证下次可重试 */
  function applyResult(key, res) {
    if (res && res.data && Array.isArray(res.data.nodes)) {
      cachePut(key, { nodes: res.data.nodes, cursor: res.data.cursor, hasMore: !!res.data.hasMore });
      return getPage(key);
    }
    return null;
  }

  // ── 数据编排 ──

  /** 根页加载：缓存命中或加载中 → 直接返回；否则请求 page 1 */
  async function loadRoot(rootPath) {
    const key = V.CACHE_KEY_ROOT(rootPath);
    if (hasCache(key) || state.loading.has(key)) return getPage(key);
    markLoading(key);
    try {
      const res = await read('member', { action: 'tree', focusId: rootPath, page: 1 }, key, 30000);
      return applyResult(key, res);
    } finally {
      unmarkLoading(key);
    }
  }

  /** 子树懒加载：点击展开时按父 path 拉取（独立缓存位） */
  async function loadChildren(parentPath) {
    const key = V.CACHE_KEY_CHILDREN(parentPath);
    if (hasCache(key) || state.loading.has(key)) return getPage(key);
    markLoading(key);
    try {
      const res = await read('member', { action: 'tree', focusId: parentPath, page: 1 }, key, 30000);
      return applyResult(key, res);
    } finally {
      unmarkLoading(key);
    }
  }

  /** 续载：须有缓存页且 hasMore；按页码独立缓存 */
  async function nextPage(rootPath, pageNo) {
    const rootKey = V.CACHE_KEY_ROOT(rootPath);
    if (!V.hasNextPage(rootKey, state.pages)) return null;
    const key = V.PAGE_KEY(rootPath, pageNo);
    if (state.loading.has(key)) return null;
    markLoading(key);
    try {
      const res = await read('member', { action: 'tree', focusId: rootPath, page: pageNo }, key, 30000);
      return applyResult(key, res);
    } finally {
      unmarkLoading(key);
    }
  }

  /** 刷新：清本根前缀缓存后重拉根页（子树/分页页一并失效） */
  async function refreshRoot(rootPath) {
    const fresh = V.cacheClear(state.pages, rootPath);
    state.pages = fresh; // 若 state 为 reactive 代理，整表替换同样可追踪
    return loadRoot(rootPath);
  }

  /** 登出/切换身份：全量重置 */
  function reset() {
    state.collapsed = V.resetCollapsed();
    state.pages = new Map();
    state.loading = new Set();
  }

  return {
    isExpanded, toggleCollapse, setCollapse,
    getPage, hasCache,
    loadRoot, loadChildren, nextPage, refreshRoot, reset
  };
}

module.exports = { createTreeFlow };
