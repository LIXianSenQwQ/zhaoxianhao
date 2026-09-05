/**
 * tests/tree-view.test.js - 树视图状态机 + CSV 导出纯函数（Sprint R5）
 */
const { test } = require('node:test');
const assert = require('node:assert');
const V = require('../utils/tree-view');
const { BOM, escapeField, rowToCsvLine, rowsToCsv, buildExportPath } = require('../cloud/functions/common/csv');

// ─── 折叠状态机 ───

test('toggleCollapse：初始展开 → 折叠 → 再展开（不可变更新）', () => {
  let m = {};
  m = V.toggleCollapse(m, '/001/');
  assert.equal(V.isExpanded(m, '/001/'), false);
  m = V.toggleCollapse(m, '/001/');
  assert.equal(V.isExpanded(m, '/001/'), true);
  // 不可变：原对象不受影响
  const frozen = Object.freeze({});
  const next = V.toggleCollapse(frozen, '/x/');
  assert.equal(V.isExpanded(next, '/x/'), false);
});

test('setCollapse：直接设定', () => {
  let m = V.setCollapse({}, '/a/', true);
  assert.equal(V.isExpanded(m, '/a/'), false);
  m = V.setCollapse(m, '/a/', false);
  assert.equal(V.isExpanded(m, '/a/'), true);
});

test('resetCollapsed：清空', () => {
  const m = V.toggleCollapse(V.toggleCollapse({}, '/a/'), '/b/');
  assert.deepEqual(V.resetCollapsed(), {});
});

// ─── 页缓存 ───

test('getPage/hasCache：命中/未命中/空占位（cacheSet 返回新 Map，不可变）', () => {
  let pages = new Map();
  assert.equal(V.getPage(pages, 'k'), null);
  assert.equal(V.hasCache(pages, 'k'), false);
  pages = V.cacheSet(pages, 'k', { nodes: [], hasMore: false });
  assert.equal(V.hasCache(pages, 'k'), true);
  assert.equal(V.getPage(pages, 'k').hasMore, false);
});

test('cacheSet：不可变更新（原 Map 不受影响）', () => {
  const p1 = new Map();
  const p2 = V.cacheSet(p1, 'k', { nodes: [1], hasMore: false });
  assert.equal(p1.has('k'), false);
  assert.equal(p2.has('k'), true);
});

test('cacheClear：按根路径前缀清除根页与子树页（不可变）', () => {
  let pages = new Map();
  pages = V.cacheSet(pages, 'tree:/001/:r', { nodes: [], hasMore: false });
  pages = V.cacheSet(pages, 'tree:/001/:c_children', { nodes: [], hasMore: false });
  pages = V.cacheSet(pages, 'tree:/002/:r', { nodes: [], hasMore: false });
  const next = V.cacheClear(pages, '/001/');
  assert.equal(next.has('tree:/001/:r'), false);
  assert.equal(next.has('tree:/001/:c_children'), false);
  assert.equal(next.has('tree:/002/:r'), true);
  // 原 Map 不受影响
  assert.equal(pages.has('tree:/001/:r'), true);
});

// ─── 分页续载 ───

test('hasNextPage：hasMore=true 才续载', () => {
  const pages = V.cacheSet(new Map(), 'tree:/a/:r', { nodes: [], hasMore: true });
  assert.equal(V.hasNextPage('tree:/a/:r', pages), true);
  const p2 = V.cacheSet(pages, 'tree:/a/:r', { nodes: [], hasMore: false });
  assert.equal(V.hasNextPage('tree:/a/:r', p2), false);
  assert.equal(V.hasNextPage('missing', p2), false);
});

test('getNextPageParam：下一页无缓存返回页码', () => {
  const pages = V.cacheSet(new Map(), 'tree:/a/:1', { nodes: [], hasMore: true });
  assert.equal(V.getNextPageParam('/a/', 2, pages), 2);
});

// ─── CSV 导出 ───

test('escapeField：普通值原样，含逗号/引号/换行则包裹转义', () => {
  assert.equal(escapeField('郝氏'), '郝氏');
  assert.equal(escapeField('a,b'), '"a,b"');
  assert.equal(escapeField('say "hi"'), '"say ""hi"""');
  assert.equal(escapeField('line\nbreak'), '"line\nbreak"');
  assert.equal(escapeField(null), '');
  assert.equal(escapeField(undefined), '');
  assert.equal(escapeField(18), '18');
});

test('rowToCsvLine：多字段逗号连接', () => {
  assert.equal(rowToCsvLine(['a', 'b,c', 'd']), 'a,"b,c",d');
});

test('rowsToCsv：BOM + 表头 + 行（\r\n 分隔）', () => {
  const csv = rowsToCsv(
    [{ 谱名: '郝一', 世代: 18 }, { 谱名: '郝二', 世代: 19 }],
    ['谱名', '世代']
  );
  assert.ok(csv.startsWith(BOM));
  const lines = csv.slice(1).split('\r\n');
  assert.equal(lines[0], '谱名,世代');
  assert.equal(lines[1], '郝一,18');
  assert.equal(lines[2], '郝二,19');
});

test('rowsToCsv：空数组返回空串', () => {
  assert.equal(rowsToCsv([], ['a']), '');
  assert.equal(rowsToCsv(null), '');
});

test('rowsToCsv：省略 keys 自动取首行键', () => {
  const csv = rowsToCsv([{ x: 1, y: 2 }]);
  assert.ok(csv.includes('x,y'));
  assert.ok(csv.includes('1,2'));
});

/** Sprint R7: buildExportPath 纯函数测试 */
test('buildExportPath：正常 branchId+ts → exports/members-{branch}-{ts}.csv', () => {
  assert.equal(buildExportPath('long', 1690000000), 'exports/members-long-1690000000.csv');
  assert.equal(buildExportPath('', 1690000000), 'exports/members-all-1690000000.csv');
  // 转义：特殊字符过滤
  assert.equal(buildExportPath('long/branch', 1690000000), 'exports/members-longbranch-1690000000.csv');
});
