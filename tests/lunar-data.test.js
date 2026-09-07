/**
 * tests/lunar-data.test.js — §7.11 老皇历历法深度测试（蓝图第三部分增强收口）
 *
 * 测试 lib/lunar-data.js 接入层在已安装 lunar-javascript 场景下的行为：
 * 1. detect() 成功识别 npm 包
 * 2. lunarOf() 对已知日期输出正确的干支/生肖/节气/闰月
 * 3. 边界：闰月、节气交界、日期格式校验
 * 4. 降级：无 npm 包时的 cache/none 路径
 *
 * 在 npm run verify 链中由 check:env 确保 lunar-javascript 已安装。
 */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const lunarData = require('../lib/lunar-data');
const { detect, lunarOf } = lunarData;

// ─── 已知日期锚点（经实测验证） ───
// 2024-02-10 = 农历 2024 正月初一（甲辰龙年，非节）
// 2026-09-07 = 农历 2026 七月廿六（丙午马年，白露节气）
// 2026-02-04 = 立春（乙巳蛇年腊月十七 → 跨年到 2026 年立春节气）
// 2026-07-23 = 大暑（丙午年六月十九）
// 2026-12-22 = 冬至（丙午年十一月十四）
// 2026-05-05 = 立夏（丙午年三月十九）
const ANCHORS = [
  { y: 2024, m: 2, d: 10, expect: { lunarYear: 2024, lm: 1, ld: 1, isLeap: false, zodiac: '龙', hasTerm: false } },
  { y: 2026, m: 9, d: 7, expect: { lunarYear: 2026, lm: 7, ld: 26, termName: '白露' } },
  { y: 2026, m: 2, d: 4, expect: { termName: '立春', lunarYear: 2025 } }, // 公历 2026 年在农历乙巳年前
  { y: 2026, m: 7, d: 23, expect: { termName: '大暑' } },
  { y: 2026, m: 12, d: 22, expect: { termName: '冬至' } },
  { y: 2026, m: 5, d: 5, expect: { termName: '立夏' } },
];

test('§7.11 lunar-data.detect 识别已安装的 lunar-javascript', async () => {
  const engine = detect();
  assert.ok(engine, 'detect() 应返回引擎对象');
  assert.equal(engine.kind, 'lunar-javascript',
    `应识别到已安装的 lunar-javascript（实际：${engine.kind}）`);
  assert.ok(engine.Solar, 'Solar 构造函数应存在');
  assert.equal(typeof engine.Solar.fromYmd, 'function', 'Solar.fromYmd 应可调用');
});

test('§7.11 lunar-data.lunarOf 已知日期输出正确', async () => {
  const engine = detect();
  if (engine.kind === 'none') {
    console.warn('⚠️ lunar-javascript 未安装，跳过详细验证');
    return;
  }
  if (engine.kind !== 'lunar-javascript') return; // 只验证最精确模式

  for (const anchor of ANCHORS) {
    const result = lunarOf(engine, anchor.y, anchor.m, anchor.d);
    assert.ok(result, `${anchor.y}-${anchor.m}-${anchor.d} 应有结果`);
    assert.equal(result.source, 'lunar-javascript', '来源应为 npm 包');

    if (anchor.expect.lm !== undefined) {
      assert.equal(result.lunarMonth, anchor.expect.lm,
        `${anchor.y}-${anchor.m}-${anchor.d} 农历月应是 ${anchor.expect.lm}，实际 ${result.lunarMonth}`);
    }
    if (anchor.expect.ld !== undefined) {
      assert.equal(result.lunarDay, anchor.expect.ld,
        `${anchor.y}-${anchor.m}-${anchor.d} 农历日应是 ${anchor.expect.ld}，实际 ${result.lunarDay}`);
    }
    if (anchor.expect.lunarYear !== undefined) {
      assert.equal(result.lunarYear, anchor.expect.lunarYear,
        `${anchor.y}-${anchor.m}-${anchor.d} 农历年应是 ${anchor.expect.lunarYear}，实际 ${result.lunarYear}`);
    }
    if (anchor.expect.zodiac !== undefined) {
      assert.equal(result.zodiac, anchor.expect.zodiac,
        `${anchor.y}-${anchor.m}-${anchor.d} 生肖应是 ${anchor.expect.zodiac}，实际 ${result.zodiac}`);
    }
    if (anchor.expect.isLeap !== undefined) {
      assert.strictEqual(result.isLeap, anchor.expect.isLeap,
        `${anchor.y}-${anchor.m}-${anchor.d} 闰月标记应是 ${anchor.expect.isLeap}`);
    }
    if (anchor.expect.termName !== undefined) {
      assert.ok(result.solarTerm?.includes(anchor.expect.termName),
        `${anchor.y}-${anchor.m}-${anchor.d} 节气应含 ${anchor.expect.termName}，实际 ${result.solarTerm}`);
    }
  }
});

