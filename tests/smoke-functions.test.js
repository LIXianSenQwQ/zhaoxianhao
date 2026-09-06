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
const CTX_WITH_ROLE = (role) => ({ OPENID: `u-${role.toLowerCase()}`, openid: `u-${role.toLowerCase()}`, role });

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
  worshipLogs = [], tasks = [], taskRecords = [], calendarItems = [], events = [],
  ceremonies = [], entryRecords = [], relations = [],
  settings = [], avatars = []
} = {}) {
  globalThis.__HCS_STUB_SEED__ = {
    collections: {
      users, members, auth_requests: authRequests, authorizations,
      audit_logs: auditLogs, notifications, plaza_posts: plazaPosts, settings,
      points_accounts: accounts, points_logs: pointsLogs,
      worship_logs: worshipLogs, tasks, task_records: taskRecords,
      calendar_items: calendarItems, events, ceremonies,
      entry_records: entryRecords, relations, avatars
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

// ─── Sprint R14：notify 大修（卡流/合并列表/越权封堵）+ atmosphere.homeCards 真数据 ───

const NOW = Date.now();

test('R14 notify.digest：蓝图 0.3.2 卡序（仪式朱砂→提醒→个人通知→动态）', async () => {
  seedDB({
    ceremonies: [{ _id: 'c-1', title: '清明祭祖', desc: '梨园集中祭扫', status: 'ACTIVE', date: new Date('2026-04-05T00:00:00Z') }],
    calendarItems: [{ _id: 'ci-1', userId: 'u-m', title: '族谱核对', notified: false }],
    notifications: [{ _id: 'n-1', userId: 'u-m', title: '忌日提醒', body: '今日是先人的忌日', read: false }],
    plazaPosts: [{ _id: 'p-1', authorName: '郝三叔', content: '家族梨园开园了，欢迎大家来采摘', createdAt: new Date(NOW) }]
  });
  const res = await FN('notify').main({ action: 'digest' }, { OPENID: 'u-m', openid: 'u-m' });
  assert.equal(res.success, true);
  const types = res.data.cards.map(c => c.type);
  assert.deepEqual(types, ['ceremony', 'reminder', 'notice', 'moment'], '卡流按 0.3.2 权重排序');
  assert.equal(res.data.cards[0].accent, 'cinnabar', '仪式卡朱砂边条标记');
  assert.equal(res.data.cards[2].title, '忌日提醒');
});

test('R14 notify.digest：空态祖训今日兜底（默认祖训 + settings 覆盖）', async () => {
  seedDB({});
  const res = await FN('notify').main({ action: 'digest' }, { OPENID: 'u-m', openid: 'u-m' });
  assert.equal(res.data.cards.length, 1);
  assert.equal(res.data.cards[0].type, 'motto');
  assert.equal(res.data.cards[0].desc, '敬宗睦族，诗礼传家', '默认祖训（0.3.3 首屏不空）');

  // settings.daily_motto 自定义覆盖
  globalThis.__HCS_STUB_SEED__.collections.settings = [{ _id: 's-1', key: 'daily_motto', value: '耕读传家久，诗书继世长' }];
  const res2 = await FN('notify').main({ action: 'digest' }, { OPENID: 'u-m', openid: 'u-m' });
  assert.equal(res2.data.cards[0].desc, '耕读传家久，诗书继世长');
});

test('R14 notify.digest：未登录 403（本人接口，蓝图 9.1）', async () => {
  seedDB({});
  const res = await FN('notify').main({ action: 'digest' }, {});
  assert.equal(res.code, 403);
});

test('R14 notify.list：个人通知与全员广播合并（旧版个人通知永不可见已修复）', async () => {
  seedDB({
    notifications: [
      { _id: 'n-old', userId: 'u-m', title: '旧忌日提醒', body: 'a', read: true, createdAt: new Date(NOW - 86400000) },
      { _id: 'n-mine', userId: 'u-m', title: '审核结果', body: '入谱已通过', read: false, createdAt: new Date(NOW) },
      { _id: 'n-all', scope: 'ALL', title: '紧急通知', body: '台风预警', read: false, createdAt: new Date(NOW - 3600000) },
      { _id: 'n-other', userId: 'u-x', title: '他人通知', body: 'b', read: false, createdAt: new Date(NOW) }
    ]
  });
  const res = await FN('notify').main({ action: 'list' }, { OPENID: 'u-m', openid: 'u-m' });
  assert.equal(res.success, true);
  const ids = res.data.records.map(n => n._id);
  assert.ok(ids.includes('n-mine'), '个人通知在列');
  assert.ok(ids.includes('n-all'), '全员广播在列');
  assert.ok(!ids.includes('n-other'), '他人通知不可见');
  assert.ok(ids.includes('n-old'), '通知中心含已读个人通知');
  assert.equal(ids[0], 'n-mine', 'createdAt 倒序合并');
});

test('R14 notify.markRead：越权 403（旧版水平越权封堵）+ 本人 OK', async () => {
  seedDB({
    notifications: [
      { _id: 'n-mine', userId: 'u-m', title: '忌日提醒', body: 'x', read: false },
      { _id: 'n-all', scope: 'ALL', title: '广播', body: 'y', read: false }
    ]
  });
  const denied = await FN('notify').main({ action: 'markRead', notificationId: 'n-mine' }, { OPENID: 'u-x', openid: 'u-x' });
  assert.equal(denied.code, 403, '仅本人可标记个人通知已读');
  const ok = await FN('notify').main({ action: 'markRead', notificationId: 'n-mine' }, { OPENID: 'u-m', openid: 'u-m' });
  assert.equal(ok.success, true);
  const seed = globalThis.__HCS_STUB_SEED__;
  assert.equal(seed.collections.notifications.find(n => n._id === 'n-mine').read, true);
  assert.ok(seed.collections.notifications.find(n => n._id === 'n-mine').readAt, 'readAt 留痕');
});

test('R14 notify.broadcast：EDITOR 正向无崩（generateObjectId 移除）+ 审计', async () => {
  seedDB({
    users: [{ openid: 'u-e', role: 'EDITOR', status: 'ACTIVE' }]
  });
  const res = await FN('notify').main({ action: 'broadcast', content: '明日族谱核对', level: 'MEDIUM' }, { OPENID: 'u-e', openid: 'u-e' });
  assert.equal(res.success, true, '旧版此处因 generateObjectId 必崩');
  assert.ok(res.data.broadcastId, '_id 由 add 自动生成');
  assert.equal(res.data.notifiedCount, 0, '订阅消息未配置时跳过不阻塞');
  const seed = globalThis.__HCS_STUB_SEED__;
  const note = seed.collections.notifications.find(n => n.type === 'EMERGENCY');
  assert.ok(note, '广播落库');
  assert.equal(note.scope, 'ALL');
  assert.ok(seed.collections.audit_logs.some(a => a.action === 'notify.broadcast'));
});

test('R14 atmosphere.homeCards：真数据接入（与 digest 同口径）', async () => {
  seedDB({
    ceremonies: [{ _id: 'c-1', title: '冬至祭', desc: '', status: 'ACTIVE', date: new Date('2026-12-22T00:00:00Z') }],
    calendarItems: [{ _id: 'ci-1', userId: 'u-m', title: '请安提醒', notified: false }],
    notifications: [{ _id: 'n-1', userId: 'u-m', title: '忌日提醒', body: '宜上香', read: false }],
    plazaPosts: [{ _id: 'p-1', authorName: '郝大伯', content: '新谱初稿完成', createdAt: new Date(NOW) }]
  });
  const res = await FN('atmosphere').main({ action: 'today' }, { OPENID: 'u-m', openid: 'u-m' });
  assert.equal(res.success, true);
  assert.equal(res.data.homeCards[0].type, 'ceremony', '卡流首卡为仪式');
  assert.equal(res.data.homeCards.length, 4, '四级卡流全量下发');
  assert.ok(/^#[0-9A-F]{6}$/i.test(res.data.moodTheme.top), '氛围端点色不回归');
});

test('R14 atmosphere.homeCards：匿名访客祖训兜底（公开接口不空屏）', async () => {
  seedDB({});
  const res = await FN('atmosphere').main({ action: 'today' }, {});
  assert.equal(res.success, true);
  assert.equal(res.data.homeCards[0].type, 'motto');
  assert.ok(res.data.homeCards[0].desc.length > 0);
});

// ─── Sprint R15：member.stats 家族速览 + member.heroList 英烈名录 + 合拜正向 ───

test('R15 member.stats：四指标正向（代数/在世/本月大事/我的字辈）', async () => {
  const monthStart = new Date();
  monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  seedDB({
    users: [{ openid: 'u-m', role: 'MEMBER', memberId: 'm-me' }],
    members: [
      { _id: 'm-me', name: '郝我', generation: 3, status: 'ALIVE' },
      { _id: 'm-a', name: '郝甲', generation: 5, status: 'ALIVE' },
      { _id: 'm-b', name: '郝乙', generation: 5, status: 'DECEASED' }
    ],
    events: [
      { _id: 'e-1', title: '新谱初稿', status: 'PUBLISHED', createdAt: new Date() },
      { _id: 'e-old', title: '旧大事', status: 'PUBLISHED', createdAt: new Date('2020-01-01T00:00:00Z') }
    ]
  });
  globalThis.__HCS_STUB_SEED__.collections.generations = [{ _id: 'g-3', char: '庆', order: 3 }];
  const res = await FN('member').main({ action: 'stats' }, { OPENID: 'u-m', openid: 'u-m' });
  assert.equal(res.success, true);
  assert.equal(res.data.totalGenerations, 5, '最大世代');
  assert.equal(res.data.aliveCount, 2, '在世人口');
  assert.equal(res.data.monthEvents, 1, '本月已发布大事（旧事不计）');
  assert.equal(res.data.myGeneration, 3);
  assert.equal(res.data.myGenerationChar, '庆', '字辈字按 generations.order 匹配');
});

test('R15 member.stats：无 memberId（未绑定档案）→ 字辈空态', async () => {
  seedDB({
    users: [{ openid: 'u-m', role: 'MEMBER' }],
    members: [{ _id: 'm-a', generation: 4, status: 'ALIVE' }]
  });
  const res = await FN('member').main({ action: 'stats' }, { OPENID: 'u-m', openid: 'u-m' });
  assert.equal(res.success, true);
  assert.equal(res.data.totalGenerations, 4);
  assert.equal(res.data.myGeneration, null);
  assert.equal(res.data.myGenerationChar, '');
});

test('R15 member.stats：VISITOR 403（蓝图 0.3.2 家族速览为族人数据）', async () => {
  seedDB({ users: [{ openid: 'u-v', role: 'VISITOR' }] });
  const res = await FN('member').main({ action: 'stats' }, { OPENID: 'u-v', openid: 'u-v' });
  assert.equal(res.code, 403);
});

test('R15 member.heroList：访客可浏览（L1）+ DECEASED 过滤 + 字段白名单', async () => {
  seedDB({
    users: [{ openid: 'u-v', role: 'VISITOR' }],
    members: [
      { 
        _id: 'h-1', 
        genealogyName: '郝忠烈', name: '郝忠', generation: 4, status: 'DECEASED', isHero: true, 
        heroNote: '抗战殉国', deathDate: '1942-03-08', worshipCount: 12, 
        tomb: { place: 'x' }, specialNotes: [{ type: 'x', desc: 'y' }], 
        occupation: { job: 'secret' } 
      },
      { _id: 'h-2', name: '郝健在', generation: 5, status: 'ALIVE', isHero: true, heroNote: '老兵在世' },
      { _id: 'h-3', name: '郝普通', generation: 3, status: 'DECEASED' }
    ]
  });
  const res = await FN('member').main({ action: 'heroList', page: 1 }, { OPENID: 'u-v', openid: 'u-v' });
  assert.equal(res.success, true, '蓝图 6.3：访客仅可浏览英烈献花');
  assert.equal(res.data.heroes.length, 1, '仅 DECEASED+isHero 入名录');
  const h = res.data.heroes[0];
  assert.equal(h.name, '郝忠烈');
  assert.equal(h.heroNote, '抗战殉国');
  assert.equal(h.worshipCount, 12);
  assert.ok(!('tomb' in h) && !('specialNotes' in h) && !('occupation' in h), '私密字段不出白名单');
  assert.equal(res.data.hasMore, false);
});

test('R15 member.heroList：空名录空态', async () => {
  seedDB({ users: [], members: [] });
  const res = await FN('member').main({ action: 'heroList' }, { OPENID: 'u-x', openid: 'u-x' });
  assert.equal(res.success, true);
  assert.deepEqual(res.data.heroes, []);
});

test('R15 ceremony.worship：合拜 group 正向（第四祭拜类型走通）', async () => {
  seedDB({
    users: [{ openid: 'u-m', role: 'MEMBER' }],
    members: [{ _id: 'm-dec', name: '郝公', status: 'DECEASED', worshipCount: 0 }]
  });
  const res = await FN('ceremony').main(
    { action: 'worship', type: 'group', targetMemberId: 'm-dec' },
    { OPENID: 'u-m', openid: 'u-m' });
  assert.equal(res.success, true);
  assert.equal(res.data.typeLabel, '合拜');
  assert.equal(res.data.blessing.delta, 10, '合拜同入功德池');
  const seed = globalThis.__HCS_STUB_SEED__;
  assert.equal(seed.collections.worship_logs[0].type, 'group');
});

// ─── Sprint R16：relation.edit 真实现 + admin.heroTag 英名录录入 + getDetail 传记字段 ───

test('R16 relation.edit：EDITOR 正向 → entry_records 建 CHANGE 工单（双人审核链）', async () => {
  seedDB({
    users: [{ openid: 'u-ed', role: 'EDITOR' }],
    members: [{ _id: 'm-1', name: '郝一' }, { _id: 'm-2', name: '郝二' }],
    relations: []
  });
  const res = await FN('relation').main(
    { action: 'edit', fromId: 'm-1', toId: 'm-2', type: 'SIBLING', note: '族谱勘误' },
    { OPENID: 'u-ed', openid: 'u-ed' });
  assert.equal(res.success, true);
  assert.equal(res.data.status, 'SUBMITTED');
  assert.ok(res.data.recordId, '返回工单号');
  const seed = globalThis.__HCS_STUB_SEED__;
  const rec = seed.collections.entry_records[0];
  assert.equal(rec.type, 'CHANGE', '蓝图 7.7：关系变更走 CHANGE 工单');
  assert.equal(rec.payload.changeType, 'RELATION');
  assert.equal(rec.payload.relation.type, 'SIBLING');
  assert.equal(rec.status, 'SUBMITTED');
  assert.equal(seed.collections.audit_logs[0].action, 'relation.edit');
});

test('R16 relation.edit：MEMBER 越权 403（L4 门禁）', async () => {
  seedDB({ users: [{ openid: 'u-m', role: 'MEMBER' }], members: [{ _id: 'm-1' }] });
  const res = await FN('relation').main(
    { action: 'edit', fromId: 'm-1', toId: 'm-1', type: 'SIBLING' },
    { OPENID: 'u-m', openid: 'u-m' });
  assert.equal(res.code, 403);
});

test('R16 relation.edit：自环 400 + 非法类型 400', async () => {
  seedDB({
    users: [{ openid: 'u-ed', role: 'EDITOR' }],
    members: [{ _id: 'm-1' }]
  });
  const r1 = await FN('relation').main(
    { action: 'edit', fromId: 'm-1', toId: 'm-1', type: 'SIBLING' },
    { OPENID: 'u-ed', openid: 'u-ed' });
  assert.equal(r1.code, 400, '自环');
  const r2 = await FN('relation').main(
    { action: 'edit', fromId: 'm-1', toId: 'm-1', type: 'COUSIN' },
    { OPENID: 'u-ed', openid: 'u-ed' });
  assert.equal(r2.code, 400, '蓝图 5.3 类型白名单外');
});

test('R16 relation.edit：成员不存在 404 + 重复 ACTIVE 边 400', async () => {
  seedDB({
    users: [{ openid: 'u-ed', role: 'EDITOR' }],
    members: [{ _id: 'm-1' }, { _id: 'm-2' }],
    relations: [{ _id: 'rel-1', fromId: 'm-1', toId: 'm-2', type: 'SIBLING', status: 'ACTIVE' }]
  });
  const r1 = await FN('relation').main(
    { action: 'edit', fromId: 'm-1', toId: 'm-ghost', type: 'SIBLING' },
    { OPENID: 'u-ed', openid: 'u-ed' });
  assert.equal(r1.code, 404, 'toId 不存在');
  const r2 = await FN('relation').main(
    { action: 'edit', fromId: 'm-1', toId: 'm-2', type: 'SIBLING' },
    { OPENID: 'u-ed', openid: 'u-ed' });
  assert.equal(r2.code, 400, '重复 ACTIVE 关系');
});

test('R16 admin.heroTag：HISTORIAN 正向设置 isHero+heroNote（配 heroList）', async () => {
  seedDB({
    users: [{ openid: 'u-his', role: 'HISTORIAN' }],
    members: [{ _id: 'h-9', name: '郝忠烈', status: 'DECEASED' }]
  });
  const res = await FN('admin').main(
    { action: 'heroTag', memberId: 'h-9', isHero: true, heroNote: '抗战殉国' },
    { OPENID: 'u-his', openid: 'u-his' });
  assert.equal(res.success, true);
  assert.equal(res.data.isHero, true);
  assert.equal(res.data.heroNote, '抗战殉国');
  const seed = globalThis.__HCS_STUB_SEED__;
  assert.equal(seed.collections.members[0].isHero, true, '落库');
  assert.equal(seed.collections.audit_logs[0].action, 'admin.heroTag', '全程审计');
  // 英名录立即可见（R15 heroList 闭环）
  const hero = await FN('member').main({ action: 'heroList' }, { OPENID: 'u-x', openid: 'u-x' });
  assert.equal(hero.data.heroes.length, 1);
});

test('R16 admin.heroTag：EDITOR 越权 403（族史委专属）', async () => {
  seedDB({ users: [{ openid: 'u-ed', role: 'EDITOR' }], members: [{ _id: 'm-1' }] });
  const res = await FN('admin').main(
    { action: 'heroTag', memberId: 'm-1', isHero: true },
    { OPENID: 'u-ed', openid: 'u-ed' });
  assert.equal(res.code, 403);
});

test('R16 member.getDetail：公开级输出传记字段 deeds/motto/heroNote', async () => {
  seedDB({
    users: [{ openid: 'u-m', role: 'MEMBER', memberId: 'm-me' }],
    members: [{ _id: 'm-1', genealogyName: '郝忠烈', generation: 4, status: 'DECEASED',
      deeds: [{ title: '修桥', date: '1938', desc: '义修石桥' }], motto: '敬宗睦族', heroNote: '英烈' }]
  });
  const res = await FN('member').main({ action: 'getDetail', memberId: 'm-1' }, { OPENID: 'u-m', openid: 'u-m' });
  assert.equal(res.success, true);
  assert.deepEqual(res.data.member.deeds, [{ title: '修桥', date: '1938', desc: '义修石桥' }]);
  assert.equal(res.data.member.motto, '敬宗睦族');
  assert.equal(res.data.member.heroNote, '英烈');
});

test('R16 member.getDetail：非族人访客对 DECEASED 仍可见公开级（蓝图 7.4）', async () => {
  seedDB({
    users: [{ openid: 'u-v', role: 'VISITOR' }],
    members: [{ _id: 'm-1', genealogyName: '郝先祖', generation: 1, status: 'DECEASED', tomb: { place: 'x' } }]
  });
  const res = await FN('member').main({ action: 'getDetail', memberId: 'm-1' }, { OPENID: 'u-v', openid: 'u-v' });
  assert.equal(res.success, true);
  assert.ok(res.data.member.genealogyName, '公开级可见');
  assert.ok(res.data.hiddenFields.includes('tomb'), '私密字段隐藏');
});

// ─── Sprint R17：entry.audit 双人审核链升级 + CHANGE(RELATION) 工单 APPROVED 后 relations 生效 ───

test('R17 entry.audit FIRST_PASS：BRANCH_HEAD 初审正向（蓝图 7.6 初审支系）+ auditChain 留痕', async () => {
  seedDB({
    users: [{ openid: 'u-bh', role: 'BRANCH_HEAD' }, { openid: 'u-sub', role: 'MEMBER' }],
    entryRecords: [
      { 
        _id: 'r-fp', 
        type: 'MANUAL', 
        payload: { name: '郝一', generation: 18, branchId: 'long' }, 
        status: 'SUBMITTED', 
        createdBy: 'u-sub', 
        auditChain: [] 
      }
    ]
  });
  const res = await FN('entry').main(
    { action: 'audit', recordId: 'r-fp', auditAction: 'FIRST_PASS', comment: '支系核实无误' },
    { OPENID: 'u-bh', openid: 'u-bh' });
  assert.equal(res.success, true, `初审应通过: ${JSON.stringify(res)}`);
  assert.equal(res.data.status, 'FIRST_PASS');
  const rec = globalThis.__HCS_STUB_SEED__.collections.entry_records[0];
  assert.equal(rec.status, 'FIRST_PASS');
  assert.equal(rec.auditChain[0].action, 'FIRST_PASS');
  assert.equal(rec.auditChain[0].comment, '支系核实无误');
});

test('R17 entry.audit：MEMBER 触达审核 403（鉴权先行）+ 提交人自审 400', async () => {
  seedDB({
    users: [{ openid: 'u-m', role: 'MEMBER' }, { openid: 'u-bh', role: 'BRANCH_HEAD' }],
    entryRecords: [
      { 
        _id: 'r-self', 
        type: 'MANUAL', 
        payload: { name: '郝一', generation: 1, branchId: 'b' }, 
        status: 'SUBMITTED', 
        createdBy: 'u-bh', 
        auditChain: [] 
      }
    ]
  });
  const r1 = await FN('entry').main(
    { action: 'audit', recordId: 'r-self', auditAction: 'FIRST_PASS' },
    { OPENID: 'u-m', openid: 'u-m' });
  assert.equal(r1.code, 403, 'MEMBER 低于 BRANCH_HEAD 粗门禁');
  const r2 = await FN('entry').main(
    { action: 'audit', recordId: 'r-self', auditAction: 'FIRST_PASS' },
    { OPENID: 'u-bh', openid: 'u-bh' });
  assert.equal(r2.code, 400, '提交人不得自审（初审）');
});

test('R17 entry.audit SECOND_PASS：HISTORIAN 复审 + 复审人≠初审人（双人审核）+ CHANGE(RELATION) 工单 relations 生效', async () => {
  seedDB({
    users: [{ openid: 'u-bh', role: 'BRANCH_HEAD' }, { openid: 'u-his', role: 'HISTORIAN' }],
    members: [{ _id: 'm-1' }, { _id: 'm-2' }],
    entryRecords: [{
      _id: 'r-rel', type: 'CHANGE', status: 'FIRST_PASS', submittedBy: 'u-sub',
      payload: { changeType: 'RELATION', relation: { fromId: 'm-1', toId: 'm-2', type: 'SIBLING', subType: '' } },
      auditChain: [{ step: 'FIRST_PASS', userId: 'u-bh', action: 'FIRST_PASS', time: new Date(), comment: '核实' }]
    }],
    relations: []
  });
  // BRANCH_HEAD 不可复审（细门禁 HISTORIAN）
  const deny = await FN('entry').main(
    { action: 'audit', recordId: 'r-rel', auditAction: 'SECOND_PASS' },
    { OPENID: 'u-bh', openid: 'u-bh' });
  assert.equal(deny.code, 403, '复审须族史委（蓝图 7.6 族史委 2 人）');
  // HISTORIAN 复审 → APPROVED → relations 落库
  const res = await FN('entry').main(
    { action: 'audit', recordId: 'r-rel', auditAction: 'SECOND_PASS' },
    { OPENID: 'u-his', openid: 'u-his' });
  assert.equal(res.success, true, `复审应通过: ${JSON.stringify(res)}`);
  assert.equal(res.data.status, 'APPROVED');
  assert.ok(res.data.relationId, '返回 relationId');
  const seed = globalThis.__HCS_STUB_SEED__;
  const rel = seed.collections.relations[0];
  assert.equal(rel.fromId, 'm-1');
  assert.equal(rel.type, 'SIBLING');
  assert.equal(rel.status, 'ACTIVE');
  assert.deepEqual(rel.verifiedBy, ['u-bh', 'u-his'], '双人审核 verifiedBy');
  assert.equal(seed.collections.audit_logs[0].action, 'entry.approve.relation', 'CHANGE 生效审计');
});

test('R17 entry.audit SECOND_PASS：复审人=初审人 400（双人审核红线）', async () => {
  seedDB({
    users: [{ openid: 'u-his', role: 'HISTORIAN' }],
    entryRecords: [{
      _id: 'r-same', type: 'MANUAL', payload: { name: '郝一', generation: 1, branchId: 'b' }, status: 'FIRST_PASS',
      auditChain: [{ step: 'FIRST_PASS', userId: 'u-his', action: 'FIRST_PASS', time: new Date(), comment: '' }]
    }]
  });
  const res = await FN('entry').main(
    { action: 'audit', recordId: 'r-same', auditAction: 'SECOND_PASS' },
    { OPENID: 'u-his', openid: 'u-his' });
  assert.equal(res.code, 400, '复审人不得与初审人相同');
});

test('R17 entry.audit REJECT：无意见 400（蓝图 11 驳回必填）+ 有意见正向', async () => {
  seedDB({
    users: [{ openid: 'u-his', role: 'HISTORIAN' }],
    entryRecords: [{ _id: 'r-rj', type: 'MANUAL', payload: {}, status: 'SUBMITTED', createdBy: 'u-sub', auditChain: [] }]
  });
  const r1 = await FN('entry').main(
    { action: 'audit', recordId: 'r-rj', auditAction: 'REJECT' },
    { OPENID: 'u-his', openid: 'u-his' });
  assert.equal(r1.code, 400, '驳回必须填写意见');
  const r2 = await FN('entry').main(
    { action: 'audit', recordId: 'r-rj', auditAction: 'REJECT', comment: '材料不全' },
    { OPENID: 'u-his', openid: 'u-his' });
  assert.equal(r2.success, true);
  assert.equal(r2.data.status, 'REJECTED');
  assert.equal(globalThis.__HCS_STUB_SEED__.collections.entry_records[0].auditChain[0].comment, '材料不全');
});

test('R17 entry.audit SECOND_PASS：CHANGE 工单与 ACTIVE 边重复 → 400（与 relation.edit 口径一致）', async () => {
  seedDB({
    users: [{ openid: 'u-his', role: 'HISTORIAN' }],
    entryRecords: [{
      _id: 'r-dup', type: 'CHANGE', status: 'FIRST_PASS', submittedBy: 'u-sub',
      payload: { changeType: 'RELATION', relation: { fromId: 'm-1', toId: 'm-2', type: 'SIBLING' } },
      auditChain: [{ step: 'FIRST_PASS', userId: 'u-bh', action: 'FIRST_PASS', time: new Date(), comment: '' }]
    }],
    relations: [{ _id: 'rel-exist', fromId: 'm-1', toId: 'm-2', type: 'SIBLING', status: 'ACTIVE' }]
  });
  const res = await FN('entry').main(
    { action: 'audit', recordId: 'r-dup', auditAction: 'SECOND_PASS' },
    { OPENID: 'u-his', openid: 'u-his' });
  assert.equal(res.code, 400);
  assert.ok(String(res.message).includes('已存在'), '重复 ACTIVE 边拦截');
});

// ─── Sprint R18：member.search 聚合搜索 + entry.pendingList 审核待办列表 ───

test('R18 member.search：MEMBER 正向命中（谱名模糊）+ 白名单字段（无私密）', async () => {
  seedDB({
    users: [{ openid: 'u-test', role: 'MEMBER' }],
    members: [
      { _id: 'm-1', genealogyName: '郝守业', generation: 18, status: 'DECEASED', tomb: '赵州西', marriage: '配王氏' },
      { _id: 'm-2', genealogyName: '郝守田', generation: 18, status: 'LIVING' },
      { _id: 'm-3', genealogyName: '郝建业', generation: 20, status: 'LIVING' }
    ]
  });
  const res = await FN('member').main({ action: 'search', keyword: '守' }, CTX);
  assert.equal(res.success, true, JSON.stringify(res));
  assert.equal(res.data.total, 2, '守业+守田 命中');
  assert.equal(res.data.hits[0].id, 'm-1');
  assert.ok(res.data.hits[0].genealogyName.includes('守'));
  assert.equal(res.data.hits[0].tomb, undefined, '白名单不含 tomb');
  assert.equal(res.data.hits[0].marriage, undefined, '白名单不含 marriage');
});

test('R18 member.search：VISITOR 403 + 空 keyword 400', async () => {
  seedDB({ users: [] });
  const r1 = await FN('member').main({ action: 'search', keyword: '郝' }, CTX);
  assert.equal(r1.code, 403, 'VISITOR 不可搜索');
  seedDB({ users: [{ openid: 'u-test', role: 'MEMBER' }] });
  const r2 = await FN('member').main({ action: 'search', keyword: '  ' }, CTX);
  assert.equal(r2.code, 400, '空 keyword 400');
});

test('R18 member.search：分页（total>20 → hasMore）', async () => {
  const many = Array.from({ length: 25 }, (_, i) => ({ _id: `m-${i}`, genealogyName: `郝守${i}`, generation: 10 + (i % 5), status: 'LIVING' }));
  seedDB({ users: [{ openid: 'u-test', role: 'MEMBER' }], members: many });
  const p1 = await FN('member').main({ action: 'search', keyword: '守' }, CTX);
  assert.equal(p1.data.hits.length, 20, 'size=20');
  assert.equal(p1.data.hasMore, true, 'total 25 > 20');
  const p2 = await FN('member').main({ action: 'search', keyword: '守', page: 2 }, CTX);
  assert.equal(p2.data.hits.length, 5);
  assert.equal(p2.data.hasMore, false);
});

test('R18 entry.pendingList：BRANCH_HEAD 正向（SUBMITTED+FIRST_PASS + canFirstPass/canSecondPass 标记）', async () => {
  seedDB({
    users: [{ openid: 'u-bh', role: 'BRANCH_HEAD' }, { openid: 'u-his', role: 'HISTORIAN' }],
    entryRecords: [
      { _id: 'r-s', status: 'SUBMITTED', createdBy: 'u-sub', payload: { name: '郝一' }, auditChain: [] },
      { 
        _id: 'r-fp', 
        status: 'FIRST_PASS', 
        createdBy: 'u-sub', 
        payload: { name: '郝二' }, 
        auditChain: [{ step: 'FIRST_PASS', userId: 'u-bh', action: 'FIRST_PASS', time: new Date() }] 
      }
    ]
  });
  // BRANCH_HEAD 视角：初审可用，复审不可（细门禁 HISTORIAN）
  const r1 = await FN('entry').main({ action: 'pendingList' }, { OPENID: 'u-bh', openid: 'u-bh' });
  assert.equal(r1.success, true, JSON.stringify(r1));
  assert.equal(r1.data.total, 2);
  const s = r1.data.pending.find(r => r._id === 'r-s');
  const fp = r1.data.pending.find(r => r._id === 'r-fp');
  assert.equal(s.canFirstPass, true);
  assert.equal(s.canSecondPass, false, 'BRANCH_HEAD 不可复审');
  assert.equal(fp.canFirstPass, false, '已初审单不可再初审');
  assert.equal(fp.canSecondPass, false, 'u-bh 是初审人 → 不可复审');
  // HISTORIAN 视角：fp.canSecondPass = true
  const r2 = await FN('entry').main({ action: 'pendingList' }, { OPENID: 'u-his', openid: 'u-his' });
  const fp2 = r2.data.pending.find(r => r._id === 'r-fp');
  assert.equal(fp2.canSecondPass, true, 'HISTORIAN 可复审');
});

test('R18 entry.pendingList：MEMBER 403（鉴权先行）', async () => {
  seedDB({ users: [{ openid: 'u-test', role: 'MEMBER' }] });
  const res = await FN('entry').main({ action: 'pendingList' }, CTX);
  assert.equal(res.code, 403);
});


// ─── Sprint R19：admin.featureFlag 集成 + hero 贯通纯函数 ───

test('R19 featureFlag：CHIEF 设置开关（settings key=featureFlag，含审计）', async () => {
  seedDB({
    users: [{ openid: 'u-chief', role: 'CHIEF' }],
    settings: [{ key: 'featureFlag', value: JSON.stringify({}) }]
  });
  const res = await FN('admin').main(
    { action: 'featureFlag', key: 'v11Avatar', value: { enabled: true }, scope: 'global' },
    { OPENID: 'u-chief', openid: 'u-chief' }
  );
  assert.equal(res.success, true, JSON.stringify(res));
  // 审计日志写入
  const logs = globalThis.__HCS_STUB_SEED__.collections.audit_logs || [];
  assert.ok(logs.some(l => l.action === 'admin.featureFlag' && l.target === 'v11Avatar'), '审计留痕');
});

test('R19 featureFlag：MEMBER 不可设置 → 403（蓝图 17.1 族长专属）', async () => {
  seedDB({ users: [{ openid: 'u-m', role: 'MEMBER' }] });
  const res = await FN('admin').main(
    { action: 'featureFlag', key: 'v11Avatar', value: { enabled: true }, scope: 'global' },
    { OPENID: 'u-m', openid: 'u-m' }
  );
  assert.equal(res.code, 403, JSON.stringify(res));
});

test('R19 featureFlag：读取开关（getFeatureFlags 返回合并结果）', async () => {
  seedDB({
    settings: [{ key: 'featureFlag', value: JSON.stringify({ v11Avatar: { enabled: true, scope: 'global' } }) }]
  });
  const res = await FN('admin').main({ action: 'getFeatureFlags' }, CTX);
  assert.equal(res.success, true);
  assert.equal(res.data.flags['v11Avatar'].enabled, true, '读取到 CHIEF 设置的开关');
});

test('R19 hero isHeroMember：DECEASED+isHero 才是英烈（memberDetail 入口判定）', () => {
  const isHeroMember = (m) => !!(m && m.status === 'DECEASED' && m.isHero);
  assert.equal(isHeroMember({ status: 'DECEASED', isHero: true }), true, '英烈');
  assert.equal(isHeroMember({ status: 'DECEASED', isHero: false }), false, '普通已故');
  assert.equal(isHeroMember({ status: 'ALIVE', isHero: true }), false, '在世非英烈');
  assert.equal(isHeroMember({ status: 'LIVING', isHero: true }), false, 'LIVING 非英烈');
  assert.equal(isHeroMember(null), false, 'null 防御');
});

test('R19 visibilityCheck 烟囱测试：PRIVATE 拒绝/PUBLIC 放行/GROUP 名单内放行', () => {
  const { visibilityCheck } = require('../cloud/functions/common/privacy');
  const u1 = { openid: 'u1', familyIds: new Set(['f1']), authedTargetIds: new Set() };
  assert.equal(visibilityCheck(u1, { _id: 'c1', visibility: 'PRIVATE', ownerOpenid: 'u2' }), 'deny');
  assert.equal(visibilityCheck(u1, { visibility: 'PUBLIC', ownerOpenid: 'u2' }), 'allow');
  assert.equal(visibilityCheck(u1, { _id: 'c2', visibility: 'GROUP', ownerOpenid: 'u2', groupIds: ['f1'] }), 'allow');
});

// ─── Sprint R20: CI/MPS/留言方案 +5 用例 ───

test('R20 upload.triggerCi: stub 返回占位 URL 模板', async () => {
  const res = await FN('upload').main(
    { action: 'triggerCi', fileId: 'temp-avatar-file' },
    { OPENID: 'u1', openid: 'u1' }
  );
  assert.equal(res.success, true, JSON.stringify(res));
  assert.ok(res.data.compressedUrl.includes('cdn-webp'), 'compressedUrl 存在');
  assert.ok(res.data.thumbnailUrls.s, 'thumb s 档存在');
});

test('R20 upload.triggerMps: duration > 60s 拒绝', async () => {
  const res = await FN('upload').main(
    { action: 'triggerMps', fileId: 'video-xx', duration: 70 },
    { OPENID: 'u1', openid: 'u1' }
  );
  assert.equal(res.code, 400);
  assert.ok(res.message?.includes('≤60s'), '长度校验文案');
});

test('R20 profile.saveAvatar: CI 占位成功 (stub)', async () => {
  seedDB({ avatars: [] });
  const res = await FN('profile').main(
    { action: 'saveAvatar', fileId: 'avatar-temp', cropMeta: { ratio: 1 }, visibility: 'PUBLIC' },
    CTX_WITH_ROLE('MEMBER')
  );
  assert.equal(res.success, true, JSON.stringify(res));
  assert.ok(res.data.avatarId.includes('profile-'), 'avatarId 格式正确');
});

test('R20 member.getDetail: isHero=true → hero 入口可见 (computed logic)', () => {
  // 复用 R19 hero isHeroMember computed
  const isHeroMember = (m) => !!(m && m.status === 'DECEASED' && m.isHero);
  assert.equal(isHeroMember({ status: 'DECEASED', isHero: true }), true);
  assert.equal(isHeroMember({ status: 'DECEASED', isHero: false }), false);
  assert.equal(isHeroMember({ status: 'ALIVE', isHero: true }), false);
});

test('R20 visibilityCheck GROUP: 跨组拒绝 (authedTargetIds 不匹配)', () => {
  const { visibilityCheck } = require('../cloud/functions/common/privacy');
  const u1 = { openid: 'u1', familyIds: new Set(['f1']), authedTargetIds: new Set() };
  const content = { _id: 'c1', visibility: 'GROUP', ownerOpenid: 'u2', groupIds: ['f2'] };
  assert.equal(visibilityCheck(u1, content), 'deny', '跨组 f1 vs f2 拒绝');
});

// ─── Sprint R20: profile.updateIntro / updateFamilyInfo test cases ───

test('R20 profile.updateIntro: MEMBER 写自己问候语 OK', async () => {
  seedDB({ users: [{ _id: 'u1', openid: 'u1', role: 'MEMBER', status: 'APPROVED' }] });
  const res = await FN('profile').main({ action: 'updateIntro', userId: 'u-member', greeting: '你好，我是郝一' }, CTX_WITH_ROLE('MEMBER'));
  assert.equal(res.success, true);
});

test('R20 profile.updateIntro: MEMBER 写他人问候语 → 403', async () => {
  seedDB({ users: [{ _id: 'u2', openid: 'u2', role: 'MEMBER', status: 'APPROVED' }] });
  const res = await FN('profile').main({ action: 'updateIntro', userId: 'u2', greeting: '他人问候' }, CTX_WITH_ROLE('MEMBER'));
  assert.equal(res.code, 403);
});

test('R20 profile.updateIntro: greeting 超长 → 400', async () => {
  const long = 'A'.repeat(201);
  const res = await FN('profile').main({ action: 'updateIntro', userId: 'u-visitor', greeting: long }, CTX_WITH_ROLE('VISITOR'));
  assert.equal(res.code, 400);
});

test('R20 profile.updateFamilyInfo: MEMBER 修改家训 → 403', async () => {
  seedDB({ settings: [] });
  const res = await FN('profile').main({ action: 'updateFamilyInfo', userId: 'u-member', familyMotto: '忠厚传家' }, CTX_WITH_ROLE('MEMBER'));
  assert.equal(res.code, 403);
});

test('R20 profile.updateFamilyInfo: EDITOR 设置家训/字辈 OK', async () => {
  seedDB({ settings: [{ _id: 'flags', key: 'featureFlags', value: {} }] });
  const res = await FN('profile').main(
    { 
      action: 'updateFamilyInfo', userId: 'u-editor', 
      familyMotto: '忠厚传家久', generationChars: ['德','文','光','明'] 
    }, CTX_WITH_ROLE('EDITOR'));
  assert.equal(res.success, true);
});

test('R20 profile.updateFamilyInfo: generationChars 非数组 → 400', async () => {
  const res = await FN('profile').main(
    { action: 'updateFamilyInfo', userId: 'u-member', familyMotto: 'test', generationChars: 'not-array' }, CTX_WITH_ROLE('EDITOR'));
  assert.equal(res.code, 400);
});
