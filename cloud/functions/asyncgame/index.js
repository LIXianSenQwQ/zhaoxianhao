/**
 * cloud/functions/asyncgame/index.js
 * V2.0 F7: 异步对弈（一手传书 · 非实时匹配）云函数
 *
 * 合规对齐（蓝图 §30 D.1 / 合规清单 2.0）：
 *   · 每步 24h 内有效（回合制，非实时匹配、无联机对战）
 *   · 双方须为认证族人（MEMBER+），零内购、零积分赌博化、无虚拟货币
 *   · 走法合法性由本域自包含象棋引擎副本校验（cloud/functions/asyncgame/engine.js，
 *     与 utils/chess-engine.js 同源同步：node scripts/sync-asyncgame-engine.js）
 *
 * Action 清单：
 *   · game.create      发起挑战（红方指定被挑战族人成员，解析其 openid）
 *   · game.list        我的对局（待应战/进行中/已结束），惰性扫描超时
 *   · game.state       单局详情（棋盘/走法日志/回合/截止）
 *   · game.move        走子（回合身份 + 引擎合法性 + 胜负终局判定）
 *   · game.accept      应战（WAITING → ONGOING，红先，24h 截止）
 *   · game.resign      认输
 */

const wx = require('wx-server-sdk');
const { OK, BAD_REQUEST, FORBIDDEN } = require('./common/response');
const { hasRole, roleOf } = require('./common/roles');
const { writeAudit } = require('./common/audit');
const eng = require('./engine');

wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

const MOVE_TTL_HOURS = 24;   // 每步 24h 内有效
const WAIT_TTL_HOURS = 48;   // 挑战 48h 未应战自动过期
const SIDE_ORDER = { red: 'black', black: 'red' };

function nowIso() { return new Date().toISOString(); }
function addHours(iso, h) { return new Date(Date.parse(iso) + h * 3600 * 1000).toISOString(); }

/** 生成 8 位对局短码（展示用） */
function makeGameId() {
  const n = Math.floor(Math.random() * 0xffffffff);
  return n.toString(36).toUpperCase().padStart(8, '0').slice(0, 8);
}

/** 服务端引擎判定：走法是否合法（含不自杀） */
function legalMove(board, from, to, side) {
  if (!board || !from || !to) return false;
  const piece = board[from.row] && board[from.row][from.col];
  if (!piece || piece.color !== side) return false;
  const moves = eng.legalMoves(board, side);
  return moves.some(m =>
    m.from.row === from.row && m.from.col === from.col &&
    m.to.row === to.row && m.to.col === to.col
  );
}

/** 主入口 */
async function main(event, context) {
  const openid = (context && context.OPENID) || (context && context.openid) || null;
  const db = wx.getDatabase();
  const action = event.action || '';
  try {
    if (!openid) return BAD_REQUEST('请先登录');
    // 五模块安全门禁（IJ3 对齐）：写操作须 MEMBER+
    if (['game.create', 'game.move', 'game.accept', 'game.resign'].includes(action)) {
      const role = await roleOf(db, openid);
      if (!hasRole(role, 'MEMBER')) return FORBIDDEN('仅认证族人可发起异步对弈');
    }
    switch (action) {
      case 'game.create':  return await gameCreate(db, openid, event);
      case 'game.list':    return await gameList(db, openid);
      case 'game.state':   return await gameState(db, openid, event);
      case 'game.move':    return await gameMove(db, openid, event);
      case 'game.accept':  return await gameAccept(db, openid, event);
      case 'game.resign':  return await gameResign(db, openid, event);
      default:             return BAD_REQUEST(`unknown action: ${action}`);
    }
  } catch (e) {
    return BAD_REQUEST(`asyncgame.${action} error: ${e.message}`);
  }
}

// ─── game.create：发起挑战（红=我，黑=被挑战成员） ───
async function gameCreate(db, openid, p) {
  const blackMemberId = p && (p.blackMemberId || p.opponentMemberId);
  if (!blackMemberId) return BAD_REQUEST('请选择被挑战的族人');
  // 解析被挑战成员 + 关联 openid（成员关联账号才能对弈）
  let member;
  try {
    const res = await db.collection('members').doc(blackMemberId).get();
    member = res.data;
  } catch (e) { member = null; }
  if (!member || !member._id) return BAD_REQUEST('未找到该族人');
  const blackId = member.linkedOpenid;
  if (!blackId) return BAD_REQUEST('对方尚未关联账号，暂无法对弈');
  if (blackId === openid) return BAD_REQUEST('不能挑战自己');

  const now = nowIso();
  const game = {
    gameId: makeGameId(),
    redId: openid,
    redMemberId: null,          // 自身 memberId 由前端可选传入
    blackId,
    blackMemberId,
    redName: (p && p.redName) || '我',
    blackName: member.genealogyName || member.name || '族人',
    status: 'WAITING',
    turn: 'red',
    board: JSON.stringify(eng.initialBoard()),
    moveLog: [],
    lastMoveAt: now,
    deadlineAt: addHours(now, WAIT_TTL_HOURS), // 等待期截止（应战后重算为 24h/步）
    result: null,
    createdBy: openid,
    createdAt: now,
    updatedAt: now
  };
  if (p && p.redMemberId) game.redMemberId = p.redMemberId;
  const res = await db.collection('async_games').add(game);
  game._id = res._id;
  await writeAudit(db, { userId: openid, action: 'asyncgame.create', target: game._id, detail: `challenge:${game.blackName}` });
  return OK({ game: toPublic(game) });
}

