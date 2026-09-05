/**
 * event/index.js - MVP Core: 家族史记/大事记
 */
const wx = require('wx-server-sdk');
wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

async function main(params, context) {
  const { action, eventId, year } = params;
  const db = wx.getDatabase();
  
  if (action === 'list') {
    const where = { status: 'PUBLISHED' };
    if (year) where.year = year;
    const res = await db.collection('events')
      .where(where).orderBy('year', 'desc').limit(100).get();
    return { success: true, events: res.data };
  }
  
  if (action === 'detail') {
    const res = await db.collection('events').doc(eventId).get();
    return { success: true, event: res.data };
  }
}

module.exports = { main };