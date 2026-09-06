#!/usr/bin/env node
/**
 * scripts/setup.js — 项目环境初始化引导脚本（Windows/macOS/Linux 兼容）
 *
 * 作用：
 *   1. 检测基础依赖（Node/npm/git）版本与可用性
 *   2. 检查并安装/更新缺失的包依赖
 *   3. 运行 npm run verify 门禁确认环境健康
 *   4. 打印部署密钥申请指南（ENV_SETUP.md 路径 + 关键链接）
 *
 * 用法：
 *   node scripts/setup.js [--install] [--skip-verify]
 */
'use strict';
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const SKIP_VERIFY = process.argv.includes('--skip-verify');
let needInstall = false;

function sh(cmd, opts = {}) {
  try {
    const out = execSync(cmd, { encoding: 'utf8', stdio: 'pipe', timeout: opts.timeout || 60000 });
    return { ok: true, out };
  } catch (e) {
    return { ok: false, out: e.stdout || '', code: e.status };
  }
}

// ─── Step 1: Node/npm/git 检测 ───
console.log('\n=== 环境检测 ===\n');
console.log('工作目录:', path.join(ROOT));

// Node
const nodeRes = sh('node --version');
if (!nodeRes.ok) {
  console.error('❌ 未找到 Node.js。请安装 v18+ (https://nodejs.org)');
  process.exit(1);
} else {
  console.log(`✓ Node.js ${nodeRes.out.trim()}`);
}

// npm
const npmRes = sh('npm --version');
if (!npmRes.ok) {
  console.error('❌ 未找到 npm。Node.js 中应自带 npm');
  process.exit(1);
} else {
  console.log(`✓ npm ${npmRes.out.trim()}`);
}

// Git
const gitRes = sh('git --version');
if (!gitRes.ok) {
  console.warn('⚠ Git 未安装或不可见。请安装 Git 以使用分支模型和 CI');
} else {
  console.log(`✓ Git ${gitRes.out.trim()}`);
}

// ─── Step 2: 依赖安装（package.json lockfile 优先） ───
const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const hasLock = fs.existsSync(path.join(ROOT, 'package-lock.json'));
console.log(hasLock ? '→ 检测到 package-lock.json，将执行 npm ci' : '→ 无 lockfile，将执行 npm install');

if (process.argv.includes('--install')) {
  needInstall = true;
}

if (needInstall) {
  console.log('\n▶ 执行 npm ci / install ...');
  const cmd = hasLock ? 'npm ci' : 'npm install';
  const res = sh(cmd, { timeout: 300000 });
  if (!res.ok) {
    console.error(`❌ 依赖安装失败:\n${res.out}`);
    process.exit(1);
  }
  console.log('✓ 依赖安装完成\n');
} else {
  console.log('跳过安装 (--install 参数可强制安装)\n');
}

// ─── Step 3: npm run verify 门禁 ───
if (!SKIP_VERIFY) {
  console.log('▶ 执行环境核查: npm run verify ...\n');
  const verifyRes = sh('npm run verify', { timeout: 300000 });
  const pass = verifyRes.ok && !/✖|fail\s+[1-9]/i.test(verifyRes.out);
  if (pass) {
    console.log('✅ 环境核查通过！\n');
  } else {
    console.log('⚠️ 核查报告：');
    console.log(verifyRes.out.split('\n').slice(-15).join('\n'));
    console.log('请修复后重试（--skip-verify 可跳过本步骤）\n');
    if (verifyRes.code !== 0) process.exit(verifyRes.code);
  }
}

// ─── Step 4: 部署指南提示 ───
console.log('=== 下一步 ===');
console.log('1. 阅读部署指南：docs/deployment/ENV_SETUP.md');
console.log('2. 申请服务账号：');
console.log('   • 微信小程序：微信公众平台 (mp.weixin.qq.com)');
console.log('   • 和风天气：https://dev.qweather.com/');
console.log('   • 腾讯云短信：https://cloud.tencent.com/product/sms');
console.log('   • 内容安全（msgSecCheck）：在云开发控制台开启');
console.log('3. 配置云函数环境变量：OPEN_ID/SECRET（在微信公众平台 → 云开发）');
console.log('4. 启动开发：');
console.log('   • 小程序：npm run dev:mp-wechat');
console.log('   • H5：npm run dev:h5');
console.log('5. 测试验证：npm test\n');