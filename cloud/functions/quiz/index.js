const wx = require('wx-server-sdk');
const { OK, BAD_REQUEST } = require('./common/response');

wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

async function quizCreate(db, openid, p) {
  if (!p || !p.question || !p.choices || !Array.isArray(p.choices) || p.choices.length < 2) return BAD_REQUEST('题目和选项不能为空');
  if (p.correctIndex === null || p.correctIndex === void 0 || p.correctIndex < 0 || p.correctIndex >= p.choices.length) return BAD_REQUEST('正确选项索引不合法');
  const now = new Date().toISOString();
  const doc = {
    type: 'question', question: p.question, choices: p.choices.map(function(c) { return { label: c.label || '', text: c.text || '' }; }),
    correctIndex: Number(p.correctIndex), industry: p.industry || '百家',
    difficulty: Math.min(5, Math.max(1, Number(p.difficulty) || 1)),
    explanation: p.explanation || '', authorOpenid: openid,
    status: 'ACTIVE', createdAt: now, updatedAt: now
  };
  const res = await db.collection('questions').add(doc);
  doc._id = res._id;
  return OK({ question: doc });
}

async function quizList(db, openid, p) {
  const page = Math.max(1, Number(p && p.page) || 1);
  const size = 20;
  const filter = { type: 'question', status: 'ACTIVE' };
  if (p && p.industry) filter.industry = p.industry;
  const res = await db.collection('questions').where(filter).orderBy('createdAt', 'desc')
    .skip((page - 1) * size).limit(size).get();
  return OK({ questions: (res.data || []).map(function(q) { return { ...q, correctIndex: undefined }; }) });
}

async function quizAnswer(db, openid, p) {
  const { questionId, selectedIndex } = p || {};
  if (!questionId || selectedIndex === null || selectedIndex === void 0) return BAD_REQUEST('questionId/selectedIndex 必需');
  const qRes = await db.collection('questions').where({ _id: questionId, type: 'question' }).limit(1).get();
  if (!qRes.data || !qRes.data.length) return BAD_REQUEST('题目不存在');
  const q = qRes.data[0];
  const correct = Number(selectedIndex) === q.correctIndex;
  const record = { openid, questionId, selectedIndex: Number(selectedIndex), correct, score: correct ? 15 : 0, industry: q.industry, createdAt: new Date().toISOString() };
  await db.collection('quiz_records').add(record);
  return OK({ correct, score: record.score, explanation: q.explanation });
}

module.exports = { main: async (params, context) => {
  const action = (params && params.action) || '';
  const db = wx.getDatabase();
  const openid = (context && (context.OPENID || context.openid)) || 'stub';
  try {
    switch (action) {
      case 'quiz.create': return await quizCreate(db, openid, params);
      case 'quiz.list':   return await quizList(db, openid, params);
      case 'quiz.answer': return await quizAnswer(db, openid, params);
      default: return BAD_REQUEST(`unknown action: ${action}`);
    }
  } catch (e) {
    return BAD_REQUEST(`quiz.${action} error: ${e.message}`);
  }
}};