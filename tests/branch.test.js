/**
 * tests/branch.test.js
 * branch 云函数行为测试（R26 #2）：stub wx-server-sdk，
 * 验证三级谱系树创建门禁 / HAO- 层级序列码 / 编码递增 / 同父重名 / seed 幂等 / update 白名单。
 */
const { test } = require('node:test');
const assert = require('node:assert');
const Module = require('module');
const path = require('node:path');

// ─── stub 注入（与 smoke-functions.test.js 同款，进程内一次） ───
const stubPath = require.resolve('../scripts/wx-server-sdk-stub.js');
if (!Module._resolveFilename.__hcsPatchedBranch) {
  const orig = Module._resolveFilename;
  Module._resolveFilename = function (request, ...rest) {
    if (request === 'wx-server-sdk') return stubPath;
    return orig.call(this, request, ...rest);
  };
  Module._resolveFilename.__hcsPatchedBranch = true;
}

const FN = () => require(path.join('..', 'cloud', 'functions', 'branch', 'index.js'));
const CTX = (role) => ({ OPENID: `u-${(role || 'visitor').toLowerCase()}`, openid: `u-${(role || 'visitor').toLowerCase()}` });
const USER = (role) => ({ _id: `u-${(role || 'visitor').toLowerCase()}`, openid: `u-${(role || 'visitor').toLowerCase()}`, role: role || 'VISITOR' });

function seed({ users = [], branches = [] } = {}) {
  globalThis.__HCS_STUB_SEED__ = { collections: { users, branches }, seq: 0 };
  return globalThis.__HCS_STUB_SEED__;
}

// ─── 门禁 ───

test('branch.create：VISITOR → 403（鉴权先行）', async () => {
  seed({ users: [USER('VISITOR')] });
  const res = await FN().main({ action: 'create', name: '宋村一支', level: 2 }, CTX('VISITOR'));
  assert.equal(res.code, 403);
});

test('branch.seed：非族长 → 403', async () => {
  seed({ users: [USER('MEMBER')] });
  const res = await FN().main({ action: 'seed' }, CTX('MEMBER'));
  assert.equal(res.code, 403);
});

test('branch.list：VISITOR → 403（族人方可浏览）', async () => {
  seed({ users: [USER('VISITOR')] });
  const res = await FN().main({ action: 'list' }, CTX('VISITOR'));
  assert.equal(res.code, 403);
});

// ─── seed 幂等 ───

test('branch.seed：CHIEF 初始化总谱 HAO-0000，重复 seed 幂等', async () => {
  seed({ users: [USER('CHIEF')] });
  const r1 = await FN().main({ action: 'seed' }, CTX('CHIEF'));
  assert.equal(r1.success, true);
  assert.equal(r1.data.code, 'HAO-0000');
  assert.equal(r1.data.level, 1);
  // first add created 1 branch
  assert.equal(globalThis.__HCS_STUB_SEED__.collections.branches.length, 1);

  // second seed (same ctx) should return already-exists without re-adding
  const r2 = await FN().main({ action: 'seed' }, CTX('CHIEF'));
  assert.equal(r2.success, true);
  assert.equal(r2.data.message.includes('already'), true, '幂等提示');
  // branches 仍只有 1 条
  assert.equal(globalThis.__HCS_STUB_SEED__.collections.branches.length, 1);
});

// ─── create 编码与校验 ───

test('branch.create：缺名/非法 level → 400', async () => {
  seed({ users: [USER('BRANCH_HEAD')], branches: [{ _id: 'b0', code: 'HAO-0000', name: '郝氏总谱', level: 1, status: 'ACTIVE' }] });
  const noName = await FN().main({ action: 'create', level: 2 }, CTX('BRANCH_HEAD'));
  assert.equal(noName.code, 400);
  const badLevel = await FN().main({ action: 'create', name: 'x', level: 9 }, CTX('BRANCH_HEAD'));
  assert.equal(badLevel.code, 400);
});

test('branch.create：总谱不存在 → 400（parentCode not found）', async () => {
  seed({ users: [USER('BRANCH_HEAD')], branches: [] });
  const res = await FN().main({ action: 'create', name: '宋村一支', level: 2 }, CTX('BRANCH_HEAD'));
  assert.equal(res.code, 400);
  assert.ok(res.message.includes('not found'));
});

