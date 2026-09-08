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

function seed({ users = [], branches = [], members = [] } = {}) {
  globalThis.__HCS_STUB_SEED__ = { collections: { users, branches, members }, seq: 0 };
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

test('branch.stats：EDITOR 真实人口聚合（members.branchId → perBranch/byLevel.population）', async () => {
  seed({
    users: [USER('EDITOR')],
    branches: [
      { _id: 'b0', code: 'HAO-0000', name: '总谱', level: 1, status: 'ACTIVE', parentCode: null },
      { _id: 'b1', code: 'HAO-0000-01', name: '宋村一支', level: 2, status: 'ACTIVE', parentCode: 'HAO-0000' },
      { _id: 'b2', code: 'HAO-0000-02', name: '南庄一支', level: 2, status: 'ACTIVE', parentCode: 'HAO-0000' }
    ],
    members: [
      { _id: 'm1', openid: 'u-m1', branchId: 'HAO-0000-01', path: '/m1/g5' },
      { _id: 'm2', openid: 'u-m2', branchId: 'HAO-0000-01', path: '/m2/g6' },
      { _id: 'm3', openid: 'u-m3', branchId: 'HAO-0000-02', path: '/m3/g7' },
      { _id: 'm4', openid: 'u-m4', branchId: 'HAO-0000-01', path: '/m4/g8' }
    ]
  });
  const res = await FN().main({ action: 'stats' }, CTX('EDITOR'));
  assert.equal(res.success, true);
  assert.equal(res.data.totalActive, 3, 'branches total');
  assert.equal(res.data.totalPopulation, 4, 'members count');
  assert.equal(res.data.byLevel['1'].total, 1, 'level 1 total');
  assert.equal(res.data.byLevel['2'].total, 2, 'level 2 total');
  assert.equal(res.data.byLevel['1'].population, 0, 'level 1 population');
  assert.equal(res.data.byLevel['2'].population, 4, 'level 2 population');
  // perBranch：仅有人口的分支
  assert.ok(res.data.perBranch.length === 2, 'perBranch size');
  assert.equal(res.data.perBranch[0].code, 'HAO-0000-01');
  assert.equal(res.data.perBranch[0].population, 3);
  assert.equal(res.data.perBranch[1].code, 'HAO-0000-02');
  assert.equal(res.data.perBranch[1].population, 1);
});

// ─── merge 合并（R28）───

test('branch.merge：MEMBER → 403（鉴权先行）', async () => {
  seed({
    users: [USER('MEMBER')],
    branches: [
      { _id: 'b1', code: 'HAO-0000-01', name: '宋村一支', level: 2, status: 'ACTIVE', parentCode: 'HAO-0000' },
      { _id: 'b2', code: 'HAO-0000-02', name: '南庄一支', level: 2, status: 'ACTIVE', parentCode: 'HAO-0000' }
    ]
  });
  const res = await FN().main({ action: 'merge', fromCode: 'HAO-0000-01', toCode: 'HAO-0000-02' }, CTX('MEMBER'));
  assert.equal(res.code, 403);
});

test('branch.merge：缺参/自合并 → 400', async () => {
  seed({ users: [USER('EDITOR')] });
  const r1 = await FN().main({ action: 'merge' }, CTX('EDITOR'));
  assert.equal(r1.code, 400, '缺 fromCode/toCode');
  const r2 = await FN().main({ action: 'merge', fromCode: 'HAO-0000-01', toCode: 'HAO-0000-01' }, CTX('EDITOR'));
  assert.equal(r2.code, 400, '自合并拒绝');
  assert.ok(r2.message.includes('自身'), '提示不能合并到自身');
});

test('branch.merge：源分支有活跃子支 → 拒绝', async () => {
  seed({
    users: [USER('EDITOR')],
    branches: [
      { _id: 'b1', code: 'HAO-0000-01', name: '宋村一支', level: 2, status: 'ACTIVE', parentCode: 'HAO-0000' },
      { _id: 'b2', code: 'HAO-0000-01-01', name: '长房', level: 3, status: 'ACTIVE', parentCode: 'HAO-0000-01' },
      { _id: 'b3', code: 'HAO-0000-02', name: '南庄一支', level: 2, status: 'ACTIVE', parentCode: 'HAO-0000' }
    ]
  });
  const res = await FN().main({ action: 'merge', fromCode: 'HAO-0000-01', toCode: 'HAO-0000-02' }, CTX('EDITOR'));
  assert.equal(res.code, 400);
  assert.ok(res.message.includes('子分支'), '提示先处理子支');
});

test('branch.merge：目标层级更低 → 拒绝', async () => {
  seed({
    users: [USER('EDITOR')],
    branches: [
      { _id: 'b0', code: 'HAO-0000', name: '总谱', level: 1, status: 'ACTIVE', parentCode: null },
      { _id: 'b1', code: 'HAO-0000-01', name: '宋村一支', level: 2, status: 'ACTIVE', parentCode: 'HAO-0000' },
      { _id: 'b1b', code: 'HAO-0000-02', name: '南庄一支', level: 2, status: 'ACTIVE', parentCode: 'HAO-0000' },
      { _id: 'b2', code: 'HAO-0000-02-01', name: '东房', level: 3, status: 'ACTIVE', parentCode: 'HAO-0000-02' }
    ]
  });
  // 二级 → 三级（更低层级，且非源子支）拒绝
  const res = await FN().main({ action: 'merge', fromCode: 'HAO-0000-01', toCode: 'HAO-0000-02-01' }, CTX('EDITOR'));
  assert.equal(res.code, 400);
  assert.ok(res.message.includes('不能合并'), '层级校验提示');
});

test('branch.merge：成功合并（状态/mergedInto/成员迁移/审计）', async () => {
  seed({
    users: [USER('EDITOR')],
    branches: [
      { _id: 'b0', code: 'HAO-0000', name: '总谱', level: 1, status: 'ACTIVE', parentCode: null },
      { _id: 'b1', code: 'HAO-0000-01', name: '宋村一支', level: 2, status: 'ACTIVE', parentCode: 'HAO-0000' },
      { _id: 'b2', code: 'HAO-0000-02', name: '南庄一支', level: 2, status: 'ACTIVE', parentCode: 'HAO-0000' }
    ],
    members: [
      { _id: 'm1', openid: 'u-m1', branchId: 'HAO-0000-01', path: '/m1/g5' },
      { _id: 'm2', openid: 'u-m2', branchId: 'HAO-0000-01', path: '/m2/g6' }
    ]
  });
  const res = await FN().main({ action: 'merge', fromCode: 'HAO-0000-01', toCode: 'HAO-0000-02' }, CTX('EDITOR'));
  assert.equal(res.success, true);
  assert.equal(res.data.status, 'MERGED');
  assert.equal(res.data.toCode, 'HAO-0000-02');

  // 1. 源分支状态/mergedInto
  const col = globalThis.__HCS_STUB_SEED__.collections.branches;
  const from = col.find(b => b.code === 'HAO-0000-01');
  assert.equal(from.status, 'MERGED');
  assert.equal(from.mergedInto, 'HAO-0000-02');

  // 2. 成员迁移
  const mems = globalThis.__HCS_STUB_SEED__.collections.members;
  assert.equal(mems.filter(m => m.branchId === 'HAO-0000-01').length, 0, '源分支成员已迁出');
  assert.equal(mems.filter(m => m.branchId === 'HAO-0000-02').length, 2, '目标分支成员已迁入');

  // 3. 审计
  const audits = globalThis.__HCS_STUB_SEED__.collections.audit_logs;
  const audit = audits.find(a => a.action === 'branch.merge');
  assert.ok(audit, 'merge 审计有痕');
  assert.ok(audit.target.includes('HAO-0000-01'), '审计含源 code');
  assert.ok(audit.target.includes('HAO-0000-02'), '审计含目标 code');
});

test('branch.merge：重复合并（源已 MERGED）→ 400', async () => {
  seed({
    users: [USER('EDITOR')],
    branches: [
      { _id: 'b1', code: 'HAO-0000-01', name: '宋村一支', level: 2, status: 'MERGED', parentCode: 'HAO-0000', mergedInto: 'HAO-0000-02' },
      { _id: 'b2', code: 'HAO-0000-02', name: '南庄一支', level: 2, status: 'ACTIVE', parentCode: 'HAO-0000' }
    ]
  });
  const res = await FN().main({ action: 'merge', fromCode: 'HAO-0000-01', toCode: 'HAO-0000-02' }, CTX('EDITOR'));
  assert.equal(res.code, 400);
  assert.ok(res.message.includes('非 ACTIVE'), '重复合并拦截');
});

test('branch.stats：members 空集合 → totalPopulation=0', async () => {
  seed({
    users: [USER('EDITOR')],
    branches: [{ _id: 'b0', code: 'HAO-0000', name: '总谱', level: 1, status: 'ACTIVE', parentCode: null }]
  });
  const res = await FN().main({ action: 'stats' }, CTX('EDITOR'));
  assert.equal(res.success, true);
  assert.equal(res.data.totalActive, 1);
  assert.equal(res.data.totalPopulation, 0);
  assert.ok(!res.data.perBranch || res.data.perBranch.length === 0, '无人口分支不返回');
});

test('branch.stats：members ≤ PAGE_SIZE(100) → 一次拉完', async () => {
  const members = [];
  for (let i = 0; i < 50; i++) {
    members.push({ _id: `m${i}`, openid: `u-${i}`, branchId: 'HAO-0000-01', path: `/m${i}/g5` });
  }
  seed({
    users: [USER('EDITOR')],
    branches: [
      { _id: 'b0', code: 'HAO-0000', name: '总谱', level: 1, status: 'ACTIVE', parentCode: null },
      { _id: 'b1', code: 'HAO-0000-01', name: '宋村一支', level: 2, status: 'ACTIVE', parentCode: 'HAO-0000' }
    ],
    members
  });
  const res = await FN().main({ action: 'stats' }, CTX('EDITOR'));
  assert.equal(res.success, true);
  assert.equal(res.data.totalPopulation, 50);
  assert.equal(res.data.byLevel['2'].population, 50);
  assert.equal(res.data.perBranch.length, 1);
  assert.equal(res.data.perBranch[0].population, 50);
});

test('branch.stats：members > PAGE_SIZE → 多页聚合精确一致', async () => {
  const members = [];
  // 生成 150 成员：前 100 支 A，后 50 支 B
  for (let i = 0; i < 150; i++) {
    const bc = i < 100 ? 'HAO-0000-01' : 'HAO-0000-02';
    members.push({ _id: `m${i}`, openid: `u-${i}`, branchId: bc, path: `/m${i}/g5` });
  }
  seed({
    users: [USER('EDITOR')],
    branches: [
      { _id: 'b0', code: 'HAO-0000', name: '总谱', level: 1, status: 'ACTIVE', parentCode: null },
      { _id: 'b1', code: 'HAO-0000-01', name: '宋村一支', level: 2, status: 'ACTIVE', parentCode: 'HAO-0000' },
      { _id: 'b2', code: 'HAO-0000-02', name: '南庄一支', level: 2, status: 'ACTIVE', parentCode: 'HAO-0000' }
    ],
    members
  });
  const res = await FN().main({ action: 'stats' }, CTX('EDITOR'));
  assert.equal(res.success, true);
  assert.equal(res.data.totalPopulation, 150);
  assert.equal(res.data.byLevel['2'].population, 150);
  // perBranch 按人口降序：A(100), B(50)
  assert.equal(res.data.perBranch.length, 2);
  assert.equal(res.data.perBranch[0].code, 'HAO-0000-01');
  assert.equal(res.data.perBranch[0].population, 100);
  assert.equal(res.data.perBranch[1].code, 'HAO-0000-02');
  assert.equal(res.data.perBranch[1].population, 50);
  // 旧 truncated 字段应移除
  assert.equal(Object.hasOwn(res.data, 'truncated'), false, 'no truncated field in R28');
});

test('branch.import：MEMBER → 403（鉴权先行）', async () => {
  seed({ users: [USER('MEMBER')] });
  const res = await FN().main({ action: 'import', rows: [{ name: '测试支谱', level: 3, parentCode: 'HAO-0000-01' }] }, CTX('MEMBER'));
  assert.equal(res.code, 403);
});

test('branch.import：超过 100 行 → 400', async () => {
  seed({ users: [USER('EDITOR')] });
  const rows = Array.from({ length: 101 }, (_, i) => ({ name: `Row${i}`, level: 2 }));
  const res = await FN().main({ action: 'import', rows }, CTX('EDITOR'));
  assert.equal(res.code, 400);
  assert.ok(res.message.includes('100 行'), '行数提示');
});

test('branch.import：空 rows → 400', async () => {
  seed({ users: [USER('EDITOR')] });
  const res = await FN().main({ action: 'import' }, CTX('EDITOR'));
  assert.equal(res.code, 400);
});

test('branch.import：全部成功（批量创建）', async () => {
  seed({
    users: [USER('EDITOR')],
    branches: [{ _id: 'b0', code: 'HAO-0000', name: '总谱', level: 1, status: 'ACTIVE', parentCode: null }]
  });
  const rows = [
    { name: '宋村二支', level: 2, region: '河北省石家庄市赵县宋村' },
    { name: '南庄一支', level: 2, region: '河北省石家庄市赵县南庄' }
  ];
  const res = await FN().main({ action: 'import', rows }, CTX('EDITOR'));
  assert.equal(res.success, true);
  assert.equal(res.data.success.length, 2, '成功数');
  assert.equal(res.data.failed.length, 0, '无失败');
  // HAO-0000-01, HAO-0000-02 自动生成
  assert.equal(res.data.success[0].code, 'HAO-0000-01');
  assert.equal(res.data.success[1].code, 'HAO-0000-02');
  
  // 审计
  const audits = globalThis.__HCS_STUB_SEED__.collections.audit_logs;
  const audit = audits.find(a => a.action === 'branch.import');
  assert.ok(audit, 'import 审计有痕');
});

test('branch.import：部分失败（含重名/层级错误）', async () => {
  seed({
    users: [USER('EDITOR')],
    branches: [
      { _id: 'b0', code: 'HAO-0000', name: '总谱', level: 1, status: 'ACTIVE', parentCode: null },
      { _id: 'b1', code: 'HAO-0000-01', name: '宋村一支', level: 2, status: 'ACTIVE', parentCode: 'HAO-0000' }
    ]
  });
  const rows = [
    { name: '宋村二支', level: 2, region: '河北' }, // OK
    { name: '宋村一支', level: 2, region: '河北' }, // 重名 → 失败
    { name: '长房', level: 3, parentCode: 'HAO-0000', region: '河北' } // 父级层级不匹配 → 失败
  ];
  const res = await FN().main({ action: 'import', rows }, CTX('EDITOR'));
  assert.equal(res.success, true);
  assert.equal(res.data.success.length, 1, '仅第一行成功');
  assert.equal(res.data.failed.length, 2, '两行失败');
  assert.ok(res.data.failed.some(f => f.reason.includes('already exists')), '重名失败');
  assert.ok(res.data.failed.some(f => f.reason.includes('parent')), '父级层级失败');
});

test('branch.archive：缺 code → 400', async () => {
  seed({ users: [USER('EDITOR')] });
  const res = await FN().main({ action: 'archive' }, CTX('EDITOR'));
  assert.equal(res.code, 400);
});
