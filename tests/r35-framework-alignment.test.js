/**
 * tests/r35-framework-alignment.test.js
 * V2.0 框架对齐专项测试 — generation.alignCheck / branch.merge mergeReport
 *
 * 对应框架条款：
 *   §5.1 字辈对齐（谱名字辈字与总谱字辈表实时校验）
 *   §5.3 合并冲突处理（四维匹配 → 冲突标记 → 合并报告）
 *
 * 运行：npm test -- tests/r35-framework-alignment.test.js（或并入全量 npm test）
 */
const { test } = require('node:test');
const assert = require('node:assert');
const Module = require('module');
const path = require('node:path');

// ─── stub 注入（与 smoke-functions.test.js 同口径，一次即可） ───
const stubPath = require.resolve('../scripts/wx-server-sdk-stub.js');
if (!Module._resolveFilename.__hcsPatchedR35) {
  const orig = Module._resolveFilename;
  Module._resolveFilename = function (request, ...rest) {
    if (request === 'wx-server-sdk') return stubPath;
    return orig.call(this, request, ...rest);
  };
  Module._resolveFilename.__hcsPatchedR35 = true;
}

const FN = (name) => require(path.join('..', 'cloud', 'functions', name, 'index.js'));
const CTX = (role) => ({ OPENID: `u-${role.toLowerCase()}`, openid: `u-${role.toLowerCase()}`, role });

function seed({ users = [], branches = [], members = [], settings = [], generations = [], entry_records = [], audit_logs = [], notifications = [] } = {}) {
  globalThis.__HCS_STUB_SEED__ = {
    collections: { users, branches, members, settings, generations, entry_records, audit_logs, notifications },
    seq: 0
  };
}

// ─────────────────────────────────────────────────────────────
// generation.alignCheck（framework §5.1 字辈对齐）
// ─────────────────────────────────────────────────────────────

test('alignCheck：对齐 → aligned=true（expectedChar/actualChar 一致）', async () => {
  seed({
    users: [{ openid: 'u-member', role: 'MEMBER' }],
    settings: [{ _id: 's-gen', key: 'generation_chars', value: ['德', '光', '甲', '守', '业'] }]
  });
  const res = await FN('generation').main(
    { action: 'alignCheck', generation: 1, genealogyName: '郝德明', surname: '郝', generationChar: '德' },
    CTX('MEMBER')
  );
  assert.equal(res.success, true);
  assert.equal(res.data.aligned, true);
  assert.equal(res.data.expectedChar, '德');
  assert.equal(res.data.actualChar, '德');
  assert.equal(res.data.beyondPoem, false);
});

test('alignCheck：不对齐 → aligned=false（第2世应为「光」）', async () => {
  seed({
    users: [{ openid: 'u-member', role: 'MEMBER' }],
    settings: [{ _id: 's-gen', key: 'generation_chars', value: ['德', '光', '甲'] }]
  });
  const res = await FN('generation').main(
    { action: 'alignCheck', generation: 2, genealogyName: '郝德明', generationChar: '德' },
    CTX('MEMBER')
  );
  assert.equal(res.success, true);
  assert.equal(res.data.aligned, false);
  assert.equal(res.data.expectedChar, '光');
  assert.equal(res.data.actualChar, '德');
});

test('alignCheck：从谱名自动解析字辈字（不传 generationChar）', async () => {
  seed({
    users: [{ openid: 'u-member', role: 'MEMBER' }],
    settings: [{ _id: 's-gen', key: 'generation_chars', value: ['德', '光', '甲'] }]
  });
  const res = await FN('generation').main(
    { action: 'alignCheck', generation: 2, genealogyName: '郝光德', surname: '郝' },
    CTX('MEMBER')
  );
  assert.equal(res.success, true);
  assert.equal(res.data.actualChar, '光', '应从谱名去姓后取首字');
  assert.equal(res.data.aligned, true);
});

test('alignCheck：超出字辈表 → beyondPoem=true + aligned=null + 续拟提示', async () => {
  seed({
    users: [{ openid: 'u-member', role: 'MEMBER' }],
    settings: [{ _id: 's-gen', key: 'generation_chars', value: ['德', '光', '甲'] }]
  });
  const res = await FN('generation').main(
    { action: 'alignCheck', generation: 9, genealogyName: '郝某', surname: '郝' },
    CTX('MEMBER')
  );
  assert.equal(res.success, true);
  assert.equal(res.data.beyondPoem, true);
  assert.equal(res.data.expectedChar, null);
  assert.equal(res.data.aligned, null);
  assert.ok(String(res.data.note).includes('续拟'), '应提示走族议会续拟流程');
});

