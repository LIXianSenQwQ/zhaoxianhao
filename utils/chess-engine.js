/**
 * utils/chess-engine.js
 * V2.0 F7: 中国象棋规则引擎（本地纯函数，零联机，零内购）
 *
 * 对齐蓝图 D.1 与合规红线（9.0.1）：
 *   · 仅单机人机对弈/打谱复盘/残局挑战
 *   · 无联机匹配、无积分赌博化、无扑克玩法
 *   · 走法合法性 + 将军/应将/胜负和判断
 *
 * 使用：const engine = require('./chess-engine');
 *       engine.possibleMoves(board, {row, col})     → 目标格列表
 *       engine.isCheck(board, side)                  → boolean
 *       engine.isCheckmate(board, side)              → boolean
 */

const BOARD_W = 9;  // 列
const BOARD_H = 10; // 行

// 棋子类型
const PIECE = {
  KING: 'K',    // 帅/将
  ADVISOR: 'A', // 仕/士
  ELEPHANT: 'E',// 相/象
  HORSE: 'H',   // 马
  ROOK: 'R',    // 车
  CANNON: 'C',  // 炮
  PAWN: 'P'     // 兵/卒
};

// 颜色：红色方（下方 7-9 行）| 黑色方（上方 0-2 行）
const SIDE = { RED: 'red', BLACK: 'black' };

function sideOf(piece) { return piece && piece.color; }
function typeOf(piece) { return piece && piece.piece; }

function inBoard(r, c) { return r >= 0 && r < BOARD_H && c >= 0 && c < BOARD_W; }

function inPalace(r, c, color) {
  const colOk = c >= 3 && c <= 5;
  if (color === SIDE.RED) return colOk && r >= 7 && r <= 9;
  return colOk && r >= 0 && r <= 2;
}

function inOwnHalf(r, color) {
  if (color === SIDE.RED) return r >= 5;
  return r <= 4;
}

/**
 * createPiece - 简化棋子初始化
 */
function createPiece(type, color) {
  return { piece: type, color };
}

/**
 * 初始化标准中国象棋棋盘（10×9 二维数组）
 */
function initialBoard() {
  const b = Array.from({ length: BOARD_H }, () => Array(BOARD_W).fill(null));
  const R = SIDE.RED, B = SIDE.BLACK;
  const p = createPiece;
  
  // 黑方（第 0 行）
  b[0][0] = p(PIECE.ROOK, B); b[0][1] = p(PIECE.HORSE, B);
  b[0][2] = p(PIECE.ELEPHANT, B); b[0][3] = p(PIECE.ADVISOR, B);
  b[0][4] = p(PIECE.KING, B);
  b[0][5] = p(PIECE.ADVISOR, B); b[0][6] = p(PIECE.ELEPHANT, B);
  b[0][7] = p(PIECE.HORSE, B); b[0][8] = p(PIECE.ROOK, B);
  
  // 黑方炮（第 2 行）
  b[2][1] = p(PIECE.CANNON, B); b[2][7] = p(PIECE.CANNON, B);
  
  // 黑方卒（第 3 行）
  for (let c = 0; c <= 8; c += 2) b[3][c] = p(PIECE.PAWN, B);
  
  // 红方兵（第 6 行）
  for (let c = 0; c <= 8; c += 2) b[6][c] = p(PIECE.PAWN, R);
  
  // 红方炮（第 7 行）
  b[7][1] = p(PIECE.CANNON, R); b[7][7] = p(PIECE.CANNON, R);
  
  // 红方（第 9 行）
  b[9][0] = p(PIECE.ROOK, R); b[9][1] = p(PIECE.HORSE, R);
  b[9][2] = p(PIECE.ELEPHANT, R); b[9][3] = p(PIECE.ADVISOR, R);
  b[9][4] = p(PIECE.KING, R);
  b[9][5] = p(PIECE.ADVISOR, R); b[9][6] = p(PIECE.ELEPHANT, R);
  b[9][7] = p(PIECE.HORSE, R); b[9][8] = p(PIECE.ROOK, R);
  
  return b;
}

