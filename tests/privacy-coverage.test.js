/**
 * tests/privacy-coverage.test.js — §7.4 隐私校验动作覆盖审计（蓝图第三部分）
 * 
 * 目的：审计每个云函数是否在其公开（user-facing）写操作中使用了
 *       common/privacy.js 的 privacyCheck（L 级）或 visibilityCheck（三级可见）。
 * 
 * 规则：
 * - 用户写操作（members.update、entry_records.*、albums.* 等）应有 privacy 调用
 * - 服务端内部操作（定时器、admin 管理后台）可豁免（已有 ROLE 门禁）
 * - 公共内容（plaza_posts、contents）藉 storage role 和 privacyDefault 管理，免逐 action 调用
 * 
 * 本测试为 📋 审计模式，输出发现但不阻断门禁（errors=0）。
 */
const { test } = require('node:test');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.resolve(__dirname, '..');
const CLOUD_DIR = path.join(ROOT, 'cloud', 'functions');

// 需豁免的云函数（服务端内部执行）
const EXEMPT_FUNCS = new Set(['admin', 'ceremony', 'ci', 'weather', 'news']);

// 隐私关键集合：修改操作必须有 privacyCheck 或 visibilityCheck
const PRIVACY_COLLECTIONS = [
  { collection: 'members', ops: ['update', 'add', 'delete'], check: 'privacyCheck', reason: '用户信息 L 级隐私' },
  { collection: 'entry_records', ops: ['update', 'add'], check: 'privacyCheck', reason: '入谱记录' },
  { collection: 'albums', ops: ['add', 'update', 'delete'], check: 'visibilityCheck', reason: '相册三级可见' },
  { collection: 'profiles', ops: ['add', 'update'], check: 'visibilityCheck', reason: '个人资料' },
  { collection: 'avatars', ops: ['add', 'update'], check: 'visibilityCheck', reason: '头像' },
];

/**
 * 扫描云函数文件，获取安全评估
 */
function analyzeFunction(funcName, content) {
  const lines = content.split('\n');
  const hasPrivacyImport = /require\(['"]\.\.?\/common\/privacy['"]\)/.test(content);
  const isExempt = EXEMPT_FUNCS.has(funcName);
  
  const uncheckedOps = [];  // 未保护的操作

  for (let ci = 0; ci < PRIVACY_COLLECTIONS.length; ci++) {
    const { collection, ops, check, reason } = PRIVACY_COLLECTIONS[ci];
    
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      
      // 检查是否是 write 操作
      const collPattern = new RegExp(`\\.collection\\(['"]${collection}['"]\\)\\.(${ops.join('|')})`);
      const match = line.match(collPattern);
      if (!match) continue;
      
      const op = match[1];
      
      // 豁免管理员或服务端操作
      if (isExempt) continue;
      
      // 检测在上下文中是否有相应的 check 调用（放宽窗口到 50 行，覆盖“先检查后写入”模式）
      const contextLines = lines.slice(Math.max(0, li - 50), li + 1);
      const contextStr = contextLines.join('\n');
      const hasCheck = contextStr.includes(check) || contextStr.includes('privacyCheck') || contextStr.includes('visibilityCheck');
      
      if (!hasCheck) {
        uncheckedOps.push({
          collection,
          op,
          check,
          reason,
          line: li + 1,
          code: line.trim().substring(0, 50)
        });
      }
    }
  }
  
  return { hasPrivacyImport, isExempt, uncheckedOps };
}

test('§7.4 隐私校验审计：用户写操作应有 privacyCheck/visibilityCheck', async () => {
  const funcs = fs.readdirSync(CLOUD_DIR)
    .filter(f => /\w+$/.test(f) && !f.startsWith('.'))
    .map(f => ({ name: f, file: path.join(CLOUD_DIR, f, 'index.js') }))
    .filter(f => fs.existsSync(f.file));
  
  console.log(`§7.4 审计 ${funcs.length} 个云函数...`);
  
  let totalUnchecked = 0;
  const findings = [];
  
  for (const func of funcs) {
    const content = fs.readFileSync(func.file, 'utf-8');
    const analysis = analyzeFunction(func.name, content);
    
    if (analysis.uncheckedOps.length > 0) {
      totalUnchecked += analysis.uncheckedOps.length;
      for (const op of analysis.uncheckedOps) {
        findings.push({ funcName: func.name, ...op });
      }
    }
  }
  
  if (totalUnchecked === 0) {
    console.log(`✅ §7.4 通过：${funcs.length} 个云函数全部用户写操作有隐私保护`);
  } else {
    console.log(`📋 §7.4 审计发现 ${totalUnchecked} 处未直接调用隐私检查的用户写操作：`);
    findings.forEach((f, idx) => {
      console.log(`  ${idx+1}. [${f.funcName}] ${f.collection}.${f.op}:${f.line} (${f.reason})`);
      console.log(`     ${f.code}`);
    });
    console.log(`📋 注意：`);
    console.log(`  - 部分操作可能通过上一层的 ROLE 门禁保护（admin: CHIEF / entry: 双人审核）`);
    console.log(`  - 部分集合（plaza_posts、contents）使用 privacyDefault 字段 + 后端 visibility 过滤，非逐 action 调用`);
    console.log(`  - 审计结果建议做人工复核，非自动门禁`);
    console.log(`\n✅ §7.4 审计完成`);
  }
});