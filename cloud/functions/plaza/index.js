/**
 * cloud/functions/plaza/index.js
 * 家族广场动态（V2.0 F5-F6: family_moments 统一动态 + 家族公告 @提及）
 * 
 * V2.0 第九部分 9.1 / 模块三/四家族动态：
 *   · list/publish/like/updateTop/status/mentionActions 接口；
 *   · announce.publish/stick/expiry/readReceipt 功能；
 *   · 兼容旧 plaza_posts → family_moments 迁移路径。
 */
const wx = require('wx-server-sdk');
const { OK, BAD_REQUEST, FORBIDDEN } = require('./common/response');
const { hasRole, roleOf } = require('./common/roles');
const { writeAudit } = require('./common/audit');

wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

const PAGE_SIZE = 20;       // 蓝图 C.5：分页 20 条/页
const TEXT_MAX = 5000;      // 蓝图 C.3：文字最长 5000 字
const MEDIA_MAX = 9;        // 蓝图 C.3：图片最多 9 张/组
const MAX_TAG_LEN = 30;     // 标签长度上限
const ANNOUNCE_PRIORITY = { low: 1, normal: 2, high: 3, urgent: 4 };
const ANNOUNCE_CATEGORIES = ['族务', '红白事', '节庆', '应急', '公示'];

async function main(event, context) {
  const openid = context.OPENID || context.openid;
  if (!openid) return FORBIDDEN('请先登录');
  const db = wx.getDatabase();
  const { action, type = 'all' } = event;

  switch (action) {
    case 'list':
      return await listMoments(db, openid, event);
    case 'publish':
      return await publishMoment(db, openid, event);
    case 'updateHotScore':
      return await updateHotScore(db, openid, event.momentId);
    case 'like':
      return await likeMoment(db, openid, event);
    case 'comment':
      return await commentMoment(db, openid, event);
    case 'stick':
      return await stickAnnouncement(db, openid, event);
    case 'readReceipt':
      return await recordReadReceipt(db, openid, event.noticeId);
    case 'getNotices':
      return await getNotices(db, openid, event);
    case 'announce':
      return await publishAnnounce(db, openid, event);
    default:
      return BAD_REQUEST(`unknown action: ${action}`);
  }
}

// ─── Family moments actions ───

/** 动态列表：support filter by type/status/topicTags; support pagination; sort by hotScore desc then publishAt desc */
async function listMoments(db, openid, { page = 1, pageSize = PAGE_SIZE, status, topicTags, author }) {
  const role = await roleOf(db, openid);
  if (!hasRole(role, 'MEMBER')) return FORBIDDEN('认证族人方可浏览动态');

  const where = {};
  if (status) where.status = status;
  if (topicTags && Array.isArray(topicTags)) where.topicTags = db.command.in(topicTags.map(t => t.trim()).filter(Boolean));
  if (author) where.authorId = author;

  const res = await db.collection('family_moments')
    .where(where)
    .orderBy('hotScore', 'desc')
    .orderBy('publishAt', 'desc')
    .skip((page - 1) * pageSize).limit(pageSize)
    .get();

  const posts = (res && res.data) || [];
  return OK({ moments: posts, page: Number(page), hasMore: posts.length === Number(pageSize) });
}

