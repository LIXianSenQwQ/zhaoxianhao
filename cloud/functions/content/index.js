/**
 * cloud/functions/content/index.js
 * V2.0 本地内容管理模块（个人本地内容/新闻资讯/家族动态）
 * Blueprint R20: 英雄留言方案（type=message, secscan+audit+频控）
 */

const wx = require('wx-server-sdk');
const { OK, BAD_REQUEST, FORBIDDEN } = require('./common/response');
const { hasRole } = require('./common/roles');
const { writeAudit } = require('./common/audit');

wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

/** R20: hero/detail 留言板设计（蓝图 8.0） */
async function sendMessage(ctx, userId, targetMemberId, content) {
  const db = wx.getDatabase();
  
  // 门禁：认证族人可发；MEMBER/HISTORIAN/CHIEF
  if (!hasRole(ctx.role, 'HISTORIAN')) {
    if (ctx.role !== 'MEMBER') return FORBIDDEN('仅认证族人可发布留言');
  }

  // 频控：每人每动态 ≤5 条/分钟（基于 member + target）
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
  const recentCount = await db.collection('content_messages').where({
    authorOpenid: ctx.openid, targetMemberId, publishAt: { $gte: fiveMinAgo.toISOString() }
  }).count();
  if (recentCount > 5) return BAD_REQUEST('发言频率过高，请稍后再试');

  // secscan 内容安全检测（R20 mock + R21 真实）
  // 真实环境：wx.cloud.callFunction({ name: 'secscan', data: { text: content } })
  // 测试环境直接通过
  const cleanedContent = content.trim(); // 占位清理
  if (cleanedContent.length < 1 || cleanedContent.length > 500) {
    return BAD_REQUEST('留言内容长度须在 1-500 字之间');
  }

  const now = new Date();
  const msgId = `msg-${now.getTime()}`;
  
  const res = await db.collection('content_messages').add({
    _id: msgId,
    targetMemberId,
    authorOpenid: ctx.openid,
    authorName: ctx.authorName || '', // 前端传入或用户表取
    content: cleanedContent,
    publishAt: now,
    status: 'PENDING', // PENDING/APPROVED/REJECTED
    likes: 0, replies: 0,
    auditResult: 'pass' // mock secscan
  });

  // audit_logs ≥1 年
  await writeAudit(db, {
    userId: ctx.openid, action: 'content.message.send', target: targetMemberId,
    detail: JSON.stringify({ msgId, cleanedContent }), time: now
  });

  return OK({ msgId, message: '留言已提交（待审核）' });
}

/**
 * R21: content.listMessages 英烈留言列表（APPROVED 优先 + 本人 PENDING 可见）
 * 入参：{ targetMemberId, page?, pageSize? }
 */
async function listMessages(ctx, targetMemberId, page = 1, pageSize = 20) {
  const db = wx.getDatabase();
  if (!targetMemberId) return BAD_REQUEST('缺少 targetMemberId');

  const skip = (Math.max(1, page) - 1) * pageSize;
  // APPROVED 全员可见；PENDING 仅作者本人可见
  const res = await db.collection('content_messages')
    .where({ targetMemberId, status: 'APPROVED' })
    .orderBy('publishAt', 'desc')
    .skip(skip).limit(pageSize).get();

  const items = res.data || [];
  // 附加作者本人的 PENDING 留言
  const mine = await db.collection('content_messages')
    .where({ targetMemberId, authorOpenid: ctx.openid, status: 'PENDING' })
    .orderBy('publishAt', 'desc').limit(5).get();

  const all = [...(mine.data || []), ...items].sort((a, b) =>
    new Date(b.publishAt).getTime() - new Date(a.publishAt).getTime()
  );

  return OK({
    messages: all.slice(0, pageSize),
    hasMore: items.length === pageSize,
    page
  });
}

module.exports = { main: async (params, context) => {
  const { action } = params || {};
  const userId = params.userId || context.openid;
  const roleCtx = {
    OPENID: context.OPENID || context.openid,
    openid: context.openid,
    role: context.role || 'VISITOR',
    authorName: context.authorName
  };
  
  switch (action) {
    case 'sendMessage':
      return await sendMessage(roleCtx, userId, params.targetMemberId, params.content);
    case 'listMessages':
      return await listMessages(roleCtx, params.targetMemberId, params.page, params.pageSize);
    default:
      return BAD_REQUEST(`unknown action: ${action}`);
  }
}};
