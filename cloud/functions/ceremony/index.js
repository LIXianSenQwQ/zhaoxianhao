/**
 * cloud/functions/ceremony/index.js
 * MVP Core: 祭祀礼拜记录（点灯/上香/献花）+ 忌日提醒
 */
const wx = require('wx-server-sdk');
wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

async function main(params, context) {
  const { action, type, targetMemberId } = params;
  
  if (action === 'worship') {
    return await recordWorship(type, targetMemberId, context.openid);
  }
  
  if (action === 'remindScan') {
    // 每日定时扫描忌日
    return await scanReminders();
  }
}

async function recordWorship(type, targetMemberId, userId) {
  const db = wx.getDatabase();
  const worshipLogId = wx.cloud.generateObjectId();
  
  // Step 1: 写入祭记记录
  await db.collection('worship_logs').add({
    data: {
      _id: worshipLogId,
      type, // 'lamp' | 'incense' | 'flower' | 'group'
      targetMemberId,
      userId,
      date: new Date(),
      message: ''
    }
  });
  
  // Step 2: 更新灵位计数（原子 +1）
  await db.collection('members').doc(targetMemberId).update({
    data: { worshipCount: _.inc(1) }
  });
  
  // Step 3: 发放积分（幂等控制）
  const bizId = `worship_${type}_${targetMemberId}_${userId}`;
  const existing = await db.collection('points_logs')
    .where({ bizId }).get();
  
  if (!existing.data.length) {
    await awardPoints(userId, 'gongde', 10, 'worship', bizId);
  }
  
  return { success: true, logId: worshipLogId };
}

async function scanReminders() {
  // 系统定时触发器调用
  const db = wx.getDatabase();
  
  // 查询今日忌日成员
  const today = new Date();
  const reminderItems = await db.collection('calendar_items')
    .where({
      type: _.eq('death'),
      remindAt: _.lte(today),
      notified: _.eq(false)
    })
    .get();
  
  const results = [];
  
  for (const item of reminderItems.data) {
    // 发送订阅消息给族人
    await notifyUser(item.userId, {
      title: '忌日提醒',
      body: `今日是 ${item.memberName} 的忌日，建议前往祖堂上香`,
      templateId: 'memorial_reminder'
    });
    
    // 标记已通知
    await db.collection('calendar_items').doc(item._id).update({
      data: { notified: true }
    });
    
    results.push({ id: item._id, status: 'sent' });
  }
  
  return { total: results.length, items: results };
}

module.exports = { main };
