const wx = require('wx-server-sdk');
const { OK, BAD_REQUEST } = require('./common/response');

wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

// Simple answerHash: in production, use crypto.createHash('sha256'). We'll store answer as plaintext in riddle_answer type records.
async function riddleCreate(db, openid, p) {
  if (!p || !p.question) return BAD_REQUEST('谜面不能为空');
  const now = new Date().toISOString();
  const riddle = {
    type: 'riddle', question: p.question, hint: p.hint || '', category: p.category || '通用',
    difficulty: Math.min(5, Math.max(1, Number(p.difficulty) || 1)),
    authorOpenid: openid, status: 'PENDING', solvedCount: 0, solvedBy: [], createdAt: now, updatedAt: now
  };
  if (p.answer) {
    // store answer as separate record for reference
    await db.collection('riddles').add({
      type: 'riddle_answer', riddleId: null, answer: String(p.answer).trim(), createdAt: now
    });
  }
  const res = await db.collection('riddles').add(riddle);
  riddle._id = res._id;
  // link answer
  if (p.answer) {
    await db.collection('riddles').add({ type: 'riddle_answer', riddleId: res._id, answerHash: String(p.answer).trim(), createdAt: now });
  }
  return OK({ riddle });
}

async function riddleList(db, openid, p) {
  const page = Math.max(1, Number(p && p.page) || 1);
  const size = 20;
  const res = await db.collection('riddles').where({ type: 'riddle', status: 'ACTIVE' })
    .orderBy('createdAt', 'desc').skip((page - 1) * size).limit(size).get();
  return OK({ riddles: res.data || [] });
}

async function riddleAnswer(db, openid, p) {
  const { riddleId, guess } = p || {};
  if (!riddleId || !guess) return BAD_REQUEST('riddleId/guess 必需');
  const ansRes = await db.collection('riddles').where({ type: 'riddle_answer', riddleId }).limit(1).get();
  if (!ansRes.data || !ansRes.data.length) return BAD_REQUEST('未设置答案');
  const correct = String(ansRes.data[0].answerHash).toLowerCase() === String(guess).toLowerCase();
  const record = { riddleId, openid, guess: String(guess).trim(), correct, score: correct ? 10 : 0, createdAt: new Date().toISOString() };
  await db.collection('riddle_votes').add(record);
  if (correct) {
    await db.collection('riddles').doc(riddleId).update({ data: { solvedCount: wx.getDatabase().command.inc(1), solvedBy: wx.getDatabase().command.push(openid) } });
  }
  return OK({ correct, score: record.score });
}

module.exports = { main: async (params, context) => {
  const action = (params && params.action) || '';
  const db = wx.getDatabase();
  const openid = (context && (context.OPENID || context.openid)) || 'stub';
  try {
    switch (action) {
      case 'riddle.create': return await riddleCreate(db, openid, params);
      case 'riddle.list':   return await riddleList(db, openid, params);
      case 'riddle.answer': return await riddleAnswer(db, openid, params);
      default: return BAD_REQUEST(`unknown action: ${action}`);
    }
  } catch (e) {
    return BAD_REQUEST(`riddle.${action} error: ${e.message}`);
  }
}};