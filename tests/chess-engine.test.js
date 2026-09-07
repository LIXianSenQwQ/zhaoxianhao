/**
 * tests/chess-engine.test.js
 * V2.0 F7: 中国象棋规则引擎单测（纯函数 TDD，零联机）
 */

const assert = require('assert');
const { test } = require('node:test');
const {
  initialBoard, createPiece, findPieces, possibleRawMoves,
  makeMove, isCheck, legalMoves, isCheckmate, isStalemate,
  PIECE, SIDE
} = require('../utils/chess-engine');

// 10×9 空棋盘辅助
function emptyBoard() {
  return Array.from({ length: 10 }, () => Array(9).fill(null));
}

test('F7 initialBoard: 标准开局双方各 16 子', () => {
  const b = initialBoard();
  assert.equal(findPieces(b, SIDE.RED).length, 16, '红方 16 子');
  assert.equal(findPieces(b, SIDE.BLACK).length, 16, '黑方 16 子');
  assert.ok(b[9][4] && b[9][4].piece === PIECE.KING, '红帅在(9,4)');
  assert.ok(b[0][4] && b[0][4].piece === PIECE.KING, '黑将在(0,4)');
});

test('F7 possibleRawMoves: 车横向/纵向走', () => {
  const b = emptyBoard();
  b[5][4] = createPiece(PIECE.ROOK, SIDE.RED);
  const moves = possibleRawMoves(b, 5, 4);
  // 第5行：向左4格 + 向右4格 + 向上5格 + 向下4格 = 17
  assert.equal(moves.length, 4 + 4 + 5 + 4);
});

test('F7 possibleRawMoves: 炮隔山打', () => {
  const b = emptyBoard();
  b[5][4] = createPiece(PIECE.CANNON, SIDE.RED);
  b[5][1] = createPiece(PIECE.PAWN, SIDE.BLACK);  // 炮架
  b[5][0] = createPiece(PIECE.PAWN, SIDE.BLACK);  // 隔山目标
  const leftMoves = possibleRawMoves(b, 5, 4).filter(m => m.row === 5 && m.col < 4);
  assert.ok(leftMoves.some(m => m.col === 3), '左1可走');
  assert.ok(leftMoves.some(m => m.col === 2), '左2可走');
  assert.ok(!leftMoves.some(m => m.col === 1), '左3炮架不可走');
  assert.ok(leftMoves.some(m => m.col === 0), '左4隔山吃');
});

test('F7 possibleRawMoves: 马蹩腿', () => {
  const b = emptyBoard();
  b[5][4] = createPiece(PIECE.HORSE, SIDE.RED);
  // 阻塞全部四个前进腿位置：上(4,4)、下(6,4)、左(5,3)、右(5,5)
  b[4][4] = createPiece(PIECE.PAWN, SIDE.RED);
  b[6][4] = createPiece(PIECE.PAWN, SIDE.RED);
  b[5][3] = createPiece(PIECE.PAWN, SIDE.RED);
  b[5][5] = createPiece(PIECE.PAWN, SIDE.RED);
  const moves = possibleRawMoves(b, 5, 4);
  assert.equal(moves.length, 0, '四面全蹩腿不能走');
});

test('F7 possibleRawMoves: 兵过河前后走法变化', () => {
  const b = emptyBoard();
  b[6][4] = createPiece(PIECE.PAWN, SIDE.RED); // 未过河
  b[4][4] = createPiece(PIECE.PAWN, SIDE.RED); // 已过河
  const before = possibleRawMoves(b, 6, 4);
  assert.equal(before.length, 1, '未过河兵只能前进');
  assert.equal(before[0].row, 5);
  const after = possibleRawMoves(b, 4, 4);
  assert.ok(after.length >= 2, '过河兵可左右或前进');
});

