/**
 * cloud/functions/riddle/index.js — 家族灯谜会（内容治理版）
 * V2.0 F8：
 *   - riddle.create    MEMBER+ 出题 → PENDING（族人共创，禁止未审核上架）
 *   - riddle.pending   EDITOR+ 审核队列（含谜底明文供审）
 *   - riddle.approve / riddle.reject  EDITOR+ 审核（审计留痕）
 *   - riddle.list      MEMBER+ 仅 ACTIVE（剥离谜底，防止剧透）
 *   - riddle.answer    MEMBER+ 仅 ACTIVE 可答；答对后每题限答一次（防刷分）
 * 合规：零现金奖池、无随机抽取；谜底字段服务端比对，列表不回传。
 */
const wx = require('wx-server-sdk');
const crypto = require('crypto');
const { OK, BAD_REQUEST, FORBIDDEN, NOT_FOUND } = require('./common/response');
const { roleOf, hasRole } = require('./common/roles');
const { writeAudit } = require('./common/audit');

wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

const MAX_LEN = { question: 100, answer: 40, hint: 100, category: 12 };

/** 谜底指纹（比对用；明文仅存主记录供审核，list/answer 接口不回传） */
function answerFingerprint(answer) {
  return crypto.createHash('sha256').update(String(answer).trim()).digest('hex').slice(0, 16);
}

function cleanText(v, max) {
  const s = String(v || '').trim();
  return s.length > max ? s.slice(0, max) : s;
}

async function riddleCreate(db, openid, p, role) {
  if (!hasRole(role, 'MEMBER')) return FORBIDDEN('认证族人才可出题');
  const question = cleanText(p && p.question, MAX_LEN.question);
  const answer = cleanText(p && p.answer, MAX_LEN.answer);
  if (!question) return BAD_REQUEST('谜面不能为空');
  if (!answer) return BAD_REQUEST('谜底必填（供审核与判定）');
  const hint = cleanText(p && p.hint, MAX_LEN.hint);
  const category = cleanText(p && p.category, MAX_LEN.category) || '通用';
  const difficulty = Math.min(5, Math.max(1, Number(p && p.difficulty) || 1));
  const now = new Date().toISOString();
  const doc = {
    type: 'riddle',
    question, answer,
    hint, category, difficulty,
    authorOpenid: openid,
    status: 'PENDING',
    solvedCount: 0, solvedBy: [],
    createdAt: now, updatedAt: now
  };
  const res = await db.collection('riddles').add(doc);
  doc._id = res._id;
  delete doc.answer; // 返回给作者时剥离开答案指纹化
  doc.answerHash = answerFingerprint(answer);
  await writeAudit(db, {
    userId: openid, action: 'riddle.create', target: res._id,
    detail: `出题 PENDING: ${question}`, createdAt: now
  });
  return OK({ riddle: doc });
}

async function riddleList(db, openid, p, role) {
  if (!hasRole(role, 'MEMBER')) return FORBIDDEN('认证族人才可参与灯谜会');
  const page = Math.max(1, Number(p && p.page) || 1);
  const size = 20;
  const res = await db.collection('riddles')
    .where({ type: 'riddle', status: 'ACTIVE' })
    .orderBy('createdAt', 'desc')
    .skip((page - 1) * size).limit(size).get();
  const riddles = (res.data || []).map(r => {
    const { answer, ...pub } = r;
    void answer;
    return pub;
  });
  return OK({ riddles });
}

async function riddlePending(db, openid, p, role) {
  if (!hasRole(role, 'EDITOR')) return FORBIDDEN('需要家族编辑权限（EDITOR+）审核灯谜');
  const page = Math.max(1, Number(p && p.page) || 1);
  const size = 20;
  const res = await db.collection('riddles')
    .where({ type: 'riddle', status: 'PENDING' })
    .orderBy('createdAt', 'asc')
    .skip((page - 1) * size).limit(size).get();
  const items = (res.data || []).map(r => {
    const { answerHash, ...pub } = r;
    void answerHash;
    return pub; // 含 answer 明文（仅审核者可见）
  });
  return OK({ riddles: items });
}

async function riddleReview(db, openid, p, role, approve) {
  if (!hasRole(role, 'EDITOR')) return FORBIDDEN('需要家族编辑权限（EDITOR+）审核灯谜');
  const id = p && p.riddleId;
  if (!id) return BAD_REQUEST('riddleId 必需');
  const cur = await db.collection('riddles').doc(id).get();
  const doc = cur && cur.data;
  if (!doc || doc.type !== 'riddle') return NOT_FOUND('灯谜不存在');
  if (doc.status !== 'PENDING') return BAD_REQUEST(`仅 PENDING 可审核（当前 ${doc.status}）`);
  const next = approve ? 'ACTIVE' : 'REJECTED';
  const now = new Date().toISOString();
  await db.collection('riddles').doc(id).update({ data: { status: next, reviewedBy: openid, reviewedAt: now, updatedAt: now } });
  await writeAudit(db, {
    userId: openid,
    action: approve ? 'riddle.approve' : 'riddle.reject',
    target: id,
    detail: `${approve ? '上架' : '驳回'}谜题: ${doc.question}`, createdAt: now
  });
  return OK({ riddleId: id, status: next });
}

async function riddleAnswer(db, openid, p, role) {
  if (!hasRole(role, 'MEMBER')) return FORBIDDEN('认证族人才可参与灯谜会');
  const id = p && p.riddleId;
  const guess = String(p && p.guess || '').trim();
  if (!id || !guess) return BAD_REQUEST('riddleId/guess 必需');
  const cur = await db.collection('riddles').doc(id).get();
  const doc = cur && cur.data;
  if (!doc || doc.type !== 'riddle') return NOT_FOUND('灯谜不存在');
  if (doc.status !== 'ACTIVE') return BAD_REQUEST('该谜题未在活动期（仅 ACTIVE 可作答）');
  // 防刷分：已答对则直接返回
  const prev = await db.collection('riddle_votes')
    .where({ riddleId: id, openid, correct: true }).limit(1).get();
  if (prev.data && prev.data.length) {
    return OK({ correct: true, score: 0, already: true });
  }
  const correct = String(doc.answer).trim().toLowerCase() === guess.toLowerCase();
  const now = new Date().toISOString();
  const record = {
    riddleId: id, openid, guess, correct,
    score: correct ? 10 : 0, createdAt: now
  };
  await db.collection('riddle_votes').add(record);
  if (correct) {
    await db.collection('riddles').doc(id).update({
      data: {
        solvedCount: wx.getDatabase().command.inc(1),
        solvedBy: wx.getDatabase().command.push(openid),
        updatedAt: now
      }
    });
  }
  return OK({ correct, score: record.score, already: false });
}

module.exports = { main: async (params, context) => {
  const action = (params && params.action) || '';
  const db = wx.getDatabase();
  const openid = (context && (context.OPENID || context.openid)) || 'stub';
  try {
    const role = await roleOf(db, openid);
    switch (action) {
      case 'riddle.create':   return await riddleCreate(db, openid, params, role);
      case 'riddle.list':     return await riddleList(db, openid, params, role);
      case 'riddle.pending':  return await riddlePending(db, openid, params, role);
      case 'riddle.approve':  return await riddleReview(db, openid, params, role, true);
      case 'riddle.reject':   return await riddleReview(db, openid, params, role, false);
      case 'riddle.answer':   return await riddleAnswer(db, openid, params, role);
      default: return BAD_REQUEST(`unknown action: ${action}`);
    }
  } catch (e) {
    return BAD_REQUEST(`riddle.${action} error: ${e.message}`);
  }
}};
