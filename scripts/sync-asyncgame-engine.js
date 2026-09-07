/**
 * scripts/sync-asyncgame-engine.js
 *
 * 把 utils/chess-engine.js（ESM 源，供前端/单测）同步为
 * cloud/functions/asyncgame/engine.js（CJS 副本，供云函数 require）。
 *
 * 背景：微信云函数独立打包，无法引用仓库根 utils（opera/quiz 同款"部署内联副本"先例）。
 * 本脚本保证两处**同源不漂移**：改规则只需改 utils/chess-engine.js，再跑本脚本。
 *
 * 用法：node scripts/sync-asyncgame-engine.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'utils', 'chess-engine.js');
const DEST = path.join(ROOT, 'cloud', 'functions', 'asyncgame', 'engine.js');

const HEADER = `/**
 * cloud/functions/asyncgame/engine.js
 * F7 异步对弈 —— 中国象棋规则引擎「部署内联副本」（自动生成，勿手改）
 *
 * 与 utils/chess-engine.js 同源同步：node scripts/sync-asyncgame-engine.js
 * 云函数独立打包无法引用根 utils，故以 CJS 副本形式内联。
 */

`;

function main() {
  const src = fs.readFileSync(SRC, 'utf8');
  // 剥离源文件头部注释块（/* ... */ 首个），保留代码
  const code = src.replace(/^\/\*[\s\S]*?\*\//, '').trim();
  // 提取 ESM 导出清单
  const m = code.match(/export\s*\{\s*([\s\S]*?)\s*\}\s*;?\s*$/);
  if (!m) {
    console.error('未找到 export 语句，同步中止');
    process.exit(1);
  }
  const names = m[1].split(',').map(s => s.trim()).filter(Boolean);
  // 去掉 export 尾行
  const body = code.replace(/export\s*\{\s*[\s\S]*?\}\s*;?\s*$/, '').trimEnd();
  // 多行 module.exports（避免超长行触发 lint）
  const exportsBody = names.map(n => '  ' + n).join(',\n');
  const cjs = HEADER + body + '\n\nmodule.exports = {\n' + exportsBody + '\n};\n';
  fs.writeFileSync(DEST, cjs, 'utf8');
  console.log(`✓ synced ${names.length} exports: ${names.join(', ')}`);
  console.log(`  ${SRC}\n  → ${DEST}`);
  // 一致性自检：导出名与源一致
  const check = fs.readFileSync(DEST, 'utf8');
  const ok = names.every(n => new RegExp('\\b' + n + '\\s*[,}:]').test(check) || new RegExp('function\\s+' + n + '\\b').test(check));
  if (!ok) { console.error('一致性自检失败'); process.exit(1); }
  console.log('✓ 一致性自检通过');
}

main();
