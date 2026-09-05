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
    default:
      return BAD_REQUEST(`unknown action: ${action}`);
  }
}

module.exports = { main, POLICY };
