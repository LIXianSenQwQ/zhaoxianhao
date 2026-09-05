/**
 * cloud/functions/admin/index.js
 * MVP Core: 权限管理 + 审计日志 + 功能开关 (admin.featureFlag)
 */
const wx = require('wx-server-sdk');
wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

async function main(params, context) {
  const { action, key, value, scope } = params;
  
  if (action === 'featureFlag') {
    return await setFeatureFlag(key, value, scope, context);
  }
  
  if (action === 'getFeatureFlags') {
    return await getFeatureFlags();
  }
  
  if (action === 'auditList') {
    return await queryAuditLogs(params);
  }
}

// V2.0 核心功能：功能开关（Feature Flags）
const defaultFlags = {
  // V1.1
  v11Profile: { enabled: true, scope: 'global', note: '头像/视频/相册' },
  v11Weather: { enabled: true, scope: 'global' },
  v11Motto: { enabled: true, scope: 'global' },
  v11Generation: { enabled: true, scope: 'global' },
  v11Security: { enabled: true, scope: 'global' },
  v11Almanac: { enabled: true, scope: 'global' },
  // V2.0 五大模块
  v20Content: { enabled: true, scope: 'global', note: '本地内容' },
  v20News: { enabled: true, scope: 'global', note: '新闻资讯' },
  v20Moment: { enabled: true, scope: 'global', note: '家族动态' },
  v20Games: { enabled: true, scope: 'global', note: '合规版游戏' },
  v20Home: { enabled: true, scope: 'global', note: '虚拟家园' },
  // P1/P2
  live: { enabled: false, scope: 'global' },
  healthArchive: { enabled: false, scope: 'global' },
  treeFanView: { enabled: false, scope: 'global' }
};

async function setFeatureFlag(key, value, scope, context) {
  const db = wx.getDatabase();
  const openid = context.openid;
  
  // 权限检查：仅族长/管理员可修改
  const userRes = await db.collection('users').where({ openid }).get();
  if (!userRes.data.length || userRes.data[0].role !== 'CHIEF') {
    return { error: 'Permission denied' };
  }
  
  // 读取现有配置
  const config = await db.collection('settings')
    .where({ key: 'featureFlag' }).get();
  
  let flags = defaultFlags;
  if (config.data.length) {
    flags = JSON.parse(config.data[0].value);
  }
  
  // 更新开关
  flags[key] = { ...flags[key], ...value, scope };
  
  // 写入数据库
  if (config.data.length) {
    await db.collection('settings').doc(config.data[0]._id).update({
      data: { value: JSON.stringify(flags), updatedAt: new Date() }
    });
  } else {
    await db.collection('settings').add({
      data: { key: 'featureFlag', value: JSON.stringify(flags), scope: 'global' }
    });
  }
  
  // 写审计日志
  await db.collection('audit_logs').add({
    data: {
      userId: openid,
      action: 'featureFlag.update',
      target: key,
      detail: `Changed to ${value.enabled}`,
      time: new Date()
    }
  });
  
  return { success: true, flags };
}

async function getFeatureFlags() {
  const db = wx.getDatabase();
  const res = await db.collection('settings')
    .where({ key: 'featureFlag' }).get();
  
  if (res.data.length) {
    return { success: true, flags: JSON.parse(res.data[0].value) };
  }
  
  return { success: true, flags: defaultFlags };
}

async function queryAuditLogs(params) {
  const db = wx.getDatabase();
  const { userId, startDate, endDate, action } = params;
  
  const where = {};
  if (userId) where.userId = userId;
  if (action) where.action = action;
  if (startDate) where.time = { $gte: new Date(startDate) };
  if (endDate) where.time = { ...where.time, $lte: new Date(endDate) };
  
  const res = await db.collection('audit_logs')
    .where(where)
    .orderBy('time', 'desc')
    .limit(100)
    .get();
  
  return { success: true, logs: res.data };
}

module.exports = { main };