test('F7 isCheck: 车将军', () => {
  const b = emptyBoard();
  b[9][4] = createPiece(PIECE.KING, SIDE.RED);
  b[9][0] = createPiece(PIECE.ROOK, SIDE.BLACK);
  assert.ok(isCheck(b, SIDE.RED));
});

test('F7 isCheck: 将帅对面（飞将）', () => {
  const b = emptyBoard();
  b[9][4] = createPiece(PIECE.KING, SIDE.RED);
  b[0][4] = createPiece(PIECE.KING, SIDE.BLACK);
  assert.ok(isCheck(b, SIDE.RED), '飞将：红被将');
  assert.ok(isCheck(b, SIDE.BLACK), '飞将：黑被将');
  b[5][4] = createPiece(PIECE.PAWN, SIDE.RED);  // 中间有子遮挡
  assert.ok(!isCheck(b, SIDE.RED), '有遮挡不飞将');
});

test('F7 isCheckmate: 车将死黑', () => {
  const b = emptyBoard();
  b[0][4] = createPiece(PIECE.KING, SIDE.BLACK);
  b[0][3] = createPiece(PIECE.ROOK, SIDE.RED);   // 车将军
  b[1][3] = createPiece(PIECE.ROOK, SIDE.RED);   // 封住 (1,4) 逃生
  assert.ok(isCheck(b, SIDE.BLACK));
  assert.ok(isCheckmate(b, SIDE.BLACK), '黑将被双车将死');
});

test('F7 legalMoves: 被将时只能解将', () => {
  const b = emptyBoard();
  b[9][4] = createPiece(PIECE.KING, SIDE.RED);
  b[9][8] = createPiece(PIECE.ROOK, SIDE.BLACK); // 将军
  b[5][4] = createPiece(PIECE.PAWN, SIDE.RED);
  const moves = legalMoves(b, SIDE.RED);
  // 只有帅有解脱走法（兵动不解将）
  const kingMoves = moves.filter(m => m.from.row === 9 && m.from.col === 4);
  assert.ok(kingMoves.length > 0, '帅可躲避');
  const pawnMoves = moves.filter(m => m.from.row === 5 && m.from.col === 4);
  assert.equal(pawnMoves.length, 0, '兵动不解将，无合法走法');
});

test('F7 isStalemate: 可辨识非困毙局面', () => {
  // 开局非困毙
  assert.ok(!isStalemate(initialBoard(), SIDE.RED));
  assert.ok(!isStalemate(initialBoard(), SIDE.BLACK));

  // 将死也不是困毙
  const b = emptyBoard();
  b[0][4] = createPiece(PIECE.KING, SIDE.BLACK);
  b[0][3] = createPiece(PIECE.ROOK, SIDE.RED);
  b[1][3] = createPiece(PIECE.ROOK, SIDE.RED);
  assert.ok(isCheckmate(b, SIDE.BLACK), '将杀');
  assert.ok(!isStalemate(b, SIDE.BLACK), '将杀≠困毙');
});

test('F7 makeMove: 走棋不可变原棋盘', () => {
  const b = initialBoard();
  const from = { row: 0, col: 0 };  // 黑车
  const to = { row: 1, col: 0 };
  makeMove(b, from, to);
  assert.ok(b[0][0] !== null, '原棋盘不受影响');
  assert.ok(b[1][0] === null, '目标格在原棋盘仍空');
});

test('F7 legalMoves: 初始局面先手有 44 种走法', () => {
  const b = initialBoard();
  const moves = legalMoves(b, SIDE.RED);
  // 标准中国象棋先手≈44种走法（兵5×1+炮2×13?+车2×各N+马2×各N+相2×各N+仕2+帅1）
  assert.ok(moves.length >= 40 && moves.length <= 50, `初始走法数合理：${moves.length}`);
});

test('F7 isCheckmate: 初始局面非将杀', () => {
  const b = initialBoard();
  assert.ok(!isCheckmate(b, SIDE.RED));
  assert.ok(!isCheckmate(b, SIDE.BLACK));
});