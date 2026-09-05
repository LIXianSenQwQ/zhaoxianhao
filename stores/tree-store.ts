/**
 * stores/tree-store.ts
 * 族谱树视图 Store（Sprint R4）
 * 
 * 职责：维护树视图展开状态（path -> collapsed）、当前页面加载路径、子树分页缓冲
 * 纯 JS/TS 可用，不依赖 uni-app/uni API；数据流与 UI 解耦
 */
import { ref, computed } from 'vue';
import { call, read } from '@/services/request';
import { useUserStore } from './user';

// ─── 类型 ───
export interface TreeNode { path: string; name: string; generation: number; genealogyName?: string; gender?: string }
export interface TreePage { nodes: TreeNode[]; cursor?: string; hasMore: boolean }

export function useTreeStore() {
  const user = useUserStore();
  
  // 展开状态：path -> false(expanded) / true(collapsed)
  const collapsedMap = ref<Record<string, boolean>>({});
  // 当前页数据：按根节点 key=path 缓存
  const pages = ref<Map<string, TreePage>>(new Map());
  // 加载中状态
  const loadingPaths = ref<Set<string>>(new Set());
  
  const toggleCollapse = (path: string) => {
    const prev = collapsedMap.value[path] ?? false;
    collapsedMap.value[path] = !prev;
  };
  
  const isExpanded = (path: string) => !collapsedMap.value[path];
  const isCollapsed = (path: string) => !!collapsedMap.value[path];
  const setCollapse = (path: string, collapse: boolean) => {
    collapsedMap.value[path] = collapse;
  };
  
  // 获取当前页：若已缓存则优先返回
  const getPage = (rootPath: string): TreePage | null => {
    return pages.value.get(rootPath) || null;
  };
  
  // 加载根节点子树（懒加载：从 pagesMap 取或调 API，无 cacheKey 防重复请求）
  async function loadRoot(rootPath: string) {
    if (loadingPaths.value.has(rootPath)) return getPage(rootPath);
    loadingPaths.value.add(rootPath);
    try {
      const res = await read('member', { action: 'tree', focusId: rootPath, page: 1 }, `tree:${rootPath}:r`, 30000);
      if (res.data?.nodes) {
        pages.value.set(rootPath, { ...res.data, hasMore: res.data.hasMore ?? false });
      }
      return getPage(rootPath);
    } finally {
      loadingPaths.value.delete(rootPath);
    }
  }
  
  // 子树懒加载：点击节点时调用 member.tree(path)
  async function loadChildren(parentPath: string) {
    if (!isExpanded(parentPath)) return; // 收缩态不加载
    if (pages.value.get(`${parentPath}_children`)) return; // 已缓存
    if (loadingPaths.value.has(parentPath)) return; // 正在加载
    
    loadingPaths.value.add(parentPath);
    try {
      const res = await read('member', { action: 'tree', focusId: parentPath, page: 1 }, `tree:${parentPath}:c`, 30000);
      if (res.data?.nodes) {
        pages.value.set(`${parentPath}_children`, { ...res.data, hasMore: res.data.hasMore ?? false });
      }
      return getPage(`${parentPath}_children`);
    } finally {
      loadingPaths.value.delete(parentPath);
    }
  }
  
  // 续载下一页
  async function nextPage(rootPath: string) {
    const cur = getPage(rootPath);
    if (!cur || !cur.hasMore || !cur.cursor) return null;
    const p = cur.page + 1;
    loadingPaths.value.add(rootPath);
    try {
      const res = await read('member', { action: 'tree', focusId: rootPath, page: p }, `tree:${rootPath}:${p}`, 30000);
      if (res.data?.nodes) {
        pages.value.set(rootPath, { ...res.data, hasMore: res.data.hasMore ?? false, page: p, cursor: res.data.cursor });
        return res.data;
      }
      return null;
    } finally {
      loadingPaths.value.delete(rootPath);
    }
  }
  
  // 刷新整棵树
  async function refreshRoot(rootPath: string) {
    pages.value.set(rootPath, undefined as any); // 清空缓存
    return loadRoot(rootPath);
  }
  
  // 重置（登出）
  function reset() {
    collapsedMap.value = {};
    pages.value.clear();
    loadingPaths.value.clear();
  }
  
  return {
    collapsedMap,
    pages,
    loadingPaths,
    isExpanded,
    isCollapsed,
    toggleCollapse,
    setCollapse,
    getPage,
    loadRoot,
    loadChildren,
    nextPage,
    refreshRoot,
    reset
  };
}