/**
 * 深拷贝棋盘
 */
function cloneBoard(b) {
  return b.map(row => row.map(p => p ? { ...p } : null));
}

/**
 * 获取某方所有棋子位置
 */
function findPieces(b, color) {
  const list = [];
  for (let r = 0; r < BOARD_H; r++)
    for (let c = 0; c < BOARD_W; c++)
      if (b[r][c] && b[r][c].color === color) list.push({ row: r, col: c, piece: b[r][c] });
  return list;
}

/**
 * 棋盘上两点间的棋子数（不含端点）
 */
function countBetween(b, r1, c1, r2, c2) {
  let cnt = 0;
  if (r1 === r2) {
    const minC = Math.min(c1, c2), maxC = Math.max(c1, c2);
    for (let c = minC + 1; c < maxC; c++) if (b[r1][c]) cnt++;
  } else if (c1 === c2) {
    const minR = Math.min(r1, r2), maxR = Math.max(r1, r2);
    for (let r = minR + 1; r < maxR; r++) if (b[r][c1]) cnt++;
  }
  return cnt;
}

/**
 * possibleRawMoves - 不考虑将军情况的合法走法（仅棋子规则）
 */
function possibleRawMoves(b, row, col) {
  const piece = b[row][col];
  if (!piece) return [];
  const color = piece.color;
  const type = piece.piece;
  const moves = [];

  const tryAdd = (r, c) => {
    if (!inBoard(r, c)) return;
    const target = b[r][c];
    if (target && target.color === color) return; // 不能吃己方
    moves.push({ row: r, col: c });
  };

  switch (type) {
    case PIECE.KING: {
      // 九宫内一步
      const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (const [dr, dc] of dirs) {
        const nr = row + dr, nc = col + dc;
        if (inPalace(nr, nc, color)) tryAdd(nr, nc);
      }
      // 将帅对面（飞将）：同列且中间无棋子
      const oppKing = findPieces(b, color === SIDE.RED ? SIDE.BLACK : SIDE.RED)
        .find(p => p.piece && p.piece.piece === PIECE.KING);
      if (oppKing && oppKing.col === col && countBetween(b, row, col, oppKing.row, oppKing.col) === 0) {
        // 飞将不算在 raw moves（shall be considered pseudo-legal; 要不要直接吃将是另一回事）
        // 实际对局中不能通过飞将走棋，但在 behind-king 检查时会被 mark
      }
      break;
    }
    case PIECE.ADVISOR: {
      const dirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
      for (const [dr, dc] of dirs) {
        const nr = row + dr, nc = col + dc;
        if (inPalace(nr, nc, color)) tryAdd(nr, nc);
      }
      break;
    }
    case PIECE.ELEPHANT: {
      // 走田字，不能过河，不被塞象眼
      const dirs = [[-2, -2], [-2, 2], [2, -2], [2, 2]];
      for (const [dr, dc] of dirs) {
        const nr = row + dr, nc = col + dc;
        if (!inBoard(nr, nc) || !inOwnHalf(nr, color)) continue;
        const eyeR = row + dr / 2, eyeC = col + dc / 2;
        if (b[eyeR][eyeC]) continue; // 塞象眼
        tryAdd(nr, nc);
      }
      break;
    }
    case PIECE.HORSE: {
      // 走日字，不被蹩马腿
      const dirs = [
        [-2, -1, -1, 0], [-2, 1, -1, 0],
        [2, -1, 1, 0], [2, 1, 1, 0],
        [-1, -2, 0, -1], [-1, 2, 0, 1],
        [1, -2, 0, -1], [1, 2, 0, 1]
      ];
      for (const [dr, dc, legR, legC] of dirs) {
        const nr = row + dr, nc = col + dc;
        if (!inBoard(nr, nc)) continue;
        const lr = row + legR, lc = col + legC;
        if (b[lr][lc]) continue; // 蹩马腿
        tryAdd(nr, nc);
      }
      break;
    }
    case PIECE.ROOK: {
      // 车：直线走，遇子停
      const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (const [dr, dc] of dirs) {
        let nr = row + dr, nc = col + dc;
        while (inBoard(nr, nc)) {
          const t = b[nr][nc];
          if (t) {
            if (t.color !== color) moves.push({ row: nr, col: nc });
            break;
          }
          moves.push({ row: nr, col: nc });
          nr += dr; nc += dc;
        }
      }
      break;
    }
    case PIECE.CANNON: {
      // 炮：直线走，遇子则隔山打
      const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (const [dr, dc] of dirs) {
        let nr = row + dr, nc = col + dc;
        let jumped = false;
        while (inBoard(nr, nc)) {
          const t = b[nr][nc];
          if (!jumped) {
            if (t) jumped = true;
            else moves.push({ row: nr, col: nc });
          } else {
            if (t) {
              if (t.color !== color) moves.push({ row: nr, col: nc });
              break;
            }
          }
          nr += dr; nc += dc;
        }
      }
      break;
    }
    case PIECE.PAWN: {
      // 兵：过河前只能前进；过河后可左右
      const forward = color === SIDE.RED ? -1 : 1;
      const nrF = row + forward;
      if (inBoard(nrF, col)) tryAdd(nrF, col);
      const crossed = color === SIDE.RED ? row <= 4 : row >= 5;
      if (crossed) {
        tryAdd(row, col - 1);
        tryAdd(row, col + 1);
      }
      break;
    }
  }
  return moves;
}

