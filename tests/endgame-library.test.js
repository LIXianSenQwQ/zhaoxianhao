/**
 * tests/endgame-library.test.js
 * V2.0 F7 残局题库校验：每题均为「红先一步将死」干净局面（引擎验证）。
 *
 * 每题性质：
 *   1. 初始黑方未被将军（否则是轮到黑应将而非红走杀题）
 *   2. 初始红方未被将军
 *   3. 红方 legalMoves 中恰有一步落子后黑将死（唯一解 → 挑战可判定）
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { LEVELS, boardFromLevel, LEVEL_COUNT } = require('../utils/endgame-library.js');
const eng = require('../utils/chess-engine.js');

function mateIn1s(board) {
  const sols = [];
  for (const m of eng.legalMoves(board, 'red')) {
    if (eng.isCheckmate(eng.makeMove(board, m.from, m.to), 'black')) sols.push(m);
  }
  return sols;
}

test('F7 残局题库：编号唯一且字段完整', () => {
  assert.ok(LEVEL_COUNT >= 6, `题库至少 6 题（当前 ${LEVEL_COUNT}）`);
  const ids = LEVELS.map(l => l.id);
  assert.equal(new Set(ids).size, ids.length, 'id 唯一');
  for (const l of LEVELS) {
    assert.ok(l.title && l.tip, `${l.id} title/tip 必填`);
    assert.ok([1, 2, 3].includes(l.difficulty), `${l.id} difficulty ∈ 1..3`);
    assert.ok(Array.isArray(l.pieces) && l.pieces.length >= 4, `${l.id} 含红帅/黑将与进攻子`);
  }
});

test('F7 残局题库：每题为干净 mate-in-1（初始未将军 + 恰唯一解）', () => {
  for (const l of LEVELS) {
    const b = boardFromLevel(l);
    // 双方帅将存在（findPieces 项: { row, col, piece: 棋子对象 }）
    assert.ok(eng.findPieces(b, 'black').some(p => p.piece && p.piece.piece === 'K'), `${l.id} 黑将存在`);
    assert.ok(eng.findPieces(b, 'red').some(p => p.piece && p.piece.piece === 'K'), `${l.id} 红帅存在`);
    assert.equal(eng.isCheck(b, 'black'), false, `${l.id} 初始黑未被将军`);
    assert.equal(eng.isCheck(b, 'red'), false, `${l.id} 初始红未被将军`);
    const sols = mateIn1s(b);
    assert.equal(sols.length, 1, `${l.id} 恰一步将杀解（当前 ${sols.length}）`);
  }
});

test('F7 残局题库：每一解走法在盘面内且不重复', () => {
  const seen = new Set();
  for (const l of LEVELS) {
    const b = boardFromLevel(l);
    const sols = mateIn1s(b);
    const key = `${sols[0].from.row},${sols[0].from.col}>${sols[0].to.row},${sols[0].to.col}`;
    assert.ok(!seen.has(key), `${l.id} 解不与其他题重复`);
    seen.add(key);
  }
});

test('F7 残局题库：解的棋子确为红方', () => {
  for (const l of LEVELS) {
    const b = boardFromLevel(l);
    const sols = mateIn1s(b);
    const p = b[sols[0].from.row][sols[0].from.col];
    assert.equal(p.color, 'red', `${l.id} 行棋棋子属红方`);
  }
});

test('F7 残局题库：六题杀着棋子类型分布 ≥3 种（车/炮/马）', () => {
  const types = new Set();
  for (const l of LEVELS) {
    const b = boardFromLevel(l);
    const sols = mateIn1s(b);
    const p = b[sols[0].from.row][sols[0].from.col];
    types.add(p.piece);
  }
  assert.ok(types.size >= 3, `杀着类型分布 ${[...types].join(',')}`);
});
