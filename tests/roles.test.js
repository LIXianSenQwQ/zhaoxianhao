/**
 * tests/roles.test.js - 角色等级体系单测
 * 运行：node --test tests/
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { ROLE_LEVEL, hasRole, canAudit, isHistorian, isChief } = require('../cloud/functions/common/roles');

test('ROLE_LEVEL 单调递增', () => {
  const levels = Object.values(ROLE_LEVEL);
  for (let i = 1; i < levels.length; i++) {
    assert.ok(levels[i] > levels[i - 1], `等级应递增: ${levels[i - 1]} -> ${levels[i]}`);
  }
});

test('hasRole 边界', () => {
  assert.equal(hasRole('MEMBER', 'MEMBER'), true);       // 恰好达标
  assert.equal(hasRole('VISITOR', 'MEMBER'), false);     // 不达标
  assert.equal(hasRole('CHIEF', 'MEMBER'), true);        // 超额
  assert.equal(hasRole('UNKNOWN_ROLE', 'MEMBER'), false);// 未知角色 fail-closed
  assert.equal(hasRole('MEMBER', 'UNKNOWN'), false);     // 未知门槛 fail-closed
});

test('canAudit: BRANCH_HEAD 起可审核（双人审核 W2 口径）', () => {
  assert.equal(canAudit('BRANCH_HEAD'), true);
  assert.equal(canAudit('MEMBER'), false);
  assert.equal(canAudit('VISITOR'), false);
});

test('isHistorian / isChief', () => {
  assert.equal(isHistorian('HISTORIAN'), true);
  assert.equal(isHistorian('EDITOR'), false);
  assert.equal(isChief('CHIEF'), true);
  assert.equal(isChief('HISTORIAN'), false);
});
