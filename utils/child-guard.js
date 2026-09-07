/**
 * utils/child-guard.js
 * 少年模式「子游戏页」守卫组合式函数（V2.0 未成年人红线闭环）
 *
 * 背景：游戏中心 index.vue 的限时只守入口（预扣 1 分钟/次），用户进入子页后
 * 滞留时长未真实累计 → 可无限滞留；且深链直达子页可完全绕过守卫。
 *
 * 本守卫接入每个游戏子页：
 *   1. onShow   — childMode 开启时：剩余耗尽 → toast + 返回（拦截深链/超时再入）
 *   2. onShow   — 记录本次前台会话起始时间
 *   3. 60s 轮询 — 前台滞留至耗尽 → 强制结算并退出（到点即停）
 *   4. onHide / onUnload — 按真实停留毫秒 settleSession 写回（≥1s 才计费，防闪进闪出）
 *
 * 用法（子页 <script setup> 顶层调用一次即可）：
 *   import { useChildGuard } from '@/utils/child-guard.js';
 *   useChildGuard();
 *
 * 纯计费逻辑见 utils/minor-mode.js settleSession（单测覆盖），本文件仅薄壳编排。
 */
import { onShow, onHide, onUnload } from '@dcloudio/uni-app';
import { useUserStore } from '@/stores/user';
import {
  canPlay, isExhausted, settleSession, todayKey, dailyLimitFromFlags
} from './minor-mode.js';

const STORAGE_KEY = 'hcs:childmode:games'; // 与 game/index.vue 共用同一把日锁
const POLL_MS = 60 * 1000;                 // 前台到点轮询间隔

export function useChildGuard(options = {}) {
  const store = useUserStore();
  const storageKey = options.storageKey || STORAGE_KEY;
  const pollMs = options.pollMs || POLL_MS;

  let sessionStart = 0;   // 0 = 无进行中的会话
  let pollTimer = null;

  function dailyLimitMs() {
    let flags = {};
    try { flags = (typeof window !== 'undefined' && window._featureFlags) || {}; } catch {}
    return dailyLimitFromFlags(flags);
  }
  function readRaw() {
    try { return uni.getStorageSync(storageKey); } catch { return null; }
  }
  function writeRecord(record) {
    try { uni.setStorageSync(storageKey, JSON.stringify(record)); } catch {}
  }
  function isActive() { return !!store.childMode; }

  function leaveWithToast() {
    try { uni.showToast({ title: '今日游戏时间已用完', icon: 'none' }); } catch {}
    setTimeout(() => {
      uni.navigateBack({
        delta: 1,
        fail: () => { try { uni.reLaunch({ url: '/pages/index/index' }); } catch {} }
      });
    }, 500);
  }

  function stopPoll() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }
  function startPoll() {
    if (pollTimer) return;
    pollTimer = setInterval(() => {
      if (!isActive() || !sessionStart) return;
      if (isExhausted(readRaw(), todayKey(), dailyLimitMs())) {
        settle();       // 先结算再退出，避免丢最后一段
        leaveWithToast();
      }
    }, pollMs);
  }

  /** 进入页面：耗尽拦截，否则开启会话（幂等） */
  function onEnter() {
    if (!isActive()) { sessionStart = 0; stopPoll(); return; }
    if (!canPlay(readRaw(), todayKey(), dailyLimitMs())) {
      leaveWithToast();
      return;
    }
    if (!sessionStart) sessionStart = Date.now();
    startPoll();
  }

  /** 离开/切后台：按真实停留毫秒结算（幂等：结算后清空会话） */
  function settle() {
    if (!sessionStart) return;
    const next = settleSession(readRaw(), sessionStart, Date.now(), todayKey(), dailyLimitMs());
    if (next.settledMs > 0) writeRecord({ date: next.date, usedMs: next.usedMs });
    sessionStart = 0;
    stopPoll();
  }

  onShow(onEnter);
  onHide(settle);
  onUnload(() => { settle(); });

  return { onEnter, settle };
}
