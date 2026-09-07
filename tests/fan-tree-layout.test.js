/**
 * tests/fan-tree-layout.test.js
 * P1 一期：族谱树扇形视图布局纯函数单测（docs/p1-fan-view-review.md §3）
 * 覆盖：环半径规则 / 家庭单元聚合 / 兄弟角度排序 / 坐标输出 / 连线 / 空集与边界
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  ringRadius, halfAngleAt, fanLayout, ringLabel, fanRingWuFu, toGraphData,
  R0, RING_STEP, MIN_R
} = require('../utils/fan-tree-layout.js');

const m = (id, path, extra = {}) => ({ _id: id, path, ...extra });

// 样例：焦点 focus（/A/B/focus/）→ 父（/A/B/）、祖父（/A/）、
//       子（/A/B/focus/c1/ c2/）、孙（/A/B/focus/c1/g1/）、配偶无独立路径
const FOCUS = '/A/B/focus/';
const baseNodes = [
  m('focus', FOCUS, { genealogyName: '郝继宗', spouseId: 'sp', gender: 'MALE' }),
  m('sp', 'sp', { genealogyName: '王氏', gender: 'FEMALE' }), // 配偶在集（共享 focus 扇区）
  m('father', '/A/B/', { genealogyName: '郝守正', birthOrder: 1 }),
  m('grandpa', '/A/', { genealogyName: '郝思源', birthOrder: 1 }),
  m('c1', '/A/B/focus/c1/', { genealogyName: '郝长福', birthOrder: 1 }),
  m('c2', '/A/B/focus/c2/', { genealogyName: '郝长禄', birthOrder: 2 }),
  m('g1', '/A/B/focus/c1/g1/', { genealogyName: '郝延宗', birthOrder: 1 })
];

describe('扇形布局 · 环半径规则', () => {
  it('焦点环半径 = R0', () => {
    assert.strictEqual(ringRadius(0), R0);
  });
  it('后代向外：Δ+1 半径增大 RING_STEP', () => {
    assert.strictEqual(ringRadius(1), R0 + RING_STEP);
  });
  it('祖先向内：Δ−1 半径收缩，且不低于 MIN_R', () => {
    const r1 = ringRadius(-1);
    assert.strictEqual(r1, R0 - RING_STEP);
    assert.ok(r1 >= MIN_R);
  });
  it('半径单调：后代环 > 本人环 > 祖先环', () => {
    assert.ok(ringRadius(2) > ringRadius(1));
    assert.ok(ringRadius(1) > ringRadius(0));
    assert.ok(ringRadius(0) > ringRadius(-1));
  });
  it('halfAngleAt 随半径增大而变小（弧长大则角小）', () => {
    assert.ok(halfAngleAt(400) < halfAngleAt(200));
  });
});

describe('扇形布局 · fanLayout 主流程', () => {
  it('空节点/缺焦点 → 空结果', () => {
    const a = fanLayout([], FOCUS);
    assert.deepStrictEqual(a.nodes, []);
    assert.deepStrictEqual(a.edges, []);
    const b = fanLayout(baseNodes, '');
    assert.deepStrictEqual(b.nodes, []);
  });

  it('家庭单元聚合：配偶并入焦点扇区', () => {
    const res = fanLayout(baseNodes, FOCUS);
    const focusFam = res.families.find(f => f.ring === 0);
    assert.ok(focusFam, '焦点家庭存在');
    assert.strictEqual(focusFam.members.length, 2, '夫妻同扇区');
    assert.ok(focusFam.members.some(x => x.path === FOCUS));
    assert.ok(focusFam.members.some(x => x.path === 'sp'));
  });

  it('环归属正确：父−1 / 子+1 / 孙+2', () => {
    const res = fanLayout(baseNodes, FOCUS);
    const byPath = Object.fromEntries(res.nodes.map(n => [n.path, n]));
    assert.strictEqual(byPath['/A/B/focus/'].ring, 0);
    assert.strictEqual(byPath['/A/B/'].ring, -1);
    assert.strictEqual(byPath['/A/'].ring, -2);
    assert.strictEqual(byPath['/A/B/focus/c1/'].ring, 1);
    assert.strictEqual(byPath['/A/B/focus/c2/'].ring, 1);
    assert.strictEqual(byPath['/A/B/focus/c1/g1/'].ring, 2);
  });

  it('后代坐标半径向外 > 祖先（|坐标距离圆心| 更远）', () => {
    const res = fanLayout(baseNodes, FOCUS);
    const dist = (n) => Math.sqrt(n.x * n.x + n.y * n.y);
    const c1 = res.nodes.find(n => n.path === '/A/B/focus/c1/');
    const father = res.nodes.find(n => n.path === '/A/B/');
    const g1 = res.nodes.find(n => n.path === '/A/B/focus/c1/g1/');
    assert.ok(dist(g1) > dist(c1), '孙辈比子辈离圆心更远');
    assert.ok(dist(c1) > dist(father), '子辈比父辈离圆心更远');
    // 焦点距圆心 = R0（±容差）
    const focus = res.nodes.find(n => n.path === FOCUS);
    assert.ok(Math.abs(dist(focus) - R0) < 5);
  });

  it('兄弟角度排序：birthOrder 小者 θ 更靠 12 点（θ 更小）', () => {
    const res = fanLayout(baseNodes, FOCUS);
    const c1 = res.nodes.find(n => n.path === '/A/B/focus/c1/');
    const c2 = res.nodes.find(n => n.path === '/A/B/focus/c2/');
    // 自 12 点顺时针 θ 递增：c1(birthOrder1) 应 < c2(birthOrder2)
    assert.ok(c1.theta < c2.theta, `c1.theta=${c1.theta} < c2.theta=${c2.theta}`);
  });

  it('连线：父→子两端坐标存在且指向子扇区', () => {
    const res = fanLayout(baseNodes, FOCUS);
    assert.ok(res.edges.length >= 4, `应有父子连线，实得 ${res.edges.length}`);
    const e = res.edges.find(x => x.from === '/A/B/' && x.to === FOCUS);
    assert.ok(e, '父→焦点连线存在');
    assert.ok(Number.isFinite(e.x1) && Number.isFinite(e.y2));
  });

  it('输出全部为有限数值坐标', () => {
    const res = fanLayout(baseNodes, FOCUS);
    for (const n of res.nodes) {
      assert.ok(Number.isFinite(n.x) && Number.isFinite(n.y), `${n.path} 坐标有限`);
      assert.ok(Number.isFinite(n.theta));
    }
  });
});

describe('扇形布局 · 环标签', () => {
  it('ringLabel 语义', () => {
    assert.strictEqual(ringLabel(0), '本人');
    assert.strictEqual(ringLabel(-1), '父母');
    assert.strictEqual(ringLabel(1), '子女');
    assert.strictEqual(ringLabel(2), '孙辈');
    assert.strictEqual(ringLabel(3), '后3代');
    assert.strictEqual(ringLabel(-3), '上3代');
  });
});

describe('扇形布局 · 五服环着色 fanRingWuFu', () => {
  it('环深度 → 五服标签（内近外疏）', () => {
    assert.strictEqual(fanRingWuFu(0), '本人');
    assert.strictEqual(fanRingWuFu(1), '斩衰');
    assert.strictEqual(fanRingWuFu(-1), '斩衰');
    assert.strictEqual(fanRingWuFu(2), '齐衰');
    assert.strictEqual(fanRingWuFu(-3), '大功');
    assert.strictEqual(fanRingWuFu(4), '小功');
    assert.strictEqual(fanRingWuFu(-5), '缌麻');
    assert.strictEqual(fanRingWuFu(6), '同宗');
    assert.strictEqual(fanRingWuFu(-9), '同宗');
    assert.strictEqual(fanRingWuFu(NaN), '同宗');
  });
});

describe('扇形布局 · toGraphData 契约（TreeGraph 扇形模式输入）', () => {
  it('空结果 → 空数组', () => {
    const g = toGraphData({ nodes: [], edges: [], rings: [] });
    assert.deepStrictEqual(g.nodes, []);
    assert.deepStrictEqual(g.edges, []);
    assert.deepStrictEqual(g.rings, []);
    assert.strictEqual(g.focusPath, null);
  });

  it('节点适配：id/name/isMale/generation/x/y/path', () => {
    const res = fanLayout(baseNodes, FOCUS);
    const g = toGraphData(res);
    const focus = g.nodes.find(n => n.path === FOCUS);
    assert.ok(focus, '焦点节点存在');
    assert.strictEqual(focus.name, '郝继宗');
    assert.strictEqual(focus.isMale, true);
    assert.strictEqual(typeof focus.x, 'number');
    assert.strictEqual(typeof focus.y, 'number');
    assert.ok(g.nodes.every(n => typeof n.id === 'string'));
  });

  it('五服标签透传：焦点=本人 / 子=斩衰 / 孙=齐衰', () => {
    const res = fanLayout(baseNodes, FOCUS);
    const g = toGraphData(res);
    const fu = (p) => g.nodes.find(n => n.path === p).fiveFu;
    assert.strictEqual(fu(FOCUS), '本人');
    assert.strictEqual(fu('/A/B/'), '斩衰'); // |Δ|=1
    assert.strictEqual(fu('/A/B/focus/c1/g1/'), '齐衰'); // |Δ|=2
    // 每个节点都带 ring + fiveFu
    assert.ok(g.nodes.every(n => typeof n.ring === 'number' && typeof n.fiveFu === 'string'));
  });

  it('edges 适配为中心点 from/to', () => {
    const res = fanLayout(baseNodes, FOCUS);
    const g = toGraphData(res);
    assert.ok(g.edges.length >= 4);
    const e = g.edges.find(x => x.to.x !== undefined);
    assert.ok(e, 'edges 含 from/to 点');
    // from/to 为中心点坐标，必须有限
    for (const ed of g.edges) {
      assert.ok(Number.isFinite(ed.from.x) && Number.isFinite(ed.from.y));
      assert.ok(Number.isFinite(ed.to.x) && Number.isFinite(ed.to.y));
    }
  });

  it('rings 元数据透传', () => {
    const res = fanLayout(baseNodes, FOCUS);
    const g = toGraphData(res);
    assert.ok(g.rings.length >= 4, `环数=${g.rings.length}`);
    assert.ok(g.rings.every(r => typeof r.delta === 'number' && typeof r.radius === 'number'));
  });
});
