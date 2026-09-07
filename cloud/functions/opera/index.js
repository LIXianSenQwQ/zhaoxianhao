/**
 * cloud/functions/opera/index.js
 * V2.0 F11: 梨园小筑云函数（DB 持久化 + 频控/权限，业务逻辑在内联引擎 engine.js）
 * Action 清单：
 *   · roster.create  创建票友卡（名唯一性幂等；行数校验）
 *   · roster.list    获取用户票友卡片列表
 *   · stage.perform  登台表演（唱念做打随机事件→评分反馈/成长建议）
 *   · daily.checkin  每日签到（积分联动 + 今日次数奖励）
 *   · records.list   历史演出记录分页列表
 */

const wx = require('wx-server-sdk');
const { OK, BAD_REQUEST } = require('./common/response');
const { idempotencyKey } = require('./common/idempotency');
const { writeAudit } = require('./common/audit');
const { awardSystemPoints } = require('./common/points');
const {
  createTicket, perform, checkinReward,
  canStageToday, canCreateTicket, validateRosterParams, dayKey, seededRng
} = require('./engine');

wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

/** 全局主入口 */
async function main(event, context) {
  const openid = (context && context.OPENID) || (context && context.openid) || null;
  const db = wx.getDatabase();
  const action = event.action || '';
  try {
    if (!openid) return BAD_REQUEST('请先登录');
    switch (action) {
      case 'roster.create':  return await rosterCreate(db, openid, event);
      case 'roster.list':    return await rosterList(db, openid);
      case 'stage.perform':  return await stagePerform(db, openid, event);
      case 'daily.checkin':  return await dailyCheckin(db, openid, event);
      case 'records.list':   return await recordsList(db, openid, event.page);
      default:               return BAD_REQUEST(`unknown action: ${action}`);
    }
  } catch (e) {
    return BAD_REQUEST(`opera.${action} error: ${e.message}`);
  }
}

// ─── roster.create：创建票友卡片（幂等：同名不重复） ───
async function rosterCreate(db, openid, p) {
  if (!p || !p.name) return BAD_REQUEST('请填写票友名字');
  const validated = validateRosterParams(p);
  if (!validated.ok) return BAD_REQUEST(validated.error);
  // 名额检查
  const countRes = await db.collection('opera_roster').where({ userId: openid }).count();
  const can = canCreateTicket(countRes.total);
  if (!can.ok) return BAD_REQUEST(can.error);
  // 同名幂等：若已存在同名卡片，返回既有 ID
  const sameName = await db.collection('opera_roster')
    .where({ userId: openid, name: validated.name })
    .limit(1).get();
  if (sameName.data.length) {
    const existing = sameName.data[0];
    return OK({ ticket: existing, alreadyCreated: true });
  }
  // 创建新票友
  const rng = seededRng(Date.now());
  const ticket = createTicket({ name: validated.name, role: p.role, rng });
  ticket.userId = openid;
  ticket.createdAt = new Date().toISOString();
  ticket.updatedAt = ticket.createdAt;
  const res = await db.collection('opera_roster').add(ticket);
  ticket._id = res._id;
  await writeAudit(db, { userId: openid, action: 'roster.create', target: ticket._id, detail: `new:${ticket.name}` });
  return OK({ ticket, alreadyCreated: false });
}

// ─── roster.list：用户票友卡片列表 ───
async function rosterList(db, openid) {
  const listRes = await db.collection('opera_roster')
    .where({ userId: openid })
    .orderBy('createdAt', 'desc')
    .limit(50).get();
  const tickets = (listRes.data || []).map(t => ({
    _id: t._id, name: t.name, role: t.role, roleTitle: t.roleTitle,
    skillLevel: t.skillLevel, mood: t.mood, stageCount: t.stageCount,
    totalScore: t.totalScore
  }));
  return OK({ tickets });
}

