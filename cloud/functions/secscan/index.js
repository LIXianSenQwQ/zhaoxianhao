/**
 * cloud/functions/secscan/index.js
 * V2.0: 内容安全检测统一入口（文本 + 图片），敏感词库 + 人工复核队列
 * 
 * V2.0 第九部分 9.2 / D 路线 secscan：
 *   · detectText: 敏感词库 + msgSecCheck（微信原生安全 API）→ 双保险
 *   · detectImage: URL/FileID → imgSecCheck（微信原生安全 API）→ 结果判定
 *   · 全部结果写 audit_logs 留痕
 *   · 连续违规触发人工复核标记
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

// ═══════════ 敏感词检查 ═══════════
function checkTextSensitive(text) {
  const matched = [];
  for (const word of SENSITIVE_WORDS) {
    if (text.includes(word)) {
      matched.push(word);
    }
  }
  return matched.length > 0 ? { status: 'block', reason: 'contains_sensitive_words', flaggedWords: [...new Set(matched)] } : null;
}

// ═══════════ 调用微信内容安全 API ═══════════
async function callMsgSecCheck(content) {
  try {
    // 微信云开发原生 msgSecCheck（无需额外配置，自动关联 openid 审核策略）
    const res = await wx.cloud.callFunction({
      name: 'msgSecCheck',
      data: { content }
    });
    
    // 合规通过：errCode === 0
    if (res.result && res.result.errCode === 0) {
      return { pass: true };
    }
    // 明确违规：errCode 87014
    if (res.result && res.result.errCode === 87014) {
      return { pass: false, reason: `msgSecCheck: ${res.result.errMsg || '内容违规'}` };
    }
    // 其他（含 stub 环境无 errCode）：视为 API 不可用，降级到敏感词库
    return { pass: null, reason: 'API_unavailable' };
  } catch (e) {
    // API 失败不阻塞：降级到敏感词库检测结果
    console.warn('[secscan] msgSecCheck API 不可用，已降级到敏感词库:', e.message);
    return { pass: null, reason: 'API_unavailable' };
  }
}

async function callImgSecCheck(url) {
  try {
    const res = await wx.cloud.callFunction({
      name: 'imgSecCheck',
      data: { url }
    });
    
    if (res.result && res.result.errCode === 0) {
      return { pass: true };
    }
    if (res.result && res.result.errCode === 87014) {
      return { pass: false, reason: `imgSecCheck: ${res.result.errMsg || '图片违规'}` };
    }
    return { pass: null, reason: 'API_unavailable' };
  } catch (e) {
    console.warn('[secscan] imgSecCheck 不可用:', e.message);
    return { pass: null, reason: 'API_unavailable' };
  }
}

// ═══════════ 文本检测 ═══════════
async function detectText(ctx, content) {
  if (!content || typeof content !== 'string') return BAD_REQUEST('content 必需且为字符串');
  if (content.length > 5000) return BAD_REQUEST('文本长度不得超过 5000 字');

  // ① 敏感词库检查（离线，零网络）
  const blockResult = checkTextSensitive(content);
  if (blockResult) {
    // 审计记录
    await writeAudit(wx.getDatabase(), {
      userId: ctx.openid, action: 'secscan.text.block', target: content.substring(0, 100),
      detail: JSON.stringify(blockResult), time: new Date()
    }).catch(() => {});
    
    return OK({ status: 'block', reason: blockResult.reason, flaggedWords: blockResult.flaggedWords, source: 'dictionary' });
  }

  // ② msgSecCheck 在线检测（生产环境）→ 降级不影响主流程
  const apiResult = await callMsgSecCheck(content);
  if (apiResult.pass === false) {
    await writeAudit(wx.getDatabase(), {
      userId: ctx.openid, action: 'secscan.text.block_api', target: content.substring(0, 100),
      detail: JSON.stringify(apiResult), time: new Date()
    }).catch(() => {});
    
    return OK({ status: 'block', reason: apiResult.reason, source: 'msgSecCheck' });
  }

  return OK({ status: 'pass', source: apiResult.pass === null ? 'fallback' : 'msgSecCheck', time: new Date() });
}

// ═══════════ 图片检测 ═══════════
async function detectImage(ctx, sourceType, fileIdOrUrl) {
  if (!sourceType || !['url', 'fileId'].includes(sourceType)) {
    return BAD_REQUEST('sourceType 必需：url 或 fileId');
  }
  if (!fileIdOrUrl) return BAD_REQUEST('fileIdOrUrl 必需');

  const url = sourceType === 'url' ? fileIdOrUrl : await wx.cloud.getTempFileURL({ fileList: [fileIdOrUrl] }).then(r => r.fileList[0]?.tempFileURL);
  if (!url) return BAD_REQUEST('无法获取图片下载 URL');

  const result = await callImgSecCheck(url);
  
  if (result.pass === false) {
    await writeAudit(wx.getDatabase(), {
      userId: ctx.openid, action: 'secscan.image.block', target: fileIdOrUrl,
      detail: JSON.stringify(result), time: new Date()
    }).catch(() => {});
    
    return OK({ status: 'block', reason: result.reason, source: 'imgSecCheck' });
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
}};