/**
 * stores/genealogy.ts — 世系/族谱 Store (Pinia)
 * 管理：当前焦点人物、世代选择、房支/字辈索引
 * W1 骨架：基础 state + tree 数据派发
 */
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import * as memberSvc from '../services/member';

export const useGenealogyStore = defineStore('genealogy', () => {
  // ═══ State ═══
  /** 当前焦点人物 ID（族谱树中心） */
  const focusId = ref<string | null>(null);
  /** 树节点数据 [{id, name, gender, generation, fatherId, motherId, spouseIds}] */
  const treeNodes = ref<any[]>([]);
  /** 树的关系边 [{fromId, toId, type}] */
  const treeEdges = ref<any[]>([]);
  /** 加载状态 */
  const loading = ref(false);
  /** 错误信息 */
  const error = ref<string | null>(null);
  /** 视图模式：'tree' | 'lineage'（树形 / 直系链） */
  const viewMode = ref<'tree' | 'lineage'>('tree');
  /** 当前世代数过滤 */
  const filterGeneration = ref<number | null>(null);
  /** 年份滑块值（用于时间轴过滤，null = 全部） */
  const yearFilter = ref<number | null>(null);

  // ═══ Getters ═══
  /** 焦点人物世代数 */
  const focusGeneration = computed(() => {
    const node = treeNodes.value.find(n => n.id === focusId.value);
    return node ? node.generation : null;
  });

  /** 树加载出错 */
  const hasError = computed(() => !!error.value);

  /** 按世代组织的树（世系表布局用） */
  const nodesByGeneration = computed(() => {
    const map: Record<number, any[]> = {};
    for (const n of treeNodes.value) {
      const g = n.generation || 0;
      if (!map[g]) map[g] = [];
      map[g].push(n);
    }
    return map;
  });

  // ═══ Actions ═══
  async function loadTree(focus?: string, depth = 2) {
    const id = focus || focusId.value;
    if (!id) { error.value = '未指定焦点人物'; return; }
    loading.value = true;
    error.value = null;
    try {
      const res = await memberSvc.tree(id, depth);
      if (res.error) { error.value = res.error.message; return; }
      const d: any = res.data;
      treeNodes.value = d.nodes || [];
      treeEdges.value = d.edges || [];
      focusId.value = id;
    } catch (e: any) {
      error.value = e.message || '加载族谱树失败';
    } finally {
      loading.value = false;
    }
  }

  function setFocus(id: string) {
    focusId.value = id;
    loadTree(id);
  }

  function setViewMode(mode: 'tree' | 'lineage') {
    viewMode.value = mode;
  }

  function clear() {
    focusId.value = null;
    treeNodes.value = [];
    treeEdges.value = [];
    error.value = null;
  }

  return {
    focusId, treeNodes, treeEdges, loading, error, viewMode,
    filterGeneration, yearFilter,
    focusGeneration, hasError, nodesByGeneration,
    loadTree, setFocus, setViewMode, clear
  };
});