test('branch.create：level=2 挂总谱 → HAO-0000-01，第二支 → HAO-0000-02（序号递增）', async () => {
  seed({ users: [USER('BRANCH_HEAD')], branches: [{ _id: 'b0', code: 'HAO-0000', name: '郝氏总谱', level: 1, status: 'ACTIVE', parentCode: null }] });
  const r1 = await FN().main({ action: 'create', name: '宋村一支', level: 2, region: '河北省石家庄市赵县' }, CTX('BRANCH_HEAD'));
  assert.equal(r1.success, true);
  assert.equal(r1.data.code, 'HAO-0000-01');

  const r2 = await FN().main({ action: 'create', name: '南庄一支', level: 2 }, CTX('BRANCH_HEAD'));
  assert.equal(r2.success, true);
  assert.equal(r2.data.code, 'HAO-0000-02', '同父下序号递增');
});

test('branch.create：level=3 挂分谱 → HAO-0000-01-01（三级编码）', async () => {
  seed({
    users: [USER('BRANCH_HEAD')],
    branches: [
      { _id: 'b0', code: 'HAO-0000', name: '郝氏总谱', level: 1, status: 'ACTIVE', parentCode: null },
      { _id: 'b1', code: 'HAO-0000-01', name: '宋村一支', level: 2, status: 'ACTIVE', parentCode: 'HAO-0000' }
    ]
  });
  const res = await FN().main({ action: 'create', name: '东房', level: 3, parentCode: 'HAO-0000-01' }, CTX('BRANCH_HEAD'));
  assert.equal(res.success, true);
  assert.equal(res.data.code, 'HAO-0000-01-01');
});

test('branch.create：同父重名 → 400', async () => {
  seed({
    users: [USER('BRANCH_HEAD')],
    branches: [
      { _id: 'b0', code: 'HAO-0000', name: '郝氏总谱', level: 1, status: 'ACTIVE', parentCode: null },
      { _id: 'b1', code: 'HAO-0000-01', name: '宋村一支', level: 2, status: 'ACTIVE', parentCode: 'HAO-0000' }
    ]
  });
  const res = await FN().main({ action: 'create', name: '宋村一支', level: 2 }, CTX('BRANCH_HEAD'));
  assert.equal(res.code, 400);
  assert.ok(res.message.includes('already exists'));
});

test('branch.create：父级层级不匹配 → 400（level 3 不可挂 level 1）', async () => {
  seed({ users: [USER('BRANCH_HEAD')], branches: [{ _id: 'b0', code: 'HAO-0000', name: '郝氏总谱', level: 1, status: 'ACTIVE', parentCode: null }] });
  const res = await FN().main({ action: 'create', name: '越级', level: 3, parentCode: 'HAO-0000' }, CTX('BRANCH_HEAD'));
  assert.equal(res.code, 400);
  assert.ok(res.message.includes('parent must be level'));
});

// ─── list / detail ───

test('branch.list：MEMBER 可读，按 code 升序', async () => {
  seed({
    users: [USER('MEMBER')],
    branches: [
      { _id: 'b2', code: 'HAO-0000-02', name: '南庄一支', level: 2, status: 'ACTIVE', parentCode: 'HAO-0000' },
      { _id: 'b0', code: 'HAO-0000', name: '郝氏总谱', level: 1, status: 'ACTIVE', parentCode: null },
      { _id: 'b1', code: 'HAO-0000-01', name: '宋村一支', level: 2, status: 'ARCHIVED', parentCode: 'HAO-0000' }
    ]
  });
  const res = await FN().main({ action: 'list' }, CTX('MEMBER'));
  assert.equal(res.success, true);
  assert.equal(res.data.items.length, 2, 'ARCHIVED 不出现在列表');
  assert.equal(res.data.items[0].code, 'HAO-0000');
  assert.equal(res.data.items[1].code, 'HAO-0000-02');
});

test('branch.detail：按 code 返回 + 直接子支', async () => {
  seed({
    users: [USER('MEMBER')],
    branches: [
      { _id: 'b0', code: 'HAO-0000', name: '郝氏总谱', level: 1, status: 'ACTIVE', parentCode: null },
      { _id: 'b1', code: 'HAO-0000-01', name: '宋村一支', level: 2, status: 'ACTIVE', parentCode: 'HAO-0000' }
    ]
  });
  const res = await FN().main({ action: 'detail', code: 'HAO-0000' }, CTX('MEMBER'));
  assert.equal(res.success, true);
  assert.equal(res.data.name, '郝氏总谱');
  assert.equal(res.data.children.length, 1);
  assert.equal(res.data.children[0].code, 'HAO-0000-01');

  const miss = await FN().main({ action: 'detail', code: 'HAO-9999' }, CTX('MEMBER'));
  assert.equal(miss.code, 404);
});

// ─── update 白名单 ───

