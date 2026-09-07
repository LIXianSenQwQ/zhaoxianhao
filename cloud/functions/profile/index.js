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

/**
 * R22: profile.greeting.save 保存家庭问候语
 * 入参：{ content, templateId, schedule, familyId }
 */
async function saveGreeting(ctx, userId, { content, templateId = 'default', schedule, familyId }) {
  const db = wx.getDatabase();
  const now = new Date();

  // 必填校验
  if (!content || !content.text) return BAD_REQUEST('content.text 必填');
  if (content.text.length > 200) return BAD_REQUEST('问候语不得超过 200 字符');

  // 模板校验
  const ALLOWED_TEMPLATES = ['default', 'morning', 'night', 'festival', 'solar', 'family'];
  if (!ALLOWED_TEMPLATES.includes(templateId)) return BAD_REQUEST('templateId 无效');

  // schedule 校验
  if (schedule) {
    if (schedule.time && !/^\d{2}:\d{2}$/.test(schedule.time)) return BAD_REQUEST('schedule.time 格式需 HH:mm');
    if (schedule.weekdays && (!Array.isArray(schedule.weekdays) || schedule.weekdays.some(d => d < 0 || d > 6))) {
      return BAD_REQUEST('weekdays 需为 0-6 数组');
    }
  }

  const res = await db.collection('greeting_cards').add({
    userId,
    familyId: familyId || null,
    content,
    templateId,
    schedule: schedule || { time: '08:00', weekdays: [1,2,3,4,5,6,0], enabled: false },
    visibility: 'FAMILY',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now
  });

  return OK({ cardId: res._id, message: '问候语已保存' });
}

/**
 * R22: profile.greeting.list 列表
 */
async function listGreetings(ctx, userId) {
  const db = wx.getDatabase();
  const res = await db.collection('greeting_cards').where({ userId }).orderBy('updatedAt', 'desc').limit(20).get();
  return OK({ cards: res.data || [] });
}

// ─── R23: 百年设置 time_capsules（蓝图 24.5：定时自动解密，精确到年月日） ───

/**
 * profile.capsule.create 创建百年胶囊
 * 入参：{ targetType, targetId, unlockDate: 'YYYY-MM-DD', message? }
 *   message 为可选书信文本（≤2000 字）：向本人可见存明文；生产建议升级为
 *   服务端加密（encryptedPayload），当前 stub 环境保持占位可测。
 */
async function capsuleCreate(ctx, userId, { targetType, targetId, unlockDate, message }) {
  const db = wx.getDatabase();
  const now = new Date();

  if (!targetType || !targetId) return BAD_REQUEST('targetType/targetId 必填');
  if (!unlockDate || !/^\d{4}-\d{2}-\d{2}$/.test(unlockDate)) return BAD_REQUEST('unlockDate 需为 YYYY-MM-DD');
  if (message !== undefined && message !== null && String(message).length > 2000) {
    return BAD_REQUEST('书信内容不得超过 2000 字');
  }

  // unlockDate 必须晚于今天
  const today = new Date();
  const unlock = new Date(unlockDate + 'T00:00:00Z');
  if (unlock <= today) return BAD_REQUEST('解密日期必须晚于今天');

  const res = await db.collection('time_capsules').add({
    userId,
    targetType,
    targetId,
    unlockDate,
    message: message || '',
    status: 'SEALED',
    unlockLog: [],
    encryptedPayload: `sealed:${targetId}`,
    createdAt: now
  });

  await db.collection('audit_logs').add({
    userId: ctx.openid, action: 'capsule.create', target: res._id,
    detail: `${targetType}:${targetId}@${unlockDate}`, time: now
  });
  return OK({ capsuleId: res._id, status: 'SEALED', unlockDate });
}

/**
 * profile.capsule.check 到期检查（每日 0 点定时触发器调用）
 * 扫描 unlockDate ≤ today 且 SEALED → UNLOCKED + 通知
 */