// ─── game.list：我的对局（先惰性扫描超时，再返回） ───
async function gameList(db, openid) {
  await lazyExpire(db); // 惰性：先结算所有超时对局
  const mine = [];
  for (const col of ['redId', 'blackId']) {
    const res = await db.collection('async_games')
      .where({ [col]: openid }).orderBy('updatedAt', 'desc').limit(30).get();
    for (const g of (res.data || [])) mine.push(g);
  }
  // 去重（同局可能 red+black 双侧各出现一次）
  const uniq = new Map();
  for (const g of mine) if (!uniq.has(g._id)) uniq.set(g._id, g);
  const games = [...uniq.values()].sort((a, b) =>
    Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0)
  );
  return OK({
    games: games.map(g => toPublic(g, openid)),
    waiting: games.filter(g => g.status === 'WAITING' && g.blackId === openid).length,
    ongoing: games.filter(g => g.status === 'ONGOING').length
  });
}

// ─── game.state：单局详情 ───
async function gameState(db, openid, p) {
  const gameId = p && p.gameId;
  if (!gameId) return BAD_REQUEST('缺少 gameId');
  let game;
  try {
    const res = await db.collection('async_games').where({ gameId }).limit(1).get();
    game = (res.data && res.data[0]) || null;
  } catch (e) { game = null; }
  if (!game) return BAD_REQUEST('对局不存在');
  if (game.redId !== openid && game.blackId !== openid) return FORBIDDEN('无权查看该对局');
  const settled = await settleIfExpired(db, game);
  return OK({ game: toPublic(settled, openid) });
}

// ─── game.accept：应战（WAITING → ONGOING，红先，24h 截止） ───
async function gameAccept(db, openid, p) {
  const gameId = p && p.gameId;
  if (!gameId) return BAD_REQUEST('缺少 gameId');
  let game;
  try {
    const res = await db.collection('async_games').where({ gameId }).limit(1).get();
    game = (res.data && res.data[0]) || null;
  } catch (e) { game = null; }
  if (!game) return BAD_REQUEST('对局不存在');
  if (game.blackId !== openid) return FORBIDDEN('仅被挑战方可应战');
  if (game.status !== 'WAITING') return BAD_REQUEST('对局已开始或已结束');

  const now = nowIso();
  await db.collection('async_games').doc(game._id).update({
    data: {
      status: 'ONGOING',
      turn: 'red',
      deadlineAt: addHours(now, MOVE_TTL_HOURS),
      updatedAt: now
    }
  });
  const updated = { ...game, status: 'ONGOING', turn: 'red', deadlineAt: addHours(now, MOVE_TTL_HOURS), updatedAt: now };
  await writeAudit(db, { userId: openid, action: 'asyncgame.accept', target: game._id, detail: `gameId:${gameId}` });
  return OK({ game: toPublic(updated, openid) });
}

