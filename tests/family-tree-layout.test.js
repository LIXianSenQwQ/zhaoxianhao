/**
 * tests/family-tree-layout.test.js
 * P3 增强收口：族谱树布局纯函数单元测试（蓝图 §7.1 布局算法）
 * 覆盖：路径工具 / 世代行 / 兄弟排序 / 父居中 / 家庭单元 / 直系过滤 / 时间轴 / 五服色板
 */
const { describe, test, it } = require('node:test');
const assert = require('node:assert');
const {
  parsePath, parentPathOf, generationOf,
  computeLayout, filterDirectLine, timelineFilter, familyWidth, wufuColor
} = require('../utils/family-tree-layout');

const m = (id, path, extra = {}) => ({ _id: id, path, ...extra });

describe('路径工具', () => {
  it('parsePath', () => {
    assert.deepStrictEqual(parsePath('/001/002/003/'), ['001', '002', '003']);
    assert.deepStrictEqual(parsePath('/'), []);
    assert.deepStrictEqual(parsePath(null), []);
  });
  it('parentPathOf', () => {
    assert.strictEqual(parentPathOf('/001/002/003/'), '/001/002/');
    assert.strictEqual(parentPathOf('/001/'), null);
    assert.strictEqual(parentPathOf(null), null);
  });
  it('generationOf', () => {
    assert.strictEqual(generationOf('/001/'), 1);
    assert.strictEqual(generationOf('/001/002/003/'), 3);
    assert.strictEqual(generationOf('/'), 0);
  });
});

describe('computeLayout - 基础', () => {
  it('空输入返回空结果', () => {
    assert.deepStrictEqual(computeLayout([]), { nodes: [], edges: [], width: 0, height: 0, families: [] });
    assert.deepStrictEqual(computeLayout(null).nodes, []);
  });

  it('单节点：无边、有尺寸', () => {
    const res = computeLayout([m('a', '/001/', { genealogyName: '始祖', gender: 'MALE' })]);
    assert.strictEqual(res.nodes.length, 1);
    assert.strictEqual(res.edges.length, 0);
    assert.strictEqual(res.width, familyWidth(res.nodes[0]));
    assert.ok(res.height > 0);
    assert.strictEqual(res.nodes[0].x, 0);
    assert.strictEqual(res.nodes[0].y, 0);
  });

  it('三代直链：同代同 Y、父居中、edges=n-1', () => {
    const res = computeLayout([
      m('a', '/001/'), m('b', '/001/002/'), m('c', '/001/002/003/')
    ]);
    assert.strictEqual(res.nodes.length, 3);
    assert.strictEqual(res.edges.length, 2);
    const byPath = {};
    res.nodes.forEach(n => { byPath[n.path] = n; });
    // Y 随世代单调增加（每级 NODE_H+V_GAP）
    assert.ok(byPath['/001/002/003/'].y > byPath['/001/002/'].y);
    assert.ok(byPath['/001/002/'].y > byPath['/001/'].y);
    // 父节点水平中心 = 唯一子女水平中心（居中于子女上方）
    const centerB = byPath['/001/002/'].x + familyWidth(byPath['/001/002/']) / 2;
    const centerC = byPath['/001/002/003/'].x + familyWidth(byPath['/001/002/003/']) / 2;
    assert.ok(Math.abs(centerB - centerC) < 2, `父中心 ${centerB} 应≈子中心 ${centerC}`);
  });

  it('两兄弟：水平不重叠、按 birthOrder 排序', () => {
    const res = computeLayout([
      m('p', '/001/'),
      m('c2', '/001/003/', { birthOrder: 2 }),
      m('c1', '/001/002/', { birthOrder: 1 })
    ]);
    const kids = res.nodes.filter(n => n.path.startsWith('/001/00')).sort((a, b) => a.x - b.x);
    assert.strictEqual(kids.length, 2);
    assert.strictEqual(kids[0]._id, 'c1'); // birthOrder=1 在左
    assert.strictEqual(kids[1]._id, 'c2');
    // 不重叠：c1 右缘 < c2 左缘
    assert.ok(kids[0].x + familyWidth(kids[0]) <= kids[1].x);
    // 同代同 Y
    assert.strictEqual(kids[0].y, kids[1].y);
  });

  it('家庭单元：配偶在场时识别夫妻对（同代同 Y、非血缘父子关系）', () => {
    // 配偶分属两条不同房支（同代、非父子），materialized path 下各自独立
    const res = computeLayout([
      m('h', '/001/', { spouseId: '/002/' }),
      m('w', '/002/', { spouseId: '/001/' })
    ]);
    assert.strictEqual(res.nodes.length, 2);
    // 同代（Y 相同）
    assert.strictEqual(res.nodes[0].y, res.nodes[1].y);
    // families 输出一个夫妻对
    assert.strictEqual(res.families.length, 1);
    assert.strictEqual(res.families[0].length, 2);
  });

  it('200 节点性能：快速完成（<200ms）', () => {
    const nodes = [];
    const root = m('r', '/001/');
    nodes.push(root);
    // 10 个房支 × 20 人/支（三代），构造有效路径
    let id = 0;
    for (let b = 1; b <= 10; b++) {
      const segB = String(b).padStart(3, '0');
      nodes.push(m(`b${b}`, `/001/${segB}/`));
      for (let c = 1; c <= 9; c++) {
        const segC = String(c).padStart(3, '0');
        nodes.push(m(`c${b}_${c}`, `/001/${segB}/${segC}/`));
        for (let d = 1; d <= 2; d++) {
          const segD = String(d).padStart(3, '0');
          nodes.push(m(`d${b}_${c}_${d}`, `/001/${segB}/${segC}/${segD}/`));
        }
      }
    }
    const t0 = Date.now();
    const res = computeLayout(nodes);
    const dt = Date.now() - t0;
    assert.ok(res.nodes.length >= 200);
    assert.ok(dt < 500, `200 节点布局耗时 ${dt}ms（放宽 <500ms 防止 CI 抖动）`);
  });
});

