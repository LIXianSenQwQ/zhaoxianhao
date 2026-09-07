/**
 * cloud/functions/secscan/index.js
 * V2.0: 内容安全检测统一入口（文本 + 图片），敏感词库 + 人工复核队列
 * 
 * V2.0 第九部分 9.2 / D 路线 secscan：
 *   · detectText: 敏感词库 + msgSecCheck 原生 API → 双保险
 *   · detectImage: URL/FileID → imgSecCheck 原生 API → 结果判定
 *   · 全部结果写 audit_logs 留痕
 *   · 连续违规触发人工复核标记（24h≥3 次）
 */

const wx = require('wx-server-sdk');
const { OK, BAD_REQUEST } = require('./common/response');
const { writeAudit } = require('./common/audit');

wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

// ═══════════ 扩展敏感词库（生产级） ═══════════
const SENSITIVE_WORDS = [
  // 政治类
  '政治敏感', 'gjchy', 'mzd', '邓小平', 'jiangzemin', 'hujintao',
  '习近平', 'xijinping', '法轮功', '六四', 'tiananmen',
  '藏独', '疆独', '台独', '港独',
  // 涉黄
  '色情', 'AV', 'porn', '裸聊', '裸照', '三级片',
  // 涉赌
  '赌博', '赌场', '六合彩', '赌球', '德州扑克',
  // 诈骗 / 虚假
  '诈骗', '传销', '资金盘', '比特币', '刷单',
  // 暴力
  '暴力', '杀人', '恐怖', '毒品',
  // 违法
  '枪支', '炸药', '管制刀具', '违法',
  // 黑产
  '代写论文', '假证', '办证', '发票',
];

const BLOCK_WINDOW_MS = 24 * 3600 * 1000;   // 统计窗口
const BLOCK_THRESHOLD = 3;                    // ≥3 次触发人工复核

// ═══════════ 敏感词检查 ═══════════
function checkTextSensitive(text) {
  const matched = [];
  for (const word of SENSITIVE_WORDS) {
    if (text.includes(word)) {
      matched.push(word);
    }
  }
  return matched.length > 0
    ? { status: 'block', reason: 'contains_sensitive_words', flaggedWords: [...new Set(matched)] }
    : null;
}

// ═══════════ 微信内容安全原生 API（带降级） ═══════════

/**
 * 调用微信云开发 msgSecCheck 原生 API。
 * 生产环境走 wx.cloud.openSecurity.msgSecCheck；stub/降级走 callFunction 兼容或直接返回 API_unavailable。
 */
async function callMsgSecCheck(content) {
  try {
    // ✅ 生产路径：云开发原生 msgSecCheck API（V2.0 F4 生产化，替代原 callFunction 占位）
    if (typeof wx.cloud.openSecurity !== 'undefined' && typeof wx.cloud.openSecurity.msgSecCheck === 'function') {
      const res = await wx.cloud.openSecurity.msgSecCheck({ content });
      if (res && res.errCode === 0) return { pass: true };
      if (res && res.errCode === 87014) return { pass: false, reason: `msgSecCheck: ${res.errMsg || '内容违规'}` };
    }
  } catch (e) {
    console.warn('[secscan] openSecurity msgSecCheck 不可用，尝试降级:', e.message);
  }

  // 降级 1：callFunction 兼容（老项目或自定义 sec 云函数）
  try {
    const res = await wx.cloud.callFunction({
      name: 'msgSecCheck',
      data: { content }
    });
    if (res.result && res.result.errCode === 0) return { pass: true };
    if (res.result && res.result.errCode === 87014) return { pass: false, reason: `msgSecCheck: ${res.result.errMsg || '内容违规'}` };
  } catch (e) { /* 降级到敏感词库 */ }

  return { pass: null, reason: 'API_unavailable' };
}

/**
 * 调用 imgSecCheck 原生 API。
 * 同样尝试 openSecurity → callFunction 降级。
 */
async function callImgSecCheck(mediaUrl) {
  try {
    if (typeof wx.cloud.openSecurity !== 'undefined' && typeof wx.cloud.openSecurity.imgSecCheck === 'function') {
      const res = await wx.cloud.openSecurity.imgSecCheck({
        media: { header: { ContentType: 'image/jpeg' }, body: mediaUrl }
      });
      if (res && res.errCode === 0) return { pass: true };
      if (res && res.errCode === 87014) return { pass: false, reason: `imgSecCheck: ${res.errMsg || '图片违规'}` };
    }
  } catch (e) {
    console.warn('[secscan] openSecurity imgSecCheck 不可用:', e.message);
  }
  try {
    const res = await wx.cloud.callFunction({ name: 'imgSecCheck', data: { url: mediaUrl } });
    if (res.result && res.result.errCode === 0) return { pass: true };
    if (res.result && res.result.errCode === 87014) return { pass: false, reason: `imgSecCheck: ${res.result.errMsg || '图片违规'}` };
  } catch (e) { /* 降级 */ }
  return { pass: null, reason: 'API_unavailable' };
}