test('alignCheck：VISITOR → 403；缺 generation → 400', async () => {
  seed({
    users: [
      { openid: 'u-visitor', role: 'VISITOR' },
      { openid: 'u-member', role: 'MEMBER' }
    ],
    settings: [{ _id: 's-gen', key: 'generation_chars', value: ['德'] }]
  });
  const denied = await FN('generation').main(
    { action: 'alignCheck', generation: 1, generationChar: '德' },
    CTX('VISITOR')
  );
  assert.equal(denied.code, 403);

  const bad = await FN('generation').main(
    { action: 'alignCheck', generationChar: '德' },
    CTX('MEMBER')
  );
  assert.equal(bad.code, 400);
});

// ─────────────────────────────────────────────────────────────
// branch.merge mergeReport（framework §5.3 四维匹配 + 合并报告）
// 四维：genealogyName + generation + 父路径 + 生年
// ─────────────────────────────────────────────────────────────

test('merge：四维命中 → 父子重复组均检出（父+子各 1 条）', async () => {
  seed({
    users: [{ openid: 'u-editor', role: 'EDITOR' }],
    branches: [
      { _id: 'b1', code: 'HAO-0000-01', name: '源支', level: 2, status: 'ACTIVE', parentCode: 'HAO-0000' },
      { _id: 'b2', code: 'HAO-0000-02', name: '目标支', level: 2, status: 'ACTIVE', parentCode: 'HAO-0000' }
    ],
    members: [
      // 父成员：两分支同谱名同世代且同为根 → 也构成重复（父子重复组）
      { _id: 'm0a', genealogyName: '郝德祖', generation: 17, branchId: 'HAO-0000-01', path: '/001/' },
      { _id: 'm0b', genealogyName: '郝德祖', generation: 17, branchId: 'HAO-0000-02', path: '/002/' },
      // 源分支：与目标分支 m3 四维全同（谱名/世代/父谱名/生年）→ 命中
      { _id: 'm1', genealogyName: '郝德生', generation: 18, branchId: 'HAO-0000-01', path: '/001/005/', lifespan: { birth: '1680-05-01' } },
      // 源分支：不命中（目标分支无同四维者）
      { _id: 'm2', genealogyName: '郝德成', generation: 19, branchId: 'HAO-0000-01', path: '/001/006/', lifespan: { birth: '1710-01-01' } },
      // 目标分支
      { _id: 'm3', genealogyName: '郝德生', generation: 18, branchId: 'HAO-0000-02', path: '/002/007/', lifespan: { birth: '1680-05-01' } }
    ]
  });
  const res = await FN('branch').main({ action: 'merge', fromCode: 'HAO-0000-01', toCode: 'HAO-0000-02' }, CTX('EDITOR'));
  assert.equal(res.success, true);
  assert.ok(res.data.mergeReport, '应返回 mergeReport');
  assert.equal(res.data.mergeReport.scannedFrom, 3);
  assert.equal(res.data.mergeReport.scannedTo, 2);
  assert.equal(res.data.mergeReport.conflictCount, 2, '父(郝德祖)+子(郝德生)重复组均应检出');
  const names = res.data.mergeReport.conflicts.map(c => c.genealogyName).sort();
  assert.deepEqual(names, ['郝德生', '郝德祖']);
});

test('merge：无重复 → conflictCount=0；成员迁移与审计正常', async () => {
  seed({
    users: [{ openid: 'u-editor', role: 'EDITOR' }],
    branches: [
      { _id: 'b1', code: 'HAO-0000-01', name: '源支', level: 2, status: 'ACTIVE', parentCode: 'HAO-0000' },
      { _id: 'b2', code: 'HAO-0000-02', name: '目标支', level: 2, status: 'ACTIVE', parentCode: 'HAO-0000' }
    ],
    members: [
      { _id: 'm1', genealogyName: '郝德生', generation: 18, branchId: 'HAO-0000-01', path: '/001/005/', lifespan: { birth: '1680-05-01' } }
    ]
  });
  const res = await FN('branch').main({ action: 'merge', fromCode: 'HAO-0000-01', toCode: 'HAO-0000-02' }, CTX('EDITOR'));
  assert.equal(res.success, true);
  assert.equal(res.data.mergeReport.conflictCount, 0);
  assert.equal(res.data.mergeReport.strategy, 'keep_both_source_tags_pending_review');

  // 成员迁移
  const mems = globalThis.__HCS_STUB_SEED__.collections.members;
  assert.equal(mems.find(m => m._id === 'm1').branchId, 'HAO-0000-02', '成员已迁入目标分支');

  // 审计含 conflictCount
  const audit = globalThis.__HCS_STUB_SEED__.collections.audit_logs.find(a => a.action === 'branch.merge');
  assert.ok(audit, 'merge 审计有痕');
  assert.ok(String(audit.detail).includes('conflictCount=0'));
});

