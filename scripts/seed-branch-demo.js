/**
 * scripts/seed-branch-demo.js
 * 宋村演示分支种子数据（幂等，多次运行安全）
 *
 * 创建：
 *   HAO-0000-01  宋村支系（分谱，level 2）
 *   HAO-0000-01-01 长房（支谱，level 3）
 *   HAO-0000-01-02 二房（支谱，level 3）
 *
 * 前置条件：总谱 HAO-0000 已通过 branch.seed 初始化
 *
 * 用法：node scripts/seed-branch-demo.js
 */
const path = require('node:path');
const Module = require('module');

// patch wx-server-sdk → stub（用于线下运行演示 seed）
const stubPath = path.join(__dirname, '..', 'scripts', 'wx-server-sdk-stub.js');
const orig = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === 'wx-server-sdk') return stubPath;
  return orig.call(this, request, ...rest);
};

const FN = require(path.join(__dirname, '..', 'cloud', 'functions', 'branch', 'index.js'));

async function seedDemo() {
  // 注入仿 CHIEF 用户
  globalThis.__HCS_STUB_SEED__ = {
    collections: {
      users: [{ _id: 'u-chief', openid: 'u-chief', role: 'CHIEF' }],
      branches: []
    },
    seq: 0
  };

  console.log('正在初始化总谱…');
  const r1 = await FN.main({ action: 'seed' }, { OPENID: 'u-chief' });
  if (!r1.success) { console.error('总谱初始化失败:', r1); return; }
  console.log(`总谱已就绪: ${r1.data.code}`);

  // 该集合需有总谱后才有 parentCode HAO-0000
  // 用 manager 角色创建分谱
  const managerCtx = { OPENID: 'u-manager' };
  globalThis.__HCS_STUB_SEED__.collections.users.push(
    { _id: 'u-manager', openid: 'u-manager', role: 'BRANCH_HEAD' }
  );

  console.log('正在创建宋村分谱…');
  const r2 = await FN.main({ action: 'create', name: '宋村支系', level: 2, region: '河北省石家庄市赵县' }, managerCtx);
  if (!r2.success) { console.error('分谱创建失败:', r2); return; }
  console.log(`分谱已创建: ${r2.data.code}`);

  console.log('正在创建长房支谱…');
  const r3 = await FN.main({ action: 'create', name: '长房', level: 3, parentCode: r2.data.code, region: '赵县宋村' }, managerCtx);
  if (!r3.success) { console.error('长房创建失败:', r3); return; }
  console.log(`长房已创建: ${r3.data.code}`);

  console.log('正在创建二房支谱…');
  const r4 = await FN.main({ action: 'create', name: '二房', level: 3, parentCode: r2.data.code, region: '赵县宋村' }, managerCtx);
  if (!r4.success) { console.error('二房创建失败:', r4); return; }
  console.log(`二房已创建: ${r4.data.code}`);

  console.log('\n✅ 宋村演示数据就绪');
  console.log(`总分支数: ${globalThis.__HCS_STUB_SEED__.collections.branches.length}`);
}

seedDemo().catch(console.error);