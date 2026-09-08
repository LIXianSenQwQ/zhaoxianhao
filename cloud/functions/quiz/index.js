/**
 * cloud/functions/quiz/index.js — 百业问学（内容治理版）
 * V2.0 F8：
 *   - quiz.create    MEMBER+ 出题 → PENDING（禁止未审核上架）
 *   - quiz.pending   EDITOR+ 审核队列（含正确答案/解析供审）
 *   - quiz.approve / quiz.reject  EDITOR+ 审核（审计留痕）
 *   - quiz.list      MEMBER+ 仅 ACTIVE（剥离 correctIndex）
 *   - quiz.answer    MEMBER+ 仅 ACTIVE 可答；每用户每题限一次（防枚举刷分）
 * 合规：知识问答纯娱乐、奖励仅家族积分，无现金奖池。
 */
const wx = require('wx-server-sdk');
const { OK, BAD_REQUEST, FORBIDDEN, NOT_FOUND } = require('./common/response');
const { roleOf, hasRole } = require('./common/roles');
const { writeAudit } = require('./common/audit');

wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

const INDUSTRIES = ['百家', '农业', '商贾', '文教', '医道', '工造', '蚕桑', '茶艺'];

function cleanText(v, max) {
  const s = String(v || '').trim();
  return s.length > max ? s.slice(0, max) : s;
}

async function quizCreate(db, openid, p, role) {
  if (!hasRole(role, 'MEMBER')) return FORBIDDEN('认证族人才可出题');
  const question = cleanText(p && p.question, 200);
  const choicesRaw = p && Array.isArray(p.choices) ? p.choices : [];
  if (!question) return BAD_REQUEST('题目不能为空');
  if (choicesRaw.length < 2 || choicesRaw.length > 6) return BAD_REQUEST('选项需 2~6 个');
  const choices = choicesRaw.map(c => cleanText(c && c.text, 60));
  if (choices.some(t => !t)) return BAD_REQUEST('选项文本不能为空');
  const correctIndex = Number(p && p.correctIndex);
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= choices.length) {
    return BAD_REQUEST('正确选项索引不合法');
  }
  const industry = cleanText(p && p.industry, 10) || '百家';
  if (!INDUSTRIES.includes(industry)) return BAD_REQUEST(`行业需在 ${INDUSTRIES.join('/')} 内`);
  const explanation = cleanText(p && p.explanation, 300);
  const difficulty = Math.min(5, Math.max(1, Number(p && p.difficulty) || 1));
  const now = new Date().toISOString();
  const doc = {
    type: 'question',
    question,
    choices: choices.map(text => ({ label: '', text })),
    correctIndex,
    industry, difficulty,
    explanation,
    authorOpenid: openid,
    status: 'PENDING',
    createdAt: now, updatedAt: now
  };
  const res = await db.collection('questions').add(doc);
  doc._id = res._id;
  await writeAudit(db, {
    userId: openid, action: 'quiz.create', target: res._id,
    detail: `出题 PENDING[${industry}]: ${question}`, createdAt: now
  });
  return OK({ question: doc });
}

async function quizList(db, openid, p, role) {
  if (!hasRole(role, 'MEMBER')) return FORBIDDEN('认证族人才可参与问学');
  const page = Math.max(1, Number(p && p.page) || 1);
  const size = 20;
  const filter = { type: 'question', status: 'ACTIVE' };
  if (p && p.industry) filter.industry = String(p.industry).trim();
  const res = await db.collection('questions')
    .where(filter).orderBy('createdAt', 'desc')
    .skip((page - 1) * size).limit(size).get();
  const questions = (res.data || []).map(q => {
    const { correctIndex, ...pub } = q;
    void correctIndex;
    return pub;
  });
  return OK({ questions });
}

async function quizPending(db, openid, p, role) {
  if (!hasRole(role, 'EDITOR')) return FORBIDDEN('需要家族编辑权限（EDITOR+）审核题目');
  const page = Math.max(1, Number(p && p.page) || 1);
  const size = 20;
  const res = await db.collection('questions')
    .where({ type: 'question', status: 'PENDING' })
    .orderBy('createdAt', 'asc')
    .skip((page - 1) * size).limit(size).get();
  return OK({ questions: res.data || [] }); // 审核者可见 correctIndex/explanation
}

async function quizReview(db, openid, p, role, approve) {
  if (!hasRole(role, 'EDITOR')) return FORBIDDEN('需要家族编辑权限（EDITOR+）审核题目');
  const id = p && p.questionId;
  if (!id) return BAD_REQUEST('questionId 必需');
  const cur = await db.collection('questions').doc(id).get();
  const doc = cur && cur.data;
  if (!doc || doc.type !== 'question') return NOT_FOUND('题目不存在');
  if (doc.status !== 'PENDING') return BAD_REQUEST(`仅 PENDING 可审核（当前 ${doc.status}）`);
  const next = approve ? 'ACTIVE' : 'REJECTED';
  const now = new Date().toISOString();
  await db.collection('questions').doc(id).update({
    data: { status: next, reviewedBy: openid, reviewedAt: now, updatedAt: now }
  });
  await writeAudit(db, {
    userId: openid,
    action: approve ? 'quiz.approve' : 'quiz.reject',
    target: id,
    detail: `${approve ? '上架' : '驳回'}题目[${doc.industry}]: ${doc.question}`, createdAt: now
  });
  return OK({ questionId: id, status: next });
}

async function quizAnswer(db, openid, p, role) {
  if (!hasRole(role, 'MEMBER')) return FORBIDDEN('认证族人才可参与问学');
  const id = p && p.questionId;
  const sel = Number(p && p.selectedIndex);
  if (!id || !Number.isInteger(sel)) return BAD_REQUEST('questionId/selectedIndex 必需');
  const cur = await db.collection('questions').doc(id).get();
  const q = cur && cur.data;
  if (!q || q.type !== 'question') return NOT_FOUND('题目不存在');
  if (q.status !== 'ACTIVE') return BAD_REQUEST('该题未在活动期（仅 ACTIVE 可作答）');
  // 防枚举刷分：每用户每题仅一次
  const prev = await db.collection('quiz_records')
    .where({ questionId: id, openid }).limit(1).get();
  if (prev.data && prev.data.length) {
    return OK({ correct: prev.data[0].correct, score: 0, already: true, explanation: q.explanation });
  }
  const correct = sel === Number(q.correctIndex);
  const now = new Date().toISOString();
  const record = {
    openid, questionId: id, selectedIndex: sel, correct,
    score: correct ? 15 : 0, industry: q.industry, createdAt: now
  };
  await db.collection('quiz_records').add(record);
  return OK({ correct, score: record.score, already: false, explanation: q.explanation });
}

module.exports = { main: async (params, context) => {
  const action = (params && params.action) || '';
  const db = wx.getDatabase();
  const openid = (context && (context.OPENID || context.openid)) || 'stub';
  try {
    const role = await roleOf(db, openid);
    switch (action) {
      case 'quiz.create':   return await quizCreate(db, openid, params, role);
      case 'quiz.list':     return await quizList(db, openid, params, role);
      case 'quiz.pending':  return await quizPending(db, openid, params, role);
      case 'quiz.approve':  return await quizReview(db, openid, params, role, true);
      case 'quiz.reject':   return await quizReview(db, openid, params, role, false);
      case 'quiz.answer':   return await quizAnswer(db, openid, params, role);
      default: return BAD_REQUEST(`unknown action: ${action}`);
    }
  } catch (e) {
    return BAD_REQUEST(`quiz.${action} error: ${e.message}`);
  }
}};
