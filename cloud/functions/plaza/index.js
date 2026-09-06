/**
 * cloud/functions/plaza/index.js
 * 家族广场动态（Sprint R11 新建；蓝图集合 13 plaza_posts / 页面 plaza/index）
 * 为 V2.0 moment（family_moments 统一动态）迁移铺路：接口命名对齐蓝图 9.1 风格。
 * Sprint R11 范围：list（分页倒序）/ publish（MEMBER+）/ like（原子计数）
 */
const wx = require('wx-server-sdk');
const { OK, BAD_REQUEST, FORBIDDEN, NOT_FOUND } = require('./common/response');
const { hasRole } = require('./common/roles');
const { writeAudit } = require('./common/audit');

wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

const PAGE_SIZE = 20;       // 蓝图 C.5：分页 20 条/页
const TEXT_MAX = 5000;      // 蓝图 C.3：文字最长 5000 字
const MEDIA_MAX = 9;        // 蓝图 C.3：图片最多 9 张/组

async function main(event, context) {
  const openid = context.OPENID || context.openid;
  if (!openid) return FORBIDDEN('请先登录');
  const db = wx.getDatabase();
  const { action } = event;

  switch (action) {
    case 'list':
      return await listPosts(db, openid, event);
    case 'publish':
      return await publishPost(db, openid, event);
    case 'like':
      return await likePost(db, openid, event);
    default:
      return BAD_REQUEST(`unknown action: ${action}`);
  }
}

async function roleOf(db, openid) {
  const res = await db.collection('users').where({ openid }).limit(1).get();
  return (res.data[0] && res.data[0].role) || 'VISITOR';
}

/** 广场列表：分页倒序（蓝图 C.5 最新发布为默认排序）；热度排序入 V2.0 moment */
async function listPosts(db, openid, { filterPage = 1, type }) {
  const role = await roleOf(db, openid);
  if (!hasRole(role, 'MEMBER')) return FORBIDDEN('认证族人方可浏览广场');

  const where = {};
  if (type) where.type = String(type).trim();

  const page = Math.max(1, Number(filterPage) || 1);
  const res = await db.collection('plaza_posts')
    .where(where)
    .orderBy('publishAt', 'desc')
    .skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE)
    .get();

  const posts = (res && res.data) || [];
  return OK({ posts, page, hasMore: posts.length === PAGE_SIZE });
}

/** 发布动态：MEMBER+；文字 ≤5000；媒体 ID ≤9；审计留痕 */
async function publishPost(db, openid, { type = 'text', content, mediaIds }) {
  const role = await roleOf(db, openid);
  if (!hasRole(role, 'MEMBER')) return FORBIDDEN('认证族人方可发布动态');
  // 蓝图 C.4 反骚扰：陌生人（未认证访客）不能发言——hasRole MEMBER 已覆盖

  const text = String(content || '').trim();
  if (!text && !(Array.isArray(mediaIds) && mediaIds.length)) {
    return BAD_REQUEST('文字与媒体不可同时为空');
  }
  if (text.length > TEXT_MAX) return BAD_REQUEST(`文字超限（≤${TEXT_MAX} 字）`);
  if (mediaIds && (!Array.isArray(mediaIds) || mediaIds.length > MEDIA_MAX)) {
    return BAD_REQUEST(`媒体数量超限（≤${MEDIA_MAX}）`);
  }
  // V2.0 secscan 内容安全检测接入点（敏感词/人工复核队列，F4 交付）

  const post = {
    authorId: openid,
    type: ['text', 'image', 'video', 'mixed'].includes(type) ? type : 'text',
    content: text,
    mediaIds: Array.isArray(mediaIds) ? mediaIds.slice(0, MEDIA_MAX) : [],
    stats: { like: 0, comment: 0 },
    status: 'ACTIVE',
    publishAt: new Date().toISOString()
  };
  const addRes = await db.collection('plaza_posts').add({ data: post });
  await writeAudit(db, { userId: openid, action: 'plaza.publish', target: addRes._id, detail: `type=${post.type} len=${text.length}` });
  return OK({ postId: addRes._id });
}

/** 点赞：原子 +1（db.command.inc）；返回真实值（更新后重 read 避免浅拷贝引用污染） */
async function likePost(db, openid, { postId }) {
  const role = await roleOf(db, openid);
  if (!hasRole(role, 'MEMBER')) return FORBIDDEN('认证族人方可点赞');

  if (!postId) return BAD_REQUEST('缺少 postId');
  const res = await db.collection('plaza_posts').doc(postId).get().catch(() => null);
  const post = res && res.data && !Array.isArray(res.data) ? res.data : (res && res.data && res.data[0]);
  if (!post) return NOT_FOUND('动态不存在或已删除');

  const cmd = db.command;
  await db.collection('plaza_posts').doc(postId).update({
    data: { 'stats.like': cmd.inc(1) }
  });
  // 重新读取真实值（修复 stub 浅拷贝引用导致 like+1 再 +1 的 bug）
  const newRes = await db.collection('plaza_posts').doc(postId).get();
  const newPost = newRes && newRes.data && !Array.isArray(newRes.data) ? newRes.data : (newRes && newRes.data && newRes.data[0]);
  return OK({ like: (newPost.stats && newPost.stats.like || 0) });
}

module.exports = { main };