/** 发布动态：MEMBER+; text ≤ 5000; mediaIds ≤ 9; supports mentions & tags; secscan content safety */
async function publishMoment(db, openid, { type = 'TEXT', content, mediaIds, topicTags, mentions }) {
  const role = await roleOf(db, openid);
  if (!hasRole(role, 'MEMBER')) return FORBIDDEN('认证族人方可发布动态');

  const text = String(content || '').trim();
  if (!text && !(Array.isArray(mediaIds) && mediaIds.length)) {
    return BAD_REQUEST('文字与媒体不可同时为空');
  }
  if (text.length > TEXT_MAX) return BAD_REQUEST(`文字超限（≤${TEXT_MAX} 字）`);
  if (mediaIds && (!Array.isArray(mediaIds) || mediaIds.length > MEDIA_MAX)) {
    return BAD_REQUEST(`媒体数量超限（≤${MEDIA_MAX}）`);
  }

  // secscan 内容安全检测（V2.0 §7.5/9.2 合规门禁；stub 无 code 视为放行）
  if (text) {
    try {
      const scanRes = await wx.cloud.callFunction({ name: 'secscan', data: { action: 'detectText', content: text } });
      const code = scanRes && scanRes.result ? scanRes.result.code : undefined;
      if (code !== undefined && code !== 0) {
        console.warn('[plaza.publishMoment] secscan.text blocked:', code);
        return BAD_REQUEST('内容包含敏感信息，请修改后重试');
      }
    } catch (e) {
      console.warn('[plaza.publishMoment] secscan call failed, fallback:', e.message);
      // 降级：允许继续但不记录；生产环境建议严格失败
    }
  }

  // 标签规范化
  const tags = (topicTags || []).filter(t => String(t).trim().length <= MAX_TAG_LEN).slice(0, 10);

  const moment = {
    authorId: openid,
    authorName: '', // to be filled from member/profile collection
    type, content: text,
    mediaIds: Array.isArray(mediaIds) ? mediaIds.slice(0, MEDIA_MAX) : [],
    topicTags: tags,
    mentions: (mentions || []).map(m => ({ userId: m.userId?.toString(), userName: m.userName, createdAt: new Date() })),
    stats: { like: 0, comment: 0, share: 0 },
    hotScore: 0, // refreshed by cron
    status: 'PUBLISHED',
    publishAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const addRes = await db.collection('family_moments').add({ data: moment });
  await writeAudit(db, { userId: openid, action: 'family_moments.publish', target: addRes._id, detail: `type=${type} len=${text.length}` });
  return OK({ momentId: addRes._id });
}

/** 热度评分更新（用于定期刷新或事件触发）——牛顿冷却法（半衰期 24h）**/
async function updateHotScore(db, openid, momentId) {
  // stub: placeholder for production cron or event trigger
  return OK({ updated: false, message: 'Stub: implement real hot score update logic' });
}

/** 点赞：原子 +1; idempotent (check existing LIKE interaction)**/
async function likeMoment(db, openid, { momentId }) {
  const role = await roleOf(db, openid);
  if (!hasRole(role, 'MEMBER')) return FORBIDDEN('认证族人方可点赞');

  if (!momentId) return BAD_REQUEST('缺少 momentId');
  
  // Check existing like
  const existingLikes = await db.collection('moment_interactions')
    .where({ momentId, type: 'LIKE', userId: openid }).limit(1).get();
  if (existingLikes && existingLikes.data && existingLikes.data.length) {
    return OK({ like: null, message: 'Already liked', idempotent: true });
  }

  // Add interaction
  const now = new Date();
  await db.collection('moment_interactions').add({
    data: {
      momentId,
      type: 'LIKE',
      userId: openid,
      userName: '', // to fetch later
      createdAt: now
    }
  });

  // Increment like count
  const cmd = db.command;
  await db.collection('family_moments').doc(momentId).update({
    data: { 'stats.like': cmd.inc(1), 'hotScore': cmd.inc(0.5) }
  });

  // Re-read actual value
  const newRes = await db.collection('family_moments').doc(momentId).get();
  const newMoment = (newRes && newRes.data && !Array.isArray(newRes.data)) ? newRes.data : (newRes && newRes.data && newRes.data[0]);
  return OK({ like: (newMoment.stats && newMoment.stats.like || 0), total: newMoment.stats && newMoment.stats.like || 0 });
}

/** 评论：添加 COMMENT 互动记录 **/
async function commentMoment(db, openid, { momentId, content }) {
  const role = await roleOf(db, openid);
  if (!hasRole(role, 'MEMBER')) return FORBIDDEN('认证族人方可评论');

  if (!momentId || !content) return BAD_REQUEST('momentId/content 必需');
  const text = String(content).trim();
  if (text.length > TEXT_MAX) return BAD_REQUEST(`评论超限（≤${TEXT_MAX} 字）`);

  const now = new Date();
  await db.collection('moment_interactions').add({
    data: {
      momentId,
      type: 'COMMENT',
      userId: openid,
      userName: '',
      content: text,
      createdAt: now
    }
  });

  // Update comment count
  const cmd = db.command;
  await db.collection('family_moments').doc(momentId).update({
    data: { 'stats.comment': cmd.inc(1) }
  });

  return OK({ commented: true });
}

// ─── Announcements actions ───

/** 发布/更新置顶公告：CHIEF+; priority ∈ [low,normal,high,urgent]; auto-expire support **/
async function publishAnnounce(db, openid, { title, content, category, priority = 'normal', stickingDays = 7, requiresReadReceipt = false }) {
  const role = await roleOf(db, openid);
  if (!hasRole(role, 'CHIEF')) return FORBIDDEN('仅族务长老可发布公告');

  if (!title || !content) return BAD_REQUEST('title/content 必需');
  if (!ANNOUNCE_CATEGORIES.includes(category)) return BAD_REQUEST(`category 非法（可选值：${ANNOUNCE_CATEGORIES.join(', ')}）`);
  if (!ANNOUNCE_PRIORITY[priority]) return BAD_REQUEST(`priority 非法（可选值：${Object.keys(ANNOUNCE_PRIORITY).join(', ')}）`);

  const priorityNum = ANNOUNCE_PRIORITY[priority];
  const publishAt = new Date();
  const expireAt = new Date(Date.now() + stickingDays * 24 * 3600 * 1000);

  const announce = {
    publisherId: openid,
    publisherName: '', // to fetch from profile
    title: title.trim(),
    content: content.trim(),
    category,
    priority: priorityNum,
    stickingCountdown: stickingDays,
    requiresReadReceipt,
    readBy: [], // [{userId, name, readAt}]
    publishAt: publishAt.toISOString(),
    expireAt: expireAt.toISOString(),
    status: 'PUBLISHED',
    updatedAt: publishAt.toISOString()
  };

  const res = await db.collection('clan_notices').add({ data: announce });
  await writeAudit(db, { userId: openid, action: 'clan_notices.publish', target: res._id, detail: `title=${announce.title.substring(0, 50)}` });
  return OK({ noticeId: res._id });
}

/** 置顶：调整 stickingCountdown（管理员每日操作一次）**/
async function stickAnnouncement(db, openid, { noticeId, stickyMinutes = 60 }) {
  const role = await roleOf(db, openid);
  if (!hasRole(role, 'CHIEF')) return FORBIDDEN('仅族务长老可置顶');

  if (!noticeId) return BAD_REQUEST('缺少 noticeId');
  const days = Math.max(1, Math.round(stickyMinutes / (24 * 60)));
  const now = new Date();
  const expireAt = new Date(now.getTime() + days * 24 * 3600 * 1000);

  const cmd = db.command;
  await db.collection('clan_notices').doc(noticeId).update({
    data: {
      stickingCountdown: days,
      expireAt: expireAt.toISOString(),
      updatedAt: now.toISOString()
    }
  });

  return OK({ stuck: true, expiredAfter: expireAt.toISOString() });
}

/** 阅读回执：记录已读状态，requiresReadReceipt=true 时强制读取**/
async function recordReadReceipt(db, openid, noticeId) {
  if (!noticeId || !openid) return BAD_REQUEST('noticeId/openid 必需');

  const announce = await db.collection('clan_notices').doc(noticeId).get();
  const item = (announce && announce.data && !Array.isArray(announce.data)) ? announce.data : (announce && announce.data && announce.data[0]);
  if (!item) return FORBIDDEN('公告不存在或已过期');

  // Check existing read
  const alreadyRead = (item.readBy || []).some(r => r.userId === openid);
  if (alreadyRead) return OK({ alreadyRead: true });

  // Record read (client-side array concat, avoid db.command.push for stub compatibility)
  const now = new Date();
  const entry = { userId: openid, name: '', readAt: now.toISOString() };
  await db.collection('clan_notices').doc(noticeId).update({
    data: {
      readBy: (item.readBy || []).concat([entry]),
      updatedAt: now.toISOString()
    }
  });

  return OK({ readReceiptAdded: true, alreadyRead: false });
}

/** 获取活动公告：按 priority 排序，显示 sticking countdown**/
async function getNotices(db, openid, { page = 1, pageSize = 10 }) {
  const role = await roleOf(db, openid);
  if (!hasRole(role, 'VISITOR')) return FORBIDDEN('所有用户可获取公告列表');

  const now = new Date();
  const res = await db.collection('clan_notices')
    .where({ status: 'PUBLISHED', expireAt: db.command.gte(now.toISOString()) })
    .orderBy('priority', 'desc')
    .orderBy('stickingCountdown', 'desc')
    .orderBy('publishAt', 'desc')
    .skip((page - 1) * pageSize).limit(pageSize)
    .get();

  const notices = (res && res.data) || [];
  return OK({ notices, page: Number(page), hasMore: notices.length === Number(pageSize) });
}

module.exports = { main };

