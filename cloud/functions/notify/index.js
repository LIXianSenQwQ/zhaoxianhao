/**
 * cloud/functions/notify/index.js
 * 通知聚合 + 首页摘要 + 紧急广播
 * Sprint R3 完整化：
 *   - 修复 list 调用未定义函数的 ReferenceError
 *   - 统一响应格式（旧版 broadcast 返回裸 {error}）
 *   - 权限判定统一 hasRole（旧版字符串枚举比较遗漏 ADMIN）
 */
const wx = require('wx-server-sdk');
const { OK, BAD_REQUEST, FORBIDDEN } = require('./common/response');
const { hasRole } = require('./common/roles');
const { writeAudit } = require('./common/audit');

wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

const LIST_LIMIT = 50;

async function main(event, context) {
  const openid = context.OPENID || context.openid;
  if (!openid) return FORBIDDEN('请先登录');
  const db = wx.getDatabase();
  const { action } = event;

  switch (action) {
    case 'digest':
      return await getHomeDigest(db, openid);
    case 'list':
      return await listNotifications(db, openid, event.page);
    case 'markRead':
      return await markRead(db, openid, event.notificationId);
    case 'broadcast':
      return await broadcastToAll(db, openid, event);
    default:
      return BAD_REQUEST(`unknown action: ${action}`);
  }
}

async function roleOf(db, openid) {
  const res = await db.collection('users').where({ openid }).limit(1).get();
  return (res.data[0] && res.data[0].role) || 'VISITOR';
}

/** 首页摘要卡：仪式 > 日程 > 动态（优先级排序，缓存 60s 由前端 request 层管理） */
async function getHomeDigest(db, openid) {
  const cards = [];

  // 1. 仪式/红白事（最高优先级）
  const ceremonies = await db.collection('ceremonies')
    .where({ status: 'ACTIVE' })
    .orderBy('date', 'asc')
    .limit(3).get();

  for (const c of ceremonies.data) {
    cards.push({ type: 'ceremony', title: c.title || c.type, desc: c.desc, date: c.date, id: c._id });
  }

  // 2. 提醒/日程
  const reminders = await db.collection('calendar_items')
    .where({ userId: openid, notified: false })
    .limit(5).get();

  for (const r of reminders.data) {
    cards.push({ type: 'reminder', title: r.title, desc: r.desc, date: r.date });
  }

  // 3. 家族动态摘要
  const moments = await db.collection('plaza_posts')
    .orderBy('createdAt', 'desc')
    .limit(3).get();

  for (const m of moments.data) {
    cards.push({ type: 'moment', title: m.authorName, desc: m.content ? m.content.substring(0, 50) : '', id: m._id });
  }

  return OK({ cards });
}

/** 我的通知列表：分页倒序 */
async function listNotifications(db, openid, page = 1) {
  const size = 20;
  const p = Math.max(1, Number(page) || 1);
  const res = await db.collection('notifications')
    .where({ scope: 'ALL', read: false }) // 全员广播未读；个人通知 V1.1
    .orderBy('createdAt', 'desc')
    .skip((p - 1) * size).limit(size)
    .get();
  return OK({ records: res.data, page: p, hasMore: res.data.length === size });
}

/** 标记已读 */
async function markRead(db, openid, notificationId) {
  if (!notificationId) return BAD_REQUEST('缺少 notificationId');
  await db.collection('notifications').doc(notificationId).update({ data: { read: true } });
  return OK({ marked: true });
}

/** 紧急广播：EDITOR+ 才可发（写入 + 订阅消息推送） */
async function broadcastToAll(db, openid, { content, level }) {
  const role = await roleOf(db, openid);
  if (!hasRole(role, 'EDITOR')) return FORBIDDEN('仅编辑及以上可发布紧急广播');
  if (!content || !String(content).trim()) return BAD_REQUEST('缺广播内容');

  const broadcastId = wx.cloud.generateObjectId();
  await db.collection('notifications').add({
    data: {
      type: 'EMERGENCY',
      level: ['HIGH', 'MEDIUM'].includes(level) ? level : 'HIGH',
      title: '紧急通知',
      body: String(content).trim(),
      scope: 'ALL',
      read: false,
      createdAt: new Date(),
      createdBy: openid
    }
  });

  // 订阅消息推送（失败不阻塞通知本体）
  let notifiedCount = 0;
  try {
    const users = await db.collection('users').where({ status: 'ACTIVE' }).limit(1000).get();
    for (const user of users.data) {
      try {
        await wx.openapi.subscribeMessage.send({
          touser: user.openid,
          templateId: 'BROADCAST_TEMPLATE_ID',
          data: { thing1: { value: '紧急通知' }, thing2: { value: String(content).substring(0, 20) } }
        });
        notifiedCount++;
      } catch (e) {
        console.warn('[notify.broadcast] send fail:', user.openid);
      }
    }
  } catch (e) {
    console.warn('[notify.broadcast] user scan fail:', e.message);
  }

  await writeAudit(db, { userId: openid, action: 'notify.broadcast', target: broadcastId, detail: level });
  return OK({ broadcastId, notifiedCount });
}

module.exports = { main };
