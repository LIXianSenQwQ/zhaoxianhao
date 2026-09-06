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

// ─── Sprint R7: member.applyAuth smoke gates ───

test('member.applyAuth：VISITOR → 403（鉴权先行）', async () => {
  const denied = await FN('member').main(
    { action: 'applyAuth', memberId: 'm-123', reason: '需要查看详细资料，理由充足且符合要求。' }, CTX);
  assert.equal(denied.success, false);
  assert.equal(denied.code, 403);
});

test('member.applyAuth：缺 openid → 403', async () => {
  const noOpenid = await FN('member').main({ action: 'applyAuth', memberId: 'm-123', reason: '原因说明。' }, {});
  assert.equal(noOpenid.success, false);
  assert.equal(noOpenid.code, 403);
});

// ─── Sprint R8: member.reviewAuth smoke gates ───

test('member.reviewAuth：VISITOR → 403（鉴权先行，list）', async () => {
  const denied = await FN('member').main(
    { action: 'reviewAuth', op: 'list' }, CTX);
  assert.equal(denied.success, false);
  assert.equal(denied.code, 403);
});

test('member.reviewAuth：VISITOR → 403（鉴权先行，approve）', async () => {
  const denied = await FN('member').main(
    { action: 'reviewAuth', op: 'approve', requestId: 'r-1' }, CTX);
  assert.equal(denied.success, false);
  assert.equal(denied.code, 403);
});

// ─── Sprint R8: exportFile fallback smoke gate ───

test('member.exportFile：VISITOR → 403（鉴权先行）', async () => {
  const denied = await FN('member').main(
    { action: 'exportFile', branchId: 'long' }, CTX);
  assert.equal(denied.success, false);
  assert.equal(denied.code, 403);
});

// ─── Sprint R9: stub 数据注入 + CHIEF 正向路径 + 幂等 upsert ───

/** 预置 seed 数据（getDatabase 每次 main() 调用时读全局 seed，无需重新 require） */
function seedDB({ users = [], members = [], authRequests = [], authorizations = [] } = {}) {
  globalThis.__HCS_STUB_SEED__ = {
    collections: {
      users, members, auth_requests: authRequests, authorizations,
      audit_log: []
    },
    seq: 1000
  };
}

const CHIEF_CTX = { OPENID: 'u-chief', openid: 'u-chief' };

test('R9 reviewAuth list：CHIEF 正向路径返回 PENDING 列表', async () => {
  seedDB({
    users: [{ openid: 'u-chief', role: 'CHIEF' }],
    authRequests: [
      { _id: 'r-1', grantee: 'u-a', target: 'm-1', status: 'PENDING', createdAt: '2025-01-01T00:00:00Z' },
      { _id: 'r-2', grantee: 'u-b', target: 'm-2', status: 'APPROVED', createdAt: '2025-01-02T00:00:00Z' }
    ]
  });
  const res = await FN('member').main({ action: 'reviewAuth', op: 'list' }, CHIEF_CTX);
  assert.equal(res.success, true);
  assert.equal(res.data.requests.length, 1, '默认只返回 PENDING');
  assert.equal(res.data.requests[0]._id, 'r-1');
  assert.equal(res.data.hasMore, false);
});

test('R9 reviewAuth list：非法 status → 400（白名单校验）', async () => {
  seedDB({ users: [{ openid: 'u-chief', role: 'CHIEF' }] });
  const res = await FN('member').main({ action: 'reviewAuth', op: 'list', status: 'HACK' }, CHIEF_CTX);
  assert.equal(res.success, false);
  assert.equal(res.code, 400);
});

test('R9 applyAuth：MEMBER 重复申请 → duplicate:true（幂等）', async () => {
  seedDB({
    users: [{ openid: 'u-m', role: 'MEMBER' }],
    members: [{ _id: 'm-1', genealogyName: '郝一', path: '/001/' }],
    authRequests: [
      { _id: 'r-dup', grantee: 'u-m', target: 'm-1', status: 'PENDING' }
    ]
  });
  const ctx = { OPENID: 'u-m', openid: 'u-m' };
  const res = await FN('member').main(
    { action: 'applyAuth', memberId: 'm-1', reason: '需要查看该支系详细资料以便核对世系。' }, ctx);
  assert.equal(res.success, true);
  assert.equal(res.data.duplicate, true, '已有 PENDING 申请应幂等返回');
});

test('R9 reviewAuth approve：authorizations upsert 幂等（已存在→skip）', async () => {
  seedDB({
    users: [{ openid: 'u-chief', role: 'CHIEF' }],
    authRequests: [{ _id: 'r-1', grantee: 'u-a', target: 'm-1', status: 'PENDING' }],
    authorizations: [{ grantee: 'u-a', target: 'm-1', grantedBy: 'u-other' }]
  });
  const res = await FN('member').main({ action: 'reviewAuth', op: 'approve', requestId: 'r-1' }, CHIEF_CTX);
  assert.equal(res.success, true);
  assert.equal(res.data.status, 'APPROVED');
  const seed = globalThis.__HCS_STUB_SEED__;
  assert.equal(seed.collections.authorizations.length, 1, '已存在授权不得重复写入（upsert skip）');
  assert.equal(seed.collections.auth_requests.find(r => r._id === 'r-1').status, 'APPROVED');
});

