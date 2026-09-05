/**
 * tests/privacy.test.js - 隐私校验单测（文档 7.4 + 8.3.1）
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { privacyCheck, visibilityCheck } = require('../cloud/functions/common/privacy');

// ─── privacyCheck（L 级） ───

test('公开字段：MEMBER 可读，VISITOR 不可读', () => {
  const target = { _id: 'm1', branchId: 'b1', status: 'ALIVE' };
  assert.equal(privacyCheck({ role: 'MEMBER', branchId: 'b1', openid: 'u1' }, target, '公开'), 'allow');
  assert.equal(privacyCheck({ role: 'VISITOR', branchId: 'b1', openid: 'u1' }, target, '公开'), 'needAuth');
});

test('限制字段：同房支/直系/族长 三通道', () => {
  const target = { _id: 'm2', branchId: 'b2', status: 'ALIVE' };
  // 同房支
  assert.equal(privacyCheck({ role: 'MEMBER', branchId: 'b2', openid: 'u1' }, target, '限制'), 'allow');
  // 跨房支普通成员
  assert.equal(privacyCheck({ role: 'MEMBER', branchId: 'b1', openid: 'u1' }, target, '限制'), 'needAuth');
  // 跨房支但有授权（直系）
  assert.equal(
    privacyCheck({ role: 'MEMBER', branchId: 'b1', openid: 'u1', authedMemberIds: new Set(['m2']) }, target, '限制'),
    'allow'
  );
  // 跨房支族长
  assert.equal(privacyCheck({ role: 'CHIEF', branchId: 'b1', openid: 'u9' }, target, '限制'), 'allow');
});

test('私密字段：仅本人或授权者', () => {
  const target = { _id: 'm3', branchId: 'b1', status: 'ALIVE', linkedOpenid: 'u3' };
  assert.equal(privacyCheck({ role: 'MEMBER', branchId: 'b1', openid: 'u3' }, target, '私密'), 'allow');
  assert.equal(privacyCheck({ role: 'MEMBER', branchId: 'b1', openid: 'u4' }, target, '私密'), 'needAuth');
  assert.equal(
    privacyCheck({ role: 'MEMBER', branchId: 'b1', openid: 'u4', authedMemberIds: new Set(['m3']) }, target, '私密'),
    'allow'
  );
});

test('私密字段：即使是族长（非本人无授权）也不放行——逐条授权原则', () => {
  const target = { _id: 'm3', status: 'ALIVE', linkedOpenid: 'u3' };
  assert.equal(privacyCheck({ role: 'CHIEF', branchId: 'b1', openid: 'u9' }, target, '私密'), 'needAuth');
});

test('已故成员：非私密可读；私密需 HISTORIAN 审批', () => {
  const dead = { _id: 'm4', branchId: 'b1', status: 'DECEASED', linkedOpenid: 'u4' };
  assert.equal(privacyCheck({ role: 'MEMBER', branchId: 'b1', openid: 'u1' }, dead, '公开'), 'allow');
  assert.equal(privacyCheck({ role: 'MEMBER', branchId: 'b1', openid: 'u4' }, dead, '私密'), 'needAuth');
  assert.equal(privacyCheck({ role: 'HISTORIAN', branchId: 'b9', openid: 'u8' }, dead, '私密'), 'allow');
});

// ─── visibilityCheck（V1.1 三级可见性） ───

const REQ = { openid: 'u1', familyIds: new Set(['f1']), authedTargetIds: new Set() };

test('PUBLIC 允许', () => {
  assert.equal(visibilityCheck(REQ, { visibility: 'PUBLIC', ownerOpenid: 'u2' }), 'allow');
});

test('PRIVATE：仅本人或受托代理人', () => {
  const c = { _id: 'c1', visibility: 'PRIVATE', ownerOpenid: 'u2' };
  assert.equal(visibilityCheck(REQ, c), 'deny');
  assert.equal(visibilityCheck({ ...REQ, openid: 'u2' }, c), 'allow');
  assert.equal(
    visibilityCheck({ ...REQ, authedTargetIds: new Set(['c1']) }, c), 'allow',
    '受托代理人可访问'
  );
});

test('GROUP：名单组内可访问', () => {
  const c = { _id: 'c2', visibility: 'GROUP', ownerOpenid: 'u2', groupIds: ['f1', 'g9'] };
  assert.equal(visibilityCheck(REQ, c), 'allow');
  assert.equal(visibilityCheck({ ...REQ, familyIds: new Set(['f2']) }, c), 'deny');
});

test('未知可见性 fail-closed', () => {
  assert.equal(visibilityCheck(REQ, { visibility: 'WHATEVER', ownerOpenid: 'u1' }), 'deny');
});