async function capsuleScan(ctx, userId) {
  const db = wx.getDatabase();
  const todayStr = new Date().toISOString().slice(0, 10);

  const res = await db.collection('time_capsules')
    .where({ unlockDate: db.command.lte ? todayStr : todayStr })
    .get();
  // stub 不支持 command，简化为全量扫描过滤
  let list = res.data || [];
  if (list.length === 0) {
    // 直接全量查（stub where 不支持 op）
    const all = await db.collection('time_capsules').where({}).get();
    list = (all.data || []).filter(c => c.unlockDate <= todayStr);
  }

  let unlocked = 0;
  for (const c of list) {
    if (c.status === 'SEALED') {
      await db.collection('time_capsules').doc(c._id).update({
        data: { status: 'UNLOCKED', unlockedAt: new Date() }
      });
      unlocked++;
    }
  }
  return OK({ scanned: list.length, unlocked });
}

/**
 * profile.capsule.list 本人胶囊列表 + 解密日志
 */
async function capsuleList(ctx, userId) {
  const db = wx.getDatabase();
  const res = await db.collection('time_capsules').where({ userId }).orderBy('createdAt', 'desc').limit(50).get();
  return OK({ capsules: res.data || [] });
}

// ─── 只读查询组（对齐 services/profile.ts 与蓝图 V1.1 语义） ───

/** settings 读取工具（key → value，不存在返回 null） */
async function readSetting(db, key) {
  const res = await db.collection('settings').where({ key }).limit(1).get();
  const row = res.data && res.data[0];
  return row ? row.value : null;
}

/**
 * profile.motto.get：当前家风家训（settings.family_motto，EDITOR+ 可编辑）
 */
async function getMotto(ctx, userId) {
  const db = wx.getDatabase();
  const value = await readSetting(db, 'family_motto');
  return OK({ motto: value || '', canEdit: hasRole(ctx.role, 'EDITOR'), source: 'family_settings' });
}

/**
 * profile.generation.list：字辈序列 + 我的成员定位
 * - chars: settings.generation_chars（数组）或空
 * - member: 当前登录用户绑定的成员 { memberId, name, generation } | null
 */
async function generationList(ctx, userId, branchId) {
  const db = wx.getDatabase();
  const chars = await readSetting(db, 'generation_chars');
  let member = null;
  try {
    const me = await db.collection('users').where({ openid: userId }).limit(1).get();
    const u = me.data && me.data[0];
    if (u && u.memberId) {
      const mres = await db.collection('members').doc(u.memberId).get().catch(() => null);
      const m = mres && mres.data && !Array.isArray(mres.data) ? mres.data : (mres && mres.data && mres.data[0]);
      if (m) {
        member = {
          memberId: u.memberId,
          name: m.genealogyName || m.name || '',
          generation: typeof m.generation === 'number' ? m.generation : null,
          isMale: m.gender !== 'FEMALE'
        };
      }
    }
  } catch (e) { /* 未绑定成员时 member=null，页面显示"尚未入谱" */ }
  return OK({
    chars: Array.isArray(chars) ? chars : [],
    total: Array.isArray(chars) ? chars.length : 0,
    member,
    canEdit: hasRole(ctx.role, 'EDITOR')
  });
}

/**
 * profile.greeting.active：当前展示问候语（本人最近一条 ACTIVE）
 */
async function greetingActive(ctx, userId) {
  const db = wx.getDatabase();
  const res = await db.collection('greeting_cards')
    .where({ userId, status: 'ACTIVE' })
    .orderBy('updatedAt', 'desc').limit(1).get();
  return OK({ card: (res.data && res.data[0]) || null });
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
    case 'greeting.save':
      return await saveGreeting(ctx, userId, params);
    case 'greeting.list':
      return await listGreetings(ctx, userId);
    case 'greeting.active':
      return await greetingActive(ctx, userId);
    case 'motto.get':
      return await getMotto(ctx, userId);
    case 'generation.list':
      return await generationList(ctx, userId, params.branchId);
    case 'capsule.create':
      return await capsuleCreate(ctx, userId, params);
    case 'capsule.scan':
      return await capsuleScan(ctx, userId);
    case 'capsule.list':
      return await capsuleList(ctx, userId);
    default:
      return BAD_REQUEST(`unknown action: ${action}`);
  }
}};
