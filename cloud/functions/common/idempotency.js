/**
 * cloud/functions/common/idempotency.js
 * 积分/写入幂等控制（文档 7.5 防超发）
 *
 * 幂等键 = bizType + bizId + userId（文档定案），分隔符用 ':' 避免歧义
 * 纯函数生成键；查重逻辑由调用方执行（先查流水 → 命中即返回既有结果）
 */

function idempotencyKey({ bizType, bizId, userId }) {
  if (!bizType || !bizId || !userId) {
    throw new Error('idempotencyKey requires bizType, bizId, userId');
  }
  return `${bizType}:${bizId}:${userId}`;
}

/** 指数退避重试延迟表（文档 A.5 失败重试最多 5 次） */
const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000];

function retryDelay(attempt) {
  if (attempt < 1 || attempt > RETRY_DELAYS_MS.length) return null;
  return RETRY_DELAYS_MS[attempt - 1];
}

module.exports = { idempotencyKey, retryDelay, RETRY_DELAYS_MS };
