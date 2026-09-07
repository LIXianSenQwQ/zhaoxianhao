/**
 * scripts/check-interface-invariance.js — §7.10 云接口不变性校验器
 * 
 * 目的：验证所有客户端代码中的云函数调用均通过统一服务层 (services/request.ts)，
 *       或通过 services/* 封装，禁止直连 wx.cloud.callFunction。
 * 
 * 例外：登录入口脚本（store/login/bootstrap、login.vue certify）需文档化豁免。
 * 
 * 执行：node scripts/check-interface-invariance.js → 零错误时退出码 0
 */

const { readFileSync, readdirSync } = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ALLOWED_DIRECT_CALLS = new Set([
  // 日志记录已注册的直接调用（登录/认证入口 bootstrap），非生产环境代码可忽略
  // 实际测试中这些会被集成在冒烟测试里验证正确响应
]);

// 扫描目录获取所有 .ts/.vue 文件路径
function scanClientFiles(dir) {
  const files = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    if (e.isDirectory() && ['node_modules', 'dist', '.git', 'cloud'].includes(e.name)) continue;
    const fullPath = path.join(dir, e.name);
    if (e.isFile() && /\.(ts|vue)$/.test(e.name)) files.push(fullPath);
    else if (e.isDirectory()) files.push(...scanClientFiles(fullPath));
  }
  return files;
}

// 正则匹配 wx.cloud.callFunction({ name: 'xxx' }) 或 uni.request / callFunction 等
const WXCLOUD_PATTERN = /wx\.cloud\.callFunction\s*\(\s*\{[\s\S]*?name\s*:\s*['"]([^'"]+)['"]/g;
const UNI_REQUEST_PATTERN = /uni\.request\s*\([^)]*(?:url.*[\'"](.*)(?:\/[^\'\"]*)?[\'"])["\s\S]*?(?:name|fn)\s*[=:]\s*['"]([^'"]+)['"]/g;

function analyzeFile(filepath) {
  const content = readFileSync(filepath, 'utf-8');
  const relativePath = path.relative(ROOT, filepath);
  const directCalls = [];
  
  const matchWX = WXCLOUD_PATTERN.exec(content);
  while (matchWX) {
    const funcName = matchWX[1];
    if (!ALLOWED_DIRECT_CALLS.has(`${relativePath}:${funcName}`)) {
      directCalls.push({ type: 'wx.cloud', funcName, file: relativePath });
    }
    WXCLOUD_PATTERN.lastIndex = 0;
  }
  
  // Reset regex for next scan
  WXCLOUD_PATTERN.lastIndex = 0;
  UNI_REQUEST_PATTERN.lastIndex = 0;
  
  return directCalls.length > 0 ? directCalls : null;
}

async function runCheck() {
  console.log('[§7.10] 云接口不变性检查开始...');
  
  // 扫描 src/services + utils/client-only pages（排除 cloud functions dir）
  const clientRoot = path.join(ROOT, 'pages', 'login');
  const tsFiles = scanClientFiles(path.join(ROOT, 'services'));
  const vueFiles = scanClientFiles(path.join(ROOT, 'pages'));
  
  // Also check stores/utils
  const storesFiles = scanClientFiles(path.join(ROOT, 'stores'));
  const utilsFiles = scanClientFiles(path.join(ROOT, 'utils'));
  
  const allFiles = [...tsFiles, ...vueFiles, ...storesFiles, ...utilsFiles].filter(f => !f.includes('node_modules'));
  
  const violations = [];
  for (const f of allFiles) {
    const calls = analyzeFile(f);
    if (calls) violations.push(...calls);
  }
  
  // Build function registry from cloud/functions/*.js index.js files
  const cloudDir = path.join(ROOT, 'cloud', 'functions');
  const registeredFunctions = new Set();
  try {
    const cloudFolders = readdirSync(cloudDir);
    for (const folder of cloudFolders) {
      if (folder.startsWith('.') || !/\w+$/.test(folder)) continue;
      registeredFunctions.add(folder);
    }
  } catch {}
  
  // 报告结果
  if (violations.length === 0) {
    console.log(`✅ §7.10 接口不变性校验通过 (${allFiles.length} 个文件扫描)`);
    process.exit(0);
  } else {
    console.error(`❌ §7.10 发现 ${violations.length} 处未通过服务层的云函数调用:`);
    violations.forEach((v, idx) => {
      console.error(`  ${idx+1}. [${v.type}] ${v.funcName} in ${v.file}`);
    });
    
    // Warn about any unknown functions called directly
    for (const v of violations) {
      if (!registeredFunctions.has(v.funcName)) {
        console.error(`  ⚠️ 警告：${v.funcName} 未在 cloud/functions 中找到注册！`);
      }
    }
    process.exit(1);
  }
}

runCheck().catch(err => {
  console.error('[§7.10] 检查失败:', err.message);
  process.exit(2);
});
