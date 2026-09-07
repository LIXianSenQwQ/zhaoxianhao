/**
 * tests/asyncgame-engine.test.js — 异步对弈引擎副本一致性对拍
 *
 * cloud/functions/asyncgame/engine.js 是 utils/chess-engine.js 的 CJS 部署副本
 * （云函数独立打包）。本测试对拍两版在代表性输入上的行为一致性，防漂移。
 * 若源引擎改动：node scripts/sync-asyncgame-engine.js 重新生成副本。
 */
const { test } = require('node:test');
const assert = require('node:assert');

const src = require('../utils/chess-engine.js');
const cjs = require('../cloud/functions/asyncgame/engine.js');

const RAW_FN = [
  'initialBoard', 'cloneBoard', 'createPiece', 'findPieces',
  'possibleRawMoves', 'makeMove', 'isCheck', 'legalMoves', 'isCheckmate', 'isStalemate'
];

test('asyncgame-engine：副本导出集与源一致（14 个）', () => {
  assert.deepStrictEqual(Object.keys(cjs).sort(), Object.keys(src).sort());
});

test('asyncgame-engine：棋盘/走法行为对拍（代表性局面）', () => {
  const b = src.initialBoard();
  const cb = cjs.initialBoard();
  assert.deepStrictEqual(cb, b, 'initialBoard 一致');

  // 红车直上 [9,0]->[8,0] 合法
  const mk = (eng) => eng.makeMove(b, { row: 9, col: 0 }, { row: 8, col: 0 });
  const nb1 = mk(src), nb2 = mk(cjs);
  assert.deepStrictEqual(nb2, nb1, 'makeMove 一致');
  assert.strictEqual(cjs.isCheck(nb2, 'black'), src.isCheck(nb1, 'black'));

  // 红兵前进合法
  const m1 = src.legalMoves(b, 'red');
  const m2 = cjs.legalMoves(b, 'red');
  assert.strictEqual(m2.length, m1.length, 'legalMoves 数量一致');
});

test('asyncgame-engine：源/副本分别从各自棋盘走一步后仍同步', () => {
  const a = src.initialBoard(), b = cjs.initialBoard();
  const sa = src.legalMoves(a, 'red')[0];
  const sb = cjs.legalMoves(b, 'red')[0];
  assert.deepStrictEqual(sa, sb);
  const na = src.makeMove(a, sa.from, sa.to);
  const nb = cjs.makeMove(b, sb.from, sb.to);
  assert.deepStrictEqual(nb, na);
  assert.strictEqual(src.isCheckmate(na, 'black'), cjs.isCheckmate(nb, 'black'));
});

test('asyncgame-engine：终局判定一致（非残局初始 → 均非将杀/困毙）', () => {
  const b = cjs.initialBoard();
  assert.strictEqual(cjs.isCheckmate(b, 'black'), src.isCheckmate(b, 'black'));
  assert.strictEqual(cjs.isStalemate(b, 'black'), src.isStalemate(b, 'black'));
});
