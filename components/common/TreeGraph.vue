<template>
  <canvas type="2d" class="tree-graph" id="treeCanvas" @touchstart="onTouchStart" @touchmove="onTouchMove" @touchend="onTouchEnd"></canvas>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue';

const props = defineProps<{
  nodes: Array<{ id: string; name: string; generation: number; isMale: boolean; x: number; y: number }>;
  edges: Array<{ from: { x: number; y: number }; to: { x: number; y: number } }>;
  focusId?: string | null;
}>();

const emit = defineEmits<{
  click: [id: string];
}>();

// Canvas state
const canvasRef = ref<any>(null);
const ctx = ref<any>(null);
const scale = ref(1);
const offsetX = ref(0);
const offsetY = ref(0);
const lastX = ref(0);
const lastY = ref(0);

// Colors
const COLORS = {
  bg: '#FAF8F2',
  male: '#E3E9EC',
  female: '#F7F4EC',
  focus: '#B03A2E',
  line: '#C0BBAD',
  text: '#26221E',
  textSub: '#8A867F'
};

function render() {
  if (!ctx.value) return;

  const canvas = canvasRef.value;
  if (!canvas) return;
  
  const dpr = uni.getSystemInfoSync().pixelRatio;
  canvas.width = canvas.offsetWidth * dpr;
  canvas.height = canvas.offsetHeight * dpr;
  ctx.value.scale(dpr, dpr);
  
  // Clear
  ctx.value.fillStyle = COLORS.bg;
  ctx.value.fillRect(0, 0, canvas.width, canvas.height);

  // Apply transform
  ctx.value.save();
  ctx.value.translate(offsetX.value, offsetY.value);
  ctx.value.scale(scale.value, scale.value);

  const NODE_W = 120;
  const NODE_H = 50;
  const RADIUS = 12;

  // Draw edges
  ctx.value.strokeStyle = COLORS.line;
  ctx.value.lineWidth = 1;
  props.edges.forEach(edge => {
    ctx.value.beginPath();
    ctx.value.moveTo(edge.from.x + NODE_W / 2, edge.from.y + NODE_H);
    ctx.value.lineTo(edge.to.x + NODE_W / 2, edge.to.y);
    ctx.value.stroke();
  });

  // Draw nodes
  props.nodes.forEach(node => {
    const x = node.x;
    const y = node.y;
    const isFocus = node.id === props.focusId;
    
    // Node background
    ctx.value.fillStyle = isFocus ? COLORS.focus : (node.isMale ? COLORS.male : COLORS.female);
    ctx.value.shadowColor = isFocus ? 'rgba(176,58,46,0.15)' : 'rgba(0,0,0,0.04)';
    ctx.value.shadowBlur = 8;
    
    ctx.value.beginPath();
    ctx.value.roundRect(x, y, NODE_W, NODE_H, RADIUS);
    ctx.value.fill();

    // Border for focus
    if (isFocus) {
      ctx.value.strokeStyle = COLORS.focus;
      ctx.value.lineWidth = 2;
      ctx.value.shadowBlur = 0;
      ctx.value.beginPath();
      ctx.value.roundRect(x - 1, y - 1, NODE_W + 2, NODE_H + 2, RADIUS + 1);
      ctx.value.stroke();
    }

    ctx.value.shadowBlur = 0;

    // Text - name
    const name = node.name.length > 6 ? node.name.substring(0, 6) + '…' : node.name;
    ctx.value.fillStyle = isFocus ? '#FFF' : COLORS.text;
    ctx.value.font = `${isFocus ? 14 : 13}px system-ui`;
    ctx.value.textAlign = 'center';
    ctx.value.textBaseline = 'middle';
    ctx.value.fillText(name, x + NODE_W / 2, y + NODE_H / 2 - 4);

    // Text - generation
    ctx.value.fillStyle = isFocus ? 'rgba(255,255,255,0.7)' : COLORS.textSub;
    ctx.value.font = '10px system-ui';
    ctx.value.fillText(`第${node.generation}世`, x + NODE_W / 2, y + NODE_H / 2 + 20);

    // Store node position for hit test
    (node as any).bounds = { x, y, w: NODE_W, h: NODE_H };
  });

  ctx.value.restore();
}

function hitTest(tx: number, ty: number): string | null {
  // Inverse transform
  const ix = (tx - offsetX.value) / scale.value;
  const iy = (ty - offsetY.value) / scale.value;
  
  for (const node of props.nodes) {
    const b = (node as any).bounds;
    if (b && ix >= b.x && ix <= b.x + b.w && iy >= b.y && iy <= b.y + b.h) {
      return node.id;
    }
  }
  return null;
}

function onTouchStart(e: any) {
  const touch = e.touches[0];
  lastX.value = touch.clientX;
  lastY.value = touch.clientY;
  
  // Hit test on touch end
}

function onTouchMove(e: any) {
  const touch = e.touches[0];
  const dx = touch.clientX - lastX.value;
  const dy = touch.clientY - lastY.value;
  offsetX.value += dx;
  offsetY.value += dy;
  lastX.value = touch.clientX;
  lastY.value = touch.clientY;
  render();
}

function onTouchEnd(e: any) {
  const touch = e.changedTouches[0];
  if (touch && lastX.value === touch.clientX && lastY.value === touch.clientY) {
    // No drag, it's a click/tap
    const id = hitTest(touch.clientX, touch.clientY);
    if (id) emit('click', id);
  }
}

// Watch for data changes
watch(() => [props.nodes, props.edges, props.focusId], () => {
  nextTick(render);
}, { deep: true });

onMounted(() => {
  nextTick(() => {
    const query = uni.createSelectorQuery();
    query.select('#treeCanvas').fields({ node: true, size: true }).exec(([res]) => {
      if (res && res.node) {
        canvasRef.value = res.node;
        ctx.value = res.node.getContext('2d');
        render();
      }
    });
  });
});

// Expose for parent zoom control
defineExpose({ render, scale: () => scale.value, setScale: (s: number) => { scale.value = s; render(); } });
</script>

<style scoped>
.tree-graph {
  width: 100%;
  height: 100%;
  display: block;
}
</style>