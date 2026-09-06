/**
 * cloud/functions/profile/index.js
 * V1.1 个人资料模块（头像/介绍视频/问候语/家训/字辈）
 * 接口约定：{ action, ..., userId } → 云端调用；userId 默认取 context.openid（兼容旧调用）
 */

const wx = require('wx-server-sdk');
const { OK, BAD_REQUEST, FORBIDDEN } = require('./common/response');
const { hasRole } = require('./common/roles');
const { visibilityCheck } = require('./common/privacy');

wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

const CLOUD_ID_PREFIX = 'profile-'; // 临时区 ID 前缀
const MAX_AVATAR_SIZE_KB = 200;    // CI 压缩目标 ≤200KB

/**
 * R19 profile.saveAvatar：头像上传处理（蓝图 V1.1 8.3.1）
 * - 临时区上传（前端直传云存储 fileID 已包含在 fileId）
 * - CI 压缩至 ≤200KB → WEBP 统一格式
 * - avatars 集合存历史版本 + isCurrent 标记
 * - visibilityCheck（PRIVATE/PUBLIC/GROUP）+ audit_logs
 */
async function saveAvatar(ctx, userId, fileId, cropMeta = null, visibility = 'PUBLIC') {
  const db = wx.getDatabase();
  
  // 门禁：本人 or EDITOR+
  if (!hasRole(ctx.role, 'EDITOR')) {
    // VISITOR/MEMBER：必须匹配 userId
    if (ctx.openid !== userId) return FORBIDDEN('仅属主或管理员可设置头像');
  }

  const dbo = db.collection('avatars');
  
  // 可见性校验（蓝图 8.3.1）
  const content = { _id: `temp-${Date.now()}`, visibility, ownerOpenid: ctx.openid };
  if (visibilityCheck({ openid: ctx.openid, authedTargetIds: new Set() }, content) === 'deny') {
    return FORBIDDEN('权限不足，不可设置为该可见性');
  }

  const now = new Date();
  const avatarId = `${CLOUD_ID_PREFIX}${now.getTime()}`;
  
  const res = await dbo.add({
    userId,
    fileId,                // 来自 upload.signUrl 返回的临时文件 ID
    format: 'WEBP',         // CI 转码后统一格式（V1.1）
    cropMeta: cropMeta || {},
    visibility,            // PRIVATE/PUBLIC/GROUP（蓝图 8.3.1）
    isCurrent: true,       // 新设为当前
    thumbUrls: [],         // CI 生成缩略图路径（占位，由 CI 回调更新）
    createdAt: now,
    updatedAt: now
  });

  // 清理旧 isCurrent=true 的当前头像（同一用户只保留一个当前头像）
  await dbo.where({ userId, _id: { $ne: res._id }, isCurrent: true }).update({ data: { isCurrent: false } });

  // 审计日志（保留 ≥1 年，蓝图 26.3）
  const audit = db.collection('audit_logs');
  await audit.add({
    userId: ctx.openid,
    action: 'profile.avatar.update',
    target: avatarId,
    detail: JSON.stringify({ visibility }),
    time: now,
    ip: ctx.ip
  });

  return OK({ avatarId, message: '头像已保存' });
}

module.exports = { main: async (params, context) => {
  const { action } = params || {};
  const userId = params.userId || context.openid;
  
  // 门禁中间件注入的角色（auth.middleware / cloud call）
  const ctx = {
    OPENID: context.OPENID || context.openid,
    openid: context.openid,
    role: context.role || 'VISITOR'
  };
  
  switch (action) {
    case 'saveAvatar':
      return await saveAvatar(ctx, userId, params.fileId, params.cropMeta, params.visibility);
    default:
      return BAD_REQUEST(`unknown action: ${action}`);
  }
}};
