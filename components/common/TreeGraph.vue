<!--
  components/common/TreeGraph.vue — 族谱树 Canvas 2D 渲染组件（蓝图 §7.1 落地 + P1 二期扇形）

  布局双模式（layout prop）：
    · 'tree' — 树形/直系：节点 x/y = 卡片左上角（computeLayout 输出），自上而下世代流
    · 'fan'  — 扇形（P1 二期）：节点 x/y = 徽标圆心（fanLayout 输出，圆心在原点），
               同心环 + 家庭扇区 + 中心连线；自带 fit 到视口（fitFan），单指拖拽平移、
               双指捏合缩放（以圆心为锚），点击徽标 emit click 供上层改焦点重排

  性能优化（蓝图全部要求，tree 模式沿用）：
    ① 单次 setTransform(dpr)，每帧重置后统一变换（无累积 bug）
    ② 视口裁剪：仅绘制可见节点（cullNodes）+ 边粗裁（cullEdges）
    ③ 渲染降级：>300 → block；scale <0.4 → dot
    ④ 边合并单路径 stroke
    ⑤ RAF 帧合并（touchmove 不直接 render）
    ⑥ roundRect polyfill
    ⑦ canvas size 只 init 一次
    ⑧ shadowBlur 仅焦点节点

  对外 API：render / scale / setScale / reset / fit / cullNodes / cullEdges
-->
<template>
  <canvas
    type="2d"
    class="tree-graph"
    id="treeCanvas"
    ref="canvasRef"
    @touchstart="onTouchStart"
    @touchmove="onTouchMove"
    @touchend="onTouchEnd"
  ></canvas>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, nextTick, onBeforeUnmount } from 'vue';
import * as perf from '@/utils/tree-perf.js';

const props = defineProps<{
  nodes: Array<{ id: string; name: string; generation: number; isMale: boolean; x: number; y: number; fiveFu?: string }>;
  edges: Array<{ from: { x: number; y: number }; to: { x: number; y: number } }>;
  focusId?: string | null;
  viewMode?: 'ALL' | 'ANCESTORS' | 'DESCENDANTS' | 'LINEAGE';
  /** 渲染布局：tree（树形，默认）| fan（扇形） */
  layout?: 'tree' | 'fan';
  /** fan 模式：同心环元数据 [{delta, radius, familyCount}]（用于绘制背景环） */
  rings?: Array<{ delta: number; radius: number; familyCount: number }>;
}>();

const emit = defineEmits<{
  click: [id: string];
}>();

// ─── Canvas refs/state ───
const canvasRef = ref<any>(null);
let ctx: any = null; // will be typed at runtime
let rafId: number | null = null;
let lastTouchX = 0, lastTouchY = 0;
let isSingleTouch = true;
let pinchedStartDist = 0;
let pinchedStartScale = 1;
const minScale = 0.5;
const maxScale = 3;

// Touch state (RAF 合并)
const panState = {
  dx: 0, dy: 0, pending: false
};
const scaleState = { newScale: 1, pending: false };

// ─── Fan 模式独立视口状态（持久，非增量） ───
const FAN_R = 26; // 扇形徽标半径（世界 px）
const fanState = {
  scale: 1,   // 内容缩放
  offX: 0,    // 世界坐标偏移：screenX = (x + offX)*scale + W/2
  offY: 0,
  rot: 0,     // 绕圆心旋转角（弧度），fan 特有交互（单指拖拽）
  fitted: false
};
// 扇形旋转手势缓存
let fanRotating = false;
let fanLastAngle = 0; // 旋转手势中上一帧角度（跨 ±π 平滑用）
let pinchLastMidX = 0, pinchLastMidY = 0;

/** 扇形：圆心在屏幕上的 CSS px 坐标（fit 后 off=0 → 视口中心） */
function fanScreenCenter() {
  const { w: viewW, h: viewH } = canvasSize();
  return {
    x: fanState.offX * fanState.scale + viewW / 2,
    y: fanState.offY * fanState.scale + viewH / 2
  };
}

