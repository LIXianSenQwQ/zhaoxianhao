/**
 * tests/kindship.test.js - 称谓矩阵 + 五服单测（文档 7.2 / 7.3，R2 修正几何口径）
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { fiveFu, kinshipTitle } = require('../cloud/functions/common/kindship');

// ─── 五服 ───

test('五服边界（文档 7.3 口径）', () => {
  assert.equal(fiveFu(1), '斩衰');   // 父母
  assert.equal(fiveFu(2), '齐衰');   // 祖父母、兄弟
  assert.equal(fiveFu(3), '大功');   // 堂兄弟
  assert.equal(fiveFu(4), '小功');   // 从祖兄弟
  assert.equal(fiveFu(5), '缌麻');   // 族兄弟
  assert.equal(fiveFu(6), '同宗');   // 出五服
  assert.equal(fiveFu(100), '同宗');
});

test('五服非法输入 fail-closed 为同宗', () => {
  assert.equal(fiveFu(0), '斩衰');   // 0 视为本人层，归入最近服
  assert.equal(fiveFu(-1), '同宗');
  assert.equal(fiveFu(1.5), '同宗');
  assert.equal(fiveFu(NaN), '同宗');
});

// ─── 称谓矩阵（(n,m) = 先上 n 步到 LCA 再下 m 步） ───

test('本人 (0,0)', () => {
  assert.equal(kinshipTitle(0, 0, 'MALE', null), '本人');
});

test('直系上溯/下溯', () => {
  assert.equal(kinshipTitle(1, 0, 'MALE', null), '父亲');
  assert.equal(kinshipTitle(1, 0, 'FEMALE', null), '母亲');
  assert.equal(kinshipTitle(2, 0, 'MALE', null), '祖父');
  assert.equal(kinshipTitle(4, 0, 'MALE', null), '高祖父');
  assert.equal(kinshipTitle(0, 1, 'MALE', null), '儿子');
  assert.equal(kinshipTitle(0, 1, 'FEMALE', null), '女儿');
  assert.equal(kinshipTitle(0, 2, 'MALE', null), '孙子');
});

test('兄弟 (1,1) 经父 + 长幼', () => {
  assert.equal(kinshipTitle(1, 1, 'MALE', 'elder'), '哥哥');
  assert.equal(kinshipTitle(1, 1, 'MALE', 'younger'), '弟弟');
  assert.equal(kinshipTitle(1, 1, 'FEMALE', 'elder'), '姐姐');
  assert.equal(kinshipTitle(1, 1, 'FEMALE', 'younger'), '妹妹');
});

test('叔伯 (2,1) / 侄 (1,2) / 堂亲 (2,2)（文档 7.2 示例对齐）', () => {
  assert.equal(kinshipTitle(2, 1, 'MALE', 'elder'), '伯父/叔叔');
  assert.equal(kinshipTitle(2, 1, 'FEMALE', null), '姑母');
  assert.equal(kinshipTitle(1, 2, 'MALE', null), '侄子');
  assert.equal(kinshipTitle(1, 2, 'FEMALE', null), '侄女');
  assert.equal(kinshipTitle(2, 2, 'MALE', 'elder'), '堂兄');
  assert.equal(kinshipTitle(2, 2, 'FEMALE', 'younger'), '堂妹');
});

test('矩阵外组合降级为「族亲」不报错', () => {
  assert.equal(kinshipTitle(9, 9, 'MALE', null), '族亲');
  assert.equal(kinshipTitle(1, 1, 'MALE', null), '族亲'); // 同辈槽缺 seniority
});
