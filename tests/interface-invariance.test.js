/**
 * tests/interface-invariance.test.js — §7.10 云函数接口不变性校验
 * 
 * 验证：
 * 1. 所有客户端服务调用均通过统一层 (services/request.ts)
 * 2. 客户端引用的所有云函数名在 cloud/functions/ 下有实现
 * 3. 无直接 wx.cloud.callFunction 绕层调用
 */
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { readFileSync, existsSync } = require('node:fs');

const ROOT = path.resolve(__dirname, '..');

// 排除 list（cloud/ 下的云函数实现自身合法调用 wx SDK）
const EXCLUDE_PATHS = [/[\\/]cloud[\\/]/, /node_modules/];

function scanCodeFiles(dir) {
  const fs = require('fs');
  const result = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!EXCLUDE_PATHS.some(r => r.test(full))) result.push(...scanCodeFiles(full));
    } else if (/\.(ts|vue)$/.test(e.name) && !EXCLUDE_PATHS.some(r => r.test(full))) {
      result.push(full);
    }
  }
  return result;
}

test('§7.10 接口不变性：客户端无直接 wx.cloud.callFunction 调用', async () => {
  // 例外白名单（只有 request.ts 允许直接调用）
  const requestTs = path.join(ROOT, 'services', 'request.ts');
  const legalFiles = new Set([path.resolve(requestTs)]);

  const codeFiles = [
    ...scanCodeFiles(path.join(ROOT, 'services')),
    ...scanCodeFiles(path.join(ROOT, 'stores')),
    ...scanCodeFiles(path.join(ROOT, 'utils')),
    ...scanCodeFiles(path.join(ROOT, 'pages')),
    ...scanCodeFiles(path.join(ROOT, 'components')),
  ].filter(f => path.resolve(f) !== path.resolve(requestTs));

  const calls = [];
  for (const file of codeFiles) {
    const content = readFileSync(file, 'utf-8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('wx.cloud.callFunction')) {
        calls.push(`${path.relative(ROOT, file)}:${i + 1}`);
      }
    }
  }

  assert.equal(
    calls.length,
    0,
    `发现 ${calls.length} 处直接 wx.cloud.callFunction 调用（仅 services/request.ts 允许）:\n  ${calls.join('\n  ')}`
  );
});

test('§7.10 接口不变性：客户端引用的云函数名在磁盘有实现', async () => {
  // 从 services/*.ts 中提取 call/read/write 第一参数（函数名）
  const FN_CALL_RE = /(?:call|read|write)\(\s*['"]([a-zA-Z0-9_-]+)['"]/g;
  const clients = [
    ...scanCodeFiles(path.join(ROOT, 'services')),
    path.join(ROOT, 'utils', 'feature-flags.ts'),
  ];

  const calledNames = new Set();
  for (const file of clients) {
    const content = readFileSync(file, 'utf-8');
    let m;
    while ((m = FN_CALL_RE.exec(content)) !== null) {
      calledNames.add(m[1]);
    }
  }

  // 加上 pages/login/login.vue 中用到的
  const loginVue = path.join(ROOT, 'pages', 'login', 'login.vue');
  const loginContent = existsSync(loginVue) ? readFileSync(loginVue, 'utf-8') : '';
  const certifyMatch = loginContent.match(/certify\(['"]([a-zA-Z0-9_-]+)['"]/g);
  if (certifyMatch) {
    calledNames.add('auth');
  }

  // 验证
  const missing = [];
  for (const name of calledNames) {
    const fnDir = path.join(ROOT, 'cloud', 'functions', name);
    const fnFile = path.join(fnDir, 'index.js');
    if (!existsSync(fnFile)) {
      missing.push(name);
    }
  }

  assert.equal(
    missing.length,
    0,
    `以下云函数被客户端引用但磁盘无实现: ${missing.join(', ')}`
  );
});