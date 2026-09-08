/**
 * tests/lineage-naming.test.js
 * 字辈与谱名工具单测（蓝图 §4.4 B2 冲刺）
 */
const { test } = require('node:test');
const assert = require('node:assert');
const {
  normalizePoem,
  isValidPoem,
  matchGenerationChar,
  matchByBirthYear,
  buildGenealogyName,
  validateGenealogyName,
  checkDuplicateGenealogyName,
  nextAvailableSuffix,
  checkExtensionNeed,
  MAX_GENERATION_CHARS,
  YEAR_PER_GENERATION
} = require('../utils/lineage-naming.js');

// ─── normalizePoem ───

test('normalizePoem 空格分隔', () => {
  assert.deepEqual(normalizePoem('庆 昌 永 世 传 家'), ['庆', '昌', '永', '世', '传', '家']);
});

test('normalizePoem 顿号分隔', () => {
  assert.deepEqual(normalizePoem('庆、昌、永、世、传、家'), ['庆', '昌', '永', '世', '传', '家']);
});

test('normalizePoem 混合分隔符（含换行）', () => {
  assert.deepEqual(normalizePoem('庆，昌，永\n世，传\r家，'), ['庆', '昌', '永', '世', '传', '家']);
});

test('normalizePoem 每项截断 ≤3 字', () => {
  assert.deepEqual(normalizePoem('一二三四 五六七八'), ['一二三', '五六七']);
  assert.deepEqual(normalizePoem('长字 中 短字超长个三'), ['长字', '中', '短字超']);
});

test('normalizePoem 空输入', () => {
  assert.deepEqual(normalizePoem(''), []);
  assert.deepEqual(normalizePoem(null), []);
  assert.deepEqual(normalizePoem(undefined), []);
});

test('normalizePoem 超过 50 字抛错', () => {
  const longPoem = Array.from({ length: 51 }, (_, i) => `字${i}`).join(' ');
  assert.throws(() => normalizePoem(longPoem), /不得超过 50 字/);
});

test('normalizePoem 恰好 50 字不抛错', () => {
  const poem = Array.from({ length: 50 }, (_, i) => `字${i}`).join(' ');
  assert.equal(normalizePoem(poem).length, 50);
});

// ─── isValidPoem ───

test('isValidPoem 合法/非法数组', () => {
  assert.ok(isValidPoem(['字一', '字二']));
  assert.ok(!isValidPoem([])); // 空数组视为未配置（非法）
  assert.ok(!isValidPoem(null));
  assert.ok(!isValidPoem('string'));
  assert.ok(!isValidPoem(Array.from({ length: 51 }).fill('x'))); // 超限
});

// ─── matchGenerationChar ───

test('matchGenerationChar 标准序列', () => {
  const chars = ['庆', '昌', '永', '世', '传', '家'];
  let r = matchGenerationChar({ chars, generation: 1 });
  assert.equal(r.char, '庆');
  assert.ok(r.valid);
  r = matchGenerationChar({ chars, generation: 6 });
  assert.equal(r.char, '家');
  assert.ok(r.valid);
  r = matchGenerationChar({ chars, generation: 7 });
  assert.equal(r.char, null);
  assert.ok(!r.valid);
});

test('matchGenerationChar 无效输入', () => {
  let r = matchGenerationChar({ chars: null, generation: 1 });
  assert.equal(r.char, null);
  assert.ok(!r.valid);
  r = matchGenerationChar({ chars: ['字'], generation: -1 });
  assert.equal(r.char, null);
  assert.ok(!r.valid);
  r = matchGenerationChar({ chars: ['字'], generation: 0 });
  assert.ok(!r.valid);
});

// ─── matchByBirthYear ───

test('matchByBirthYear 精确匹配', () => {
  const chars = ['A', 'B', 'C', 'D', 'E'];
  let r = matchByBirthYear({ chars, baseYear: 1900, baseGen: 1, birthYear: 1900 });
  assert.equal(r.generation, 1);
  assert.equal(r.char, 'A');
  assert.ok(r.valid);

  r = matchByBirthYear({ chars, baseYear: 1900, baseGen: 1, birthYear: 1925 });
  assert.equal(r.generation, 2);
  assert.equal(r.char, 'B');
  assert.ok(r.valid);
});

test('matchByBirthYear 估算误差取整', () => {
  const chars = ['A', 'B', 'C'];
  // +13 年 ≈ +0.52 世 → round → +1 → 第 2 世
  let r = matchByBirthYear({ chars, baseYear: 1900, baseGen: 1, birthYear: 1913 });
  assert.equal(r.generation, 2);
  assert.equal(r.char, 'B');
  assert.ok(r.valid);

  // -13 年 ≈ -0.52 世 → round(-0.52) = -1 → 第 0 世（始祖之前）→ 无效
  r = matchByBirthYear({ chars, baseYear: 1900, baseGen: 1, birthYear: 1887 });
  assert.equal(r.generation, null);
  assert.ok(!r.valid);

  // 早于始祖 38 年 → 第 -1 世 → 无效
  r = matchByBirthYear({ chars, baseYear: 1900, baseGen: 1, birthYear: 1862 });
  assert.equal(r.generation, null);
  assert.ok(!r.valid);
});

