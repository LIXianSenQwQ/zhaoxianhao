/**
 * scripts/sync-common.js
 * R21 增强：自动扫描 cloud/functions 所有业务域，将 common/ 目录复制到各模块
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC_COMMON = path.join(ROOT, 'cloud', 'functions', 'common');

async function sync() {
  const dirs = fs.readdirSync(path.join(ROOT, 'cloud', 'functions'), { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  console.log(`Scanning ${dirs.length} directories...`);
  for (const dirName of dirs) {
    if (dirName === 'common') continue; // skip source
    const dest = path.join(ROOT, 'cloud', 'functions', dirName, 'common');
    if (!fs.existsSync(dest)) {
      fs.cpSync(SRC_COMMON, dest, { recursive: true });
      console.log(`✓ synced to ${dirName}/common/`);
    }
  }
  console.log('All done.');
}

sync().catch(err => { console.error(err); process.exit(1); });
