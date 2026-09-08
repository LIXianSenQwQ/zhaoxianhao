/**
 * scripts/demo-verse-entry.js
 * 字辈诗录入预览脚本（R27 演示）
 *
 * 目的：向族史委/开发团队演示「字辈诗 → branch.update → detail/stats 刷新」全链路。
 * 运行：node scripts/demo-verse-entry.js
 * 依赖：wx-server-sdk-stub（本地 mock，不触真实云环境）
 *
 * 演示流程：
 *   1. seed 总谱 HAO-0000 + 宋村一支 HAO-0000-01（EDITOR 权限）
 *   2. detail 读取 before 状态（generationVerses 空）
 *   3. update 写入字辈诗草稿（模拟支长原文）
 *   4. detail 读取 after 状态（generationVerses 已落库）
 *   5. stats 验证人口聚合与分支计数
 *   6. 审计断言（branch.update 有痕）
 */

const path = require('path');
const Module = require('module');

// ─── 1. 挂 stub（wx-server-sdk → 本地替身） ───
const stubPath = require.resolve('./wx-server-sdk-stub.js');
if (!Module._resolveFilename.__hcsDemoPatched) {
  const orig = Module._resolveFilename;
  Module._resolveFilename = function (request, ...rest) {
    if (request === 'wx-server-sdk') return stubPath;
    return orig.call(this, request, ...rest);
  };
  Module._resolveFilename.__hcsDemoPatched = true;
}

// ─── 2. 演示数据（模拟支长提交的字辈诗原文） ───
const DEMO_VERSE = '国正天心顺，官清民自安；坤贤乾德少，子孝父恩宽。';
const DEMO_DESCRIPTION = '宋村一支，明初自山西洪洞迁居赵县宋村，为本支开基祖讳郝兴后裔。';

// ─── 3. seed 数据 ───
globalThis.__HCS_STUB_SEED__ = {
  collections: {
    users: [
      { _id: 'u-editor', openid: 'u-editor', role: 'EDITOR', name: '族史委编辑（演示）' }
    ],
    branches: [
      {
        _id: 'b-root', code: 'HAO-0000', name: '郝氏总谱', level: 1,
        parentCode: null, region: '河北省石家庄市赵县', population: 0,
        description: '全族总谱（根节点）', generationVerses: '', status: 'ACTIVE'
      },
      {
        _id: 'b-songcun', code: 'HAO-0000-01', name: '宋村一支', level: 2,
        parentCode: 'HAO-0000', region: '河北省石家庄市赵县宋村', population: 0,
        description: '', generationVerses: '', status: 'ACTIVE'
      }
    ],
    members: [
      { _id: 'm1', openid: 'u-m1', branchId: 'HAO-0000-01', path: '/m1/g5' },
      { _id: 'm2', openid: 'u-m2', branchId: 'HAO-0000-01', path: '/m2/g6' },
      { _id: 'm3', openid: 'u-m3', branchId: 'HAO-0000-01', path: '/m3/g7' }
    ],
    audit_logs: []
  },
  seq: 0
};

// ─── 4. 调用 branch 云函数全链路 ───
const FN = require(path.join('..', 'cloud', 'functions', 'branch', 'index.js'));
const CTX = { OPENID: 'u-editor', openid: 'u-editor' };

const banner = (title) => console.log(`\n━━━ ${title} ━━━`);

(async () => {
  banner('【1】detail 读取 before 状态（字辈诗应为空）');
  const before = await FN.main({ action: 'detail', code: 'HAO-0000-01' }, CTX);
  console.log('  code       :', before.data.code);
  console.log('  name       :', before.data.name);
  console.log('  generationVerses :', JSON.stringify(before.data.generationVerses), '  ← 空，待录入');
  console.log('  population :', before.data.population);

  banner('【2】update 写入字辈诗（模拟支长原文 + EDITOR 门禁通过）');
  const upd = await FN.main({
    action: 'update',
    code: 'HAO-0000-01',
    generationVerses: DEMO_VERSE,
    description: DEMO_DESCRIPTION
  }, CTX);
  console.log('  调用结果    :', upd.success ? '✅ 成功' : `❌ ${upd.message}`);
  console.log('  落库字段    :', Object.keys(upd).filter(k => !['success', 'message'].includes(k)).join(', '));

  banner('【3】detail 读取 after 状态（字辈诗已落库）');
  const after = await FN.main({ action: 'detail', code: 'HAO-0000-01' }, CTX);
  console.log('  generationVerses :');
  console.log('    ┌─────────────────────────────────────');
  after.data.generationVerses.split(/[；;]/).forEach(line => console.log(`    │ ${line.trim()}`));
  console.log('    └─────────────────────────────────────');
  console.log('  description :', after.data.description);
  console.log('  updatedAt   :', after.data.updatedAt ? '✅ 已记录' : '❌ 缺失');
  console.log('  updatedBy   :', after.data.updatedBy);

  banner('【4】stats 验证（人口聚合 + 分支计数）');
  const st = await FN.main({ action: 'stats' }, CTX);
  console.log('  totalActive     :', st.data.totalActive, '(总谱+宋村一支)');
  console.log('  totalPopulation :', st.data.totalPopulation, '(members 计数)');
  console.log('  byLevel         :', JSON.stringify(st.data.byLevel));
  console.log('  perBranch       :');
  st.data.perBranch.forEach(p => console.log(`    · ${p.code} ${p.name} → ${p.population} 人`));

  banner('【5】审计验证（branch.update 有痕）');
  const audits = globalThis.__HCS_STUB_SEED__.collections.audit_logs
    .filter(a => a.action === 'branch.update');
  console.log('  branch.update 审计条数 :', audits.length, audits.length > 0 ? '✅' : '❌');
  audits.forEach(a => {
    console.log(`    · userId=${a.userId} target=${a.target} detail=${a.detail}`);
  });

  banner('【6】权限反例：MEMBER 尝试 update → 403');
  globalThis.__HCS_STUB_SEED__.collections.users.push({ _id: 'u-member', openid: 'u-member', role: 'MEMBER' });
  const denied = await FN.main({ action: 'update', code: 'HAO-0000-01', generationVerses: '越权' }, { OPENID: 'u-member', openid: 'u-member' });
  console.log('  MEMBER 调用结果 :', denied.code === 403 ? '✅ 403 拒绝（门禁生效）' : `❌ 异常 ${denied.code}`);

  banner('演示完成 ✅');
  console.log('\n真实录入流程（管理端）:');
  console.log('  1. 微信开发者工具 → 分支谱系页 (pkg-family/pages/branches/branches)');
  console.log('  2. 展开任意分谱/支谱 → 点「编辑」按钮');
  console.log('  3. 填写字辈诗 textarea（≤500） → 点「保存」');
  console.log('  4. 页面自动刷新 detailMap + stats，字辈诗与人口同步更新\n');
})().catch(e => {
  console.error('演示失败:', e.message);
  process.exit(1);
});
