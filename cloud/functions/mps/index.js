/**
 * cloud/functions/mps/index.js
 * V1.1 E2: 腾讯云媒体处理 MPS ProcessMedia API 封装
 * 真实环境需配置环境变量：MPS_SECRET_ID、MPS_SECRET_KEY、MPS_APP_ID、MPS_REGION
 */

const wx = require('wx-server-sdk');
const { OK, BAD_REQUEST, FORBIDDEN } = require('./common/response');
const { hasRole } = require('./common/roles');

wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

/**
 * 调用媒体处理 HTTP API 的占位实现（真实环境替换）
 * POST https://mps.<Region>.myqcloud.com/v1/processvideo
 */
async function transcodeVideo(fileId, templateId, duration) {
  // 时长校验（与 upload.triggerMps 一致）
  if (duration > 60) return BAD_REQUEST('视频时长必须 ≤60s');

  const config = process.env.MPS_CONFIG || {};
  const { MPS_SECRET_ID, MPS_SECRET_KEY, MPS_APP_ID } = config;

  if (!MPS_SECRET_ID || !MPS_SECRET_KEY) {
    // 未配置 → 降级占位 URL
    const now = Date.now();
    return {
      success: true,
      data: {
        transcodedFileId: `video-h264-transcoded.webp`,
        coverFrameUrl: `https://cdn-cover-frame-${now}.jpg`,
        note: 'MPS 未配置，占位 ID；真实环境由腾讯云 HTTP API 回调更新'
      }
    };
  }

  // 真实实现占位：模拟响应
  const timestamp = Date.now();
  return {
    success: true,
    data: {
      taskIds: [`mps-task-${timestamp}`],
      status: 'PROCESSING',
      templateId,
      note: '真实 MPS API 调用占位；生产环境需发起 HTTPS POST 并等待回调'
    }
  };
}

/**
 * R21: MPS 转码接口
 */
async function transcoding(ctx, fileId, duration, templateId = 'h264_mp4_720p') {
  if (!fileId) return BAD_REQUEST('缺少 fileId');
  if (typeof duration !== 'number') return BAD_REQUEST('duration 必需为数字');
  if (!hasRole(ctx.role, 'EDITOR')) {
    if (ctx.openid !== ctx.userId) return FORBIDDEN('仅属主或管理员可触发 MPS');
  }

  const res = await transcodeVideo(fileId, templateId, duration);
  if (res.code === 400) return BAD_REQUEST(res.message);
  return OK(res.data);
}

module.exports = { main: async (params, context) => {
  const { action } = params || {};
  const userId = params.userId || context.openid;
  const ctx = { OPENID: context.OPENID || context.openid, openid: context.openid, role: context.role || 'VISITOR', userId };
  
  switch (action) {
    case 'transcode':
      return await transcoding(ctx, params.fileId, params.duration, params.templateId);
    default:
      return BAD_REQUEST(`unknown action: ${action}`);
  }
}};
