/**
 * utils/tree-perf.js — 族谱树 Canvas 渲染性能纯函数（蓝图 §7.1 落地，可单测）
 *
 * 职责：把「视口裁剪 / 边粗裁 / 渲染模式降级 / 文本截断 / 布局边界」等渲染优化决策
 *       抽为纯函数，TreeGraph.vue 直接消费，保证逻辑可单测、无 uni-app/canvas 依赖。
 *
 * 对齐蓝图 §7.1 渲染优化：
 *   · 仅渲染视口内节点（viewport culling）
 *   · 节点 > 300 → 降级「方块视图」（block：无阴影、精简文字）
 *   · 缩放 < 0.4 → 只显示名字圆点（dot：极小尺度不画文字）
 *   · 边合并单路径（组件内实现）；本文件负责「哪些边该画」的几何粗判
 */

'use strict';

// ─── 常量（与 TreeGraph.vue / family-tree-layout.js 保持一致） ───
const NODE_W = 120;
const NODE_H = 50;
/** 节点 AABB 视口外扩 padding（px，世界坐标） */
const NODE_PAD = 24;
/** 边的外扩 padding 更大（边可跨长距离，两端都在很远同侧才应裁剪） */
const EDGE_PAD = 96;
/** 超过该节点数进入 block（方块视图）降级 */
const BLOCK_THRESHOLD = 300;
/** 缩放低于该值进入 dot（名字圆点）简化 */
const DOT_SCALE = 0.4;

/**
 * 计算当前视口对应的世界坐标矩形
 * @param {number} viewW  画布逻辑宽（CSS px）
 * @param {number} viewH  画布逻辑高
 * @param {number} scale  当前缩放
 * @param {number} offsetX 平移量（屏幕 px）
 * @param {number} offsetY 平移量
 * @returns {{left:number, top:number, right:number, bottom:number}} 世界坐标可视区
 */
function computeViewport(viewW, viewH, scale, offsetX, offsetY) {
  const s = scale > 0 ? scale : 1;
  return {
    left: (0 - offsetX) / s,
    top: (0 - offsetY) / s,
    right: (viewW - offsetX) / s,
    bottom: (viewH - offsetY) / s
  };
}

/** AABB 相交判定（世界坐标） */
function intersects(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

/**
 * 节点是否位于视口（含外扩 padding）
 * 节点矩形以 (x, y, NODE_W, NODE_H) 表示（与 TreeGraph 布局一致）
 * @param {{x:number,y:number}} node
 * @param {{left:number,top:number,right:number,bottom:number}} vp
 * @param {number} [pad]
 */
function nodeInViewport(node, vp, pad = NODE_PAD) {
  if (typeof node.x !== 'number' || typeof node.y !== 'number') return true; // 未知坐标保守绘制
  return intersects(
    vp.left - pad, vp.top - pad, (vp.right - vp.left) + pad * 2, (vp.bottom - vp.top) + pad * 2,
    node.x, node.y, NODE_W, NODE_H
  );
}

/**
 * 裁剪出视口内的节点（返回新数组，不含越界节点）
 * @param {Array} nodes
 * @param {{left:number,top:number,right:number,bottom:number}} vp
 */
function cullNodes(nodes, vp, pad = NODE_PAD) {
  return (nodes || []).filter(n => nodeInViewport(n, vp, pad));
}

/**
 * 边的几何粗判：两端点都落在视口扩展矩形外且在同一侧 → 裁剪；
 * 否则保守保留（跨长边的中间段可能穿过视口）。
 * edge: { from:{x,y}, to:{x,y} }
 */
function edgeInViewport(edge, vp, pad = EDGE_PAD) {
  const fx = edge.from && edge.from.x, fy = edge.from && edge.from.y;
  const tx = edge.to && edge.to.x, ty = edge.to && edge.to.y;
  if (![fx, fy, tx, ty].every(v => typeof v === 'number')) return true;
  const L = vp.left - pad, T = vp.top - pad, R = vp.right + pad, B = vp.bottom + pad;

  // 两个端点都在视口内（含 padding）→ 必画
  const fIn = fx >= L && fx <= R && fy >= T && fy <= B;
  const tIn = tx >= L && tx <= R && ty >= T && ty <= B;
  if (fIn || tIn) return true;

  // 两端同在左侧 / 右侧 / 上方 / 下方 → 线段不可能穿过视口
  if (fx < L && tx < L) return false;
  if (fx > R && tx > R) return false;
  if (fy < T && ty < T) return false;
  if (fy > B && ty > B) return false;
  return true; // 保守：跨越某个轴向范围，可能穿过视口
}

/**
 * 裁剪边（几何粗判，不依赖节点 id）
 */
function cullEdges(edges, vp, pad = EDGE_PAD) {
  return (edges || []).filter(e => edgeInViewport(e, vp, pad));
}

/**
 * 渲染模式决策（蓝图 §7.1 降级规则）
 * @param {number} nodeCount 当前（过滤后或全量）节点数
 * @param {number} scale
 * @returns {{block:boolean, dot:boolean, normal:boolean}}
 */
function pickRenderMode(nodeCount, scale) {
  const block = Number(nodeCount) > BLOCK_THRESHOLD;
  const dot = !block && scale < DOT_SCALE;
  return { block, dot, normal: !block && !dot };
}

/**
 * 名字截断（block/normal 均可用；normal 默认 6 字，block 可略长）
 * @param {string} name
 * @param {number} [max]
 */
function truncateName(name, max = 6) {
  const s = String(name ?? '');
  return s.length > max ? s.slice(0, max) + '…' : s;
}

/**
 * 节点集的世界坐标包围盒（用于居中/定位，或空集返回 null）
 * @returns {{minX:number,minY:number,maxX:number,maxY:number}|null}
 */
function layoutBounds(nodes) {
  let b = null;
  for (const n of nodes || []) {
    if (typeof n.x !== 'number' || typeof n.y !== 'number') continue;
    if (!b) {
      b = { minX: n.x, minY: n.y, maxX: n.x + NODE_W, maxY: n.y + NODE_H };
      continue;
    }
    if (n.x < b.minX) b.minX = n.x;
    if (n.y < b.minY) b.minY = n.y;
    if (n.x + NODE_W > b.maxX) b.maxX = n.x + NODE_W;
    if (n.y + NODE_H > b.maxY) b.maxY = n.y + NODE_H;
  }
  return b;
}

// ─── ESM 导出 ─────────────────────────────────
export { NODE_W, NODE_H, NODE_PAD, EDGE_PAD, BLOCK_THRESHOLD, DOT_SCALE, computeViewport, nodeInViewport, cullNodes, edgeInViewport, cullEdges, pickRenderMode, truncateName, layoutBounds };

// ─── 兼容性 CommonJS ──────────────────────────
module.exports = {
  NODE_W, NODE_H, NODE_PAD, EDGE_PAD, BLOCK_THRESHOLD, DOT_SCALE,
  computeViewport, nodeInViewport, cullNodes, edgeInViewport, cullEdges,
  pickRenderMode, truncateName, layoutBounds
};
