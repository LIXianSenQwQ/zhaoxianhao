/**
 * scripts/sync-common.js
 * 部署前置脚本：把 cloud/functions/common/ 同步进每个云函数目录
 * （微信云开发按目录独立打包，共享代码需物理复制）
 * 用法：node scripts/sync-common.js
 * 注：使用基础 fs API 逐文件复制（cpSync 在部分受限环境下不可用）
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const COMMON = path.join(ROOT, 'cloud', 'functions', 'common');
const FN_DIR = path.join(ROOT, 'cloud', 'functions');

/** 递归复制目录（基础 fs API） */
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

const fnNames = fs
  .readdirSync(FN_DIR, { withFileTypes: true })
  .filter(d => d.isDirectory() && d.name !== 'common')
  .map(d => d.name);

let synced = 0;
for (const name of fnNames) {
  const target = path.join(FN_DIR, name, 'common');
  fs.rmSync(target, { recursive: true, force: true });
  copyDir(COMMON, target);
  synced++;
  console.log(`  common -> functions/${name}/common`);
}
console.log(`Synced common middleware into ${synced} cloud functions.`);