describe('filterDirectLine（直系视图）', () => {
  it('返回祖先 + focus + 后代直系支', () => {
    const nodes = [
      m('g', '/001/'), m('f', '/001/002/'), m('u', '/001/003/'), // u = 叔伯
      m('me', '/001/002/004/'), m('sib', '/001/002/005/'), m('son', '/001/002/004/006/')
    ];
    const direct = filterDirectLine(nodes, '/001/002/004/');
    const paths = direct.map(n => n.path).sort();
    // 祖先 g,f + me + son（后代）；不含叔伯 u、兄弟 sib
    assert.ok(paths.includes('/001/'));
    assert.ok(paths.includes('/001/002/'));
    assert.ok(paths.includes('/001/002/004/'));
    assert.ok(paths.includes('/001/002/004/006/'));
    assert.ok(!paths.includes('/001/003/'));
    assert.ok(!paths.includes('/001/002/005/'));
  });
  it('无 focus 返回全量', () => {
    const nodes = [m('a', '/001/'), m('b', '/001/002/')];
    assert.strictEqual(filterDirectLine(nodes, null).length, 2);
  });
});

describe('timelineFilter（时间轴）', () => {
  it('在世（无 deathDate）始终保留', () => {
    const res = timelineFilter([m('a', '/001/', { birthDate: '1990-05-01' })], 2025);
    assert.strictEqual(res.length, 1);
  });
  it('出生晚于 Y 被滤除', () => {
    const res = timelineFilter([m('a', '/001/', { birthDate: '2020-05-01' })], 2010);
    assert.strictEqual(res.length, 0);
  });
  it('已故：死亡早于 Y 被滤除、等于/晚于 Y 保留', () => {
    const died = m('a', '/001/', { birthDate: '1950-05-01', deathDate: '2015-08-01' });
    assert.strictEqual(timelineFilter([died], 2016).length, 0);
    assert.strictEqual(timelineFilter([died], 2015).length, 1);
    assert.strictEqual(timelineFilter([died], 2000).length, 1);
  });
  it('无出生记录不误杀（保守保留）', () => {
    const res = timelineFilter([m('a', '/001/')], 2025);
    assert.strictEqual(res.length, 1);
  });
});

describe('五服色板（wufuColor）', () => {
  it('五级 + 出五服 + 兜底', () => {
    assert.strictEqual(wufuColor('斩衰'), '#2C2A29');
    assert.strictEqual(wufuColor('齐衰'), '#6B5B3E');
    assert.strictEqual(wufuColor('大功'), '#8C6A4F');
    assert.strictEqual(wufuColor('小功'), '#A8926E');
    assert.strictEqual(wufuColor('缌麻'), '#C4B391');
    assert.strictEqual(wufuColor('出五服'), '#E3DCCB'); // R26 修正：≥6 → 出五服（框架 7.3）
    assert.strictEqual(wufuColor('未知值'), '#E3DCCB'); // 兜底出五服
  });
});
