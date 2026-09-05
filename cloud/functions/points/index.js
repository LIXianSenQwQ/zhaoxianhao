/**
 * cloud/functions/points/index.js
 * MVP Core: 积分账户 + 流水（四类积分）+ 幂等防刷
 */
const wx = require('wx-server-sdk');
wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

async function main(params, context) {
  const { action, pool, bizType, bizId } = params;
  
  if (action === 'get') {
    return await getPoints(context.openid);
  }
  
  if (action === 'award') {
    return await awardPointsAtomic(context.openid, pool, bizType, bizId);
  }
}

async function getPoints(userId) {
  const db = wx.getDatabase();
  
  // 读取账户余额（无则创建）
  let account = await db.collection('points_accounts')
    .where({ userId }).get();
  
  if (!account.data.length) {
    await db.collection('points_accounts').add({
      data: {
        userId,
        xiaoqin: 0,   // 孝亲池
        gongde: 0,    // 功德池
        fuyun: 0,     // 福运池
        normal: 0     // 普通池
      }
    });
  } else {
    return { success: true, data: account.data[0] };
  }
}

async function awardPointsAtomic(userId, pool, type, bizId) {
  const db = wx.getDatabase();
  
  // Step 1: 检查幂等键（避免重复加分）
  const existing = await db.collection('points_logs')
    .where({ bizId }).get();
  
  if (existing.data.length) {
    return { 
      success: false, 
      error: 'Already processed', 
      duplicated: true 
    };
  }
  
  // Step 2: 查询账户
  let account = await db.collection('points_accounts')
    .where({ userId }).get();
  
  if (!account.data.length) {
    return { error: 'Account not found' };
  }
  
  // Step 3: 更新余额（事务内）
  const amount = getTypeAmount(type);
  await db.collection('points_accounts').doc(account.data[0]._id).update({
    data: { [pool]: _.inc(amount) }
  });
  
  // Step 4: 写流水（幂等保障）
  await db.collection('points_logs').add({
    data: {
      _id: wx.cloud.generateObjectId(),
      userId,
      pool,
      delta: amount,
      bizType: type,
      bizId, // 幂等唯一标识
      time: new Date()
    }
  });
  
  return { success: true, newBalance: account[0][pool] + amount };
}

function getTypeAmount(bizType) {
  const amounts = {
    'checkin': 5,
    'worship': 10,
    'task_complete': 20,
    'family_post': 8
  };
  return amounts[bizType] || 1;
}

module.exports = { main };