// ─── Viewport culling state ───
const filteredNodes = ref(props.nodes);
function applyViewFilter() {
  // fan 模式不做代差过滤（扇形围绕焦点天然含祖/后）
  if (props.layout === 'fan') {
    filteredNodes.value = props.nodes;
    return;
  }
  if (!props.focusId || !props.viewMode || props.viewMode === 'ALL') {
    filteredNodes.value = props.nodes;
    return;
  }
  const fn = props.nodes.find(n => n.id === props.focusId);
  if (!fn) {
    filteredNodes.value = props.nodes;
    return;
  }
  const fg = fn.generation;
  switch (props.viewMode) {
    case 'ANCESTORS': filteredNodes.value = props.nodes.filter(n => n.generation! < fg); break;
    case 'DESCENDANTS': filteredNodes.value = props.nodes.filter(n => n.generation! > fg); break;
    case 'LINEAGE':   filteredNodes.value = props.nodes.filter(n => Math.abs((n.generation||0) - fg) <= 5); break;
    default:          filteredNodes.value = props.nodes;
  }
}
watch(() => [props.nodes, props.focusId, props.viewMode], () => {
  applyViewFilter();
  if (props.layout === 'fan') {
    // 扇形：圆心更换 / 数据更新 → 重新自适应视口并重绘
    fitFan();
  }
  scheduleDraw();
}, { deep: true });
watch(() => props.layout, () => {
  applyViewFilter();
  // 切到扇形：等待数据后自适应视口
  if (props.layout === 'fan') {
    nextTick(() => { fit(); scheduleDraw(); });
  } else {
    // 切回树形：归位原始视角
    nextTick(() => { reset(); });
  }
});

// ─── Colors ───
const COLORS = {
  bg: '#FAF8F2',
  male: '#E3E9EC', female: '#F7F4EC', focus: '#B03A2E', line: '#C0BBAD', text: '#26221E', textSub: '#8A867F'
};
const WU_FU_COLORS = {
  '斩衰': '#2C2A29',
  '齐衰': '#6B5B3E',
  '大功': '#8C6A4F',
  '小功': '#A8926E',
  '缌麻': '#C4B391',
  '出五服': '#E3DCCB',
  '本人': '#B03A2E'
};

// ─── RoundRect polyfill & helper ───
function hasRoundRect(ctx: CanvasRenderingContext2D) {
  return typeof ctx.roundRect === 'function';
}

function drawRoundedRect(ctx: any, x: number, y: number, w: number, h: number, r: number) {
  if (hasRoundRect(ctx)) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
  } else {
    // Simple rect fallback
    ctx.fillRect(x, y, w, h);
  }
}

// ─── Frame scheduler (RAF merge) ───
function scheduleDraw() {
  if (rafId !== null) return; // already pending
  rafId = window.requestAnimationFrame ? window.requestAnimationFrame(drawFrame) : setTimeout(drawFrame, 16);
}

// ─── 画布视口尺寸（CSS px） ───
function canvasSize() {
  const cv = canvasRef.value;
  const w = (cv && cv.offsetWidth) || window.innerWidth || 375;
  const h = (cv && cv.offsetHeight) || window.innerHeight || 600;
  return { w, h };
}

// ─── Fan 模式自适应：原点(圆心)居中于视口，缩放使最远环可见 ───
function fitFan() {
  const { w: viewW, h: viewH } = canvasSize();
  const ns = filteredNodes.value;
  // fit = 正北视角（归零旋转）
  fanState.rot = 0;
  fanState.offX = 0;
  fanState.offY = 0;
  if (!ns.length) {
    fanState.scale = 1;
    fanState.fitted = true;
    return;
  }
  // 扇形以原点为圆心：取最远节点的半径
  let maxR = 0;
  for (const n of ns) {
    if (typeof n.x !== 'number' || typeof n.y !== 'number') continue;
    const r = Math.sqrt(n.x * n.x + n.y * n.y) + FAN_R;
    if (r > maxR) maxR = r;
  }
  if (!maxR) maxR = FAN_R * 2;
  const pad = 40;
  const halfW = viewW / 2 - pad, halfH = viewH / 2 - pad;
  if (halfW <= 0 || halfH <= 0) { fanState.scale = 1; return; }
  let s = Math.min(halfW, halfH) / maxR;
  s = Math.max(0.18, Math.min(2.2, s));
  fanState.scale = s;
  fanState.fitted = true;
}