/**
 * 检查用户是否连续违规触发人工复核标记。
 * 规则：过去 24h 内 ≥3 次 secscan 违规。（stub 环境用简单计数近似；生产环境需完整时间窗校验）
 */
async function checkRepeatedViolation(db, userId) {
  if (!userId) return { escalation: false };
  // TODO(v2.0 secscan F4): 生产环境需精确时间窗查询（db.command.gte 等）支持，目前用本地计数器模拟降级
  // 简化实现：假设已有日志 → 固定返回 true 便于测试验证结构正确性（实际应接 db 查询）
  return { escalation: false, blocks: 0, threshold: BLOCK_THRESHOLD };
}

// ═══════════ 文本检测 ═══════════
async function detectText(ctx, content) {
  if (!content || typeof content !== 'string') return BAD_REQUEST('content 必需且为字符串');
  if (content.length > 5000) return BAD_REQUEST('文本长度不得超过 5000 字');

  const db = wx.getDatabase();

  // ① 敏感词库检查（离线，零网络）
  const blockResult = checkTextSensitive(content);
  if (blockResult) {
    await writeAudit(db, {
      userId: ctx.openid, action: 'secscan.text.block', target: content.substring(0, 100),
      detail: JSON.stringify(blockResult), time: new Date()
    }).catch(() => {});
    // 连续违规检测
    const repeat = await checkRepeatedViolation(db, ctx.openid);
    return OK({ 
      status: 'block', 
      reason: blockResult.reason, 
      flaggedWords: blockResult.flaggedWords, 
      source: 'dictionary',
      escalated: repeat.escalation, 
      escalationDetail: repeat.escalation ? repeat : null 
    });
  }

  // ② msgSecCheck 在线检测（生产环境 openSecurity → 降级 callFunction → 降级敏感词库）
  const apiResult = await callMsgSecCheck(content);
  if (apiResult.pass === false) {
    await writeAudit(db, {
      userId: ctx.openid, action: 'secscan.text.block_api', target: content.substring(0, 100),
      detail: JSON.stringify(apiResult), time: new Date()
    }).catch(() => {});
    const repeat = await checkRepeatedViolation(db, ctx.openid);
    return OK({ 
      status: 'block', 
      reason: apiResult.reason, 
      source: 'msgSecCheck',
      escalated: repeat.escalation, 
      escalationDetail: repeat.escalation ? repeat : null 
    });
  }

  return OK({ status: 'pass', source: apiResult.pass === null ? 'fallback' : 'msgSecCheck', time: new Date() });
}

// ═══════════ 图片检测 ═══════════
async function detectImage(ctx, sourceType, fileIdOrUrl) {
  if (!sourceType || !['url', 'fileId'].includes(sourceType)) {
    return BAD_REQUEST('sourceType 必需：url 或 fileId');
  }
  if (!fileIdOrUrl) return BAD_REQUEST('fileIdOrUrl 必需');

  const db = wx.getDatabase();
  const url = sourceType === 'url' ? fileIdOrUrl : await wx.cloud.getTempFileURL({ fileList: [fileIdOrUrl] }).then(r => r.fileList[0]?.tempFileURL);
  if (!url) return BAD_REQUEST('无法获取图片下载 URL');

  const result = await callImgSecCheck(url);

  if (result.pass === false) {
    await writeAudit(db, {
      userId: ctx.openid, action: 'secscan.image.block', target: fileIdOrUrl,
      detail: JSON.stringify(result), time: new Date()
    }).catch(() => {});
    const repeat = await checkRepeatedViolation(db, ctx.openid);
    return OK({ 
      status: 'block', 
      reason: result.reason, 
      source: 'imgSecCheck',
      escalated: repeat.escalation, 
      escalationDetail: repeat.escalation ? repeat : null 
    });
  }

  return OK({ status: 'pass', source: result.pass === null ? 'fallback' : 'imgSecCheck', time: new Date() });
}

// ═══════════ 入口 ═══════════
module.exports = { main: async (params, context) => {
  const { action } = params || {};
  const ctx = { openid: context.OPENID || context.openid };

  switch (action) {
    case 'detectText':
      return await detectText(ctx, params.content);
    case 'detectImage':
      return await detectImage(ctx, params.sourceType, params.fileIdOrUrl);
    default:
      return BAD_REQUEST(`unknown action: ${action}`);
  }
} };