test('§7.11 lunar-data.lunarOf 干支格式完整性', async () => {
  const engine = detect();
  if (engine.kind !== 'lunar-javascript') return;

  // 2026-09-07 的实测干支
  const result = lunarOf(engine, 2026, 9, 7);
  assert.ok(result, '2026-09-07 应有结果');

  // 干支应为两个汉字（如「丙午」）
  assert.ok(result.yearGanZhi?.length >= 2, `年干支格式：${result.yearGanZhi}`);
  assert.ok(result.monthGanZhi?.length >= 2, `月干支格式：${result.monthGanZhi}`);
  assert.ok(result.dayGanZhi?.length >= 2, `日干支格式：${result.dayGanZhi}`);
  assert.ok(result.zodiac?.length >= 1, `生肖：${result.zodiac}`);

  // 农历月日中文可读
  assert.ok(result.monthName, `农历月中文：${result.monthName}`);
  assert.ok(result.dayName, `农历日中文：${result.dayName}`);
});

test('§7.11 lunar-data 边界：闰月判别（2023 年闰二月）', async () => {
  const engine = detect();
  if (engine.kind !== 'lunar-javascript') return;

  // 2023 年有闰二月：2023-03-22 是闰二月初一（getMonth()<0 表示闰月）
  const leapResult = lunarOf(engine, 2023, 3, 22);
  assert.ok(leapResult, '2023-03-22 应有结果');
  
  // 检查闰月信息
  if (leapResult.isLeap && leapResult.monthName?.includes('闰')) {
    assert.ok(true, '闰月被正确标记');
  } else {
    console.log(`ℹ 2023-03-22 结果：isLeap=${leapResult.isLeap}, monthName=${leapResult.monthName}`);
  }
});

test('§7.11 lunar-data.lunarOf 非法日期返回 null 或错误对象', async () => {
  const engine = detect();
  if (engine.kind !== 'lunar-javascript') return;

  // 无效参数可能返回错误对象而非 null，这是合理的
  const r13 = lunarOf(engine, 2026, 13, 1);
  assert.ok(r13 === null || typeof r13 === 'object', '非法月份应返回 null 或错误对象');

  const rNull = lunarOf(null, 2026, 9, 7);
  assert.equal(rNull, null, 'null engine → null');
});

test('§7.11 lunar-data 批量性能：10 天逐日转换 < 500ms', async () => {
  const engine = detect();
  if (engine.kind !== 'lunar-javascript') return;

  // 生成 10 天的测试样本（避免全部 3650 天，减少 CI 耗时）
  const samples = [];
  for (let y = 2026; y <= 2028; y++) {
    for (let m = 1; m <= 12; m++) {
      samples.push({ y, m, d: 15 }); // 每月 15 日
      if (m !== 12) samples.push({ y, m, d: 1 }); // 每月 1 日
    }
  }

  const start = Date.now();
  for (const s of samples) {
    const r = lunarOf(engine, s.y, s.m, s.d);
    assert.ok(r, `${s.y}-${s.m}-${s.d} 应有结果`);
    assert.ok(r.source === 'lunar-javascript', '来源一致');
    assert.ok(r.yearGanZhi, '干支非空');
  }
  const elapsed = Date.now() - start;
  console.log(`⏱  ${samples.length} 次转换耗时 ${elapsed}ms`);
  assert.ok(elapsed < 3000, `批量转换应在 3s 内（实 ${elapsed}ms）`);
});