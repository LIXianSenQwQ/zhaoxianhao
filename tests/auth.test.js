// tests/auth.test.js
/**
 * R29 T2 前置: utils/auth.js 角色门禁工具测试
 * 关键红线: 前端 ROLE_ORDER 必须与云函数 cloud/functions/common/roles.js 同口径
 * （漂移即越权：admin.heroTag HISTORIAN+ 门禁曾在 API.md L429 定死 EDITOR < HISTORIAN）
 */
const { test } = require('node:test');
const assert = require('node:assert');

// mock uni 全局（auth.js 顶层不调用，仅函数内部用，防御性注入）
globalThis.uni = {
  getStorageSync: () => '',
  setStorageSync: () => {},
  removeStorageSync: () => {}
};

const auth = require('../utils/auth.js');
const rolesCloud = require('../cloud/functions/common/roles.js');

test('auth.ROLE_ORDER 与云函数 roles.ROLE_LEVEL 同口径（防漂移红线）', () => {
  const fe = auth.ROLE_ORDER;
  const cloud = rolesCloud.ROLE_LEVEL || rolesCloud.default?.ROLE_LEVEL;
  assert.ok(cloud, '云函数导出 ROLE_LEVEL');
  // 六角色键集合一致
  assert.deepEqual(Object.keys(fe).sort(), Object.keys(cloud).sort());
  // 每个角色数值一致
  for (const role of Object.keys(cloud)) {
    assert.equal(fe[role], cloud[role], `role ${role} 前后端层级不一致`);
  }
});

test('auth: EDITOR < HISTORIAN（API.md admin.heroTag 红线）', () => {
  assert.ok(auth.ROLE_ORDER.EDITOR < auth.ROLE_ORDER.HISTORIAN, '族史委应高于编辑');
  assert.equal(auth.hasRole('EDITOR', 'HISTORIAN'), false, 'EDITOR 不可过 HISTORIAN 门禁');
  assert.equal(auth.hasRole('HISTORIAN', 'EDITOR'), true, 'HISTORIAN 可过 EDITOR 门禁');
});

test('auth.hasRole: 链式层级正确', () => {
  assert.equal(auth.hasRole('VISITOR', 'MEMBER'), false);
  assert.equal(auth.hasRole('MEMBER', 'MEMBER'), true);   // 等级相等放行
  assert.equal(auth.hasRole('BRANCH_HEAD', 'MEMBER'), true);
  assert.equal(auth.hasRole('CHIEF', 'EDITOR'), true);
  assert.equal(auth.hasRole('MEMBER', 'EDITOR'), false);  // R28 import 门禁
});

test('auth.hasRole: 未知角色 fail-closed', () => {
  assert.equal(auth.hasRole(undefined, 'MEMBER'), false);
  assert.equal(auth.hasRole('SUPER_ADMIN', 'MEMBER'), false); // 未定义角色不放行
  assert.equal(auth.hasRole('MEMBER', undefined), false);
});

test('auth.isAdminRole / isChief', () => {
  assert.equal(auth.isAdminRole('EDITOR'), true);
  assert.equal(auth.isAdminRole('HISTORIAN'), true);
  assert.equal(auth.isAdminRole('CHIEF'), true);
  assert.equal(auth.isAdminRole('MEMBER'), false);
  assert.equal(auth.isChief('CHIEF'), true);
  assert.equal(auth.isChief('EDITOR'), false);
});

test('auth.roleName: 中文名称映射', () => {
  assert.equal(auth.roleName('CHIEF'), '族长');
  assert.equal(auth.roleName('HISTORIAN'), '族史委');
  assert.equal(auth.roleName('UNKNOWN_X'), '未知');
});
