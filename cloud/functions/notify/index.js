/**
 * cloud/functions/notify/index.js
 * MVP Core: 通知聚合 + 首页摘要 + 紧急广播
 */
const wx = require('wx-server-sdk');
wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

async function main(params, context) {
  const { action, content, level } = params;
  
  if (action === 'digest') {
    return await getHomeDigest(context.openid);
  }
  
  if (action === 'list') {
    return await listNotifications(context.openid);
  }
  
  if (action === 'broadcast') {
    return await broadcastToAll(content, level, context.openid);
  }
}

async function getHomeDigest(openid) {
  const db = wx.getDatabase();
  const cards = [];
  
  // 1. 仪式/红白事（最高优先级）
  const ceremonies = await db.collection('ceremonies')
    .where({ status: 'ACTIVE' })
    .orderBy('date', 'asc')
    .limit(3).get();
  
  for (const c of ceremonies.data) {
    cards.push({
      type: 'ceremony',
      title: c.title || c.type,
      desc: c.desc,
      date: c.date,
      id: c._id
    });
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
    cards.push({
      type: 'moment',
      title: m.authorName,
      desc: m.content?.substring(0, 50),
      id: m._id
    });
  }
  
  return { success: true, cards };
}

async function broadcastToAll(content, level, operatorId) {
  const db = wx.getDatabase();
  
  // 权限检查：L4+ 可广播
  const userRes = await db.collection('users').where({ openid: operatorId }).get();
  const role = userRes.data[0]?.role || 'VISITOR';
  
  if (role !== 'CHIEF' && role !== 'EDITOR') {
    return { error: 'Permission denied' };
  }
  
  // 1. 写入紧急广播
  const broadcastId = wx.cloud.generateObjectId();
  await db.collection('notifications').add({
    data: {
      type: 'EMERGENCY',
      level: level || 'HIGH',
      title: '紧急通知',
      body: content,
      scope: 'ALL',
      read: false,
      createdAt: new Date(),
      createdBy: operatorId
    }
  });
  
  // 2. 调用微信订阅消息（模板推送）
  const users = await db.collection('users').where({ status: 'ACTIVE' }).get();
  for (const user of users.data) {
    try {
      await wx.openapi.subscribeMessage.send({
        touser: user.openid,
        templateId: 'BROADCAST_TEMPLATE_ID',
        data: {
          thing1: { value: '紧急通知' },
          thing2: { value: content }
        }
      });
    } catch (e) {
      console.warn('Send fail:', user.openid);
    }
  }
  
  return { success: true, broadcastId, notifiedCount: users.data.length };
}

module.exports = { main };
