/**
 * cloud/functions/common/response.js
 * 云函数统一响应格式（文档 6.2 第 4 条：403 + 授权申请路由，不白屏）
 */

const OK = (data) => ({ success: true, data });

const ERR = (code, message, extra) => ({ success: false, code, message, ...extra });

/** 403 权限不足：必须携带授权申请路由，前端展示申请卡而非白屏（文档十一章） */
const FORBIDDEN = (message = '权限不足', applyRoute = '/pages/privacy/privacy') =>
  ERR(403, message, { needAuthCard: true, applyRoute });

/** 功能开关关闭（文档 17.3：返回 403 + 明确文案） */
const FLAG_DISABLED = (flagKey) =>
  ERR(403, `功能「${flagKey}」暂未开放`, { flagDisabled: true, flagKey });

/** 参数校验失败 */
const BAD_REQUEST = (message) => ERR(400, message);

const NOT_FOUND = (message = '资源不存在') => ERR(404, message);

/** 409 并发冲突（R36：members.version 乐观锁，框架§3.1 方案 A）——前端提示刷新后重试 */
const CONFLICT = (message = '该记录已被他人修改，请刷新后重试', extra) => ERR(409, message, extra);

module.exports = { OK, ERR, FORBIDDEN, FLAG_DISABLED, BAD_REQUEST, NOT_FOUND, CONFLICT };
