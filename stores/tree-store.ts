/**
 * stores/tree-store.ts
 * 族谱树视图 Store（Sprint R4 / R5 重构）
 * 
 * 状态机/缓存/续载判定逻辑抽离至 utils/tree-view.js（纯函数可单测）。
 * 本文件只做 uni 请求桥接 + Vue 响应式包装。
 */
import { ref } from 'vue';
import { read } from '@/services/request';
import * as V from '@/utils/tree-view';

export interface TreeNode { path: string; name: string; generation: number; genealogyName?: string; gender?: string; _id?: string; children?: TreeNode[] }
export interface TreePage { nodes: TreeNode[]; cursor?: string; hasMore: boolean }

export function useTreeStore() {
  // 响应式包装
  const collapsedMap = ref<Record<string, boolean>>({});
  const pages = ref<Map<string, TreePage>>(new Map());
  const loadingPaths = ref<Set<string>>(new Set());

  // ─── 折叠态（委托 tree-view 纯函数） ───
  const isExpanded = (path: string) => V.isExpanded(collapsedMap.value, path);
  const toggleCollapse = (path: string) => {
    collapsedMap.value = V.toggleCollapse(collapsedMap.value, path);
  };
  const setCollapse = (path: string, collapse: boolean) => {
    collapsedMap.value = V.setCollapse(collapsedMap.value, path, collapse);
  };

  // ─── 页缓存 ───
  const getPage = (key: string): TreePage | null => V.getPage(pages.value, key);
  const hasCache = (key: string) => V.hasCache(pages.value, key);

  function cachePut(key: string, value: TreePage) {
    pages.value = V.cacheSet(pages.value, key, value);
  }

  // ─── API 桥接（懒加载 + 分页） ───
  async function loadRoot(rootPath: string): Promise<TreePage | null> {
    const key = V.CACHE_KEY_ROOT(rootPath);
    if (hasCache(key) || loadingPaths.value.has(key)) return getPage(key);
    loadingPaths.value.add(key);
    try {
      const res = await read('member', { action: 'tree', focusId: rootPath, page: 1 }, key, 30000);
      if (res.data?.nodes) {
        cachePut(key, { nodes: res.data.nodes, cursor: res.data.cursor, hasMore: !!res.data.hasMore });
      }
      return getPage(key);
    } finally {
      loadingPaths.value.delete(key);
    }
  }

  async function loadChildren(parentPath: string): Promise<TreePage | null> {
    const key = V.CACHE_KEY_CHILDREN(parentPath);
    if (hasCache(key) || loadingPaths.value.has(key)) return getPage(key);
    loadingPaths.value.add(key);
    try {
      const res = await read('member', { action: 'tree', focusId: parentPath, page: 1 }, key, 30000);
      if (res.data?.nodes) {
        cachePut(key, { nodes: res.data.nodes, cursor: res.data.cursor, hasMore: !!res.data.hasMore });
      }
      return getPage(key);
    } finally {
      loadingPaths.value.delete(key);
    }
  }

  async function nextPage(rootPath: string, pageNo: number): Promise<TreePage | null> {
    const key = V.PAGE_KEY(rootPath, pageNo);
    if (!V.hasNextPage(V.CACHE_KEY_ROOT(rootPath), pages.value)) return null;
    if (loadingPaths.value.has(key)) return null;
    loadingPaths.value.add(key);
    try {
      const res = await read('member', { action: 'tree', focusId: rootPath, page: pageNo }, key, 30000);
      if (res.data?.nodes) {
        cachePut(key, { nodes: res.data.nodes, cursor: res.data.cursor, hasMore: !!res.data.hasMore });
        return getPage(key);
      }
      return null;
    } finally {
      loadingPaths.value.delete(key);
    }
  }

  async function refreshRoot(rootPath: string) {
    pages.value = V.cacheClear(pages.value, rootPath);
    return loadRoot(rootPath);
  }

  function reset() {
    collapsedMap.value = V.resetCollapsed();
    pages.value = new Map();
    loadingPaths.value = new Set();
  }

  return {
    collapsedMap, pages, loadingPaths,
    isExpanded, toggleCollapse, setCollapse,
    getPage, hasCache,
    loadRoot, loadChildren, nextPage, refreshRoot, reset
  };
}
