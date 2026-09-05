/**
 * scripts/migrate-paths.js
 * 存量 members 物化路径回填（Sprint R3）
 *
 * 算法在 cloud/functions/common/tree.js rebuildPaths（纯函数，已单测）。
 * 三种模式：
 *   --demo  内置样例数据验证算法输出（沙箱可用，零依赖）
 *   --dry-run  连云数据库读 members+relations，打印回填计划（默认行为，不写库）
 *   --apply    连云执行批量写入（部署环境跑，需人工确认 conflicts=0）
 *
 * 用法：
 *   node scripts/migrate-paths.js --demo
 *   node scripts/migrate-paths.js            # = --dry-run
 *   node scripts/migrate-paths.js --apply
 */
const path = require('path');

const tree = require(path.join(__dirname, '..', 'cloud', 'functions', 'common', 'tree'));

// ─── demo：内置三代样例（对应赵县郝一支） ───
function demo() {
  const members = [
    { _id: 'm1', memberNo: '1', genealogyName: '郝始祖' },
    { _id: 'm2', memberNo: '1', genealogyName: '郝二世长' },
    { _id: 'm3', memberNo: '2', genealogyName: '郝二世次' },
    { _id: 'm4', memberNo: '1', genealogyName: '郝三世甲' },
    { _id: 'm5', memberNo: '2', genealogyName: '郝三世乙' },
    { _id: 'm6', memberNo: '1', genealogyName: '郝四世子' }
  ];
  // 方向：childId <- parentId（ relations.fromId=子 toId=父 的口径在脚本内转换）
  const edges = [
    { childId: 'm2', parentId: 'm1' },
    { childId: 'm3', parentId: 'm1' },
    { childId: 'm4', parentId: 'm2' },
    { childId: 'm5', parentId: 'm2' },
    { childId: 'm6', parentId: 'm4' }
  ];
  const { patches, conflicts, roots } = tree.rebuildPaths(members, edges);
  console.log('── demo 回填计划 ──');
  patches.forEach(p => console.log(`  ${p._id} ${members.find(m => m._id === p._id).genealogyName} → ${p.path}`));
  console.log(`roots: ${roots.join(',')}  conflicts: ${conflicts.length}`);
  conflicts.forEach(c => console.log(`  [conflict] ${c}`));
  // 断言预期（demo 即算法回归）
  const expect = { m1: '/001/', m2: '/001/001/', m3: '/001/002/', m4: '/001/001/001/', m5: '/001/001/002/', m6: '/001/001/001/001/' };
  const bad = patches.filter(p => expect[p._id] !== p.path);
  if (bad.length || conflicts.length) {
    console.log('❌ demo 断言失败', bad);
    process.exit(1);
  }
  console.log('✅ demo 通过：6/6 path 与预期一致');
}

// ─── 连云模式 ───
async function cloudRun(apply) {
  let wx;
  try {
    wx = require('wx-server-sdk');
  } catch {
    console.error('连云模式需要 wx-server-sdk（部署环境运行，沙箱请用 --demo）');
    process.exit(2);
  }
  wx.init({ env: wx.DYNAMIC_CURRENT_ENV });
  const db = wx.getDatabase();

  const membersRes = await db.collection('members').limit(1000).get();
  const relationsRes = await db.collection('relations').where({ type: 'PARENT_CHILD', status: 'ACTIVE' }).limit(2000).get();

  // relations 方向适配：fromId=子 toId=父（entry 草稿口径）；如实际相反请人工核对
  const edges = relationsRes.data
    .map(r => ({ childId: r.fromId, parentId: r.toId }))
    .filter(e => e.childId !== e.parentId);

  const { patches, conflicts, roots } = tree.rebuildPaths(membersRes.data, edges);

  console.log(`members=${membersRes.data.length} edges=${edges.length} roots=${roots.length} patches=${patches.length} conflicts=${conflicts.length}`);
  conflicts.forEach(c => console.log(`  [conflict] ${c}`));

  if (conflicts.length) {
    console.log('❌ 存在冲突，禁止写入；请先人工修正 relations 数据');
    process.exit(1);
  }
  if (!apply) {
    console.log('── dry-run 计划（前 20 条） ──');
    patches.slice(0, 20).forEach(p => console.log(`  ${p._id} → ${p.path}`));
    console.log('✅ dry-run 完成。确认无误后加 --apply 执行写入');
    return;
  }

  // apply：逐条 update（云数据库单批 100 上限，分批）
  let done = 0;
  for (let i = 0; i < patches.length; i += 100) {
    const batch = patches.slice(i, i + 100);
    await Promise.all(batch.map(p =>
      db.collection('members').doc(p._id).update({ data: { path: p.path, pathMigratedAt: new Date() } })
    ));
    done += batch.length;
    console.log(`  已写入 ${done}/${patches.length}`);
  }
  console.log(`✅ 回填完成：${done} 条 path 已写入 members`);
}

// ─── main ───
const mode = process.argv[2] || '--dry-run';
if (mode === '--demo') demo();
else cloudRun(mode === '--apply').catch(e => { console.error('失败:', e.message); process.exit(1); });
