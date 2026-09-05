/**
 * tests/tree.test.js - 物化路径族谱树单测（Sprint R2）
 */
const { test } = require('node:test');
const assert = require('node:assert');
const {
  ROOT_PATH, TREE_PAGE_BUDGET, buildPath, generationOf, isDescendantOf,
  commonAncestorPath, relationSteps, paginateTree, subtreeRegex, segmentOf
} = require('../cloud/functions/common/tree');

test('buildPath：始祖与多代构造', () => {
  assert.equal(buildPath('', '1'), '/001/');
  assert.equal(buildPath('/', '3'), '/003/');
  assert.equal(buildPath('/001/', '3'), '/001/003/');
  assert.equal(buildPath('/001/003/', '7'), '/001/003/007/');
});

test('buildPath：非法输入必须抛错（防脏路径入库）', () => {
  assert.throws(() => buildPath('', 'abc'));
  assert.throws(() => buildPath('', '1234'));
  assert.throws(() => buildPath('001/', '2'));    // 缺首斜杠
  assert.throws(() => buildPath('/001/02x/', '2'));
});

test('generationOf：世代 = 分段数（根占位非成员）', () => {
  assert.equal(generationOf('/'), 0);        // 根占位（非成员/未挂接口径）
  assert.equal(generationOf('/001/'), 1);
  assert.equal(generationOf('/001/003/'), 2);
  assert.equal(generationOf('/001/003/007/'), 3);
  assert.equal(generationOf(''), 0);         // 未挂接
});

test('isDescendantOf：含自身的前缀判定，防数字兄弟误判', () => {
  assert.equal(isDescendantOf('/001/', '/001/003/'), true);
  assert.equal(isDescendantOf('/001/', '/001/'), true);      // 自身
  assert.equal(isDescendantOf('/001/003/', '/001/'), false); // 反向
  assert.equal(isDescendantOf('/001/003/', '/001/031/'), false); // 31 不是 3 的后代
});

test('commonAncestorPath（LCA）', () => {
  const a = '/001/003/007/';
  const b = '/001/003/009/';
  assert.equal(commonAncestorPath(a, b), '/001/003/');       // 兄弟 → 父
  assert.equal(commonAncestorPath(a, '/001/005/'), '/001/'); // 叔侄 → 祖
  assert.equal(commonAncestorPath(a, a), '/001/003/007/');   // 自身
  assert.equal(commonAncestorPath(a, '/002/'), '/');         // 异支 → 始祖
});

test('relationSteps × kinshipTitle 端到端（树步数 → 称谓连通）', () => {
  const { kinshipTitle } = require('../cloud/functions/common/kindship');
  const self = '/001/003/007/';
  // 兄弟：up=1 down=1（经父）→ (1,1) elder = 哥哥
  const s1 = relationSteps(self, '/001/003/009/');
  assert.deepEqual([s1.up, s1.down], [1, 1]);
  assert.equal(kinshipTitle(s1.up, s1.down, 'MALE', 'elder'), '哥哥');
  // 侄子：up=1 down=2 → (1,2) = 侄子
  const s2 = relationSteps(self, '/001/003/009/011/');
  assert.deepEqual([s2.up, s2.down], [1, 2]);
  assert.equal(kinshipTitle(s2.up, s2.down, 'MALE', null), '侄子');
  // 叔父：up=2 down=1 → (2,1) elder = 伯父/叔叔
  const s3 = relationSteps(self, '/001/005/');
  assert.deepEqual([s3.up, s3.down], [2, 1]);
  assert.equal(kinshipTitle(s3.up, s3.down, 'MALE', 'elder'), '伯父/叔叔');
  // 儿子：up=0 down=1 → (0,1) = 儿子
  const s4 = relationSteps(self, '/001/003/007/011/');
  assert.deepEqual([s4.up, s4.down], [0, 1]);
  assert.equal(kinshipTitle(s4.up, s4.down, 'MALE', null), '儿子');
  // 堂兄弟：up=2 down=2 → (2,2) elder = 堂兄
  const s5 = relationSteps(self, '/001/005/021/');
  assert.deepEqual([s5.up, s5.down], [2, 2]);
  assert.equal(kinshipTitle(s5.up, s5.down, 'MALE', 'elder'), '堂兄');
  // 本人：up=0 down=0
  const s6 = relationSteps(self, self);
  assert.deepEqual([s6.up, s6.down], [0, 0]);
  assert.equal(kinshipTitle(s6.up, s6.down, 'MALE', null), '本人');
});

test('paginateTree：预算封顶 + 游标续页', () => {
  const nodes = Array.from({ length: 450 }, (_, i) => ({ path: `/${String(i + 1).padStart(3, '0')}/` }));
  const p1 = paginateTree(nodes, '', 300);          // 请求超预算
  assert.equal(p1.items.length, TREE_PAGE_BUDGET);  // 封顶 200
  assert.equal(p1.hasMore, true);
  const p2 = paginateTree(nodes, p1.nextCursor, TREE_PAGE_BUDGET);
  assert.equal(p2.items.length, TREE_PAGE_BUDGET);
  assert.equal(p2.items[0].path, nodes[TREE_PAGE_BUDGET].path); // 续页起点正确
});

test('subtreeRegex：恰配自身+后代，不匹配同前缀数字兄弟', () => {
  const re = subtreeRegex('/001/003/');
  assert.equal(re.test('/001/003'), true);
  assert.equal(re.test('/001/003/007/'), true);
  assert.equal(re.test('/001/031/'), false); // 031 ≠ 003 的后代
  assert.equal(re.test('/001/0031/'), false);
  const root = subtreeRegex('/');
  assert.equal(root.test('/001/'), true);    // 始祖 = 全树
});
