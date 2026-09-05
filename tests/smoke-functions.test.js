/**
 * tests/smoke-functions.test.js
 * 云函数行为冒烟测试：stub wx-server-sdk + stub db，
 * 真正调用 main() 验证业务分支（统一响应格式/参数校验/权限门禁）。
 * 运行前提：--test-isolation=none（同进程 stub 注入一次生效）
 */
const { test } = require('node:test');
const assert = require('node:assert');
const Module = require('module');
const path = require('node:path');

// ─── stub 注入（一次即可） ───
const stubPath = require.resolve('../scripts/wx-server-sdk-stub.js');
if (!Module._resolveFilename.__hcsPatched) {
  const orig = Module._resolveFilename;
  Module._resolveFilename = function (request, ...rest) {
    if (request === 'wx-server-sdk') return stubPath;
    return orig.call(this, request, ...rest);
  };
  Module._resolveFilename.__hcsPatched = true;
}

const FN = (name) => require(path.join('..', 'cloud', 'functions', name, 'index.js'));
const CTX = { OPENID: 'u-test', openid: 'u-test' };

test('task.today：走 stub db 返回统一成功格式', async () => {
  const res = await FN('task').main({ action: 'today' }, CTX);
  assert.equal(res.success, true);
  assert.ok(typeof res.data.completedCount === 'number');
});

test('task.checkin 缺 taskId → BAD_REQUEST 400', async () => {
  const res = await FN('task').main({ action: 'checkin' }, CTX);
  assert.equal(res.success, false);
  assert.equal(res.code, 400);
});

test('task 未知 action → BAD_REQUEST', async () => {
  const res = await FN('task').main({ action: 'nope' }, CTX);
  assert.equal(res.code, 400);
});

test('task 无 OPENID → FORBIDDEN 403', async () => {
  const res = await FN('task').main({ action: 'today' }, {});
  assert.equal(res.code, 403);
});

test('upload.policy：各场景策略下发 + 未知场景拒绝', async () => {
  const ok = await FN('upload').main({ action: 'policy', scene: 'docscan' }, CTX);
  assert.equal(ok.success, true);
  assert.equal(ok.data.scene, 'docscan');

  const bad = await FN('upload').main({ action: 'policy', scene: 'hacker' }, CTX);
  assert.equal(bad.code, 400);
});

test('upload.meta：类型/大小校验 fail-closed', async () => {
  const big = await FN('upload').main(
    { action: 'meta', scene: 'avatar', fileId: 'f1', size: 99 * 1024 * 1024, mimeType: 'image/jpeg' }, CTX);
  assert.equal(big.code, 400, '头像超 5M 应拒绝');

  const type = await FN('upload').main(
    { action: 'meta', scene: 'avatar', fileId: 'f1', size: 1024, mimeType: 'application/x-msdownload' }, CTX);
  assert.equal(type.code, 400, 'exe 伪装应拒绝');

  const noGroup = await FN('upload').main(
    { action: 'meta', scene: 'album', fileId: 'f1', size: 1024, mimeType: 'image/jpeg', visibility: 'GROUP' }, CTX);
  assert.equal(noGroup.code, 400, 'GROUP 可见性必须带 groupId');
});

test('event.create：非族史委 403 / 缺参 400（先查权限后查参）', async () => {
  // stub db users 返回空 → VISITOR
  const res = await FN('event').main(
    { action: 'create', title: 't', content: 'c', year: 2024 }, CTX);
  assert.equal(res.code, 403, 'VISITOR 不得发布大事记');
});

test('event.list：分页结构完整', async () => {
  const res = await FN('event').main({ action: 'list', page: 1 }, CTX);
  assert.equal(res.success, true);
  assert.ok(Array.isArray(res.data.events));
  assert.equal(res.data.hasMore, false);
});

test('member.tree：缺 focusId → BAD_REQUEST', async () => {
  const res = await FN('member').main({ action: 'tree' }, CTX);
  assert.equal(res.code, 400);
});

test('member.getDetail：stub doc 无数据 → NOT_FOUND 404', async () => {
  const res = await FN('member').main({ action: 'getDetail', memberId: 'm-x' }, CTX);
  assert.equal(res.code, 404);
});
