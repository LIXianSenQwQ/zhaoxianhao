/**
 * cloud/functions/task/index.js
 * 成长任务：今日列表 / 打卡（幂等+积分联动）/ 打卡日历
 * Sprint R2 补齐：统一响应格式、权限门禁、分页、公共中间件复用
 */
const wx = require('wx-server-sdk');
const { OK, BAD_REQUEST, FORBIDDEN } = require('./common/response');
const { idempotencyKey } = require('./common/idempotency');
const { writeAudit } = require('./common/audit');
const { awardSystemPoints } = require('./common/points');

wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

const LIST_LIMIT = 50;

async function main(event, context) {
  const openid = context.OPENID || context.openid;
  if (!openid) return FORBIDDEN('请先登录');
  const db = wx.getDatabase();
  const { action, taskId, evidence, page = 1 } = event;

  switch (action) {
    case 'today':
      return await todayTasks(db, openid);
    case 'checkin':
      return await checkin(db, openid, taskId, evidence);
    case 'history':
      return await history(db, openid, page);
    default:
      return BAD_REQUEST(`unknown action: ${action}`);
  }
}

/** 今日任务 + 打卡状态（当日内幂等展示） */
async function todayTasks(db, openid) {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const [records, tasks] = await Promise.all([
    db.collection('task_records').where({ userId: openid, date: start }).limit(LIST_LIMIT).get(),
    db.collection('tasks').where({ status: 'ACTIVE' }).limit(LIST_LIMIT).get()
  ]);
  const done = new Set(records.data.map(r => r.taskId));
  return OK({
    date: start.toISOString().slice(0, 10),
    tasks: tasks.data.map(t => ({
      id: t._id, title: t.title, desc: t.desc, points: t.points,
      completed: done.has(t._id)
    })),
    completedCount: done.size
  });
}

/** 打卡：幂等键 task:date:uid；打卡成功联动积分池 */
async function checkin(db, openid, taskId, evidence) {
  if (!taskId) return BAD_REQUEST('缺少 taskId');

  const start = new Date(); start.setHours(0, 0, 0, 0);
  const dateStr = start.toISOString().slice(0, 10);
  const key = idempotencyKey({ bizType: 'task.checkin', bizId: `${taskId}:${dateStr}`, userId: openid });

  // 幂等：今日已打卡直接返回
  const dup = await db.collection('task_records').where({ idemKey: key }).limit(1).get();
  if (dup.data.length) {
    return OK({ alreadyDone: true, recordId: dup.data[0]._id });
  }

  // 任务合法性
  const taskRes = await db.collection('tasks').doc(taskId).get().catch(() => null);
  if (!taskRes || !taskRes.data) return BAD_REQUEST('任务不存在');
  const task = Array.isArray(taskRes.data) ? taskRes.data[0] : taskRes.data;

  const addRes = await db.collection('task_records').add({
    data: {
      idemKey: key,
      userId: openid, taskId,
      date: start, dateStr,
      evidence: evidence || null,
      status: 'COMPLETED',
      createdAt: new Date()
    }
  });

  // 积分联动（R13 修复：改走 common/points 本地幂等发放。
  // 原实现 callFunction points.award 链路已断——stub 不可用，且该入口
  // R12 已收口为 EDITOR 代发门禁 + bizType 签名，系统发放不应回环调用）
  let points = null;
  try {
    points = await awardSystemPoints(db, {
      userId: openid,
      pool: 'normal',
      bizType: 'task.checkin',
      bizId: `${taskId}:${dateStr}`,
      amount: task.points || 1,
      note: `打卡任务 ${task.title || taskId}`
    });
  } catch (e) {
    // 积分失败不阻塞打卡本体；补偿扫描按 dateStr 补发
    console.warn('[task.checkin] points link failed, will compensate:', e.message);
  }

  await writeAudit(db, { userId: openid, action: 'task.checkin', target: taskId, detail: dateStr });
  return OK({ alreadyDone: false, recordId: addRes._id, points });
}

/** 打卡日历：按页返回近 30 天内记录（倒序） */
async function history(db, openid, page) {
  const size = 30;
  const skip = (Math.max(1, Number(page) || 1) - 1) * size;
  const res = await db.collection('task_records')
    .where({ userId: openid })
    .orderBy('date', 'desc')
    .skip(skip).limit(size)
    .get();
  return OK({ records: res.data, page: Number(page) || 1, hasMore: res.data.length === size });
}

module.exports = { main };
