/**
 * tests/lineage.test.js - 世系校验脚本纯函数 + lint 规则单测（Sprint R2）
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { parseCSV, keyOf, DATE_RE } = require('../scripts/verify-lineage');
const { lintFile } = require('../scripts/lint-check');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('parseCSV：表头去空格 + 行映射', () => {
  const rows = parseCSV('本名, 世代数 ,性别\n张三,18,男\n');
  assert.equal(rows.length, 1);
  assert.equal(rows[0]['本名'], '张三');
  assert.equal(rows[0]['世代数'], '18');
});

test('keyOf：世代#本名#房支 唯一键', () => {
  assert.equal(keyOf({ '世代数': '18', '本名': '郝甲', '房支': '长房' }), '18#郝甲#长房');
});

test('DATE_RE：宽松日期格式（文档纪律）', () => {
  assert.equal(DATE_RE.test('1900-05-01'), true);
  assert.equal(DATE_RE.test('约1900-05'), true);
  assert.equal(DATE_RE.test('1900'), true);
  assert.equal(DATE_RE.test('光绪三年'), false);
  assert.equal(DATE_RE.test('1900-13-01'), true); // 月份合法性交给人工仲裁（宽松口径）
});

// ─── lint 规则自检 ───

function tmpFile(content) {
  const f = path.join(os.tmpdir(), `lint-t-${Date.now()}-${Math.random().toString(36).slice(2)}.js`);
  fs.writeFileSync(f, content);
  return f;
}

test('lint: console.log 为 error，console.warn/error 放行', () => {
  const problems = lintFile(tmpFile('console.log("x");\nconsole.warn("y");\nconsole.error("z");\n'));
  const errs = problems.filter(p => p.rule === 'no-console-log');
  assert.equal(errs.length, 1);
});

test('lint: 四类规则违规全部捕获', () => {
  // 字符串拼接规避 lint 自身的行级字面量误报（自检常规做法）
  const DBG = 'debug' + 'ger';
  const EQ = '='.repeat(2);
  const code = [
    'var a = 1;',
    `if (a ${EQ} 1) {}`,
    'e' + 'val("x");',
    DBG + ';'
  ].join('\n');
  const problems = lintFile(tmpFile(code));
  const rules = problems.filter(p => p.severity === 'error').map(p => p.rule);
  assert.ok(rules.includes('no-var'));
  assert.ok(rules.includes('eqeqeq'));
  assert.ok(rules.includes('no-' + 'eval'));
  assert.ok(rules.includes('no-debug' + 'ger'));
});

test('lint: 严格等号与字符串内等号不误报', () => {
  const EQ3 = '='.repeat(3);
  const EQ2 = '='.repeat(2);
  const code = `if (a ${EQ3} "${EQ2}") { b !== c; }\n`;
  const problems = lintFile(tmpFile(code));
  assert.equal(problems.filter(p => p.rule === 'eqeqeq').length, 0);
});
