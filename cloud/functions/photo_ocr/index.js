/**
 * cloud/functions/photo_ocr/index.js — 族谱照片 OCR 识别（R29）
 * 
 * V2.0 F3d / 路线 photo_ai:
 *   - uploadTempFileId: 生成临时上传凭证 + 元数据登记
 *   - detectBranchFromPhoto: 照片 → OCR 文本 → 分支字段解析
 *     · 微信图片安全 API (imgSecCheck)
 *     · 可选：接入腾讯云 OCR / 百度 AI，返回结构化分支信息
 *   - 全部结果写 audit_logs 留痕
 *   - 连续失败触发人工复核标记（TODO R30）
 */
const wx = require('wx-server-sdk');
const { OK, BAD_REQUEST, FORBIDDEN } = require('./common/response');
const { hasRole } = require('./common/roles');
const { writeAudit } = require('./common/audit');

wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

// ─── 配置 ───
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const OCR_TIMEOUT_MS = 30000;           // OCR 超时 30s

// ─── 图片安全检测 ───
async function checkImageSafety(tempFileURL) {
  try {
    if (typeof wx.cloud.openSecurity !== 'undefined' && typeof wx.cloud.openSecurity.imgSecCheck === 'function') {
      const res = await wx.cloud.openSecurity.imgSecCheck({
        media: { header: { ContentType: 'image/jpeg' }, body: tempFileURL }
      });
      if (res && res.errCode === 0) return { pass: true };
      if (res && res.errCode === 87014) return { pass: false, reason: `imgSecCheck: ${res.errMsg || '图片违规'}` };
    }
  } catch (e) {
    console.warn('[photo_ocr] openSecurity imgSecCheck 不可用:', e.message);
  }
  return { pass: null, reason: 'API_unavailable' };
}

// ─── 占位 OCR 实现（R29 接入实际服务） ───
async function doOCR(imageURL) {
  // TODO(v2.0 photo_ocr):
  // 方案 A：腾讯云 OCR（推荐）
  //   const tencent = require('@tencent/cloud-ocr');
  //   const res = await tencent.recognizeDocument(imageURL);
  //   return { text: res.text, fields: parseFields(res.text) };
  
  // 方案 B：百度 AI
  //   const baidu = require('baidu-aip-sdk');
  //   ...
  
  // 当前占位：仅返回 URL 和空结果，等待接入
  return { 
    imageURL,
    text: '',
    fields: {
      name: '',
      level: 0,
      parentCode: '',
      region: '',
      description: '',
      generationVerses: ''
    },
    source: 'placeholder'
  };
}

// ─── 简单字段提取规则（辅助函数） ───
function parseFields(text) {
  const fields = {};
  const lines = String(text || '').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    
    // 尝试匹配常见格式
    if (/^name\s*[:：]/i.test(trimmed)) {
      fields.name = trimmed.split(/[:：]/, 2)[1]?.trim() || '';
    } else if (/^level\s*[:：]/i.test(trimmed)) {
      fields.level = parseInt(trimmed.match(/\d+/)?.[0], 10) || 0;
    } else if (/^parent\s*[:：]/i.test(trimmed)) {
      fields.parentCode = trimmed.split(/[:：]/, 2)[1]?.trim() || '';
    } else if (/^(region|地区)\s*[:：]/i.test(trimmed)) {
      fields.region = trimmed.split(/[:：]/, 2)[1]?.trim() || '';
    } else if (/^desc\s*[:：]/i.test(trimmed)) {
      fields.description = trimmed.split(/[:：]/, 2)[1]?.trim() || '';
    } else if (/^verses|字辈/i.test(trimmed)) {
      fields.generationVerses = trimmed.split(/[:：]/, 2)[1]?.trim() || '';
    }
  }
  return fields;
}

// ─── 主逻辑 ───
async function main(event, context) {
  const openid = context.OPENID || context.openid;
  if (!openid) return FORBIDDEN('请先登录');
  const db = wx.getDatabase();
  const { action } = event;

  switch (action) {
    case 'uploadPolicy': {
      return OK({ maxFileSize: MAX_FILE_SIZE, allowedTypes: [...ALLOWED_TYPES] });
    }

    case 'detectBranchFromPhoto': {
      const { fileId, tempFileURL } = event;
      
      if (!fileId && !tempFileURL) {
        return BAD_REQUEST('fileId 或 tempFileURL required');
      }
      
      // ① 安全检测
      const urlToCheck = tempFileURL || await wx.cloud.getTempFileURL({ fileList: [fileId] }).then(r => r.fileList[0]?.tempFileURL);
      if (!urlToCheck) return BAD_REQUEST('无法获取图片下载 URL');
      
      const safetyResult = await checkImageSafety(urlToCheck);
      if (safetyResult.pass === false) {
        await writeAudit(db, { userId: openid, action: 'photo_ocr.block', target: urlToCheck.substring(0, 50), detail: JSON.stringify(safetyResult) });
        return BAD_REQUEST(`图片不合规：${safetyResult.reason}`);
      }

      // ② OCR 识别（异步 timeout 包装）
      let ocrResult;
      try {
        const ocrPromise = doOCR(urlToCheck);
        ocrResult = await Promise.race([
          ocrPromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('OCR timeout')), OCR_TIMEOUT_MS))
        ]);
      } catch (e) {
        console.error('[photo_ocr] error:', e.message);
        await writeAudit(db, { userId: openid, action: 'photo_ocr.fail', target: urlToCheck.substring(0, 50), detail: e.message });
        return BAD_REQUEST(`OCR 识别失败：${e.message}`);
      }

      // ③ 审计
      await writeAudit(db, { 
        userId: openid, 
        action: 'photo_ocr.success', 
        target: urlToCheck.substring(0, 50),
        detail: JSON.stringify({ detectedFields: ocrResult.fields }),
        time: new Date()
      });

      return OK({
        success: true,
        result: ocrResult,
        message: '识别成功（当前为占位模式，请接入真实 OCR 服务）'
      });
    }

    default:
      return BAD_REQUEST(`unknown action: ${action}`);
  }
}

module.exports = { main };
