<template>
  <view class="xuemap-page">
    <!-- 顶部操作栏 -->
    <view class="top-bar">
      <text class="page-title">家谱树</text>
      <view class="controls">
        <picker :range="branchOptions" @change="filterBranch" class="branch-picker">{{ currentBranch }}</picker>
        <view class="zoom-controls">
          <text class="zoom-btn" @click="zoomOut">－</text>
          <text class="zoom-level">{{ scale }}x</text>
          <text class="zoom-btn" @click="zoomIn">＋</text>
        </view>
      </view>
    </view>

    <!-- 搜索栏 -->
    <view class="search-bar">
      <input v-model="searchText" placeholder="搜索族人姓名..." class="search-input" @confirm="doSearch" />
      <text class="search-btn" @click="clearSearch" v-if="searchText">✕</text>
    </view>
    
    <!-- 加载状态 -->
    <view class="loading-overlay" v-if="loading">
      <view class="loading-spinner"></view>
      <text>加载族人数据中...</text>
    </view>

    <!-- 错误提示 -->
    <view class="error-tip" v-else-if="error">
      <text>{{ error }}</text>
      <text class="retry-btn" @click="loadTree">点击重试</text>
    </view>

    <!-- 树形可视化 -->
    <view v-else class="tree-container" id="treeContainer" @touchmove="onTouchMove">
      <view class="tree-canvas" :style="treeStyle">
        <!-- 节点渲染 -->
        <view 
          v-for="node in treeDisplayNodes" 
          :key="node.id" 
          class="tree-node"
          :style="{ 
            left: node.x + 'px', 
            top: node.y + 'px',
            width: nodeWidth + 'px',
            background: node.isMale ? '#E3E9EC' : '#F7F4EC',
            borderColor: node.isSelected ? '#B03A2E' : 'transparent'
          }"
          @click="onNodeClick(node)"
        >
          <text class="node-name" :style="{ fontSize: node.isFocus ? '16px' : '14px' }">{{ node.name }}</text>
          <text class="node-gen" v-if="genealogyStore.$state.viewMode === 'tree'">第{{ node.generation }}世</text>
        </view>

        <!-- 连线渲染 -->
        <line 
          v-for="(line, idx) in treeDisplayEdges" 
          :key="'l' + idx"
          :from="line.from" 
          :to="line.to"
          color="#C0BBAD" 
          :width="1"
          class="tree-line"
        />
      </view>
    </view>

    <!-- 底部焦点信息 -->
    <view class="focus-bar" v-if="focusInfo">
      <text class="focus-name">{{ focusInfo.name }}</text>
      <text class="focus-desc">{{ focusInfo.subInfo }}</text>
      <text class="jump-btn" @click="gotoDetail">查看详情 →</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch } from 'vue';
import { useGenealogyStore } from '@/stores/genealogy';

const genealogyStore = useGenealogyStore();

// State
const searchText = ref('');
const loading = ref(true);
const error = ref('');
const treeDisplayNodes = ref<any[]>([]);
const treeDisplayEdges = ref<any[]>([]);
const focusId = ref<string | null>(null);
const focusInfo = ref<{ name: string; subInfo: string } | null>(null);
const scale = ref(1);
const scrollX = ref(0);
const scrollY = ref(0);
const nodeWidth = ref(120);

// Constants
const NODE_HEIGHT = 60;
const NODE_GAP_X = 150;
const NODE_GAP_Y = 100;
const ZOOM_STEP = 0.15;

const branchOptions = ref(['全部房支', '长房', '二房', '三房']);
const currentBranch = ref('全部房支');

// Computed
const treeStyle = computed(() => ({
  transform: `scale(${scale.value}) translate(${scrollX.value}px, ${scrollY.value}px)`,
  transformOrigin: '0 0',
  minHeight: '2000px',
  minWidth: '3000px'
}));

// Methods
async function loadTree() {
  loading.value = true;
  error.value = '';
  try {
    // 通过计算数据生成可视化布局
    if (!genealogyStore.treeNodes.length) {
      await genealogyStore.loadTree(focusId.value || undefined, 3);
    }
    computeLayout();
  } catch (e: any) {
    error.value = e.message || '加载家谱树失败';
  } finally {
    loading.value = false;
  }
}