test('R9 reviewAuth approve：新授权正常写入 + 审计', async () => {
  seedDB({
    users: [{ openid: 'u-chief', role: 'CHIEF' }],
    authRequests: [{ _id: 'r-2', grantee: 'u-b', target: 'm-2', status: 'PENDING' }],
    authorizations: []
  });
  const res = await FN('member').main({ action: 'reviewAuth', op: 'approve', requestId: 'r-2' }, CHIEF_CTX);
  assert.equal(res.success, true);
  const seed = globalThis.__HCS_STUB_SEED__;
  assert.equal(seed.collections.authorizations.length, 1, '新授权应写入');
  assert.equal(seed.collections.authorizations[0].grantee, 'u-b');
  assert.ok(seed.collections.audit_log.length >= 1, '审计应记录 review_auth_approve');
});

// ─── Sprint R3 冒烟：doc / entry / notify ───

test('doc.list：类型筛选 + 未知类型拒绝', async () => {
  const ok = await FN('doc').main({ action: 'list', type: 'old_genealogy', page: 1 }, CTX);
  assert.equal(ok.success, true);
  assert.ok(Array.isArray(ok.data.docs));
  assert.equal(ok.data.hasMore, false);

  const bad = await FN('doc').main({ action: 'list', type: 'hacker' }, CTX);
  assert.equal(bad.code, 400);
});

test('doc.upload：VISITOR 403（鉴权先于参数校验的安全惯例）', async () => {
  const denied = await FN('doc').main(
    { action: 'upload', title: '旧谱', type: 'photo', fileId: 'f1' }, CTX);
  assert.equal(denied.code, 403, 'stub db users 为空 → VISITOR 不得上传');

  const noFile = await FN('doc').main(
    { action: 'upload', title: '旧谱', type: 'photo' }, CTX);
  assert.equal(noFile.code, 403, '鉴权先行：缺参细节不暴露给未授权者');
});

test('doc.search：缺检索词 400', async () => {
  const res = await FN('doc').main({ action: 'search' }, CTX);
  assert.equal(res.code, 400);
});

test('entry.submit：VISITOR 403 / 必填缺失 400 / 正常提交含谱名', async () => {
  const denied = await FN('entry').main(
    { action: 'submit', type: 'MANUAL', payload: { name: '郝一', generation: 18, branchId: 'long' } }, CTX);
  assert.equal(denied.code, 403, 'stub db users 为空 → VISITOR 不得提交');

  const bad = await FN('entry').main(
    { action: 'submit', type: 'MANUAL', payload: { name: '', generation: 18, branchId: 'long' } }, CTX);
  assert.equal(bad.code, 400, '缺本名应 400');

  const badType = await FN('entry').main(
    { action: 'submit', type: 'HACK', payload: { name: '郝一', generation: 18, branchId: 'long' } }, CTX);
  assert.equal(badType.code, 400, '未知 type 应 400');
});

test('entry.importExcel：VISITOR 403 鉴权先行（含缺 rows 场景）', async () => {
  const denied = await FN('entry').main(
    { action: 'importExcel', payload: { rows: [{ name: 'x', generation: 1, branchId: 'b' }] } }, CTX);
  assert.equal(denied.code, 403, '仅 EDITOR+ 可批量导入');

  const noRows = await FN('entry').main({ action: 'importExcel', payload: {} }, CTX);
  assert.equal(noRows.code, 403, '鉴权先行：VISITOR 不暴露参数校验细节');
});

test('entry.audit：VISITOR 403 鉴权先行（含缺参场景）', async () => {
  const denied = await FN('entry').main(
    { action: 'audit', recordId: 'r1', auditAction: 'FIRST_PASS' }, CTX);
  assert.equal(denied.code, 403, '仅族史委可审核');

  const bad = await FN('entry').main({ action: 'audit' }, CTX);
  assert.equal(bad.code, 403, '鉴权先行');
});

test('entry：未知 action 400（此前为 undefined 崩溃路径）', async () => {
  const res = await FN('entry').main({ action: 'nope' }, CTX);
  assert.equal(res.code, 400);
});

test('notify.broadcast：VISITOR → 统一 403（旧版裸 {error} 已废除）', async () => {
  const res = await FN('notify').main({ action: 'broadcast', content: 'x', level: 'HIGH' }, CTX);
  assert.equal(res.success, false);
  assert.equal(res.code, 403, 'stub db users 为空 → VISITOR 不得广播');
});

test('notify.list：分页结构', async () => {
  const res = await FN('notify').main({ action: 'list' }, CTX);
  assert.equal(res.success, true);
  assert.ok(Array.isArray(res.data.records));
});