test('matchByBirthYear 自定义每世年数', () => {
  const chars = ['A', 'B', 'C', 'D'];
  const r = matchByBirthYear({ chars, baseYear: 1900, baseGen: 1, birthYear: 1960, yearPerGen: 30 });
  assert.equal(r.generation, 3);
  assert.equal(r.char, 'C');
});

test('matchByBirthYear 无效输入', () => {
  const r = matchByBirthYear({ chars: null, baseYear: 1900, baseGen: 1, birthYear: 1950 });
  assert.equal(r.generation, null);
  assert.ok(!r.valid);
});

// ─── buildGenealogyName ───

test('buildGenealogyName 正常情况', () => {
  assert.equal(buildGenealogyName({ surname: '郝', generationChar: '庆', givenName: '明' }), '郝庆明');
  assert.equal(buildGenealogyName({ surname: '郝', generationChar: '', givenName: '明' }), '郝明');
  assert.equal(buildGenealogyName({ surname: '', generationChar: '庆', givenName: '明' }), '');
  assert.equal(buildGenealogyName({ surname: '郝', generationChar: '庆', givenName: '' }), '');
});

// ─── validateGenealogyName ───

test('validateGenealogyName', () => {
  assert.ok(validateGenealogyName({ name: '郝庆明', surname: '郝', generationChar: '庆' }));
  assert.ok(!validateGenealogyName({ name: '郝昌明', surname: '郝', generationChar: '庆' })); // 字辈不符
  assert.ok(validateGenealogyName({ name: '郝明', surname: '郝', generationChar: '' })); // 无字辈仅验姓
  assert.ok(!validateGenealogyName({ name: '李庆明', surname: '郝', generationChar: '庆' })); // 姓不符
  assert.ok(!validateGenealogyName({ name: '', surname: '郝', generationChar: '庆' }));
});

// ─── checkDuplicateGenealogyName ───

test('checkDuplicateGenealogyName 完全重复', () => {
  const existing = ['郝A一', '郝A二', '郝B一'];
  const r = checkDuplicateGenealogyName({ name: '郝A二', generation: 2, existingNames: existing });
  assert.ok(r.isDuplicate);
  assert.equal(r.conflictLevel, 'duplicate');
});

test('checkDuplicateGenealogyName 无冲突（同姓不算冲突）', () => {
  const existing = ['郝A一', '郝A二'];
  const r = checkDuplicateGenealogyName({ name: '郝B三', generation: 3, existingNames: existing });
  assert.ok(!r.isDuplicate);
  assert.equal(r.conflictLevel, 'none');
});

test('checkDuplicateGenealogyName 无效参数', () => {
  let r = checkDuplicateGenealogyName({ name: null, generation: 2, existingNames: [] });
  assert.ok(!r.isDuplicate);
  r = checkDuplicateGenealogyName({ name: '郝A', generation: null, existingNames: [] });
  assert.ok(!r.isDuplicate);
  r = checkDuplicateGenealogyName({ name: '郝A', generation: 2, existingNames: 'not-array' });
  assert.ok(!r.isDuplicate);
});

// ─── nextAvailableSuffix ───

test('nextAvailableSuffix 顺延', () => {
  const existing = ['1-1', '1-2', '1-5'];
  assert.equal(nextAvailableSuffix(existing, 1), '1-3');
  assert.equal(nextAvailableSuffix(existing, 6), '6-1'); // 新组从头
});

test('nextAvailableSuffix 空列表', () => {
  assert.equal(nextAvailableSuffix([], 1), '1-1');
});

// ─── checkExtensionNeed ───

test('checkExtensionNeed 剩余充足', () => {
  const current = Array.from({ length: 20 }, (_, i) => `字${i}`);
  const r = checkExtensionNeed({ currentPoem: current, requiredExtend: 10 });
  assert.ok(r.canExtend);
  assert.equal(r.maxExtension, 30);
});

test('checkExtensionNeed 剩余不足', () => {
  const current = Array.from({ length: 45 }, (_, i) => `字${i}`);
  const r = checkExtensionNeed({ currentPoem: current, requiredExtend: 10 });
  assert.ok(!r.canExtend);
  assert.equal(r.maxExtension, 5);
  assert.ok(r.reason.includes('族议会审批'));
});

test('checkExtensionNeed 无效输入', () => {
  const r = checkExtensionNeed({ currentPoem: null });
  assert.ok(!r.canExtend);
});

// ─── 常量导出 ───

test('常量导出', () => {
  assert.equal(MAX_GENERATION_CHARS, 50);
  assert.equal(YEAR_PER_GENERATION, 25);
});
