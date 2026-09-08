// tests/excel-parse.test.js
/**
 * R29 T1: utils/excel-parse.js 单元测试
 * 覆盖: CSV 基础解析 / 引号包裹 / BOM / 中文表头 / 空行过滤 / 模板生成
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { parseCSV, generateTemplate } = require('../utils/excel-parse');

test('parseCSV: 基础解析（英文表头）', () => {
  const csv = 'name,level,parentCode,region,description,generationVerses\n宋村二支,2,,河北省石家庄市赵县宋村,第二分谱,国正天心顺';
  const rows = parseCSV(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, '宋村二支');
  assert.equal(rows[0].level, 2);
  assert.equal(rows[0].region, '河北省石家庄市赵县宋村');
  assert.equal(rows[0].description, '第二分谱');
  assert.equal(rows[0].generationVerses, '国正天心顺');
});

test('parseCSV: 中文表头映射', () => {
  const csv = '名称,层级,父编码,地域,描述,字辈\n南庄三支,3,HAO-0000-02,赵县南庄,第三支谱,天地玄黄';
  const rows = parseCSV(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, '南庄三支');
  assert.equal(rows[0].parentCode, 'HAO-0000-02');
  assert.equal(rows[0].generationVerses, '天地玄黄');
});

test('parseCSV: 引号包裹字段（含逗号）', () => {
  const csv = 'name,level,region\n"宋村, 二支",2,"河北, 石家庄"';
  const rows = parseCSV(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, '宋村, 二支');
  assert.equal(rows[0].region, '河北, 石家庄');
});

test('parseCSV: BOM 处理', () => {
  const csv = '\uFEFFname,level\n宋村二支,2';
  const rows = parseCSV(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, '宋村二支');
});

test('parseCSV: 空行过滤 + 无 name 行跳过', () => {
  const csv = 'name,level\n宋村二支,2\n\n,3\n长房,3';
  const rows = parseCSV(csv);
  assert.equal(rows.length, 2); // 空行 + 无 name 行都被过滤
  assert.equal(rows[0].name, '宋村二支');
  assert.equal(rows[1].name, '长房');
});

test('parseCSV: 多行批量', () => {
  const csv = [
    'name,level,parentCode',
    '宋村二支,2,',
    '长房,3,HAO-0000-01',
    '二房,3,HAO-0000-01'
  ].join('\n');
  const rows = parseCSV(csv);
  assert.equal(rows.length, 3);
  assert.equal(rows[1].parentCode, 'HAO-0000-01');
});

test('parseCSV: 空内容抛错', () => {
  assert.throws(() => parseCSV(''), /CSV 内容为空/);
  assert.throws(() => parseCSV(null), /CSV 内容为空/);
});

test('parseCSV: 仅表头抛错', () => {
  assert.throws(() => parseCSV('name,level'), /至少包含表头/);
});

test('parseCSV: _row 记录原始行号', () => {
  const csv = 'name,level\n第一行,2\n第二行,3';
  const rows = parseCSV(csv);
  assert.equal(rows[0]._row, 2); // CSV 第 2 行（表头是第 1 行）
  assert.equal(rows[1]._row, 3);
});

test('generateTemplate: 默认表头 + 示例行', () => {
  const tpl = generateTemplate([['宋村二支', 2, '', '河北']]);
  assert.ok(tpl.startsWith('name,level,parentCode'));
  assert.ok(tpl.includes('宋村二支,2,,河北'));
});
