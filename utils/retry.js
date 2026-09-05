/**
 * utils/retry.js
 * 退避重试纯函数（Sprint R3，文档 A.5 口径）
 * 抽离为纯 JS 供单测；request.ts 引用
 */

/** 指数退避延迟：step 0/1/2/3/4 → 1s/2s/4s/8s/16s（封顶 16s） */
function retryDelayMs(step) {
  const s = Math.max(0, Math.floor(Number(step) || 0));
  return Math.min(1000 * Math.pow(2, s), 16000);
}

/** 可重试错误码：超时/网关/服务端瞬时故障；4xx 业务错误（400/403/404）绝不重试 */
const RETRYABLE_CODES = [408, 500, 502, 503];
function isRetryable(code) {
  return RETRYABLE_CODES.includes(Number(code));
}

/**
 * withRetry - 读路径退避重试包装
 * @param {Function} fn      async 调用，返回 { error?: { code } }
 * @param {number}   retries 最多重试次数（默认 2，即最多 3 次尝试）
 * @param {Function} [sleep] 等待函数（默认 setTimeout，测试注入假时钟）
 */
async function withRetry(fn, retries = 2, sleep = (ms) => new Promise(r => setTimeout(r, ms))) {
  let attempt = 0;
  for (;;) {
    const res = await fn(attempt);
    if (!res || !res.error || !isRetryable(res.error.code) || attempt >= retries) {
      return res;
    }
    await sleep(retryDelayMs(attempt));
    attempt++;
  }
}

module.exports = { retryDelayMs, isRetryable, withRetry, RETRYABLE_CODES };