// ─── Core: Draw one frame（按 layout 分发） ───
function drawFrame() {
  rafId = null;
  const cv = canvasRef.value;
  if (!cv || !ctx) return;
  if (props.layout === 'fan') { drawFanFrame(cv); return; }
  drawTreeFrame(cv);
}

// ─── 树形渲染（原逻辑，保留全部优化） ───
function drawTreeFrame(cv: any) {
  const sx = scaleState.newScale;
  let ox = panState.dx;
  let oy = panState.dy;
  panState.dx = 0; panState.dy = 0; scaleState.pending = false;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(sx, sx);
  ctx.translate(ox / sx, oy / sx);

  const viewW = cv.offsetWidth;
  const viewH = cv.offsetHeight;
  const dpr = uni.getSystemInfoSync().pixelRatio;
  const VP = perf.computeViewport(viewW, viewH, 1, 0, 0);
  const bounds = perf.layoutBounds(filteredNodes.value) || { minX: 0, minY: 0, maxX: 120, maxY: 50 };
  const margin = 40;
  const clearLeft = VP.left - margin, clearTop = VP.top - margin;
  const clearRight = VP.right + margin, clearBottom = VP.bottom + margin;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(clearLeft * dpr, clearTop * dpr, (clearRight - clearLeft) * dpr, (clearBottom - clearTop) * dpr);

  ctx.setTransform(sx, 0, 0, sx, ox / sx, oy / sx);

  const vp = perf.computeViewport(viewW, viewH, sx, ox / sx, oy / sx);
  const visible = perf.cullNodes(filteredNodes.value, vp, perf.NODE_PAD);
  const visEdges = perf.cullEdges(props.edges || [], vp, perf.EDGE_PAD);
  const mode = perf.pickRenderMode(visible.length, sx);

  // Draw edges (single path for performance)
  ctx.lineWidth = 1;
  ctx.strokeStyle = COLORS.line;
  ctx.setTransform(sx, 0, 0, sx, ox / sx, oy / sx);
  if (visEdges.length) {
    ctx.beginPath();
    visEdges.forEach(e => {
      ctx.moveTo(e.from.x + perf.NODE_W / 2, e.from.y + perf.NODE_H);
      ctx.lineTo(e.to.x + perf.NODE_W / 2, e.to.y);
    });
    ctx.stroke();
  }

  // Draw nodes
  visible.forEach((node: any) => {
    const nx = node.x!, ny = node.y!, isFocus = node.id === props.focusId;

    let bgColor = COLORS.male;
    if (node.fiveFu && WU_FU_COLORS[node.fiveFu]) bgColor = WU_FU_COLORS[node.fiveFu];
    else if (isFocus) bgColor = COLORS.focus;
    else if (!node.isMale) bgColor = COLORS.female;

    ctx.fillStyle = bgColor;
    if (isFocus && !mode.block) {
      ctx.shadowColor = COLORS.focus;
      ctx.shadowBlur = 8;
    }

    if (mode.dot) {
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(nx + perf.NODE_W / 2, ny + perf.NODE_H / 2, 10, 0, 2 * Math.PI);
      ctx.fillStyle = bgColor;
      ctx.fill();
    } else {
      ctx.shadowBlur = 0;
      ctx.beginPath();
      if (hasRoundRect(ctx)) {
        ctx.roundRect(nx, ny, perf.NODE_W, perf.NODE_H, 12);
        ctx.fill();
        if (isFocus) {
          ctx.strokeStyle = COLORS.focus;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.roundRect(nx - 1, ny - 1, perf.NODE_W + 2, perf.NODE_H + 2, 13);
          ctx.stroke();
        }
      } else {
        ctx.fillRect(nx, ny, perf.NODE_W, perf.NODE_H);
        if (isFocus) {
          ctx.strokeStyle = COLORS.focus;
          ctx.lineWidth = 2;
          ctx.strokeRect(nx - 1, ny - 1, perf.NODE_W + 2, perf.NODE_H + 2);
        }
      }

      ctx.shadowBlur = 0;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const truncated = perf.truncateName(node.name || '', mode.block ? 8 : 6);

      ctx.fillStyle = isFocus ? '#FFF' : COLORS.text;
      ctx.font = `bold ${mode.block ? 12 : 13}px system-ui`;
      ctx.fillText(truncated, nx + perf.NODE_W / 2, ny + perf.NODE_H / 2 - 4);

      if (!mode.block) {
        ctx.fillStyle = isFocus ? 'rgba(255,255,255,0.7)' : COLORS.textSub;
        ctx.font = `${10}px system-ui`;
        ctx.fillText(`第${node.generation}世`, nx + perf.NODE_W / 2, ny + perf.NODE_H / 2 + 20);
      }

      (node as any).bounds = { x: nx, y: ny, w: perf.NODE_W, h: perf.NODE_H };
    }
  });

  ctx.restore();
}

