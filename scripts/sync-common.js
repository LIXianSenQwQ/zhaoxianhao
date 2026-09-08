/**
 * scripts/sync-common.js
 * R21 增强：自动扫描 cloud/functions 所有业务域，将 common/ 目录复制到各模块。
 * 2026-09 增强（B0）：除「缺失则整目录复制」外，新增「已有副本差异同步」——
 * 逐个文件比对源与副本，内容不同则覆盖（幂等，可重复执行）。
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC_COMMON = path.join(ROOT, 'cloud', 'functions', 'common');

function syncDir(srcDir, destDir) {
  let copied = 0;
  if (!fs.existsSync(destDir)) {
    fs.cpSync(srcDir, destDir, { recursive: true });
    return fs.readdirSync(srcDir).length;
  }
  for (const f of fs.readdirSync(srcDir)) {
    const s = path.join(srcDir, f);
    const d = path.join(destDir, f);
    const st = fs.statSync(s);
    if (st.isDirectory()) {
      copied += syncDir(s, d);
      continue;
    }
    if (!fs.existsSync(d) || !fs.readFileSync(s).equals(fs.readFileSync(d))) {
      fs.copyFileSync(s, d);
      copied++;
    }
  }
  return copied;
}

async function sync() {
  const dirs = fs.readdirSync(path.join(ROOT, 'cloud', 'functions'), { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  console.log(`Scanning ${dirs.length} directories...`);
  for (const dirName of dirs) {
    if (dirName === 'common') continue; // skip source
    const dest = path.join(ROOT, 'cloud', 'functions', dirName, 'common');
    const n = syncDir(SRC_COMMON, dest);
    if (n > 0) console.log(`✓ synced ${n} file(s) to ${dirName}/common/`);
  }
  console.log('All done.');
}

sync().catch(err => { console.error(err); process.exit(1); });
