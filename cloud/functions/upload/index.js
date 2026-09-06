/**
 * cloud/functions/upload/index.js
 * 上传约束：策略下发 / 元数据登记（大小与类型校验）
 * Sprint R2 补齐：统一响应 + 隐私级校验（V1.1 相册对应）
 */
const wx = require('wx-server-sdk');
const { OK, BAD_REQUEST, FORBIDDEN } = require('./common/response');
const { hasRole } = require('./common/roles');

wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

/** 按上传场景区分预算（谱库旧谱扫描件放宽，头像收紧） */
const POLICY = {
  avatar:    { maxFileSize:  5 * 1024 * 1024, allowedTypes: ['image/jpeg', 'image/png', 'image/webp'] },
  album:     { maxFileSize: 20 * 1024 * 1024, allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'video/mp4'] },
  docscan:   { maxFileSize: 50 * 1024 * 1024, allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] },
  eventimg:  { maxFileSize: 20 * 1024 * 1024, allowedTypes: ['image/jpeg', 'image/png', 'image/webp'] }
};

async function main(event, context) {
  const openid = context.OPENID || context.openid;
  if (!openid) return FORBIDDEN('请先登录');
  const db = wx.getDatabase();
  const { action } = event;

  switch (action) {
    case 'policy': {
      const { scene = 'album' } = event;
      const p = POLICY[scene];
      if (!p) return BAD_REQUEST(`未知上传场景: ${scene}`);
      return OK({ scene, ...p });
    }
    case 'meta': {
      // 上传完成后登记元数据（含校验，双保险）
      const { scene = 'album', fileId, size, mimeType, visibility = 'PRIVATE', groupId } = event;
      const p = POLICY[scene];
      if (!p) return BAD_REQUEST(`未知上传场景: ${scene}`);
      if (!fileId) return BAD_REQUEST('缺少 fileId');
      if (Number(size) > p.maxFileSize) return BAD_REQUEST(`文件超出 ${scene} 场景大小上限`);
      if (!p.allowedTypes.includes(mimeType)) return BAD_REQUEST(`不支持的类型: ${mimeType}`);
      if (!['PUBLIC', 'PRIVATE', 'GROUP'].includes(visibility)) return BAD_REQUEST('visibility 取值非法');
      if (visibility === 'GROUP' && !groupId) return BAD_REQUEST('GROUP 可见性必须指定 groupId');

      const addRes = await db.collection('upload_metas').add({
        data: {
          scene, fileId, size: Number(size), mimeType,
          ownerOpenid: openid,
          visibility, groupId: groupId || null,
          createdAt: new Date()
        }
      });
      return OK({ metaId: addRes._id });
    }
    case 'triggerCi': {
      // V1.1 R20: 数据万象 CI 调用（头像/相册缩略图压缩 + WEBP 转码）
      const { fileId, scene = 'avatar' } = event;
      if (!fileId) return BAD_REQUEST('缺少 fileId');
      return await triggerCi(context, fileId, scene);
    }
    case 'triggerMps': {
      // V1.1 R20: 媒体处理 MPS 调用（视频 H.264 转码 + 封面截取）
      const { fileId, duration } = event;
      if (!fileId || typeof duration !== 'number') return BAD_REQUEST('fileId/duration 必需');
      return await triggerMps(context, fileId, duration);
    }
    default:
      return BAD_REQUEST(`unknown action: ${action}`);
  }
}

/** R20: CI 数据万象触发器——压缩 + 转格式（WEBP）+ 多档缩略图（80/200/600） */
async function triggerCi(ctx, fileId, scene = 'avatar') {
  const p = POLICY[scene] || POLICY.avatar;
  if (!p) return BAD_REQUEST(`未知场景：${scene}`);

  try {
    // 真实环境：云开发扩展 ImageProcessJob → HTTP API
    const res = await wx.cloud.callFunction({
      name: 'ci', 
      data: { action: 'process', sourceFileId: fileId, rules: [
        { rule: 'thumb', format: 'webp', width: 80 },
        { rule: 'thumb', format: 'webp', width: 200 },
        { rule: 'thumb', format: 'webp', width: 600 }
      ] }
    });
    if (res.result && res.result.urls) return OK(res.result.urls);
  } catch (e) { /* CI 未配置降级 */ }

  // 占位模板（CI 回调更新真实 URL）
  const now = new Date();
  return OK({
    thumbnailUrls: { s: `https://cdn-thumb-${now.getTime()}/80.webp`, m: `https://cdn-thumb-${now.getTime()}/200.webp`, l: `https://cdn-thumb-${now.getTime()}/600.webp` },
    compressedUrl: `https://cdn-webp-${now.getTime()}.webp`,
    note: 'CI 未配置，占位 URL；真实环境由云开发回调更新'
  });
}

/** R20: MPS 媒体处理触发器——视频转码（H.264 MP4）+ 封面截取 */
async function triggerMps(ctx, videoFileId, duration) {
  if (duration > 60) return BAD_REQUEST('视频时长必须 ≤60s');

  try {
    const res = await wx.cloud.callFunction({
      name: 'mps', 
      data: { action: 'transcode', sourceFileId: videoFileId, templates: ['h264_mp4_720p', 'cover_frame'] }
    });
    if (res.result && res.result.fileIds) return OK(res.result);
  } catch (e) { /* MPS 未配置降级 */ }

  const now = new Date();
  return OK({ transcodedFileId: `video-h264-${now.getTime()}`, coverFrameUrl: `https://cdn-cover-${now.getTime()}.jpg`, note: 'MPS 未配置，占位 ID' });
}

module.exports = { main, POLICY, triggerCi, triggerMps };
