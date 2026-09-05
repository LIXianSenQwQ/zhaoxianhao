/**
 * scripts/verify-lineage.js
 * 世系数据双人核对校验（零依赖，Node 内置）
 *
 * 用法：node scripts/verify-lineage.js <甲表.csv> <乙表.csv>
 * 依据 docs/世系数据收集说明.md 的填写纪律做三类校验：
 *   1. 甲乙两表 diff（同键不同值 → 仲裁清单）
 *   2. 世代连续性（父世代 = 子世代 - 1，能挂接的才校验）
 *   3. 结构合法性（性别取值/在世状态/日期格式/必填项）
 * 输出：控制台报告 + 差异计数（退出码：0 通过 / 1 有阻断差异）
 */
const fs = require('fs');

// ─── CSV 解析（简单实现：本项目模板不含引号内逗号） ───
function parseCSV(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim());
  const header = lines[0].split(',').map(s => s.trim());
  return lines.slice(1).map(line => {
    const cells = line.split(',');
    const row = {};
    header.forEach((h, i) => (row[h] = (cells[i] || '').trim()));
    return row;
  });
}

const HEADER = ['本名','谱名','性别','出生日期',' 逝世日期','出生地','世代数','房支','同胞排行','父亲姓名','母亲姓名','在世状态','职业','学历','字号/曾用名','善行事迹','信息来源','录入人','备注'];
const CLEAN_HEADER = HEADER.map(h => h.trim());

function keyOf(row) {
  return `${row['世代数']}#${row['本名']}#${row['房支']}`;
}

const DATE_RE = /^(约)?\d{4}(-\d{1,2})?(-\d{1,2})?$/;

function structuralCheck(row, idx, errors) {
  const where = `第${idx + 2}行[${row['本名'] || '(空名)'}]`;
  if (!row['本名']) errors.push(`${where} 缺本名`);
  if (!['男', '女'].includes(row['性别'])) errors.push(`${where} 性别须为 男/女，实际「${row['性别']}」`);
  if (!['在世', '已故'].includes(row['在世状态'])) errors.push(`${where} 在世状态须为 在世/已故`);
  if (!/^\d+$/.test(row['世代数'])) errors.push(`${where} 世代数须为正整数，实际「${row['世代数']}」`);
  for (const col of ['出生日期', ' 逝世日期']) {
    const v = (row[col] || '').trim();
    if (v && !DATE_RE.test(v)) errors.push(`${where} ${col.trim()}格式应为 YYYY-MM-DD 或「约1900-05」，实际「${v}」`);
  }
  if (row['在世状态'] === '在世' && (row[' 逝世日期'.trim()] || '').trim()) {
    errors.push(`${where} 在世者不应填逝世日期`);
  }
  if (!row['信息来源']) errors.push(`${where} 缺信息来源（口述/老谱/碑刻/文书/推测）`);
  if (!row['录入人']) errors.push(`${where} 缺录入人`);
}

// ─── 主流程 ───
function main() {
  const [fileA, fileB] = process.argv.slice(2);
  if (!fileA || !fileB) {
    console.error('用法: node scripts/verify-lineage.js <甲表.csv> <乙表.csv>');
    process.exit(2);
  }

  const rowsA = parseCSV(fs.readFileSync(fileA, 'utf8')).filter(r => r['本名'] && r['本名'] !== '郝XX'); // 跳示例行
  const rowsB = parseCSV(fs.readFileSync(fileB, 'utf8')).filter(r => r['本名'] && r['本名'] !== '郝XX');

  const structuralErrors = [];
  rowsA.forEach((r, i) => structuralCheck(r, i, structuralErrors));
  rowsB.forEach((r, i) => structuralCheck(r, i, structuralErrors));

  // 索引：本名+世代+房支 → 行
  const indexA = new Map(rowsA.map(r => [keyOf(r), r]));
  const indexB = new Map(rowsB.map(r => [keyOf(r), r]));

  // diff：仅比较客观字段（主观描述字段不比对）
  const COMPARE_COLS = ['性别', '出生日期', '逝世日期', '世代数', '房支', '父亲姓名', '在世状态'];
  const conflicts = [];
  for (const [key, a] of indexA) {
    const b = indexB.get(key);
    if (!b) continue; // 单侧独有 → 提示但不阻断
    for (const col of COMPARE_COLS) {
      const va = (a[col] || '').trim();
      const vb = (b[col] || '').trim();
      if (va && vb && va !== vb) {
        conflicts.push(`${key} 字段「${col}」甲=${va || '(空)'} 乙=${vb || '(空)'}`);
      }
    }
  }

  // 世代连续性：子能找到父（同表内）则校验 parentGen = childGen - 1
  const genErrors = [];
  for (const rows of [rowsA, rowsB]) {
    const byName = new Map(rows.map(r => [r['本名'], r]));
    for (const child of rows) {
      const father = child['父亲姓名'];
      if (!father) continue;
      const parent = byName.get(father);
      if (!parent) continue; // 父不在本表 → 依赖已有族谱挂接，跳过
      if (Number(parent['世代数']) !== Number(child['世代数']) - 1) {
        genErrors.push(`${child['本名']}(世代${child['世代数']}) 之父 ${father}(世代${parent['世代数']}) 应为 ${Number(child['世代数']) - 1}`);
      }
    }
  }

  const onlyA = [...indexA.keys()].filter(k => !indexB.has(k));
  const onlyB = [...indexB.keys()].filter(k => !indexA.has(k));

  // ─── 报告 ───
  console.log('════════ 世系双人核对报告 ════════');
  console.log(`甲表 ${rowsA.length} 人 / 乙表 ${rowsB.length} 人 / 共同 ${indexA.size && [...indexA.keys()].filter(k => indexB.has(k)).length} 人`);
  console.log(`结构错误: ${structuralErrors.length}`);
  structuralErrors.slice(0, 20).forEach(e => console.log('  [结构] ' + e));
  console.log(`两表冲突: ${conflicts.length}（需仲裁）`);
  conflicts.slice(0, 20).forEach(e => console.log('  [冲突] ' + e));
  console.log(`世代断裂: ${genErrors.length}`);
  genErrors.slice(0, 20).forEach(e => console.log('  [世代] ' + e));
  console.log(`甲独有: ${onlyA.length} 乙独有: ${onlyB.length}（请确认是否漏填）`);
  onlyA.slice(0, 10).forEach(k => console.log('  [甲独有] ' + k));
  onlyB.slice(0, 10).forEach(k => console.log('  [乙独有] ' + k));

  const blocking = structuralErrors.length + conflicts.length + genErrors.length;
  console.log(blocking === 0
    ? '✅ 校验通过：结构/冲突/世代 三项零阻断，可入库'
    : `❌ 共 ${blocking} 项阻断差异，修正后重新校验`);
  process.exit(blocking === 0 ? 0 : 1);
}

// 供测试导入的纯函数
module.exports = { parseCSV, keyOf, DATE_RE, CLEAN_HEADER };

if (require.main === module) main();