test('merge：目标分支多条同四维成员 → matchedCount 聚合为目标侧计数', async () => {
  seed({
    users: [{ openid: 'u-editor', role: 'EDITOR' }],
    branches: [
      { _id: 'b1', code: 'HAO-0000-01', name: '源支', level: 2, status: 'ACTIVE', parentCode: 'HAO-0000' },
      { _id: 'b2', code: 'HAO-0000-02', name: '目标支', level: 2, status: 'ACTIVE', parentCode: 'HAO-0000' }
    ],
    members: [
      { _id: 'm0a', genealogyName: '郝德祖', generation: 17, branchId: 'HAO-0000-01', path: '/001/' },
      { _id: 'm0b', genealogyName: '郝德祖', generation: 17, branchId: 'HAO-0000-02', path: '/002/' },
      // 源 1 条郝德生，目标 2 条同四维 → matchedCount=2
      { _id: 'm1', genealogyName: '郝德生', generation: 18, branchId: 'HAO-0000-01', path: '/001/005/', lifespan: { birth: '1680-05-01' } },
      { _id: 'm3', genealogyName: '郝德生', generation: 18, branchId: 'HAO-0000-02', path: '/002/007/', lifespan: { birth: '1680-05-01' } },
      { _id: 'm4', genealogyName: '郝德生', generation: 18, branchId: 'HAO-0000-02', path: '/002/008/', lifespan: { birth: '1680-05-01' } }
    ]
  });
  const res = await FN('branch').main({ action: 'merge', fromCode: 'HAO-0000-01', toCode: 'HAO-0000-02' }, CTX('EDITOR'));
  assert.equal(res.success, true);
  assert.equal(res.data.mergeReport.scannedFrom, 2);
  assert.equal(res.data.mergeReport.scannedTo, 3);
  assert.equal(res.data.mergeReport.conflictCount, 2, '父+子重复组');
  const c = res.data.mergeReport.conflicts.find(x => x.genealogyName === '郝德生');
  assert.ok(c, '郝德生应有冲突项');
  assert.equal(c.matchedCount, 2, 'matchedCount 应聚合目标侧同键成员数');
});

test('merge：EDITOR 门禁（MEMBER → 403）与四维键容错（缺 genealogyName/lifespan 不误报）', async () => {
  seed({
    users: [
      { openid: 'u-member', role: 'MEMBER' },
      { openid: 'u-editor', role: 'EDITOR' }
    ],
    branches: [
      { _id: 'b1', code: 'HAO-0000-01', name: '源支', level: 2, status: 'ACTIVE', parentCode: 'HAO-0000' },
      { _id: 'b2', code: 'HAO-0000-02', name: '目标支', level: 2, status: 'ACTIVE', parentCode: 'HAO-0000' }
    ],
    members: [
      // 旧数据无 genealogyName/lifespan（如 branch.test.js 种子形态）→ 不应误报冲突
      { _id: 'm1', openid: 'u-m1', branchId: 'HAO-0000-01', path: '/m1/g5' },
      { _id: 'm2', openid: 'u-m2', branchId: 'HAO-0000-02', path: '/m2/g6' }
    ]
  });
  const denied = await FN('branch').main({ action: 'merge', fromCode: 'HAO-0000-01', toCode: 'HAO-0000-02' }, CTX('MEMBER'));
  assert.equal(denied.code, 403);

  const res = await FN('branch').main({ action: 'merge', fromCode: 'HAO-0000-01', toCode: 'HAO-0000-02' }, CTX('EDITOR'));
  assert.equal(res.success, true);
  assert.equal(res.data.mergeReport.conflictCount, 0, '缺维度字段的旧数据不应误报');
});

// ─────────────────────────────────────────────────────────────
// entry.submit entryKind（framework §4.5 入谱类型：新生儿/迁入/过继/归宗）
// ─────────────────────────────────────────────────────────────

const ENTRY_MEMBER_SEED = () => ({
  users: [
    { openid: 'u-member', role: 'MEMBER' },
    { openid: 'u-visitor', role: 'VISITOR' },
    { openid: 'u-bh', role: 'BRANCH_HEAD' },
    { openid: 'u-h', role: 'HISTORIAN' }
  ],
  generations: [],
  members: []
});

