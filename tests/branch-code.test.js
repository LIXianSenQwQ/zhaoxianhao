/**
 * tests/branch-code.test.js
 * branch-code 纯函数单测（框架 §3.2 编码规则）
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { parseBranchCode, validateBranchCode, formatBranchCode, branchLevelLabel } = require('../utils/branch-code.js');

test('parseBranchCode 标准码', () => {
  const p = parseBranchCode('HAO-0000');
  assert.equal(p.prefix, 'HAO');
  assert.deepEqual(p.segments, [0]);
  assert.equal(p.level, 1);
  assert.equal(p.label, '总谱');
});

test('parseBranchCode 二级/三级', () => {
  assert.equal(parseBranchCode('HAO-0000-01').level, 2);
  assert.equal(parseBranchCode('HAO-0000-01-03').level, 3);
  assert.equal(parseBranchCode('HAO-0000-01-03').label, '支谱');
});

test('parseBranchCode 非法输入 → null', () => {
  assert.equal(parseBranchCode(null), null);
  assert.equal(parseBranchCode(''), null);
  assert.equal(parseBranchCode('INVALID'), null);
  assert.equal(parseBranchCode('HAO-xxx'), null);
  assert.equal(parseBranchCode('hao-0000'), null); // 大写 HAO
});

test('validateBranchCode', () => {
  assert.equal(validateBranchCode('HAO-0000'), true);
  assert.equal(validateBranchCode('HAO-0000-01', 2), true);
  assert.equal(validateBranchCode('HAO-0000-01-03'), true);
  assert.equal(validateBranchCode('HAO-0000-01-03-99'), false); // 超 3 级

  // maxLevel 参数
  assert.equal(validateBranchCode('HAO-0000-01-03-99', 4), true);
});

test('formatBranchCode', () => {
  assert.equal(formatBranchCode('HAO-0000', 1), 'HAO-0000-01');
  assert.equal(formatBranchCode('HAO-0000-01', 3), 'HAO-0000-01-03');
  assert.equal(formatBranchCode('HAO-0000', 0), 'HAO-0000-00');
});

test('branchLevelLabel', () => {
  assert.equal(branchLevelLabel('HAO-0000'), '总谱');
  assert.equal(branchLevelLabel('HAO-0000-01'), '分谱');
  assert.equal(branchLevelLabel('HAO-0000-01-03'), '支谱');
  assert.equal(branchLevelLabel(''), '');
});