test('branch.update：EDITOR 可改非结构字段，代码/层级不可动', async () => {
  seed({
    users: [USER('EDITOR')],
    branches: [{ _id: 'b1', code: 'HAO-0000-01', name: '宋村一支', level: 2, status: 'ACTIVE', parentCode: 'HAO-0000', description: '' }]
  });
  const res = await FN().main(
    { action: 'update', code: 'HAO-0000-01', description: '明朝迁自山西', generationVerses: '国正天心顺', population: 120 },
    CTX('EDITOR')
  );
  assert.equal(res.success, true);
  const col = globalThis.__HCS_STUB_SEED__.collections.branches;
  assert.equal(col[0].description, '明朝迁自山西');
  assert.equal(col[0].generationVerses, '国正天心顺');
  assert.equal(col[0].population, 120);
  assert.equal(col[0].level, 2, '结构字段不可被 update 篡改');
});

test('branch.stats：MEMBER → 403 / EDITOR 可读', async () => {
  seed({
    users: [USER('MEMBER')],
    branches: [{ _id: 'b0', code: 'HAO-0000', name: '郝氏总谱', level: 1, status: 'ACTIVE', parentCode: null }]
  });
  const denied = await FN().main({ action: 'stats' }, CTX('MEMBER'));
  assert.equal(denied.code, 403);

  seed({ users: [USER('EDITOR')], branches: [{ _id: 'b0', code: 'HAO-0000', name: '郝氏总谱', level: 1, status: 'ACTIVE', parentCode: null }] });
  const ok = await FN().main({ action: 'stats' }, CTX('EDITOR'));
  assert.equal(ok.success, true);
  assert.equal(ok.data.totalActive, 1);
});

// ─── archive 归档 ───

test('branch.archive：非编辑 → 403（鉴权先行）', async () => {
  seed({
    users: [USER('MEMBER')],
    branches: [{ _id: 'b1', code: 'HAO-0000-01', name: '宋村一支', level: 2, status: 'ACTIVE', parentCode: 'HAO-0000' }]
  });
  const res = await FN().main({ action: 'archive', code: 'HAO-0000-01' }, CTX('MEMBER'));
  assert.equal(res.code, 403);
});

test('branch.archive：总谱 HAO-0000 不可归档', async () => {
  seed({
    users: [USER('EDITOR')],
    branches: [{ _id: 'b0', code: 'HAO-0000', name: '郝氏总谱', level: 1, status: 'ACTIVE', parentCode: null }]
  });
  const res = await FN().main({ action: 'archive', code: 'HAO-0000' }, CTX('EDITOR'));
  assert.equal(res.code, 400);
  assert.ok(res.message.includes('总谱'), '总谱不可归档提示');
});

test('branch.archive：存在活跃子支 → 先归档子支', async () => {
  seed({
    users: [USER('EDITOR')],
    branches: [
      { _id: 'b0', code: 'HAO-0000', name: '郝氏总谱', level: 1, status: 'ACTIVE', parentCode: null },
      { _id: 'b1', code: 'HAO-0000-01', name: '宋村一支', level: 2, status: 'ACTIVE', parentCode: 'HAO-0000' },
      { _id: 'b2', code: 'HAO-0000-01-01', name: '长房', level: 3, status: 'ACTIVE', parentCode: 'HAO-0000-01' }
    ]
  });
  const res = await FN().main({ action: 'archive', code: 'HAO-0000-01' }, CTX('EDITOR'));
  assert.equal(res.code, 400);
  assert.ok(res.message.includes('子分支'), '提示先归档子支');
});

test('branch.archive：成功归档（先归档子支后父可归档）', async () => {
  seed({
    users: [USER('EDITOR')],
    branches: [
      { _id: 'b0', code: 'HAO-0000', name: '郝氏总谱', level: 1, status: 'ACTIVE', parentCode: null },
      { _id: 'b1', code: 'HAO-0000-01', name: '宋村一支', level: 2, status: 'ACTIVE', parentCode: 'HAO-0000' }
    ]
  });
  const r1 = await FN().main({ action: 'archive', code: 'HAO-0000-01' }, CTX('EDITOR'));
  assert.equal(r1.success, true);
  assert.equal(r1.data.status, 'ARCHIVED');
  const col = globalThis.__HCS_STUB_SEED__.collections.branches;
  assert.equal(col.find((b) => b.code === 'HAO-0000-01').status, 'ARCHIVED');

  // 重复归档 → 400
  const r2 = await FN().main({ action: 'archive', code: 'HAO-0000-01' }, CTX('EDITOR'));
  assert.equal(r2.code, 400);
  assert.ok(r2.message.includes('仅 ACTIVE'), '重复归档被拒');
});

test('branch.archive：缺 code → 400', async () => {
  seed({ users: [USER('EDITOR')] });
  const res = await FN().main({ action: 'archive' }, CTX('EDITOR'));
  assert.equal(res.code, 400);
});