/**
 * 模拟走棋（返回新棋盘副本）
 */
function makeMove(b, from, to) {
  const nb = cloneBoard(b);
  nb[to.row][to.col] = nb[from.row][from.col];
  nb[from.row][from.col] = null;
  return nb;
}

/**
 * 是否正在被将军（某方被将）
 */
function isCheck(b, side) {
  // 找到己方将帅
  const king = findPieces(b, side).find(p => p.piece && p.piece.piece === PIECE.KING);
  if (!king) return true; // 将被吃掉视为被将

  const opp = side === SIDE.RED ? SIDE.BLACK : SIDE.RED;
  const oppPieces = findPieces(b, opp);
  for (const p of oppPieces) {
    const moves = possibleRawMoves(b, p.row, p.col);
    if (moves.some(m => m.row === king.row && m.col === king.col)) return true;
  }

  // 将帅对面（飞将）
  const oppKing = findPieces(b, opp).find(p => p.piece && p.piece.piece === PIECE.KING);
  if (oppKing && oppKing.col === king.col && countBetween(b, king.row, king.col, oppKing.row, oppKing.col) === 0) {
    return true;
  }

  return false;
}

/**
 * 获取某方合法走法列表（排除走完后被将的走法）
 */
function legalMoves(b, side) {
  const pieces = findPieces(b, side);
  const moves = [];
  for (const p of pieces) {
    const raw = possibleRawMoves(b, p.row, p.col);
    for (const m of raw) {
      const nb = makeMove(b, p, m);
      if (!isCheck(nb, side)) {
        moves.push({ from: { row: p.row, col: p.col }, to: m });
      }
    }
  }
  return moves;
}

/**
 * 是否被将杀
 */
function isCheckmate(b, side) {
  return isCheck(b, side) && legalMoves(b, side).length === 0;
}

/**
 * 是否被困毙（无子可动且未被将 = 和棋的一种）
 */
function isStalemate(b, side) {
  return !isCheck(b, side) && legalMoves(b, side).length === 0;
}

// ─── ESM 导出 ─────────────────────────────────
export { BOARD_W, BOARD_H, PIECE, SIDE, initialBoard, cloneBoard, createPiece, findPieces, possibleRawMoves, makeMove, isCheck, legalMoves, isCheckmate, isStalemate };