function computeLayout() {
  const nodes = genealogyStore.treeNodes;
  if (!nodes.length) {
    error.value = '暂无数据';
    return;
  }

  // 按世代分层排版
  const byGen = genealogyStore.nodesByGeneration;
  const genKeys = Object.keys(byGen).sort((a, b) => Number(a) - Number(b));
  
  const resultNodes: any[] = [];
  const resultEdges: any[] = [];
  
  genKeys.forEach((genKey, genIdx) => {
    const genNodes = byGen[Number(genKey)];
    const y = genIdx * (NODE_HEIGHT + NODE_GAP_Y) + 60;
    const totalW = genNodes.length * nodeWidth.value + (genNodes.length - 1) * 60;
    const startX = 80; // 偏移量恒定为80px
    
    genNodes.forEach((node: any, idx: number) => {
      const x = startX + idx * (nodeWidth.value + 60);
      
      resultNodes.push({
        id: node.id,
        name: node.name?.length > 6 ? node.name.slice(0,6) + '…' : node.name || '待补充',
        generation: node.generation,
        isMale: node.gender === 'M',
        isFocus: node.id === focusId.value,
        isSelected: node.id === focusId.value,
        x,
        y
      });
    });
  });

  // 生成边的布局（父子关系）
  for (const edge of genealogyStore.treeEdges) {
    const fromNode = resultNodes.find(n => n.id === edge.fromId);
    const toNode = resultNodes.find(n => n.id === edge.toId);
    if (fromNode && toNode) {
      resultEdges.push({
        from: { x: fromNode.x + nodeWidth.value / 2, y: fromNode.y },
        to: { x: toNode.x + nodeWidth.value / 2, y: toNode.y + NODE_HEIGHT }
      });
    }
  }

  treeDisplayNodes.value = resultNodes;
  treeDisplayEdges.value = resultEdges;
}

function filterBranch(e: any) {
  const idx = e.detail.value;
  currentBranch.value = branchOptions.value[idx];
  // 过滤房支
  if (idx === 0) {
    // 显示全部
    computeLayout();
  } else {
    // 按房支筛选
    const branchName = branchOptions.value[idx];
    // 筛选节点并更新布局
    // 需要调用member.search后渲染
  }
}

function zoomIn() { scale.value = Math.min(scale.value + ZOOM_STEP, 3); }
function zoomOut() { scale.value = Math.max(scale.value - ZOOM_STEP, 0.3); }

function onTouchMove() {} // 已留接口

function onNodeClick(node: any) {
  focusId.value = node.id;
  focusInfo.value = {
    name: node.name,
    subInfo: `第${node.generation}世 · ${node.isMale ? '男' : '女'}`
  };
  genealogyStore.setFocus(node.id);
}

function doSearch() {
  if (!searchText.value) return;
  // 调用 memberSvc.search 后跳转到详情
  uni.navigateTo({ url: `/pages/search/search?q=${encodeURIComponent(searchText.value)}` });
}

function clearSearch() {
  searchText.value = '';
}

function gotoDetail() {
  if (focusId.value) {
    uni.navigateTo({ url: `/pages/detail/detail?id=${focusId.value}` });
  }
}

onMounted(loadTree);
</script>

<style scoped lang="scss">
.xuemap-page {
  min-height: 100vh;
  background: var(--home-bg);
}

.top-bar {
  padding: 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: white;
  box-shadow: 0 1px 6px rgba(0,0,0,0.04);
  
  .page-title { font-size: 20px; font-weight: bold; color: var(--text-main); }
  
  .controls {
    display: flex;
    align-items: center;
    gap: 12px;
    
    .branch-picker { font-size: 14px; color: var(--cinnabar); }
    
    .zoom-controls {
      display: flex;
      align-items: center;
      gap: 4px;
      
      .zoom-btn {
        width: 28px; height: 28px;
        text-align: center;
        line-height: 28px;
        border-radius: 50%;
        background: #F4F1E8;
        font-size: 16px;
      }
      
      .zoom-level {
        width: 40px;
        text-align: center;
        font-size: 12px;
        color: var(--text-sub);
      }
    }
  }
}

.search-bar {
  margin: 10px 16px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  background: #F4F1E8;
  border-radius: 20px;
  height: 36px;
  
  .search-input {
    flex: 1;
    font-size: 14px;
    background: transparent;
  }
  
  .search-btn {
    padding: 4px 8px;
    color: var(--text-aux);
    font-size: 14px;
  }
}

.tree-container {
  overflow: scroll;
  height: calc(100vh - 160px);
  position: relative;
  
  .tree-canvas {
    position: relative;
    transition: transform 200ms ease-out;
    
    .tree-node {
      position: absolute;
      padding: 8px 12px;
      border-radius: 12px;
      border: 2px solid transparent;
      box-shadow: 0 2px 8px rgba(0,0,0,0.04);
      transition: all 120ms ease-out;
      cursor: pointer;
      
      &:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.08); }
      
      .node-name { font-weight: bold; display: block; }
      .node-gen { font-size: 11px; color: var(--text-aux); margin-top: 2px; display: block; }
    }
    
    .tree-line {
      stroke: #C0BBAD;
      stroke-width: 1;
    }
  }
}

.error-tip {
  text-align: center;
  margin-top: 80px;
  
  text { display: block; color: var(--text-sub); margin-bottom: 12px; }
  .retry-btn { color: var(--cinnabar); font-size: 14px; }
}

.focus-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 16px;
  background: white;
  display: flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 -2px 12px rgba(0,0,0,0.06);
  
  .focus-name { font-weight: bold; font-size: 16px; }
  .focus-desc { font-size: 13px; color: var(--text-sub); flex: 1; }
  .jump-btn { font-size: 14px; color: var(--cinnabar); }
}

.loading-overlay {
  text-align: center;
  margin-top: 100px;
  
  .loading-spinner {
    margin: 0 auto 12px;
    width: 32px; height: 32px;
    border: 3px solid #F4F1E8;
    border-top: 3px solid var(--cinnabar);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>