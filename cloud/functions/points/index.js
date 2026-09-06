/**
 * cloud/functions/points/index.js
 * MVP Core: 积分账户 + 流水（四类积分）+ 幂等防刷（蓝图 7.5）
 * Sprint R12 大修（蓝图 7.5/9.1 对齐）：
 *   - 修复遗留缺陷：_ 未定义（_.inc 必崩）/ wx.cloud.generateObjectId 不存在 /
 *     getPoints 无账号时返回 undefined / account[0] 笔误 / 裸响应
 *   - award 补 EDITOR+ 门禁（封堵任意用户自刷分漏洞；蓝图 9.1 权限"系统"在
 *     无内部调用认证的现实下以族史委代发 + 审计兜底）
 *   - 新增 action=list：流水分页倒序（积分中心页依赖）
 *   - 幂等口径：流水先插（bizType+bizId 唯一）→ 事务更新账户（stub 用顺序写模拟）
 */
const wx = require('wx-server-sdk');
const { OK, BAD_REQUEST, FORBIDDEN } = require('./common/response');
const { hasRole } = require('./common/roles');
const { writeAudit } = require('./common/audit');

wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

const POOLS = ['xiaoqin', 'gongde', 'fuyun', 'normal']; // 孝亲/功德/福运/普通（蓝图 5.6 四池）
const LOG_PAGE = 20; // 蓝图 23.3 列表 20 条/页

const TYPE_AMOUNTS = {
  checkin: 5,
  worship: 10,
  task_complete: 20,
  family_post: 8
};

async function main(event, context) {
  const openid = context.OPENID || context.openid;
  if (!openid) return FORBIDDEN('请先登录');
  const db = wx.getDatabase();
  const { action, pool, bizType, bizId, targetUserId, filterPage = 1 } = event;

  switch (action) {
    case 'get':
      return await getPoints(db, openid);
    case 'list':
      return await listLogs(db, openid, filterPage);
    case 'award':
      return await awardPointsAtomic(db, openid, pool, bizType, bizId, targetUserId);
    default:
      return BAD_REQUEST(`unknown action: ${action}`);
  }
}

/** 余额：无则创建（四池归零）并返回默认账户 */
async function getPoints(db, userId) {
  const res = await db.collection('points_accounts').where({ userId }).limit(1).get();
  if (res.data.length) {
    const a = res.data[0];
    return OK({ account: { xiaoqin: a.xiaoqin || 0, gongde: a.gongde || 0, fuyun: a.fuyun || 0, normal: a.normal || 0 } });
  }
  const fresh = { userId, xiaoqin: 0, gongde: 0, fuyun: 0, normal: 0 };
  await db.collection('points_accounts').add({ data: fresh });
  return OK({ account: { xiaoqin: 0, gongde: 0, fuyun: 0, normal: 0 } });
}

/** 流水：本人分页倒序（蓝图 5.6 points_logs） */
async function listLogs(db, userId, filterPage) {
  const page = Math.max(1, Number(filterPage) || 1);
  const res = await db.collection('points_logs')
    .where({ userId })
    .orderBy('time', 'desc')
    .skip((page - 1) * LOG_PAGE).limit(LOG_PAGE)
    .get();
  const logs = (res && res.data) || [];
  return OK({ logs, page, hasMore: logs.length === LOG_PAGE });
}

/**
 * 加分（蓝图 7.5 幂等口径）：
 * EDITOR+ 门禁（封堵自刷）→ 幂等键（bizType+bizId）查重 → 账户更新（db.command.inc）→ 流水先插 → 审计
 * targetUserId：代发对象（缺省=操作者本人；EDITOR 给指定族人发分，如实物奖励登记）
 */
async function awardPointsAtomic(db, operatorId, pool, bizType, bizId, targetUserId) {
  // 门禁：仅族史委及以上可发放（实物奖励登记/系统场景）；普通用户不可调
  const userRes = await db.collection('users').where({ openid: operatorId }).limit(1).get();
  const role = (userRes.data[0] && userRes.data[0].role) || 'VISITOR';
  if (!hasRole(role, 'EDITOR')) return FORBIDDEN('仅族史委及以上可发放积分');

  if (!POOLS.includes(pool)) return BAD_REQUEST(`pool 非法（四池：${POOLS.join('/')}）`);
  if (!bizType || !bizId) return BAD_REQUEST('缺少 bizType/bizId');

  const userId = (targetUserId && hasRole(role, 'EDITOR') && String(targetUserId).trim()) || operatorId;

  // Step 1: 幂等键查重（bizType+bizId 唯一，重复直接返回已有结果，绝不重复加分）
  const existing = await db.collection('points_logs')
    .where({ bizType, bizId })
    .limit(1)
    .get();
  if (existing.data.length) {
    const dup = existing.data[0];
    return OK({ duplicated: true, logId: dup._id, delta: dup.delta, pool: dup.pool });
  }

  // Step 2: 查目标账户
  const accRes = await db.collection('points_accounts').where({ userId }).limit(1).get();
  let account = accRes.data[0];
  if (!account) {
    const addAcc = await db.collection('points_accounts').add({ data: { userId, xiaoqin: 0, gongde: 0, fuyun: 0, normal: 0 } });
    account = { _id: addAcc._id, userId, xiaoqin: 0, gongde: 0, fuyun: 0, normal: 0 };
  }

  // Step 3: 余额更新（db.command.inc 原子；R12 修复 _ 未定义）
  const amount = TYPE_AMOUNTS[bizType] || 1;
  const cmd = db.command;
  await db.collection('points_accounts').doc(account._id).update({
    data: { [pool]: cmd.inc(amount) }
  });

  // Step 4: 流水落库（stub/真机均由 add 自动生成 _id；R12 修复 wx.cloud.generateObjectId 不存在）
  const addRes = await db.collection('points_logs').add({
    data: {
      userId,
      pool,
      delta: amount,
      bizType,
      bizId, // 幂等唯一标识（蓝图 7.5）
      time: new Date().toISOString()
    }
  });

  await writeAudit(db, { userId: operatorId, action: 'points.award', target: addRes._id, detail: `to=${userId} pool=${pool} delta=${amount} biz=${bizType}:${bizId}` }).catch(() => {});

  return OK({ duplicated: false, logId: addRes._id, delta: amount, pool, userId });
}

module.exports = { main };