test('entryKind：不传 → 默认 NEWBORN（向后兼容现有 MANUAL/OCR/EXCEL 提交）', async () => {
  seed(ENTRY_MEMBER_SEED());
  const res = await FN('entry').main(
    { action: 'submit', type: 'MANUAL', payload: { name: '小明', generation: 19, branchId: 'HAO-冀-赵县-宋村-001' } },
    CTX('MEMBER')
  );
  assert.equal(res.success, true, `默认应成功: ${res.message || ''}`);
  const rec = globalThis.__HCS_STUB_SEED__.collections.entry_records[0];
  assert.equal(rec.entryKind, 'NEWBORN');
  assert.equal(rec.payload.entryKind, 'NEWBORN');
});

test('entryKind：MIGRATION_IN 缺 sourceBranchCode → 400', async () => {
  seed(ENTRY_MEMBER_SEED());
  const res = await FN('entry').main(
    { action: 'submit', type: 'MANUAL', payload: { name: '小迁', generation: 19, branchId: 'HAO-0000-02', entryKind: 'MIGRATION_IN', proofSourceTag: '东汪郝氏谱·卷一' } },
    CTX('MEMBER')
  );
  assert.equal(res.code, 400);
  assert.ok(String(res.message).includes('sourceBranchCode'), '应提示缺原分支编码');
});

test('entryKind：MIGRATION_IN 证明齐全 → 成功且工单携带 kind+证明字段', async () => {
  seed(ENTRY_MEMBER_SEED());
  const res = await FN('entry').main(
    { action: 'submit', type: 'MANUAL', payload: {
      name: '小迁', generation: 19, branchId: 'HAO-0000-02',
      entryKind: 'MIGRATION_IN', sourceBranchCode: 'HAO-冀-赵县-宋村-001', proofSourceTag: '东汪郝氏谱·卷一·迁出记'
    } },
    CTX('MEMBER')
  );
  assert.equal(res.success, true, `应成功: ${res.message || ''}`);
  const rec = globalThis.__HCS_STUB_SEED__.collections.entry_records[0];
  assert.equal(rec.entryKind, 'MIGRATION_IN');
  assert.equal(rec.payload.sourceBranchCode, 'HAO-冀-赵县-宋村-001');
  assert.equal(rec.payload.proofSourceTag, '东汪郝氏谱·卷一·迁出记');
});

test('entryKind：ADOPTION 缺 proofSourceTag → 400；RETURN 齐全 → 成功', async () => {
  seed(ENTRY_MEMBER_SEED());
  const badAdoption = await FN('entry').main(
    { action: 'submit', type: 'MANUAL', payload: { name: '小继', generation: 20, branchId: 'HAO-0000-01', entryKind: 'ADOPTION' } },
    CTX('MEMBER')
  );
  assert.equal(badAdoption.code, 400);
  assert.ok(String(badAdoption.message).includes('proofSourceTag'));

  const ret = await FN('entry').main(
    { action: 'submit', type: 'MANUAL', payload: { name: '小归', generation: 20, branchId: 'HAO-0000-01', entryKind: 'RETURN', proofSourceTag: '族老口述·1948年离乡记' } },
    CTX('MEMBER')
  );
  assert.equal(ret.success, true, `RETURN 应成功: ${ret.message || ''}`);
  const rec = globalThis.__HCS_STUB_SEED__.collections.entry_records.find(r => r.payload.name === '小归');
  assert.equal(rec.entryKind, 'RETURN');
});

test('entryKind：非法值 → 400', async () => {
  seed(ENTRY_MEMBER_SEED());
  const res = await FN('entry').main(
    { action: 'submit', type: 'MANUAL', payload: { name: '小妖', generation: 19, branchId: 'HAO-0000-01', entryKind: 'HACK' } },
    CTX('MEMBER')
  );
  assert.equal(res.code, 400);
  assert.ok(String(res.message).includes('entryKind'));
});

test('entryKind：VISITOR 提交 MIGRATION_IN 缺证明 → 403（鉴权先行，不暴露证明细节）', async () => {
  seed(ENTRY_MEMBER_SEED());
  const res = await FN('entry').main(
    { action: 'submit', type: 'MANUAL', payload: { name: '小未', generation: 19, branchId: 'HAO-0000-01', entryKind: 'MIGRATION_IN' } },
    CTX('VISITOR')
  );
  assert.equal(res.code, 403, '鉴权先于证明材料校验');
  assert.ok(!String(res.message || '').includes('证明'), '证明细节不暴露给未授权者');
});