// ─── 扇形渲染（P1 二期）：同心环 + 家庭连线 + 圆徽标 + 五服环着色 + 绕心旋转 ───
function drawFanFrame(cv: any) {
  const dpr = uni.getSystemInfoSync().pixelRatio;
  const { w: viewW, h: viewH } = canvasSize();
  const s = fanState.scale;
  const rot = fanState.rot || 0;
  const cosR = Math.cos(rot), sinR = Math.sin(rot);
  // 世界(绕原点旋转θ) → 缩放 → 平移(dpr 物理像素)
  // screenX_dpr = (x*cosθ - y*sinθ)*s*dpr + (offX*s + W/2)*dpr
  const a = s * dpr * cosR, b = s * dpr * sinR;
  const c = -s * dpr * sinR, d = s * dpr * cosR;
  const e = (fanState.offX * s + viewW / 2) * dpr;
  const f = (fanState.offY * s + viewH / 2) * dpr;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, viewW * dpr, viewH * dpr);
  ctx.setTransform(a, b, c, d, e, f);

  const ns = filteredNodes.value;
  // 可见判定改为「到圆心距离」（旋转不变量，旋转安全）
  const halfW = viewW / (2 * s), halfH = viewH / (2 * s);
  const viewR = Math.sqrt(halfW * halfW + halfH * halfH) + FAN_R + 8;

  // 同心环背景（以布局原点为圆心，随内容平移；由外向内装饰线）
  const rings = props.rings && props.rings.length ? props.rings : null;
  if (rings) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(192,187,173,0.35)';
    ctx.setLineDash([4, 6]);
    for (const r of rings) {
      ctx.beginPath();
      ctx.arc(0, 0, r.radius, 0, 2 * Math.PI);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // 圆心标记（焦点人所在）
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, 2 * Math.PI);
    ctx.fillStyle = 'rgba(176,58,46,0.45)';
    ctx.fill();
  }

  // 连线：父家庭中心 → 子家庭中心（单路径；随 rot 自动旋转）
  const edges = props.edges || [];
  if (edges.length) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(176,58,46,0.28)';
    ctx.beginPath();
    edges.forEach(ed => {
      ctx.moveTo(ed.from.x, ed.from.y);
      ctx.lineTo(ed.to.x, ed.to.y);
    });
    ctx.stroke();
  }

  // 节点徽标（五服环着色：fiveFu → WU_FU_COLORS，深底白字）
  const visNodes = ns.filter(n =>
    typeof n.x === 'number' && typeof n.y === 'number' &&
    Math.sqrt(n.x * n.x + n.y * n.y) <= viewR
  );
  visNodes.forEach((node: any) => {
    const isFocus = node.id === props.focusId;
    // 五服色（替代性别色）：按环深度 fiveFu；本人/焦点朱砂
    const fu = node.fiveFu || '本人';
    let bg = WU_FU_COLORS[fu] || COLORS.focus;
    if (isFocus) bg = WU_FU_COLORS['本人'] || COLORS.focus;
    // 深底用白字，浅底用深字（可读性）
    const dark = textOnLight(bg) ? '#26221E' : '#FFFFFF';

    ctx.beginPath();
    ctx.arc(node.x, node.y, FAN_R, 0, 2 * Math.PI);
    ctx.fillStyle = bg;
    if (isFocus) {
      ctx.shadowColor = COLORS.focus;
      ctx.shadowBlur = 10;
    }
    ctx.fill();
    ctx.shadowBlur = 0;

    // 焦点描边 / 普通描边
    ctx.lineWidth = isFocus ? 2 : 1;
    ctx.strokeStyle = isFocus ? '#FFF' : 'rgba(0,0,0,0.08)';
    ctx.beginPath();
    ctx.arc(node.x, node.y, FAN_R, 0, 2 * Math.PI);
    ctx.stroke();

    // 姓名（≤5 字居中）
    const name = perf.truncateName(node.name || '', 5);
    ctx.fillStyle = dark;
    ctx.font = `bold ${FAN_R * 0.62}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, node.x, node.y - (node.generation != null ? 3 : 0));

    // 第 N 世
    if (node.generation != null) {
      ctx.fillStyle = isFocus ? 'rgba(255,255,255,0.9)' : dark;
      ctx.globalAlpha = 0.75;
      ctx.font = `${FAN_R * 0.44}px system-ui`;
      ctx.fillText(`${node.generation}世`, node.x, node.y + FAN_R * 0.72);
      ctx.globalAlpha = 1;
    }

    (node as any).bounds = { cx: node.x, cy: node.y, r: FAN_R };
  });

  ctx.restore();
}

/**
 * textOnLight — 简单亮度判定：背景色是否为「浅色」（需要深色文字）
 * 将 #RRGGBB 转亮度（近似 luma），> 0.62 视为浅色底。
 */
function textOnLight(hex: string): boolean {
  let h = String(hex || '').replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  if (!isFinite(n)) return true;
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luma > 0.62;
}

// ─── Init canvas once ───
async function initCanvas() {
  await nextTick();
  const cv = canvasRef.value;
  if (!cv) return;

  const dpr = uni.getSystemInfoSync().pixelRatio;
  const width = cv.offsetWidth || window.innerWidth;
  const height = cv.offsetHeight || window.innerHeight;

  cv.width = width * dpr;
  cv.height = height * dpr;
  cv.style.width = width + 'px';
  cv.style.height = height + 'px';

  ctx = cv.getContext('2d');

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  if (props.layout === 'fan') fitFan();
  drawFrame();
}

// ─── RAF merged handlers ───
function onTouchStart(e: any) {
  if (!e.touches.length) return;
  const t = e.touches[0];
  lastTouchX = t.clientX;
  lastTouchY = t.clientY;
  isSingleTouch = e.touches.length === 1;
  if (props.layout === 'fan') {
    if (e.touches.length === 1) {
      // 单指：记录绕圆心起始角
      const { x: ccx, y: ccy } = fanScreenCenter();
      fanLastAngle = Math.atan2(t.clientY - ccy, t.clientX - ccx);
      fanRotating = true;
    } else if (e.touches.length === 2) {
      fanRotating = false;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchedStartDist = Math.sqrt(dx * dx + dy * dy);
      pinchedStartScale = fanState.scale;
      pinchLastMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      pinchLastMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    }
    return;
  }
  if (e.touches.length === 2) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    pinchedStartDist = Math.sqrt(dx * dx + dy * dy);
    pinchedStartScale = scaleState.newScale;
  }
}

function onTouchMove(e: any) {
  if (!e.touches.length) return;
  if (props.layout === 'fan') {
    if (e.touches.length === 2) {
      fanRotating = false;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (pinchedStartDist > 0) {
        const ns = Math.max(0.18, Math.min(2.2, pinchedStartScale * (dist / pinchedStartDist)));
        fanState.scale = ns;
      }
      // 双指中心位移 → 平移（off 世界单位）
      const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const my = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      fanState.offX += (mx - pinchLastMidX) / fanState.scale;
      fanState.offY += (my - pinchLastMidY) / fanState.scale;
      pinchLastMidX = mx; pinchLastMidY = my;
      scheduleDraw();
    } else if (e.touches.length === 1 && fanRotating) {
      const t = e.touches[0];
      const { x: ccx, y: ccy } = fanScreenCenter();
      const cur = Math.atan2(t.clientY - ccy, t.clientX - ccx);
      // 相对上一帧的增量，回绕归一（跨 ±π 平滑累计）
      let delta = cur - fanLastAngle;
      while (delta > Math.PI) delta -= 2 * Math.PI;
      while (delta < -Math.PI) delta += 2 * Math.PI;
      fanState.rot += delta;
      fanLastAngle = cur;
      scheduleDraw();
    } else if (e.touches.length === 1) {
      // 双指抬为一指：重置旋转起点（不跳变）
      const t = e.touches[0];
      const { x: ccx, y: ccy } = fanScreenCenter();
      fanLastAngle = Math.atan2(t.clientY - ccy, t.clientX - ccx);
      fanRotating = true;
    }
    return;
  }
  const t = e.touches[0];

  if (e.touches.length === 2) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const currDist = Math.sqrt(dx * dx + dy * dy);
    const ns = Math.max(minScale, Math.min(maxScale, pinchedStartScale * (currDist / pinchedStartDist)));
    scaleState.newScale = ns;
    scaleState.pending = true;
  } else if (e.touches.length === 1) {
    const dx = t.clientX - lastTouchX;
    const dy = t.clientY - lastTouchY;
    panState.dx += dx;
    panState.dy += dy;
    panState.pending = true;
    lastTouchX = t.clientX;
    lastTouchY = t.clientY;
  }
  if (panState.pending || scaleState.pending) scheduleDraw();
}

function onTouchEnd(e: any) {
  if (!e.touches.length && (scaleState.pending || props.layout === 'fan')) {
    const t = e.changedTouches[0];
    const hitId = hitTest(t.clientX, t.clientY);
    if (hitId) emit('click', hitId);
  }
  isSingleTouch = false;
  fanRotating = false;
  if (panState.pending || scaleState.pending) scheduleDraw();
}

// ─── Hit test（逆变换） ───
function hitTest(tx: number, ty: number): string | null {
  const cv = canvasRef.value;
  if (!cv || !ctx) return null;
  const rect = cv.getBoundingClientRect();
  const sx0 = tx - rect.left;
  const sy0 = ty - rect.top;

  if (props.layout === 'fan') {
    // 屏幕(CSS px) → 旋转后世界 → 逆旋得真实世界坐标
    const s = fanState.scale;
    const qx = (sx0 - canvasSize().w / 2) / s - fanState.offX;
    const qy = (sy0 - canvasSize().h / 2) / s - fanState.offY;
    const rot = fanState.rot || 0;
    const cosR = Math.cos(rot), sinR = Math.sin(rot);
    const wx = qx * cosR + qy * sinR;
    const wy = -qx * sinR + qy * cosR;
    for (const node of filteredNodes.value) {
      const b = (node as any).bounds;
      if (b && Math.abs(wx - b.cx) <= b.r + 4 && Math.abs(wy - b.cy) <= b.r + 4) {
        return node.id;
      }
    }
    return null;
  }

  const s = scaleState.newScale;
  const ox = panState.dx;
  const oy = panState.dy;
  const ix = (sx0 - ox) / s;
  const iy = (sy0 - oy) / s;
  for (const node of filteredNodes.value) {
    const b = (node as any).bounds;
    if (b && ix >= b.x && ix <= b.x + b.w && iy >= b.y && iy <= b.y + b.h) {
      return node.id;
    }
  }
  return null;
}

// ─── Public expose API ───
const scale = () => props.layout === 'fan' ? fanState.scale : scaleState.newScale;
const setScale = (s: number) => {
  if (props.layout === 'fan') {
    fanState.scale = Math.max(0.18, Math.min(2.2, s));
    scheduleDraw();
    return;
  }
  scaleState.newScale = Math.max(minScale, Math.min(maxScale, s));
  scheduleDraw();
};
const reset = () => {
  if (props.layout === 'fan') {
    fitFan();
    scheduleDraw();
    return;
  }
  scaleState.newScale = 1;
  panState.dx = 0; panState.dy = 0;
  scheduleDraw();
};
/** 自适应视口（fan 模式外部数据更新后可调用） */
const fit = () => {
  if (props.layout === 'fan') { fitFan(); }
  else {
    scaleState.newScale = 1;
    panState.dx = 0; panState.dy = 0;
  }
  scheduleDraw();
};
const cullNodes = (vp: any, pad?: number) => perf.cullNodes(filteredNodes.value, vp, pad);
const cullEdges = (vp: any, pad?: number) => perf.cullEdges(props.edges || [], vp, pad);

onMounted(initCanvas);
onBeforeUnmount(() => {
  if (rafId !== null) window.cancelAnimationFrame?.(rafId);
});

defineExpose({ render: drawFrame, scale, setScale, reset, fit, cullNodes, cullEdges });
</script>

<style scoped>
.tree-graph {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
