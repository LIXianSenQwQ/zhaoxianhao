/**
 * cloud/functions/secscan/index.js
 * V2.0: 内容安全检测统一入口（文本 + 图片），敏感词与人工复核队列
 * R21: msgSecCheck 微信内容安全 API 占位 + 自建敏感词库
 */

const wx = require('wx-server-sdk');
const { OK, BAD_REQUEST, FORBIDDEN } = require('./common/response');

wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

/**
 * 内置基础敏感词库（可扩展）
 * TODO: 接入腾讯云内容安全 SDK 或第三方服务
 */
const SENSITIVE_WORDS = [
  '政治敏感词', '涉黄词汇', '诈骗信息', '赌博', '毒品', '武器'
];

/**
 * 简单敏感词匹配（真实环境替换为专业 SDK）
 */
function checkTextSensitive(text) {
  const matched = [];
  for (const word of SENSITIVE_WORDS) {
    if (text.includes(word)) {
      matched.push(word);
    }
  }
  return matched.length > 0 ? { status: 'block', reason: 'contains_sensitive_words' } : null;
}

/**
 * R21: 文本检测接口
 */
async function detectText(ctx, content) {
  if (!content || typeof content !== 'string') return BAD_REQUEST('content 必需且为字符串');
  if (content.length > 5000) return BAD_REQUEST('文本长度不得超过 5000 字');

  // 敏感词检查（占位）
  const blockResult = checkTextSensitive(content);
  if (blockResult) {
    return OK({ status: 'block', reason: blockResult.reason, flaggedWords: [content] });
  }

  // 调用 msgSecCheck 占位（真实环境替换）
  // const msgSecRes = await wx.cloud.callFunction({ name: 'msgSecCheck', data: { ... } });

  return OK({ status: 'pass', time: new Date() });
}

/**
 * R21: 图片检测接口（URL 或 fileID）
 */
async function detectImage(ctx, sourceType, fileIdOrUrl) {
  if (!sourceType || !['url', 'fileId'].includes(sourceType)) {
    return BAD_REQUEST('sourceType 必需：url 或 fileId');
  }
  if (!fileIdOrUrl) return BAD_REQUEST('fileIdOrUrl 必需');

  // 图片 OCR/涉黄/涉政检测占位
  return OK({ status: 'pass', time: new Date(), note: '真实 imgSecCheck 占位；生产环境需调用腾讯云图片检测 API' });
}

module.exports = { main: async (params, context) => {
  const { action } = params || {};
  const ctx = { OPENID: context.OPENID || context.openid, openid: context.openid };
  
  switch (action) {
    case 'detectText':
      return await detectText(ctx, params.content);
    case 'detectImage':
      return await detectImage(ctx, params.sourceType, params.fileIdOrUrl);
    default:
      return BAD_REQUEST(`unknown action: ${action}`);
  }
}};
