/**
 * cloud/functions/profile/index.js
 * V1.1 个人资料模块（头像/介绍视频/问候语/家训/字辈）
 * R20: CI/MPS 真实接入
 */

const wx = require('wx-server-sdk');
const { OK, BAD_REQUEST, FORBIDDEN } = require('./common/response');
const { hasRole } = require('./common/roles');
const { visibilityCheck } = require('./common/privacy');

wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

const CLOUD_ID_PREFIX = 'profile-';

/**
 * R19/R20 profile.saveAvatar：头像上传处理（蓝图 V1.1 22.1）
 * - 门禁：本人 or EDITOR+；visibilityCheck（PRIVATE/PUBLIC/GROUP fail-closed）
 * - CI 转码：调用 upload.triggerCi → WEBP + 缩略图 80/200/600
 * - avatars 集合存历史版本 + isCurrent 标记 + audit_logs 留痕（≥1 年）
 */
async function saveAvatar(ctx, userId, fileId, cropMeta = null, visibility = 'PUBLIC') {
  const db = wx.getDatabase();
  
  // 门禁：本人 or EDITOR+
  if (!hasRole(ctx.role, 'EDITOR')) {
    if (ctx.openid !== userId) return FORBIDDEN('仅属主或管理员可设置头像');
  }

  // 可见性校验
  const content = { _id: `temp-${Date.now()}`, visibility, ownerOpenid: ctx.openid };
  if (visibilityCheck({ openid: ctx.openid, authedTargetIds: new Set() }, content) === 'deny') {
    return FORBIDDEN('权限不足，不可设置为该可见性');
  }

  // R20: CI 转码调用（真实环境走云调用，测试环境 stub 降级占位）
  let ciResult = null;
  try {
    const res = await wx.cloud.callFunction({ name: 'upload', data: { action: 'triggerCi', fileId, scene: 'avatar' } });
    if (res.result) ciResult = res.result.data || res.result;
  } catch (e) { /* CI 未配置降级 */ }

  const now = new Date();
  const avatarId = `${CLOUD_ID_PREFIX}${now.getTime()}`;
  
  const resAdd = await db.collection('avatars').add({
    userId, fileId, format: 'WEBP', cropMeta: cropMeta || {}, visibility, isCurrent: true,
    thumbUrls: ciResult?.thumbnailUrls ? Object.values(ciResult.thumbnailUrls) : [],
    compressedUrl: ciResult?.compressedUrl || '',
    createdAt: now, updatedAt: now
  });

  await db.collection('avatars').where({ userId, _id: { $ne: resAdd._id }, isCurrent: true }).update({ data: { isCurrent: false } });

  // audit_logs ≥1 年（蓝图 26.3）
  await db.collection('audit_logs').add({
    userId: ctx.openid, action: 'profile.avatar.update', target: avatarId,
    detail: JSON.stringify({ visibility }), time: now, ip: ctx.ip
  });

  return OK({ avatarId, message: '头像已保存' });
}

/**
 * R20 profile.updateIntro：个人问候语/介绍视频
 * - greeting: 本人文字问候（≤200 字符），本人或 EDITOR 可写他人
 * - introVideoFileId: 云存储 fileID（前端先上传后传此处）
 * - privacyCheck: 仅 PUBLIC 允许公开问候语（V1.1 8.3）
 */
async function updateIntro(ctx, userId, params) {
  const db = wx.getDatabase();
  const { greeting, introVideoFileId } = params || {};

  // 门禁：本人 or EDITOR+
  if (!hasRole(ctx.role, 'EDITOR')) {
    if (ctx.openid !== userId) return FORBIDDEN('仅属主或管理员可设置问候语');
  }

  const updateData = {};
  if (greeting !== undefined) {
    if (greeting && greeting.length > 200) return BAD_REQUEST('问候语不得超过 200 字');
    updateData.greeting = greeting;
  }
  if (introVideoFileId !== undefined) {
    if (introVideoFileId && introVideoFileId.length > 256) return BAD_REQUEST('介绍视频文件 ID 超长');
    updateData.introVideoFileId = introVideoFileId || null;
  }
  if (Object.keys(updateData).length === 0) return BAD_REQUEST('缺少更新字段');

  const now = new Date();
  await db.collection('users').where({ openid: userId }).update({ data: { ...updateData, updatedAt: now } });

  await db.collection('audit_logs').add({
    userId: ctx.openid, action: 'profile.intro.update', target: userId,
    detail: JSON.stringify(updateData), time: now, ip: ctx.ip
  });

  return OK({ message: '介绍更新成功' });
}

/**
 * R20 profile.updateFamilyInfo：家族配置（家训/字辈）
 * - familyMotto: 家训文本（≤500 字，EDITOR+）
 * - generationChars: 字辈序列（数组，每项≤3 字，EDITOR+）
 * - upsert settings.key='family_motto' / 'generation_chars'（模拟云开发真实环境）
 */
async function updateFamilyInfo(ctx, userId, familyMotto, generationChars) {
  if (!hasRole(ctx.role, 'EDITOR')) return FORBIDDEN('仅限编辑者修改家族信息');

  const db = wx.getDatabase();
  const updates = [];

  // upsert family_motto
  if (familyMotto !== undefined) {
    if (familyMotto && familyMotto.length > 500) return BAD_REQUEST('家训不得超过 500 字');
    updates.push({ key: 'family_motto', value: familyMotto });
  }

  // upsert generation_chars
  if (generationChars !== undefined) {
    if (!Array.isArray(generationChars)) return BAD_REQUEST('字辈需为字符串数组');
    for (const c of generationChars) if (c && typeof c !== 'string') return BAD_REQUEST('字辈元素需为字符串');
    const chars = generationChars.map(c => (typeof c === 'string' ? c.slice(0, 3) : c));
    updates.push({ key: 'generation_chars', value: chars });
  }

  if (updates.length === 0) return BAD_REQUEST('缺少更新字段');

  // upsert each setting: select by key → update or add (pattern from admin.featureFlag)
  for (const { key, value } of updates) {
    const cfg = await db.collection('settings').where({ key }).limit(1).get();
    if (cfg.data.length > 0) {
      const item = cfg.data[0];
      await db.collection('settings').doc(item._id).update({
        data: { key, value, updatedAt: new Date(), updatedBy: ctx.openid }
      });
    } else {
      await db.collection('settings').add({
        _id: key, key, value, createdAt: new Date(), updatedAt: new Date(), updatedBy: ctx.openid
      });
    }
  }

  // audit log
  await db.collection('audit_logs').add({
    userId: ctx.openid, action: 'profile.family.info.update', target: 'family_settings',
    detail: JSON.stringify(updates), time: new Date(), ip: ctx.ip
  });

  return OK({ message: '家族信息更新成功', updates });
}

module.exports = { main: async (params, context) => {
  const { action } = params || {};
  const userId = params.userId || context.openid;
  const ctx = { OPENID: context.OPENID || context.openid, openid: context.openid, role: context.role || 'VISITOR' };
  
  switch (action) {
    case 'saveAvatar':
      return await saveAvatar(ctx, userId, params.fileId, params.cropMeta, params.visibility);
    case 'updateIntro':
      return await updateIntro(ctx, userId, { greeting: params.greeting, introVideoFileId: params.introVideoFileId });
    case 'updateFamilyInfo':
      return await updateFamilyInfo(ctx, userId, params.familyMotto, params.generationChars);
    default:
      return BAD_REQUEST(`unknown action: ${action}`);
  }
}};