// ─── stage.perform：登台表演（唱念做打随机事件） ───
async function stagePerform(db, openid, p) {
  const rosterId = p && p.rosterId;
  if (!rosterId) return BAD_REQUEST('请选择一名票友登场');
  // 验证票友归属
  const ticketRes = await db.collection('opera_roster').doc(rosterId).get();
  if (!ticketRes.data || ticketRes.data.userId !== openid) return BAD_REQUEST('该票友不属于您');
  const ticket = ticketRes.data;
  // 今日登台上限频控
  const today = dayKey();
  const todayCount = await db.collection('opera_performances')
    .where({ userId: openid, playedDate: today }).count().then(c => c.total);
  const canStage = canStageToday(todayCount);
  if (!canStage.ok) return BAD_REQUEST(canStage.error);
  // 引擎生成演出结果
  const rng = seededRng(Date.now());
  const result = perform(ticket, { rng });
  const perf = result.performance;
  const growth = result.growth;
  // 写入演出记录
  const record = {
    userId: openid,
    rosterId: rosterId,
    rosterName: ticket.name,
    performanceId: `perf-${rosterId}-${Date.now()}`,
    playName: perf.playName,
    snippet: perf.snippet,
    primarySkill: perf.primarySkill,
    actDetail: perf.actDetail,
    score: perf.score,
    grade: perf.grade,
    feedback: perf.feedback,
    suggestions: perf.suggestions,
    expGain: perf.expGain,
    leveledUp: growth.leveledUp,
    playedDate: today,
    status: 'COMPLETED'
  };
  const recAdd = await db.collection('opera_performances').add(record);
  record._id = recAdd._id;
  // 更新票友成长
  const next = growth.next;
  delete next._id;
  next.updatedAt = new Date().toISOString();
  await db.collection('opera_roster').doc(rosterId).update({ data: next });
  await writeAudit(db, { userId: openid, action: 'stage.perform', target: rosterId, detail: `${perf.grade}:${perf.score}` });
  return OK({ performance: record, roster: next, growth: { ...growth, newlyUnlocked: growth.newlyUnlocked } });
}

// ─── daily.checkin：每日签到（积分联动今日登台次数） ───
async function dailyCheckin(db, openid, p) {
  const today = dayKey();
  const todayStageCount = await db.collection('opera_performances')
    .where({ userId: openid, playedDate: today }).count().then(c => c.total);
  // 检查是否已签到（幂等）
  const dupLog = await db.collection('points_logs')
    .where({ userId: openid, bizType: 'opera.daily', bizId: today }).limit(1).get();
  if (dupLog.data.length) {
    return OK({ alreadyDone: true, message: '今日已签到，明日再来' });
  }
  const reward = checkinReward({ alreadyDone: false, todayStageCount });
  if (reward.points > 0) {
    const pointsResult = await awardSystemPoints(db, {
      userId: openid,
      pool: 'normal',
      bizType: 'opera.daily',
      bizId: today,
      amount: reward.points,
      note: `梨园小筑签到${reward.message}`
    });
    await writeAudit(db, { userId: openid, action: 'opera.daily.checkin', target: today, detail: `${reward.points}分` });
    return OK({ alreadyDone: false, points: pointsResult.delta, message: reward.message });
  }
  return OK({ alreadyDone: false, points: 0, message: reward.message });
}

// ─── records.list：演出记录分页列表 ───
async function recordsList(db, openid, page) {
  const pageNum = Math.max(1, Number(page) || 1);
  const size = 20;
  const res = await db.collection('opera_performances')
    .where({ userId: openid })
    .orderBy('performedAt', 'desc')
    .skip((pageNum - 1) * size)
    .limit(size).get();
  const records = (res.data || []).map(r => ({
    _id: r._id,
    rosterName: r.rosterName,
    playName: r.playName,
    score: r.score,
    grade: r.grade,
    feedback: r.feedback,
    performedAt: r.performedAt,
    status: r.status
  }));
  return OK({ records, page: pageNum, hasMore: res.data.length >= size });
}

module.exports = { main };