// ─── game.move：走子（回合身份 + 引擎合法性 + 终局） ───
async function gameMove(db, openid, p) {
  const gameId = p && p.gameId;
  const from = p && p.from;
  const to = p && p.to;
  if (!gameId || !from || !to) return BAD_REQUEST('参数不完整（gameId/from/to）');
  let game;
  try {
    const res = await db.collection('async_games').where({ gameId }).limit(1).get();
    game = (res.data && res.data[0]) || null;
  } catch (e) { game = null; }
  if (!game) return BAD_REQUEST('对局不存在');

  game = await settleIfExpired(db, game); // 先结算：若已超时本步拒绝
  if (game.status !== 'ONGOING') return BAD_REQUEST(`对局已结束（${game.status}）`);

  // 幂等先行：同一步重复提交（含网络重试/切回合竞态）→ 直接返回，不重复入账
  if (game.redId === openid || game.blackId === openid) {
    if (game.moveLog.some(m =>
      m.from.row === from.row && m.from.col === from.col &&
      m.to.row === to.row && m.to.col === to.col
    )) return OK({ game: toPublic(game, openid), duplicate: true });
  }

  // 回合身份：红方只能走红子，黑方只能走黑子
  const side = game.turn;
  const expected = side === 'red' ? game.redId : game.blackId;
  if (expected !== openid) return FORBIDDEN('尚未轮到您行棋');

  let board;
  try { board = JSON.parse(game.board || 'null'); } catch (e) { board = null; }
  if (!legalMove(board, from, to, side)) return BAD_REQUEST('该走法不合法（引擎校验）');

  const nextBoard = eng.makeMove(board, from, to);
  const opp = SIDE_ORDER[side];

  const now = nowIso();
  const entry = { side, from, to, at: now };
  const moveLog = [...(game.moveLog || []), entry];

  // 终局判定（服务端引擎）
  let status = 'ONGOING';
  let result = null;
  if (eng.isCheckmate(nextBoard, opp)) {
    status = 'FINISHED';
    result = { winner: side, reason: 'CHECKMATE' };
  } else if (eng.isStalemate(nextBoard, opp)) {
    status = 'FINISHED';
    result = { winner: 'draw', reason: 'STALEMATE' };
  }

  const patch = {
    board: JSON.stringify(nextBoard),
    moveLog,
    turn: status === 'ONGOING' ? opp : game.turn,
    lastMoveAt: now,
    deadlineAt: addHours(now, MOVE_TTL_HOURS),
    updatedAt: now
  };
  if (status !== 'ONGOING') { patch.status = status; patch.result = result; }

  await db.collection('async_games').doc(game._id).update({ data: patch });
  const updated = { ...game, ...patch };
  if (status !== 'ONGOING') {
    await writeAudit(db, { userId: openid, action: 'asyncgame.finish', target: game._id,
      detail: `gameId:${gameId} winner:${result.winner} reason:${result.reason}` });
  }
  return OK({ game: toPublic(updated, openid), finished: status !== 'ONGOING' });
}

// ─── game.resign：认输 ───
async function gameResign(db, openid, p) {
  const gameId = p && p.gameId;
  if (!gameId) return BAD_REQUEST('缺少 gameId');
  let game;
  try {
    const res = await db.collection('async_games').where({ gameId }).limit(1).get();
    game = (res.data && res.data[0]) || null;
  } catch (e) { game = null; }
  if (!game) return BAD_REQUEST('对局不存在');
  if (game.redId !== openid && game.blackId !== openid) return FORBIDDEN('无权操作该对局');
  game = await settleIfExpired(db, game);
  if (game.status !== 'ONGOING' && game.status !== 'WAITING') return BAD_REQUEST('对局已结束');

  const loser = game.redId === openid ? 'red' : 'black';
  const winner = SIDE_ORDER[loser];
  const now = nowIso();
  await db.collection('async_games').doc(game._id).update({
    data: {
      status: 'FINISHED',
      result: { winner, reason: 'RESIGN' },
      updatedAt: now
    }
  });
  await writeAudit(db, { userId: openid, action: 'asyncgame.resign', target: game._id, detail: `gameId:${gameId}` });
  return OK({ game: toPublic({ ...game, status: 'FINISHED', result: { winner, reason: 'RESIGN' } }, openid) });
}

// ─── 超时结算 ───
async function settleIfExpired(db, game) {
  const now = Date.now();
  let patch = null;
  if (game.status === 'WAITING' && Date.parse(game.deadlineAt || 0) < now) {
    patch = { status: 'EXPIRED', result: { winner: '', reason: 'ABANDON' }, updatedAt: nowIso() };
  } else if (game.status === 'ONGOING' && Date.parse(game.deadlineAt || 0) < now) {
    const loser = game.turn;
    patch = {
      status: 'FINISHED',
      result: { winner: SIDE_ORDER[loser], reason: 'TIMEOUT' },
      turn: loser,
      updatedAt: nowIso()
    };
  }
  if (patch) {
    await db.collection('async_games').doc(game._id).update({ data: patch });
    return { ...game, ...patch };
  }
  return game;
}

async function lazyExpire(db) {
  const nowI = nowIso();
  // WAITING 超期 + ONGOING 超期（分批扫，上限防抖）
  const res = await db.collection('async_games')
    .where({ status: 'WAITING', deadlineAt: nowI }).limit(20).get().catch(() => ({ data: [] }));
  for (const g of (res.data || [])) await settleIfExpired(db, g).catch(() => {});
  const res2 = await db.collection('async_games')
    .where({ status: 'ONGOING', deadlineAt: nowI }).limit(20).get().catch(() => ({ data: [] }));
  for (const g of (res2.data || [])) await settleIfExpired(db, g).catch(() => {});
}

/** 出参裁剪：不回传对方敏感字段，仅对局必要字段 */
function toPublic(g, me) {
  return {
    _id: g._id,
    gameId: g.gameId,
    redName: g.redName,
    blackName: g.blackName,
    mySide: me ? (g.redId === me ? 'red' : g.blackId === me ? 'black' : '') : '',
    status: g.status,
    turn: g.turn,
    board: g.board ? JSON.parse(g.board) : null,
    moveLog: g.moveLog || [],
    lastMoveAt: g.lastMoveAt,
    deadlineAt: g.deadlineAt,
    result: g.result || null,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt
  };
}

module.exports = { main };
