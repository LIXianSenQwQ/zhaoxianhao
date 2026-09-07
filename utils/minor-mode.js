/**
 * utils/minor-mode.js
 * 少年模式合规守卫（V2.0 未成年人红线：游戏 ≤30 分钟/日 + 娱乐八卦屏蔽）
 * 纯函数无副作用（storage 读写由调用方注入），Node/小程序双端可测。
 * 时间单位统一毫秒；日期键统一本地 YYYY-MM-DD。
 */
export const CHILD_DAILY_LIMIT_MS = 30 * 60 * 1000; // 每日 30 分钟

/** 被屏蔽的一级分类（未成年人不可见，蓝本红线：娱乐八卦） */
export const BLOCKED_NEWS_CATEGORY = '娱乐体育';

/** 本地日期键（YYYY-MM-DD，避免跨时区 UTC 偏移） */
export function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 归一化当日用量记录：跨日自动重置（date 不等于 today 则归零）
 * @param {any} raw 存储原文（JSON 字符串或对象或 null）
 * @param {string} today 本地日期键
 * @returns {{ date: string, usedMs: number }}
 */
export function normalizeUsage(raw, today = todayKey()) {
  let data = raw;
  if (typeof raw === 'string') {
    try { data = JSON.parse(raw || '{}'); }
    catch { data = {}; }
  }
  if (!data || typeof data !== 'object') data = {};
  if (data.date !== today) return { date: today, usedMs: 0 };
  const used = Number(data.usedMs) || 0;
  return { date: today, usedMs: Math.max(0, used) };
}

/**
 * 当日剩余可玩毫秒（钳制 ≥0）
 */
export function remainingMs(raw, today = todayKey(), limitMs = CHILD_DAILY_LIMIT_MS) {
  const { usedMs } = normalizeUsage(raw, today);
  return Math.max(0, limitMs - usedMs);
}

/** 是否还可进入（剩余 > 0） */
export function canPlay(raw, today = todayKey(), limitMs = CHILD_DAILY_LIMIT_MS) {
  return remainingMs(raw, today, limitMs) > 0;
}

/**
 * 记录本次游玩耗用，返回新记录（调用方负责 setStorageSync）
 * @param raw 现有记录
 * @param costMs 本次耗用毫秒
 * @param today 本地日期键
 * @returns 更新后的记录 { date, usedMs }
 */
export function consume(raw, costMs, today = todayKey(), limitMs = CHILD_DAILY_LIMIT_MS) {
  const base = normalizeUsage(raw, today);
  const used = Math.min(limitMs, base.usedMs + Math.max(0, Number(costMs) || 0));
  return { date: today, usedMs: used };
}

/** 是否耗尽（剩余 ≤0） */
export function isExhausted(raw, today = todayKey(), limitMs = CHILD_DAILY_LIMIT_MS) {
  return remainingMs(raw, today, limitMs) <= 0;
}

/** 结算最小计费粒度：低于 1 秒的滞留不累计（防误触/闪进闪出） */
export const SETTLE_MIN_MS = 1000;

/**
 * 真实前台停留结算：把 [startMs, endMs] 的停留时长累计进当日用量。
 * 纯函数无副作用，供子游戏页 onHide/onUnload 调用的核心逻辑（可单测）。
 * @param raw 现有记录
 * @param startMs 进入页面时刻（毫秒时间戳）
 * @param endMs 离开页面时刻（毫秒时间戳）
 * @param today 本地日期键
 * @param limitMs 每日上限
 * @returns { { date, usedMs, settledMs } } settledMs 为本次实际累计的毫秒
 */
export function settleSession(raw, startMs, endMs, today = todayKey(), limitMs = CHILD_DAILY_LIMIT_MS) {
  const s = Number(startMs) || 0;
  const e = Number(endMs) || 0;
  const elapsed = Math.max(0, e - s);
  if (elapsed < SETTLE_MIN_MS) {
    const base = normalizeUsage(raw, today);
    return { date: today, usedMs: base.usedMs, settledMs: 0 };
  }
  const next = consume(raw, elapsed, today, limitMs);
  return { date: today, usedMs: next.usedMs, settledMs: elapsed };
}

/**
 * 少年模式分类过滤：childMode 开启时移除被屏蔽分类（保持原数组不变）
 * @param {string[]} categories
 * @param {boolean} childMode
 * @param {string} blocked
 * @returns {string[]}
 */
export function filterCategories(categories, childMode, blocked = BLOCKED_NEWS_CATEGORY) {
  const list = Array.isArray(categories) ? categories : [];
  if (!childMode) return list.slice();
  return list.filter(c => c !== blocked);
}

/** 从 features/minorProtection 读每日上限（允许族议会调参；默认 30 分钟） */
export function dailyLimitFromFlags(flags = {}) {
  const min = flags?.minorProtection?.gameDailyLimitMin;
  const n = Number(min);
  return Number.isFinite(n) && n > 0 ? n * 60 * 1000 : CHILD_DAILY_LIMIT_MS;
}
