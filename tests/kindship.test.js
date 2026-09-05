/**
 * tests/kindship.test.js - 称谓矩阵 + 五服单测（文档 7.2 / 7.3）
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

// ─── 称谓矩阵 ───

test('直系上溯/下溯', () => {
  assert.equal(kinshipTitle(1, 0, 'MALE', null), '父亲');
  assert.equal(kinshipTitle(1, 0, 'FEMALE', null), '母亲');
  assert.equal(kinshipTitle(2, 0, 'MALE', null), '祖父');
  assert.equal(kinshipTitle(0, 1, 'MALE', null), '儿子');
  assert.equal(kinshipTitle(0, 1, 'FEMALE', null), '女儿');
  assert.equal(kinshipTitle(0, 2, 'MALE', null), '孙子');
});

test('同辈长幼', () => {
  assert.equal(kinshipTitle(0, 0, 'MALE', 'elder'), '哥哥');
  assert.equal(kinshipTitle(0, 0, 'MALE', 'younger'), '弟弟');
  assert.equal(kinshipTitle(0, 0, 'FEMALE', 'elder'), '姐姐');
});

test('旁系：叔伯侄（文档 7.2 示例 n=2,m=1 / n=1,m=2）', () => {
  assert.equal(kinshipTitle(1, 1, 'MALE', 'elder'), '伯父/叔叔');
  assert.equal(kinshipTitle(1, 1, 'MALE', 'younger'), '侄子');
  assert.equal(kinshipTitle(1, 1, 'FEMALE', 'elder'), '姑母');
  assert.equal(kinshipTitle(1, 2, 'MALE', null), '孙辈(兄弟之孙)');
});

test('矩阵外组合降级为「族亲」不报错', () => {
  assert.equal(kinshipTitle(9, 9, 'MALE', null), '族亲');
  assert.equal(kinshipTitle(3, 3, 'FEMALE', 'elder'), '族亲');
});
