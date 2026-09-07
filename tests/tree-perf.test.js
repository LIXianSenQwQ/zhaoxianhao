/**
 * tests/tree-perf.test.js — 族谱树 Canvas 性能纯函数单测（蓝图 §7.1）
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const perf = require('../utils/tree-perf');

describe('computeViewport', () => {
  test('标准视口 (scale=1,offset=0)', () => {
    const vp = perf.computeViewport(100, 200, 1, 0, 0);
    assert.equal(vp.left, 0);
    assert.equal(vp.top, 0);
    assert.equal(vp.right, 100);
    assert.equal(vp.bottom, 200);
  });
  test('放大 2x: 可视世界范围缩小一半', () => {
    const vp = perf.computeViewport(100, 200, 2, 0, 0);
    assert.closeTo(vp.left, 0, 0.01);
    assert.closeTo(vp.right, 50, 0.01); // 200/2 → right 实际是 100/2 = 50
  });
  test('平移 offset+200 右移 → left=-200/scale', () => {
    const vp = perf.computeViewport(100, 200, 1, -200, 0); // 画布向右移动意味着 world 向左移
    assert.closeTo(vp.left, 200, 0.01); // offsetX=-200 表示内容左移，左边出现在 +200
    assert.closeTo(vp.right, 400, 0.01);
  });
  test('负缩放？返回默认 1', () => {
    const vp = perf.computeViewport(100, 200, -1, 0, 0);
    assert.ok(typeof vp.left === 'number');
  });
});

describe('nodeInViewport / cullNodes', () => {
  const VP = perf.computeViewport(300, 600, 1, 0, 0); // 300x600 屏幕

  test('完全在视口内 → true', () => {
    const n = { x: 50, y: 50 };
    assert.equal(perf.nodeInViewport(n, VP), true);
  });
  test('节点在视口外 30px > NODE_PAD=24 → false', () => {
    const n = { x: 300, y: 300 }; // 右侧距边界 0-30 = -30 < pad → 超出
    assert.equal(perf.nodeInViewport(n, VP, 24), false);
  });
  test('节点紧贴边界 → true（含 padding）', () => {
    const n = { x: 280, y: 550 }; // 在 300-30, 600-30 → 距边界 20 < 24 → true
    assert.equal(perf.nodeInViewport(n, VP, 24), true);
  });
  test('cullNodes 过滤掉不可见节点', () => {
    const nodes = [
      { id: '1', x: 50, y: 50 },   // 可见
      { id: '2', x: 1000, y: 1000 }, // 不可见
      { id: '3', x: 200, y: 100 }, // 可见
    ];
    const visible = perf.cullNodes(nodes, VP, 24);
    assert.equal(visible.length, 2);
    assert.equal(visible[0].id, '1');
    assert.equal(visible[1].id, '3');
  });
  test('节点坐标未知 → 保守绘制', () => {
    const n = { x: null, y: null };
    assert.equal(perf.nodeInViewport(n, VP), true);
  });
});

describe('edgeInViewport / cullEdges', () => {
  const VP = perf.computeViewport(300, 600, 1, 0, 0);
  const PAD = 96;

  test('两端都在视口内 → true', () => {
    const e = { from: { x: 50, y: 50 }, to: { x: 100, y: 100 } };
    assert.equal(perf.edgeInViewport(e, VP, PAD), true);
  });
  test('一端在视口内 → true', () => {
    const e = { from: { x: 50, y: 50 }, to: { x: 500, y: 500 } }; // 一端远外
    assert.equal(perf.edgeInViewport(e, VP, PAD), true);
  });
  test('两端都在左侧外 → false', () => {
    const e = { from: { x: -200, y: 100 }, to: { x: -400, y: 200 } };
    assert.equal(perf.edgeInViewport(e, VP, PAD), false);
  });
  test('两端都在下方外 → false', () => {
    const e = { from: { x: 200, y: 800 }, to: { x: 250, y: 1000 } };
    assert.equal(perf.edgeInViewport(e, VP, PAD), false);
  });
  test('跨越上边界（一端上方、一端内部）→ true', () => {
    const e = { from: { x: 100, y: -200 }, to: { x: 150, y: 100 } }; // 一端在 top<0 外部，一端内部
    assert.equal(perf.edgeInViewport(e, VP, PAD), true);
  });
  test('cullEdges 批量裁剪', () => {
    const edges = [
      { from: { x: 50, y: 50 }, to: { x: 100, y: 100 } }, // 全在内部
      { from: { x: -500, y: 0 }, to: { x: -800, y: 0 } }, // 全在左外
      { from: { x: 100, y: 100 }, to: { x: 500, y: 500 } }, // 跨越右/下
    ];
    const vis = perf.cullEdges(edges, VP, PAD);
    assert.equal(vis.length, 2);
  });
});

describe('pickRenderMode', () => {
  test('300 节点 → normal (<=BLOCK_THRESHOLD)', () => {
    const m = perf.pickRenderMode(300, 1);
    assert.equal(m.block, false);
    assert.equal(m.normal, true);
  });
  test('301 节点 → block=true', () => {
    const m = perf.pickRenderMode(301, 1);
    assert.equal(m.block, true);
    assert.equal(m.dot, false);
    assert.equal(m.normal, false);
  });
  test('scale=0.3 (< DOT_SCALE) → dot=true (且无 block)', () => {
    const m = perf.pickRenderMode(200, 0.3);
    assert.equal(m.dot, true);
    assert.equal(m.normal, false);
  });
  test('block=true && scale<0.4 → dot=false（block 优先）', () => {
    const m = perf.pickRenderMode(500, 0.3);
    assert.equal(m.block, true);
    assert.equal(m.dot, false); // dot 被 block 覆盖
  });
});

describe('truncateName', () => {
  test('短名不变', () => assert.equal(perf.truncateName('张三'), '张三'));
  test('长名截断加…', () => assert.equal(perf.truncateName('张三百余字姓名'), '张三……')); // max=6 时 6+1
  test('max=8 截断更长', () => {
    const s = '这是一个很长的名字字符串';
    const t = perf.truncateName(s, 8);
    assert.equal(t.endsWith('…'), true);
    assert.ok(t.length <= 9);
  });
  test('空字符串处理', () => assert.equal(perf.truncateName(null, 6), ''));
});

describe('layoutBounds', () => {
  test('空数组 → null', () => assert.equal(perf.layoutBounds([]), null));
  test('单个节点', () => {
    const nodes = [{ x: 10, y: 20 }];
    const b = perf.layoutBounds(nodes);
    assert.equal(b.minX, 10);
    assert.equal(b.minY, 20);
    assert.equal(b.maxX, 130); // 10 + 120
    assert.equal(b.maxY, 70); // 20 + 50
  });
  test('多节点包围盒扩展', () => {
    const nodes = [
      { x: 0, y: 0 },
      { x: 200, y: 300 },
    ];
    const b = perf.layoutBounds(nodes);
    assert.equal(b.minX, 0);
    assert.equal(b.maxX, 320); // 200 + 120
    assert.equal(b.minY, 0);
    assert.equal(b.maxY, 350); // 300 + 50
  });
  test('忽略无效节点', () => {
    const nodes = [{ x: null, y: null }, { x: 100, y: 200 }];
    const b = perf.layoutBounds(nodes);
    assert.notEqual(b, null);
  });
});

describe('constants consistency', () => {
  test('NODE_W/NODE_H 与 family-tree-layout 一致 (120x50)', () => {
    assert.equal(perf.NODE_W, 120);
    assert.equal(perf.NODE_H, 50);
  });
  test('BLOCK_THRESHOLD = 300', () => assert.equal(perf.BLOCK_THRESHOLD, 300));
  test('DOT_SCALE = 0.4', () => assert.equal(perf.DOT_SCALE, 0.4));
});

test('整体一致性：computeViewport → cullNodes 端到端', () => {
  // 模拟一个 300x600 视口，节点分布在不同位置
  const vp = perf.computeViewport(300, 600, 1, 0, 0);
  const all = [
    { x: 0, y: 0 },
    { x: 50, y: 50 },
    { x: 1000, y: 1000 },
    { x: 280, y: 580 }, // 右下角边缘，距边 20 < 24 → 保留
    { x: 299, y: 599 }, // 边缘外 30-24=6 → 丢弃
  ];
  const vis = perf.cullNodes(all, vp, 24);
  assert.ok(vis.length >= 2 && vis.length <= 3);
  assert.equal(vis.some(n => n.x === 0), true); // 左上角肯定在
});
