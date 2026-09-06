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
function seedDB({
  users = [], members = [], authRequests = [], authorizations = [], auditLogs = [],
  plazaPosts = [], notifications = [], accounts = [], pointsLogs = [],
  worshipLogs = [], tasks = [], taskRecords = [], calendarItems = [], events = []
} = {}) {
  globalThis.__HCS_STUB_SEED__ = {
    collections: {
      users, members, auth_requests: authRequests, authorizations,
      audit_logs: auditLogs, notifications, plaza_posts: plazaPosts, settings: [],
      points_accounts: accounts, points_logs: pointsLogs,
      worship_logs: worshipLogs, tasks, task_records: taskRecords,
      calendar_items: calendarItems, events
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
  assert.ok(seed.collections.audit_logs.length >= 1, '审计应记录 review_auth_approve');
});

// ─── Sprint R10: 授权闭环通知联动 + 我的申请列表 ───

test('R10 reviewAuth approve → notifications 站内通知（蓝图 7.9）', async () => {
  seedDB({
    users: [{ openid: 'u-chief', role: 'CHIEF' }],
    authRequests: [{ _id: 'r-1', grantee: 'u-a', target: 'm-1', targetName: '郝一', status: 'PENDING' }],
    authorizations: [],
    notifications: []
  });
  const res = await FN('member').main({ action: 'reviewAuth', op: 'approve', requestId: 'r-1' }, CHIEF_CTX);
  assert.equal(res.success, true);
  const seed = globalThis.__HCS_STUB_SEED__;
  const notes = seed.collections.notifications;
  assert.equal(notes.length, 1, '批准应写 1 条站内通知');
  assert.equal(notes[0].userId, 'u-a', '通知发给申请人 grantee');
  assert.ok(notes[0].title.includes('通过'), '标题含通过');
  assert.ok(notes[0].targetRoute.includes('m-1'), 'targetRoute 指向成员详情');
  assert.equal(notes[0].read, false);
});

test('R10 reviewAuth reject → notifications 站内通知', async () => {
  seedDB({
    users: [{ openid: 'u-chief', role: 'CHIEF' }],
    authRequests: [{ _id: 'r-3', grantee: 'u-c', target: 'm-3', targetName: '郝三', status: 'PENDING' }],
    notifications: []
  });
  const res = await FN('member').main(
    { action: 'reviewAuth', op: 'reject', requestId: 'r-3', comment: '理由不充分' }, CHIEF_CTX);
  assert.equal(res.success, true);
  assert.equal(res.data.status, 'REJECTED');
  const seed = globalThis.__HCS_STUB_SEED__;
  const notes = seed.collections.notifications;
  assert.equal(notes.length, 1, '驳回也应通知申请人');
  assert.ok(notes[0].title.includes('驳回'), '标题含驳回');
  assert.ok(notes[0].body.includes('理由不充分'), '审批意见透传给申请人');
  assert.equal(notes[0].targetRoute, '', '驳回不跳详情');
});

test('R10 listMyAuth：缺 openid → 403', async () => {
  const denied = await FN('member').main({ action: 'listMyAuth' }, {});
  assert.equal(denied.success, false);
  assert.equal(denied.code, 403);
});

test('R10 listMyAuth：MEMBER 正向 + 越权隔离（只看自己的）', async () => {
  seedDB({
    users: [{ openid: 'u-me', role: 'MEMBER' }],
    authRequests: [
      { _id: 'mine-1', grantee: 'u-me', target: 'm-1', status: 'PENDING', createdAt: '2025-01-02T00:00:00Z' },
      { _id: 'mine-2', grantee: 'u-me', target: 'm-2', status: 'APPROVED', createdAt: '2025-01-01T00:00:00Z' },
      { _id: 'other', grantee: 'u-someone-else', target: 'm-3', status: 'PENDING', createdAt: '2025-01-03T00:00:00Z' }
    ]
  });
  const ctx = { OPENID: 'u-me', openid: 'u-me' };
  const res = await FN('member').main({ action: 'listMyAuth' }, ctx);
  assert.equal(res.success, true);
  assert.equal(res.data.requests.length, 2, '只能看到自己的申请（越权隔离）');
  assert.ok(res.data.requests.every(r => r.grantee === 'u-me'));
  assert.equal(res.data.requests[0]._id, 'mine-1', '按 createdAt 倒序');
});

// ─── Sprint R11: admin 鉴权修复 / plaza 云函数 / relation 物化路径重写 ───

test('R11 admin.auditList：越权修复——MEMBER 403（此前任何登录者可查审计）', async () => {
  seedDB({
    users: [{ openid: 'u-m', role: 'MEMBER' }],
    auditLogs: [{ userId: 'u-x', action: 'member.export_csv', time: '2025-01-01T00:00:00Z' }]
  });
  const res = await FN('admin').main({ action: 'auditList' }, { OPENID: 'u-m', openid: 'u-m' });
  assert.equal(res.success, false);
  assert.equal(res.code, 403);
});

test('R11 admin.auditList：HISTORIAN 正向 + userId 筛选 + 分页字段', async () => {
  seedDB({
    users: [{ openid: 'u-h', role: 'HISTORIAN' }],
    auditLogs: [
      { userId: 'u-a', action: 'member.export_csv', time: '2025-01-02T00:00:00Z' },
      { userId: 'u-b', action: 'plaza.publish', time: '2025-01-01T00:00:00Z' }
    ]
  });
  const ctx = { OPENID: 'u-h', openid: 'u-h' };
  const all = await FN('admin').main({ action: 'auditList' }, ctx);
  assert.equal(all.success, true);
  assert.equal(all.data.logs.length, 2);
  assert.equal(all.data.hasMore, false);

  const filtered = await FN('admin').main({ action: 'auditList', userId: 'u-a' }, ctx);
  assert.equal(filtered.data.logs.length, 1);
  assert.equal(filtered.data.logs[0].userId, 'u-a');
  assert.ok(filtered.data.logs.every(l => l.userId === 'u-a'));
});

test('R11 plaza.publish：VISITOR 403 / MEMBER 正向（审计留痕 plaza.publish）', async () => {
  seedDB({ users: [{ openid: 'u-m', role: 'MEMBER' }], plazaPosts: [] });

  const denied = await FN('plaza').main({ action: 'publish', content: '大家好' }, {});
  assert.equal(denied.success, false);
  assert.equal(denied.code, 403, '未认证访客不能发布（蓝图 C.4 反骚扰）');

  const ctx = { OPENID: 'u-m', openid: 'u-m' };
  const ok = await FN('plaza').main({ action: 'publish', type: 'text', content: '家祭通知' }, ctx);
  assert.equal(ok.success, true);
  assert.ok(ok.data.postId);

  const seed = globalThis.__HCS_STUB_SEED__;
  assert.equal(seed.collections.plaza_posts.length, 1);
  assert.equal(seed.collections.plaza_posts[0].stats.like, 0);
  assert.ok(seed.collections.audit_logs.some(l => l.action === 'plaza.publish'), '发布写审计');
});

test('R11 plaza.publish：文字超限 400 + 空内容 400', async () => {
  seedDB({ users: [{ openid: 'u-m', role: 'MEMBER' }] });
  const ctx = { OPENID: 'u-m', openid: 'u-m' };

  const tooLong = await FN('plaza').main({ action: 'publish', content: '哈'.repeat(5001) }, ctx);
  assert.equal(tooLong.code, 400, '5000 字上限（蓝图 C.3）');

  const empty = await FN('plaza').main({ action: 'publish' }, ctx);
  assert.equal(empty.code, 400, '文字与媒体不可同时为空');
});

test('R11 plaza.like：原子 +1（db.command.inc + 点路径，stub 兼容）', async () => {
  seedDB({
    users: [{ openid: 'u-m', role: 'MEMBER' }],
    plazaPosts: [{ _id: 'p-1', authorId: 'u-x', content: 'hi', stats: { like: 2, comment: 0 } }]
  });
  const ctx = { OPENID: 'u-m', openid: 'u-m' };
  const res = await FN('plaza').main({ action: 'like', postId: 'p-1' }, ctx);
  assert.equal(res.success, true);
  assert.equal(res.data.like, 3);
  assert.equal(globalThis.__HCS_STUB_SEED__.collections.plaza_posts[0].stats.like, 3, '深层路径 +1 生效');
});

test('R11 relation.calc：VISITOR 403 / MEMBER 正向（物化路径共同祖先）', async () => {
  seedDB({
    users: [{ openid: 'u-m', role: 'MEMBER' }],
    members: [
      { _id: 'g1', path: '/001/', gender: 'MALE' },
      { _id: 'a', path: '/001/003/', gender: 'MALE' },
      { _id: 'b', path: '/001/003/007/', gender: 'MALE' },
      { _id: 'other', path: '/002/005/', gender: 'MALE' }
    ]
  });
  const denied = await FN('relation').main({ action: 'calc', aId: 'a', bId: 'b' }, {});
  assert.equal(denied.code, 403, 'VISITOR 不可用称谓计算（蓝图 relation.calc 权限 L2）');

  const ctx = { OPENID: 'u-m', openid: 'u-m' };
  // a(父层 /001/003/) 与 b(子层 /001/003/007/)：n=0 m=1
  const parent = await FN('relation').main({ action: 'calc', aId: 'a', bId: 'b' }, ctx);
  assert.equal(parent.success, true);
  assert.equal(parent.data.related, true);
  assert.equal(parent.data.upSteps, 0);
  assert.equal(parent.data.downSteps, 1);

  // 同代兄弟：/001/003/007/ 与 /001/003/009/ → n=1 m=1；含跨系无共同祖先对（g1↔other）
  seedDB({
    users: [{ openid: 'u-m', role: 'MEMBER' }],
    members: [
      { _id: 'x', path: '/001/003/007/', gender: 'MALE' },
      { _id: 'y', path: '/001/003/009/', gender: 'MALE' },
      { _id: 'g1', path: '/001/', gender: 'MALE' },
      { _id: 'other', path: '/002/005/', gender: 'MALE' }
    ]
  });
  const sib = await FN('relation').main({ action: 'calc', aId: 'x', bId: 'y' }, ctx);
  assert.equal(sib.data.upSteps, 1);
  assert.equal(sib.data.downSteps, 1);
  assert.equal(sib.data.formalTitle, '哥哥', '矩阵 1-1 male elder（A 视角：对方为兄）');

  // 无共同祖先 → fail-closed 同宗（与 R2 单测口径一致）
  const oth = await FN('relation').main({ action: 'calc', aId: 'g1', bId: 'other' }, ctx);
  assert.equal(oth.data.related, false);
  assert.equal(oth.data.fiveFu, '同宗');
});

// ─── Sprint R12: points 大修（蓝图 7.5）───

test('R12 points.get：MEMBER 无账户 → 默认四池归零创建', async () => {
  seedDB({ users: [{ openid: 'u-m', role: 'MEMBER' }] });
  const ctx = { OPENID: 'u-m', openid: 'u-m' };
  const res = await FN('points').main({ action: 'get' }, ctx);
  assert.equal(res.success, true);
  assert.deepEqual(res.data.account, { xiaoqin: 0, gongde: 0, fuyun: 0, normal: 0 });
  assert.equal(globalThis.__HCS_STUB_SEED__.collections.points_accounts.length, 1, '账户已创建');
});

test('R12 points.award：MEMBER 403（自刷分漏洞封堵）/ EDITOR 正向 + 审计', async () => {
  seedDB({
    users: [{ openid: 'u-m', role: 'MEMBER' }, { openid: 'u-e', role: 'EDITOR' }],
    accounts: [{ _id: 'acc-1', userId: 'u-e', xiaoqin: 10, gongde: 0, fuyun: 0, normal: 0 }]
  });
  // MEMBER 不可发放（此前任何登录者可给自己加分）
  const denied = await FN('points').main({ action: 'award', pool: 'gongde', bizType: 'checkin', bizId: 'b1' }, { OPENID: 'u-m', openid: 'u-m' });
  assert.equal(denied.success, false);
  assert.equal(denied.code, 403);

  // EDITOR 正向：checkin=5 入 gongde？——bizType 决定 amount，pool 由入参指定
  const ok = await FN('points').main({ action: 'award', pool: 'gongde', bizType: 'checkin', bizId: 'b1' }, { OPENID: 'u-e', openid: 'u-e' });
  assert.equal(ok.success, true);
  assert.equal(ok.data.duplicated, false);
  assert.equal(ok.data.delta, 5);

  const seed = globalThis.__HCS_STUB_SEED__;
  assert.equal(seed.collections.points_accounts[0].gongde, 5, 'inc 原子生效');
  assert.equal(seed.collections.points_logs.length, 1, '流水落库');
  assert.ok(seed.collections.audit_logs.some(l => l.action === 'points.award'), '发放写审计');
});

test('R12 points.award：幂等重复 → duplicated:true 不重复加分（蓝图 7.5）', async () => {
  seedDB({
    users: [{ openid: 'u-e', role: 'EDITOR' }],
    accounts: [{ _id: 'acc-1', userId: 'u-e', xiaoqin: 0, gongde: 5, fuyun: 0, normal: 0 }],
    pointsLogs: [{ _id: 'log-9', userId: 'u-e', pool: 'gongde', delta: 5, bizType: 'checkin', bizId: 'b1', time: '2025-01-01T00:00:00Z' }]
  });
  const res = await FN('points').main({ action: 'award', pool: 'gongde', bizType: 'checkin', bizId: 'b1' }, { OPENID: 'u-e', openid: 'u-e' });
  assert.equal(res.success, true);
  assert.equal(res.data.duplicated, true, '幂等键重复直接返回已有结果');
  assert.equal(res.data.delta, 5);
  // 不重复加分：余额保持 5
  assert.equal(globalThis.__HCS_STUB_SEED__.collections.points_accounts[0].gongde, 5);
  // 不新增流水
  assert.equal(globalThis.__HCS_STUB_SEED__.collections.points_logs.length, 1);
});

test('R12 points.award：pool 非法 400 + targetUserId 代发', async () => {
  seedDB({
    users: [{ openid: 'u-e', role: 'EDITOR' }],
    accounts: [{ _id: 'acc-1', userId: 'u-e', xiaoqin: 0, gongde: 0, fuyun: 0, normal: 0 }]
  });
  const ctx = { OPENID: 'u-e', openid: 'u-e' };
  const badPool = await FN('points').main({ action: 'award', pool: 'hack', bizType: 'checkin', bizId: 'b2' }, ctx);
  assert.equal(badPool.code, 400, '四池白名单校验');

  // 代发给指定族人
  const fwd = await FN('points').main({ action: 'award', pool: 'normal', bizType: 'task_complete', bizId: 'b3', targetUserId: 'u-other' }, ctx);
  assert.equal(fwd.success, true);
  assert.equal(fwd.data.userId, 'u-other');
  const seed = globalThis.__HCS_STUB_SEED__;
  const otherAcc = seed.collections.points_accounts.find(a => a.userId === 'u-other');
  assert.equal(otherAcc.normal, 20, '代发对象 normal +20（task_complete）');
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

// ─── Sprint R13：ceremony 大修 + atmosphere 氛围引擎 + 积分联动闭环 ───

test('R13 ceremony.worship：VISITOR 403（鉴权先行）', async () => {
  seedDB({
    users: [{ openid: 'u-v', role: 'VISITOR' }],
    members: [{ _id: 'm-dec', name: '郝公', status: 'DECEASED' }]
  });
  const res = await FN('ceremony').main(
    { action: 'worship', type: 'lamp', targetMemberId: 'm-dec' },
    { OPENID: 'u-v', openid: 'u-v' });
  assert.equal(res.code, 403);
});

test('R13 ceremony.worship：type 白名单 400 + 缺灵位 400 + 祝福语超长 400', async () => {
  seedDB({
    users: [{ openid: 'u-m', role: 'MEMBER' }],
    members: [{ _id: 'm-dec', name: '郝公', status: 'DECEASED' }]
  });
  const ctx = { OPENID: 'u-m', openid: 'u-m' };
  const badType = await FN('ceremony').main({ action: 'worship', type: 'dance', targetMemberId: 'm-dec' }, ctx);
  assert.equal(badType.code, 400, '白名单 lamp/incense/flower/group');
  const noTarget = await FN('ceremony').main({ action: 'worship', type: 'lamp' }, ctx);
  assert.equal(noTarget.code, 400);
  const longMsg = await FN('ceremony').main(
    { action: 'worship', type: 'lamp', targetMemberId: 'm-dec', message: '祝'.repeat(101) }, ctx);
  assert.equal(longMsg.code, 400, '祝福语 ≤100 字');
});

test('R13 ceremony.worship：在世族人不可立灵位 400 + 灵位不存在 404', async () => {
  seedDB({
    users: [{ openid: 'u-m', role: 'MEMBER' }],
    members: [{ _id: 'm-alive', name: '郝生', status: 'ALIVE' }]
  });
  const ctx = { OPENID: 'u-m', openid: 'u-m' };
  const alive = await FN('ceremony').main({ action: 'worship', type: 'lamp', targetMemberId: 'm-alive' }, ctx);
  assert.equal(alive.code, 400);
  const missing = await FN('ceremony').main({ action: 'worship', type: 'lamp', targetMemberId: 'm-none' }, ctx);
  assert.equal(missing.code, 404);
});

test('R13 ceremony.worship：正向（祭记+原子计数+功德分+审计）', async () => {
  seedDB({
    users: [{ openid: 'u-m', role: 'MEMBER' }],
    members: [{ _id: 'm-dec', name: '郝公', genealogyName: '郝公讳某', status: 'DECEASED', worshipCount: 0 }]
  });
  const res = await FN('ceremony').main(
    { action: 'worship', type: 'lamp', targetMemberId: 'm-dec', message: '爷爷安好' },
    { OPENID: 'u-m', openid: 'u-m' });
  assert.equal(res.success, true);
  assert.equal(res.data.worshipCount, 1, '灵位计数原子 +1');
  assert.equal(res.data.blessing.duplicated, false);
  assert.equal(res.data.blessing.delta, 10);
  const seed = globalThis.__HCS_STUB_SEED__;
  assert.equal(seed.collections.worship_logs.length, 1, '祭记落库');
  assert.equal(seed.collections.worship_logs[0].typeLabel, '点灯');
  const log = seed.collections.points_logs[0];
  assert.equal(log.pool, 'gongde');
  assert.equal(log.delta, 10);
  assert.equal(log.bizType, 'ceremony.worship');
  assert.equal(seed.collections.points_accounts.find(a => a.userId === 'u-m').gongde, 10, '账户 gongde +10');
  assert.ok(seed.collections.audit_logs.some(a => a.action === 'ceremony.worship'), '审计留痕');
});

test('R13 ceremony.worship：同日同灵位同类型幂等（祭记每次记、积分只发一次）', async () => {
  seedDB({
    users: [{ openid: 'u-m', role: 'MEMBER' }],
    members: [{ _id: 'm-dec', name: '郝公', status: 'DECEASED', worshipCount: 0 }]
  });
  const ctx = { OPENID: 'u-m', openid: 'u-m' };
  await FN('ceremony').main({ action: 'worship', type: 'incense', targetMemberId: 'm-dec' }, ctx);
  const second = await FN('ceremony').main({ action: 'worship', type: 'incense', targetMemberId: 'm-dec' }, ctx);
  assert.equal(second.success, true);
  assert.equal(second.data.blessing.duplicated, true, '同日重复祭拜积分幂等');
  const seed = globalThis.__HCS_STUB_SEED__;
  assert.equal(seed.collections.worship_logs.length, 2, '祭记每次都记');
  assert.equal(seed.collections.points_logs.length, 1, '积分只发一次');
  assert.equal(seed.collections.points_accounts.find(a => a.userId === 'u-m').gongde, 10);
});

test('R13 ceremony.spirits/list：灵位列表仅含已故 + 祭记按灵位过滤 + VISITOR 403', async () => {
  seedDB({
    users: [{ openid: 'u-m', role: 'MEMBER' }],
    members: [
      { _id: 'm-1', genealogyName: '郝一世祖', status: 'DECEASED', worshipCount: 3, deathDate: '1901-02-02' },
      { _id: 'm-2', genealogyName: '郝二世祖', status: 'DECEASED', worshipCount: 0 },
      { _id: 'm-3', name: '郝在世', status: 'ALIVE' }
    ],
    worshipLogs: [
      { _id: 'w-1', type: 'lamp', targetMemberId: 'm-1', date: new Date('2025-01-02T00:00:00Z') },
      { _id: 'w-2', type: 'flower', targetMemberId: 'm-2', date: new Date('2025-01-03T00:00:00Z') }
    ]
  });
  const ctx = { OPENID: 'u-m', openid: 'u-m' };
  const spirits = await FN('ceremony').main({ action: 'spirits' }, ctx);
  assert.equal(spirits.success, true);
  assert.equal(spirits.data.spirits.length, 2, '在世不入灵位列表');
  assert.equal(spirits.data.spirits[0].worshipCount, 3);
  const logs = await FN('ceremony').main({ action: 'list', targetMemberId: 'm-1' }, ctx);
  assert.equal(logs.success, true);
  assert.equal(logs.data.logs.length, 1, '按灵位过滤祭记');
  const denied = await FN('ceremony').main({ action: 'spirits' }, { OPENID: 'u-x', openid: 'u-x' });
  assert.equal(denied.code, 403, '未认证不可看灵位');
});

test('R13 ceremony.remindScan：到期忌日写站内通知并标记已提醒', async () => {
  seedDB({
    calendarItems: [
      { _id: 'ci-1', type: '忌日', userId: 'u-m', memberName: '郝公', remindAt: new Date(Date.now() - 86400000), notified: false }
    ]
  });
  const res = await FN('ceremony').main({ action: 'remindScan' }, {});
  assert.equal(res.success, true);
  assert.equal(res.data.total, 1);
  const seed = globalThis.__HCS_STUB_SEED__;
  const note = seed.collections.notifications[0];
  assert.equal(note.userId, 'u-m');
  assert.ok(note.body.includes('郝公'));
  assert.ok(note.targetRoute.includes('shrine'));
  assert.equal(seed.collections.calendar_items.find(i => i._id === 'ci-1').notified, true, '已提醒标记');
});

test('R13 ceremony.remindScan：未来忌日不触发 + 二次扫描不重复', async () => {
  seedDB({
    calendarItems: [
      { _id: 'ci-future', type: '忌日', userId: 'u-m', memberName: '郝先', remindAt: new Date(Date.now() + 86400000), notified: false },
      { _id: 'ci-due', type: '忌日', userId: 'u-m', memberName: '郝祖', remindAt: new Date(Date.now() - 86400000), notified: false }
    ]
  });
  const first = await FN('ceremony').main({ action: 'remindScan' }, {});
  assert.equal(first.data.total, 1, '仅到期忌日触发');
  const again = await FN('ceremony').main({ action: 'remindScan' }, {});
  assert.equal(again.data.total, 0, '已提醒不再触发');
  assert.equal(globalThis.__HCS_STUB_SEED__.collections.notifications.length, 1);
});

test('R13 task.checkin：积分联动打通（normal 池入账+同日幂等不重复）', async () => {
  seedDB({
    users: [{ openid: 'u-m', role: 'MEMBER' }],
    tasks: [{ _id: 't-1', title: '每日打卡', desc: '坚持', points: 5, status: 'ACTIVE' }],
    taskRecords: []
  });
  const ctx = { OPENID: 'u-m', openid: 'u-m' };
  const res = await FN('task').main({ action: 'checkin', taskId: 't-1' }, ctx);
  assert.equal(res.success, true);
  assert.equal(res.data.alreadyDone, false);
  assert.equal(res.data.points.duplicated, false);
  assert.equal(res.data.points.delta, 5);
  const seed = globalThis.__HCS_STUB_SEED__;
  const log = seed.collections.points_logs[0];
  assert.equal(log.bizType, 'task.checkin');
  assert.equal(log.pool, 'normal');
  assert.equal(seed.collections.points_accounts.find(a => a.userId === 'u-m').normal, 5, 'normal 池 +5');
  assert.ok(seed.collections.audit_logs.some(a => a.action === 'task.checkin'));
  const dup = await FN('task').main({ action: 'checkin', taskId: 't-1' }, ctx);
  assert.equal(dup.data.alreadyDone, true, '同日重复打卡幂等');
  assert.equal(seed.collections.points_logs.length, 1, '积分不重复发放');
});

test('R13 atmosphere.today：统一格式 + 节气命中 + 端点色结构', async () => {
  seedDB({});
  const res = await FN('atmosphere').main({ action: 'today' }, {});
  assert.equal(res.success, true, '统一响应（原 today 必崩 ReferenceError）');
  assert.ok(res.data.solarTerm.length >= 2, '任一日期都命中节气');
  assert.ok(['春', '夏', '秋', '冬'].includes(res.data.season));
  assert.ok(/^#[0-9A-F]{6}$/i.test(res.data.moodTheme.top), 'moodTheme 为端点色对象');
  assert.ok(res.data.greeting.length > 0, '节气笺非空');
  assert.equal(Array.isArray(res.data.homeCards), true);
  assert.equal(res.data.muted, false);
});

test('R13 atmosphere.today：白事静默素色覆盖（蓝图 7.8）', async () => {
  seedDB({ events: [{ _id: 'e-1', type: 'funeral', status: 'ACTIVE' }] });
  const res = await FN('atmosphere').main({ action: 'today' }, {});
  assert.equal(res.data.muted, true);
  assert.equal(res.data.moodTheme.top, '#F7F5F0', '素色端点覆盖节日端点');
  assert.equal(res.data.season, '', '静默期不下发季节主题');
  assert.ok(res.data.greeting.includes('慎终追远'));
});

test('R13 atmosphere：24 节气表完整 + 圆环匹配（跨年回卷冬至段）', async () => {
  const atm = FN('atmosphere');
  assert.equal(atm.SOLAR_TERMS.length, 24, '24 节气齐备（原仅 2 项）');
  assert.equal(atm.resolveTerm(new Date('2025-01-03T04:00:00Z')).name, '冬至', '1 月初回卷冬至段');
  assert.equal(atm.resolveTerm(new Date('2025-04-06T04:00:00Z')).name, '清明');
  assert.equal(atm.resolveTerm(new Date('2025-08-09T04:00:00Z')).name, '立秋');
  assert.equal(atm.resolveTerm(new Date('2025-12-25T04:00:00Z')).name, '冬至');
});
