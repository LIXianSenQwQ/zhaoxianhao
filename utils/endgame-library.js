/**
 * utils/endgame-library.js — 中国象棋残局题库（红先一步将死 / Mate-in-1）
 * V2.0 F7 残局挑战数据源。
 *
 * 合规属性：纯静态残局（无随机、无联机、无对赌），由 chess-engine 纯函数校验。
 * 每题均经引擎验证「恰存在一步将杀解」——见 tests/endgame-library.test.js。
 *
 * 使用：
 *   import { LEVELS, boardFromLevel } from '@/utils/endgame-library.js';
 */
import { createPiece } from './chess-engine.js';

/** 空 10×9 棋盘 */
function emptyBoard() {
  return Array.from({ length: 10 }, () => Array(9).fill(null));
}

/**
 * 残局题
 * @param {string} id       唯一编号（E01…）
 * @param {string} title    标题
 * @param {string} tip      棋诀提示（服务端引擎判定，不剧透唯一解坐标）
 * @param {number} difficulty 1-简单 2-中等 3-较难
 * @param {Array}  pieces   棋子布局 { p, color, row, col }
 */
export const LEVELS = [
  {
    id: 'E01',
    title: '勒马车·让路将军',
    tip: '车在底线牵制，马身让开即可成杀',
    difficulty: 1,
    pieces: [
      { p: 'R', color: 'red', row: 0, col: 0 },
      { p: 'H', color: 'red', row: 0, col: 3 },
      { p: 'K', color: 'black', row: 0, col: 4 },
      { p: 'K', color: 'red', row: 9, col: 3 }
    ]
  },
  {
    id: 'E02',
    title: '卧槽马·车正马后',
    tip: '马走日控宫心，车线洞开即成杀',
    difficulty: 1,
    pieces: [
      { p: 'R', color: 'red', row: 0, col: 0 },
      { p: 'H', color: 'red', row: 0, col: 1 },
      { p: 'K', color: 'black', row: 0, col: 4 },
      { p: 'K', color: 'red', row: 9, col: 3 }
    ]
  },
  {
    id: 'E03',
    title: '大胆穿心',
    tip: '车砍中士，一将即绝（中士乃九宫之胆）',
    difficulty: 2,
    pieces: [
      { p: 'R', color: 'red', row: 0, col: 0 },
      { p: 'H', color: 'red', row: 0, col: 6 },
      { p: 'A', color: 'black', row: 0, col: 3 },
      { p: 'K', color: 'black', row: 0, col: 4 },
      { p: 'E', color: 'black', row: 2, col: 4 },
      { p: 'K', color: 'red', row: 9, col: 3 }
    ]
  },
  {
    id: 'E04',
    title: '勒马车·右路镜像',
    tip: '棋形左右同构，车正马后之法不变',
    difficulty: 1,
    pieces: [
      { p: 'R', color: 'red', row: 0, col: 8 },
      { p: 'H', color: 'red', row: 0, col: 6 },
      { p: 'K', color: 'black', row: 0, col: 5 },
      { p: 'K', color: 'red', row: 9, col: 3 }
    ]
  },
  {
    id: 'E05',
    title: '炮打双士',
    tip: '重炮隔士，双士自锁无路',
    difficulty: 3,
    pieces: [
      { p: 'R', color: 'red', row: 0, col: 0 },
      { p: 'C', color: 'red', row: 1, col: 1 },
      { p: 'A', color: 'black', row: 0, col: 3 },
      { p: 'K', color: 'black', row: 0, col: 4 },
      { p: 'A', color: 'black', row: 1, col: 4 },
      { p: 'K', color: 'red', row: 9, col: 3 }
    ]
  },
  {
    id: 'E06',
    title: '炮打双士·变化',
    tip: '同形异位，炮在下方也隔士取将',
    difficulty: 3,
    pieces: [
      { p: 'R', color: 'red', row: 0, col: 0 },
      { p: 'C', color: 'red', row: 1, col: 2 },
      { p: 'A', color: 'black', row: 0, col: 3 },
      { p: 'K', color: 'black', row: 0, col: 4 },
      { p: 'A', color: 'black', row: 1, col: 4 },
      { p: 'K', color: 'red', row: 9, col: 3 }
    ]
  }
];

/**
 * 由残局题构建棋盘（新增红帅等均含在 pieces 内）
 * @returns {Array<Array<null|object>>} 10×9 棋盘
 */
export function boardFromLevel(level) {
  const b = emptyBoard();
  for (const s of level.pieces) {
    b[s.row][s.col] = createPiece(s.p, s.color);
  }
  return b;
}

/** 题目总数 */
export const LEVEL_COUNT = LEVELS.length;
