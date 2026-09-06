/**
 * cloud/functions/ci/index.js
 * V1.1 E2: 腾讯云数据万象 ImageProcessJob HTTP API 封装
 * 真实环境需配置环境变量：CI_SECRET_ID、CI_SECRET_KEY、CI_BUCKET、CI_REGION
 * 本骨架使用签名占位，真实部署时替换为 HMAC-SHA256 签名
 */

const wx = require('wx-server-sdk');
const { OK, BAD_REQUEST, FORBIDDEN } = require('./common/response');
const { hasRole } = require('./common/roles');

wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

/**
 * 计算签名的占位实现（真实环境替换）
 * TODO: 接入腾讯云 CICMSDK 或手写 HMAC-SHA256 签名
 */
function computeCiSignature(params, secretId, secretKey) {
  // 占位返回 dummy signature
  const timestamp = Math.floor(Date.now() / 1000);
  return `signature-dummy-${timestamp}-${secretId}`;
}

/**
 * 调用数据万象 HTTP API 的占位实现（真实环境替换）
 * POST https://{Bucket}-image.<Region>.myqcloud.com?imageProcess=<Operation>&sign=q-sign-algorithm...
 */
async function triggerCiProcess(fileUrl, operations = []) {
  const config = process.env.CI_CONFIG || {};
  const { CI_SECRET_ID, CI_SECRET_KEY, CI_BUCKET, CI_REGION } = config;

  if (!CI_SECRET_ID || !CI_SECRET_KEY) {
    // 未配置 → 降级占位 URL
    const now = Date.now();
    return {
      success: true,
      data: {
        thumbnailUrls: {
          s: `https://cdn-thumb-s.webp`,
          m: `https://cdn-thumb-m.webp`,
          l: `https://cdn-thumb-l.webp`
        },
        compressedUrl: `https://cdn-webp-compressed.webp`,
        note: 'CI 未配置，占位 URL；真实环境由腾讯云 HTTP API 回调更新'
      }
    };
  }

  // 真实实现占位：模拟响应
  const timestamp = Math.floor(Date.now() / 1000);
  const params = { action: 'process', sourceFileId: fileUrl.split('/').pop(), operations };
  const signature = computeCiSignature(params, CI_SECRET_ID, CI_SECRET_KEY);

  return {
    success: true,
    data: {
      taskIds: [`ci-task-${timestamp}`],
      status: 'SUBMITTED',
      signature,
      note: '真实 CI API 调用占位；生产环境需发起 HTTPS POST 并等待回调'
    }
  };
}

/**
 * R21: CI 处理接口
 */
async function processImage(ctx, fileId, rules) {
  if (!fileId) return BAD_REQUEST('缺少 fileId');
  if (!hasRole(ctx.role, 'EDITOR')) {
    if (ctx.openid !== ctx.userId) return FORBIDDEN('仅属主或管理员可触发 CI');
  }

  const res = await triggerCiProcess(fileId, rules || []);
  return OK(res.data);
}

module.exports = { main: async (params, context) => {
  const { action } = params || {};
  const userId = params.userId || context.openid;
  const ctx = { OPENID: context.OPENID || context.openid, openid: context.openid, role: context.role || 'VISITOR', userId };
  
  switch (action) {
    case 'process':
      return await processImage(ctx, params.fileId, params.rules);
    default:
      return BAD_REQUEST(`unknown action: ${action}`);
  }
}};
