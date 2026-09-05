/**
 * task/index.js - MVP Core: 成长任务
 */
const wx = require('wx-server-sdk');
wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

async function main(params, context) {
  const { action, taskId, evidence } = params;
  
  if (action === 'today') {
    const db = wx.getDatabase();
    const today = new Date();
    today.setHours(0,0,0,0);
    const records = await db.collection('task_records')
      .where({ userId: context.OPENID, date: today }).get();
    return { success: true, records: records.data };
  }
  
  if (action === 'checkin') {
    const db = wx.getDatabase();
    await db.collection('task_records').add({
      data: { userId: context.OPENID, taskId, evidence, status: 'COMPLETED', createdAt: new Date() }
    });
    return { success: true };
  }
}

module.exports = { main };