/**
 * services/request.ts
 * 统一请求层（性能优化核心，Sprint R1 / R3 补齐重试）
 *
 * 性能预算（文档 2.2）：API ≤200ms；超时 3s 即视为失败并走降级
 * 策略（文档 0.3.3 / 11.5 / A.5）：
 *   1. 缓存优先渲染：先返回本地缓存，再静默刷新
 *   2. 失败重试：仅读路径，指数退避（1s/2s，utils/retry.js，可重试码 408/500/502/503）；
 *      写路径绝不自动重试（幂等键防重，失败提示用户手动重试）
 *   3. 性能埋点：每次调用记录耗时，超 200ms 记 slowCall
 *   4. 幂等键透传：写操作自动生成 bizType:bizId:userId
 */
import { withRetry } from '@/utils/retry';

// ─── 类型 ───
interface CallOptions {
  /** 缓存 key；传入即启用"缓存优先"策略 */
  cacheKey?: string;
  /** 缓存有效期 ms，默认 5 分钟 */
  cacheTTL?: number;
  /** 静默刷新：有缓存时后台更新，不阻塞渲染 */
  silentRefresh?: boolean;
  /** 业务超时 ms，默认 3000（预算 200ms，硬上限 3s） */
  timeout?: number;
  /** 写操作幂等信息 */
  idempotency?: { bizType: string; bizId: string };
}

interface CallResult<T = any> {
  data: T | null;
  fromCache: boolean;
  latencyMs: number;
  error?: { code: number; message: string; needAuthCard?: boolean; applyRoute?: string; flagDisabled?: boolean };
}

// ─── 性能埋点（本地环形缓冲，最多 50 条） ───
const perfBuffer: { name: string; ms: number; ts: number }[] = [];
const PERF_BUDGET_MS = 200;

function recordPerf(name: string, ms: number) {
  perfBuffer.push({ name, ms, ts: Date.now() });
  if (perfBuffer.length > 50) perfBuffer.shift();
  if (ms > PERF_BUDGET_MS) {
    console.warn(`[perf] slowCall ${name} ${ms}ms > ${PERF_BUDGET_MS}ms budget`);
  }
}

export function getPerfReport() {
  const slow = perfBuffer.filter(p => p.ms > PERF_BUDGET_MS);
  const avg = perfBuffer.length
    ? Math.round(perfBuffer.reduce((s, p) => s + p.ms, 0) / perfBuffer.length)
    : 0;
  return { total: perfBuffer.length, slowCount: slow.length, avgMs: avg, budget: PERF_BUDGET_MS };
}

// ─── 缓存层（uni storage） ───
const DEFAULT_TTL = 5 * 60 * 1000;

function readCache(key: string): { data: any; ts: number } | null {
  try {
    const raw = uni.getStorageSync(`hcs:cache:${key}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeCache(key: string, data: any) {
  try {
    uni.setStorageSync(`hcs:cache:${key}`, JSON.stringify({ data, ts: Date.now() }));
  } catch {
    /* 存储满则静默放弃 */
  }
}

// ─── 幂等键（与 cloud/functions/common/idempotency.js 同口径） ───
function makeIdemKey(bizType: string, bizId: string, userId: string) {
  return `${bizType}:${bizId}:${userId}`;
}

// ─── 核心调用 ───
export async function call<T = any>(
  name: string,
  data: Record<string, any>,
  opts: CallOptions = {}
): Promise<CallResult<T>> {
  const {
    cacheKey,
    cacheTTL = DEFAULT_TTL,
    silentRefresh = true,
    timeout = 3000,
    idempotency
  } = opts;

  const started = Date.now();

  // 1. 缓存优先：命中且未过期 → 立即返回，并按需静默刷新
  if (cacheKey) {
    const cached = readCache(cacheKey);
    if (cached && Date.now() - cached.ts < cacheTTL) {
      recordPerf(name, Date.now() - started);
      if (silentRefresh) {
        // 后台刷新不阻塞（同样走退避重试）
        withRetry(() => rawCall<T>(name, data, timeout, idempotency), 2)
          .then(fresh => { if (fresh.data) writeCache(cacheKey, fresh.data); })
          .catch(() => {});
      }
      return { data: cached.data, fromCache: true, latencyMs: Date.now() - started };
    }
  }

  // 2. 直连云函数（读路径退避重试，写路径不重试）
  const exec = () => rawCall<T>(name, data, timeout, idempotency);
  const res: CallResult<T> = idempotency
    ? await exec()
    : await withRetry(exec, 2);
  recordPerf(name, res.latencyMs);

  if (res.data && cacheKey) writeCache(cacheKey, res.data);

  return { ...res, fromCache: false };
}

// ─── 原始调用：超时 + 单次失败退避重试由业务层决定（写操作不重试） ───
function rawCall<T>(
  name: string,
  data: Record<string, any>,
  timeout: number,
  idempotency?: { bizType: string; bizId: string }
): Promise<CallResult<T>> {
  const started = Date.now();

  return new Promise<CallResult<T>>(resolve => {
    let settled = false;
    const finish = (r: CallResult<T>) => {
      if (settled) return;
      settled = true;
      r.latencyMs = Date.now() - started;
      resolve(r);
    };

    // 超时守护：3s 硬上限
    const timer = setTimeout(() => {
      finish({ data: null, fromCache: false, latencyMs: timeout, error: { code: 408, message: '请求超时' } });
    }, timeout);

    // 幂等键注入（写操作）
    const payload = idempotency
      ? { ...data, idemKey: makeIdemKey(idempotency.bizType, idempotency.bizId, uni.getStorageSync('hcs:uid') || 'anon') }
      : data;

    uniCloud.callFunction({ name, data: payload })
      .then((res: any) => {
        clearTimeout(timer);
        const body = res.result;
        if (body?.success) {
          finish({ data: body.data ?? body, fromCache: false, latencyMs: Date.now() - started });
        } else {
          finish({
            data: null,
            fromCache: false,
            latencyMs: Date.now() - started,
            error: {
              code: body?.code ?? 500,
              message: body?.message ?? body?.error ?? '服务异常',
              needAuthCard: body?.needAuthCard,
              applyRoute: body?.applyRoute,
              flagDisabled: body?.flagDisabled
            }
          });
        }
      })
      .catch((err: any) => {
        clearTimeout(timer);
        finish({ data: null, fromCache: false, latencyMs: Date.now() - started, error: { code: 500, message: err?.message || '网络异常' } });
      });
  });
}

// ─── 便捷包装：读操作（带缓存） / 写操作（带幂等） ───
export const read = (name: string, data: any, cacheKey?: string, ttl?: number) =>
  call(name, data, { cacheKey, cacheTTL: ttl });

export const write = (name: string, data: any, bizType: string, bizId: string) =>
  call(name, data, { idempotency: { bizType, bizId } });
