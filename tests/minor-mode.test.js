/**
 * tests/minor-mode.test.js
 * 少年模式合规守卫纯函数单测（V2.0 未成年人红线）
 */
const test = require('node:test');
const assert = require('node:assert');
const {
  CHILD_DAILY_LIMIT_MS, BLOCKED_NEWS_CATEGORY,
  todayKey, normalizeUsage, remainingMs, canPlay,
  consume, isExhausted, filterCategories, dailyLimitFromFlags
} = require('../utils/minor-mode.js');

test('todayKey: 输出本地 YYYY-MM-DD 格式', () => {
  const d = new Date(2026, 8, 7); // 2026-09-07
  assert.strictEqual(todayKey(d), '2026-09-07');
});

test('normalizeUsage: 空输入 → 当日零记录', () => {
  const t = todayKey();
  const r = normalizeUsage(null, t);
  assert.strictEqual(r.date, t);
  assert.strictEqual(r.usedMs, 0);
});

test('normalizeUsage: 解析 JSON 字符串', () => {
  const t = todayKey();
  const r = normalizeUsage(JSON.stringify({ date: t, usedMs: 60000 }), t);
  assert.strictEqual(r.usedMs, 60000);
});

test('normalizeUsage: 跨日自动重置', () => {
  const yesterday = '2026-09-06';
  const today = '2026-09-07';
  const r = normalizeUsage({ date: yesterday, usedMs: 60000 }, today);
  assert.strictEqual(r.date, today);
  assert.strictEqual(r.usedMs, 0);
});

test('normalizeUsage: 非法 JSON 容错 → 零记录', () => {
  const t = todayKey();
  const r = normalizeUsage('not-json{{{', t);
  assert.strictEqual(r.usedMs, 0);
});

test('remainingMs: 全新记录 = 30 分钟上限', () => {
  assert.strictEqual(remainingMs(null, '2026-09-07'), CHILD_DAILY_LIMIT_MS);
});

test('remainingMs: 已用 10 分钟 → 剩余 20 分钟', () => {
  const raw = { date: '2026-09-07', usedMs: 10 * 60 * 1000 };
  assert.strictEqual(remainingMs(raw, '2026-09-07'), 20 * 60 * 1000);
});

test('remainingMs: 超过上限钳制为 0', () => {
  const raw = { date: '2026-09-07', usedMs: 99 * 60 * 1000 };
  assert.strictEqual(remainingMs(raw, '2026-09-07'), 0);
});

test('canPlay: 有剩余可玩 / 耗尽不可玩', () => {
  const t = '2026-09-07';
  assert.strictEqual(canPlay({ date: t, usedMs: 60000 }, t), true);
  assert.strictEqual(canPlay({ date: t, usedMs: CHILD_DAILY_LIMIT_MS }, t), false);
  assert.strictEqual(canPlay({ date: t, usedMs: 0 }, t), true);
});

test('consume: 累加耗用', () => {
  const t = '2026-09-07';
  const r = consume({ date: t, usedMs: 0 }, 60 * 1000, t);
  assert.strictEqual(r.usedMs, 60 * 1000);
});

test('consume: 封顶不超上限（防越界）', () => {
  const t = '2026-09-07';
  const r = consume({ date: t, usedMs: 29 * 60 * 1000 }, 5 * 60 * 1000, t);
  assert.strictEqual(r.usedMs, CHILD_DAILY_LIMIT_MS);
});

test('consume: 负数耗用忽略', () => {
  const t = '2026-09-07';
  const r = consume({ date: t, usedMs: 60000 }, -1000, t);
  assert.strictEqual(r.usedMs, 60000);
});

test('isExhausted: 边界判定', () => {
  const t = '2026-09-07';
  assert.strictEqual(isExhausted({ date: t, usedMs: CHILD_DAILY_LIMIT_MS }, t), true);
  assert.strictEqual(isExhausted({ date: t, usedMs: CHILD_DAILY_LIMIT_MS - 1 }, t), false);
});

test('filterCategories: 非少年模式原样返回', () => {
  const cats = ['时政要闻', '娱乐体育', '家族专区'];
  assert.deepStrictEqual(filterCategories(cats, false), cats);
});

test('filterCategories: 少年模式剔除娱乐体育', () => {
  const cats = ['时政要闻', '娱乐体育', '家族专区'];
  const out = filterCategories(cats, true);
  assert.deepStrictEqual(out, ['时政要闻', '家族专区']);
  assert.strictEqual(out.includes(BLOCKED_NEWS_CATEGORY), false);
});

test('filterCategories: 空/非数组容错', () => {
  assert.deepStrictEqual(filterCategories(null, true), []);
  assert.deepStrictEqual(filterCategories(undefined, true), []);
});

test('dailyLimitFromFlags: 默认 30 分钟', () => {
  assert.strictEqual(dailyLimitFromFlags({}), CHILD_DAILY_LIMIT_MS);
  assert.strictEqual(dailyLimitFromFlags(null), CHILD_DAILY_LIMIT_MS);
});

test('dailyLimitFromFlags: 读自定义分钟数（族议会调参）', () => {
  const flags = { minorProtection: { gameDailyLimitMin: 20 } };
  assert.strictEqual(dailyLimitFromFlags(flags), 20 * 60 * 1000);
});

test('dailyLimitFromFlags: 非法值回退默认', () => {
  assert.strictEqual(dailyLimitFromFlags({ minorProtection: { gameDailyLimitMin: -5 } }), CHILD_DAILY_LIMIT_MS);
  assert.strictEqual(dailyLimitFromFlags({ minorProtection: { gameDailyLimitMin: 'x' } }), CHILD_DAILY_LIMIT_MS);
});

test('集成: 少年模式 30 分钟全流程（进入 30 次×1 分钟耗尽）', () => {
  const t = '2026-09-07';
  let raw = null;
  let steps = 0;
  while (canPlay(raw, t) && steps < 40) {
    raw = consume(raw, 60 * 1000, t);
    steps++;
  }
  assert.strictEqual(steps, 30); // 恰好 30 次进入后耗尽
  assert.strictEqual(isExhausted(raw, t), true);
});
