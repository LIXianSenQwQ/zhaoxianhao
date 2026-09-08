/**
 * tests/kindship.test.js - 称谓矩阵 + 五服单测（文档 7.2 / 7.3，R2 修正几何口径）
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { fiveFu, fiveFuOf, kinshipTitle } = require('../cloud/functions/common/kindship');

// ─── 五服 ───

test('五服边界（文档 7.3 口径）', () => {
  assert.equal(fiveFu(1), '斩衰');   // 父母
  assert.equal(fiveFu(2), '齐衰');   // 祖父母、兄弟
  assert.equal(fiveFu(3), '大功');   // 堂兄弟
  assert.equal(fiveFu(4), '小功');   // 从祖兄弟
  assert.equal(fiveFu(5), '缌麻');   // 族兄弟
  assert.equal(fiveFu(6), '出五服'); // R26 修正：出五服 ≠ 无共同祖先（框架 7.3 口径）
  assert.equal(fiveFu(100), '出五服');
});

test('五服非法输入 fail-closed 为出五服', () => {
  assert.equal(fiveFu(0), '斩衰');   // 0 视为本人层，归入最近服
  assert.equal(fiveFu(-1), '出五服');
  assert.equal(fiveFu(1.5), '出五服');
  assert.equal(fiveFu(NaN), '出五服');
});

// ─── fiveFuOf（关系级口径，B0 新增：member.tree 回填 / relation.calc 共用）───

test('fiveFuOf：本人与直系（代数间隔 = 档位）', () => {
  assert.equal(fiveFuOf(0, 0), '本人');      // 本人不归服
  assert.equal(fiveFuOf(1, 0), '斩衰');      // 父
  assert.equal(fiveFuOf(0, 1), '斩衰');      // 子（对称）
  assert.equal(fiveFuOf(2, 0), '齐衰');      // 祖
  assert.equal(fiveFuOf(0, 3), '大功');      // 曾孙
  assert.equal(fiveFuOf(6, 0), '出五服');    // 直系六代亲尽
});

test('fiveFuOf：旁系（代数间隔 + 1，对齐测试锚点）', () => {
  assert.equal(fiveFuOf(1, 1), '齐衰');      // 兄弟（R2 锚点 2=齐衰）
  assert.equal(fiveFuOf(2, 2), '大功');      // 堂兄弟（锚点 3）
  assert.equal(fiveFuOf(3, 3), '小功');      // 从祖兄弟（锚点 4）
  assert.equal(fiveFuOf(4, 4), '缌麻');      // 族兄弟（锚点 5）
  assert.equal(fiveFuOf(5, 5), '出五服');    // 五世亲尽
});

test('fiveFuOf：非法输入 fail-closed 为出五服', () => {
  assert.equal(fiveFuOf(-1, 1), '出五服');
  assert.equal(fiveFuOf(1, -1), '出五服');
  assert.equal(fiveFuOf(NaN, 1), '出五服');
  assert.equal(fiveFuOf('a', 1), '出五服');
  assert.equal(fiveFuOf(null, null), '出五服');
});

// ─── 称谓矩阵（(n,m) = 先上 n 步到 LCA 再下 m 步） ───

test('本人 (0,0)', () => {
  const res = kinshipTitle(0, 0, 'MALE', null);
  assert.equal(res.formal, '本人');
  assert.equal(res.dialect, null);
});

test('直系上溯/下溯', () => {
  const r1 = kinshipTitle(1, 0, 'MALE', null);
  assert.equal(r1.formal, '父亲');
  const r2 = kinshipTitle(1, 0, 'FEMALE', null);
  assert.equal(r2.formal, '母亲');
  const r3 = kinshipTitle(2, 0, 'MALE', null);
  assert.equal(r3.formal, '祖父');
  const r4 = kinshipTitle(4, 0, 'MALE', null);
  assert.equal(r4.formal, '高祖父');
  const r5 = kinshipTitle(0, 1, 'MALE', null);
  assert.equal(r5.formal, '儿子');
  const r6 = kinshipTitle(0, 1, 'FEMALE', null);
  assert.equal(r6.formal, '女儿');
  const r7 = kinshipTitle(0, 2, 'MALE', null);
  assert.equal(r7.formal, '孙子');
});

test('兄弟 (1,1) 经父 + 长幼', () => {
  assert.equal(kinshipTitle(1, 1, 'MALE', 'elder').formal, '哥哥');
  assert.equal(kinshipTitle(1, 1, 'MALE', 'younger').formal, '弟弟');
  assert.equal(kinshipTitle(1, 1, 'FEMALE', 'elder').formal, '姐姐');
  assert.equal(kinshipTitle(1, 1, 'FEMALE', 'younger').formal, '妹妹');
});

test('叔伯 (2,1) / 侄 (1,2) / 堂亲 (2,2)（文档 7.2 示例对齐）', () => {
  assert.equal(kinshipTitle(2, 1, 'MALE', 'elder').formal, '伯父/叔叔');
  assert.equal(kinshipTitle(2, 1, 'FEMALE', null).formal, '姑母');
  assert.equal(kinshipTitle(1, 2, 'MALE', null).formal, '侄子');
  assert.equal(kinshipTitle(1, 2, 'FEMALE', null).formal, '侄女');
  assert.equal(kinshipTitle(2, 2, 'MALE', 'elder').formal, '堂兄');
  assert.equal(kinshipTitle(2, 2, 'FEMALE', 'younger').formal, '堂妹');
});

test('矩阵外组合降级为「族亲」不报错', () => {
  assert.equal(kinshipTitle(9, 9, 'MALE', null).formal, '族亲');
  assert.equal(kinshipTitle(1, 1, 'MALE', null).formal, '族亲'); // 同辈槽缺 seniority → 族亲
});

// ─── 方言覆盖测试 ───

test('方言覆盖：无方言时仅返回 formal，dialect=null', () => {
  const res = kinshipTitle(1, 0, 'MALE', null, null);
  assert.equal(res.formal, '父亲');
  assert.equal(res.dialect, null);
});

test('方言覆盖：直系上溯 (1-0)，undong 方言「爹/娘」', () => {
  const dialect = {
    '1-0': { male: '爹', female: '娘' }
  };
  const r1 = kinshipTitle(1, 0, 'MALE', null, dialect);
  assert.equal(r1.formal, '父亲');
  assert.equal(r1.dialect, '爹');
  const r2 = kinshipTitle(1, 0, 'FEMALE', null, dialect);
  assert.equal(r2.formal, '母亲');
  assert.equal(r2.dialect, '娘');
});

test('方言覆盖：兄弟 (1-1) with elder/younger', () => {
  // undong dialect: brother → 哥 / 弟；sister → 姐 / 妹
  const dialect = {
    '1-1': { male: { elder: '哥', younger: '弟' }, female: { elder: '姐', younger: '妹' } }
  };
  assert.equal(kinshipTitle(1, 1, 'MALE', 'elder', dialect).formal, '哥哥');
  assert.equal(kinshipTitle(1, 1, 'MALE', 'elder', dialect).dialect, '哥');
  assert.equal(kinshipTitle(1, 1, 'MALE', 'younger', dialect).formal, '弟弟');
  assert.equal(kinshipTitle(1, 1, 'MALE', 'younger', dialect).dialect, '弟');
  assert.equal(kinshipTitle(1, 1, 'FEMALE', 'elder', dialect).formal, '姐姐');
  assert.equal(kinshipTitle(1, 1, 'FEMALE', 'elder', dialect).dialect, '姐');
  assert.equal(kinshipTitle(1, 1, 'FEMALE', 'younger', dialect).formal, '妹妹');
  assert.equal(kinshipTitle(1, 1, 'FEMALE', 'younger', dialect).dialect, '妹');
});

test('方言覆盖：部分矩阵未覆盖时 fallback formal', () => {
  const dialect = {
    '1-0': { male: '老爹', female: '老娘' }
    // '1-1' not defined → should return null
  };
  const r1 = kinshipTitle(1, 0, 'MALE', null, dialect);
  assert.equal(r1.dialect, '老爹');
  const r2 = kinshipTitle(1, 1, 'MALE', 'elder', dialect);
  assert.equal(r2.dialect, null); // no override → fallback formal
  assert.equal(r2.formal, '哥哥');
});

test('方言覆盖：sameGender 槽位优先匹配', () => {
  const dialect = {
    '1-1': { sameGender: { elder: '哥儿', younger: '弟儿' } }
  };
  assert.equal(kinshipTitle(1, 1, 'MALE', 'elder', dialect).dialect, '哥儿');
  assert.equal(kinshipTitle(1, 1, 'MALE', 'younger', dialect).dialect, '弟儿');
  assert.equal(kinshipTitle(1, 1, 'FEMALE', 'elder', dialect).dialect, '哥儿'); // gender-specific absent, uses sameGender
});
