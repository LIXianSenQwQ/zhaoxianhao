/**
 * tests/performance-budget.test.js — F10 性能预算回归（防性能退化）
 *
 * 思路：把各引擎「真实规模上限」操作固化为耗时预算断言——本地实测基线
 * （Node v24 桌面机，2026-09）见各用例注释；预算取实测 8~15 倍余量，
 * 兼顾 CI 慢机与回归检出（严重退化即红）。
 *
 * 覆盖：棋类引擎（XiangQi 走法/杀判定 + asyncgame 云副本）、家谱直角布局、
 * 扇形布局、梨园评分成长、记分板、灯谜 sha256 比对。
 */
const { test } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');

const chess = require('../utils/chess-engine');
const asyncGame = require('../cloud/functions/asyncgame/engine.js');
const family = require('../utils/family-tree-layout');
const fan = require('../utils/fan-tree-layout');
const opera = require('../utils/opera-engine');
const score = require('../utils/scoreboard-engine');

function ms(name, fn) {
  const t0 = performance.now();
  fn();
  return performance.now() - t0;
}

// ─── 棋类引擎（一局 200 手 × 每手走法生成+判定是 async 对弈主热路径）───
test('F10 perf: chess.legalMoves 400 次走法生成 < 2000ms（基线 ~0.55ms/次）', () => {
  const b = chess.initialBoard();
  const t = ms('legalMoves', () => {
    for (let i = 0; i < 400; i++) chess.legalMoves(b, chess.SIDE.RED);
  });
  assert.ok(t < 2000, `legalMoves×400 耗时 ${t.toFixed(1)}ms 超出预算`);
});

test('F10 perf: chess.isCheckmate 2000 次 < 300ms（基线 ~0.01ms/次）', () => {
  const b = chess.initialBoard();
  const t = ms('mate', () => {
    for (let i = 0; i < 2000; i++) chess.isCheckmate(b, chess.SIDE.RED);
  });
  assert.ok(t < 300, `isCheckmate×2000 耗时 ${t.toFixed(1)}ms 超出预算`);
});

test('F10 perf: asyncgame 云引擎走法生成 400 次 < 2000ms（与服务端判定同源）', () => {
  const b = asyncGame.initialBoard ? asyncGame.initialBoard() : chess.initialBoard();
  const fn = () => { for (let i = 0; i < 400; i++) asyncGame.legalMoves(b, asyncGame.SIDE ? asyncGame.SIDE.RED : 'red'); };
  const t = ms('ag', fn);
  assert.ok(t < 2000, `asyncgame legalMoves×400 耗时 ${t.toFixed(1)}ms 超出预算`);
});

// ─── 家谱直角布局（大族 2000 人页面渲染主热路径，onMounted 单次）───
test('F10 perf: family.computeLayout 2000 同代 < 800ms（基线 ~85ms）', () => {
  const wide = [];
  for (let i = 0; i < 2000; i++) {
    wide.push({ _id: 'w' + i, path: '/001/' + String(i).padStart(4, '0') + '/', genealogyName: '人' + i });
  }
  const t = ms('familyWide', () => family.computeLayout(wide));
  assert.ok(t < 800, `computeLayout(2000同代) 耗时 ${t.toFixed(1)}ms 超出预算`);
});

test('F10 perf: family.computeLayout 500 代深链 < 600ms（基线 ~66ms）', () => {
  const deep = [];
  let path = '';
  for (let i = 0; i < 500; i++) {
    path += '/00' + String(i % 9 + 1);
    deep.push({ _id: 'd' + i, path: path + '/', genealogyName: 'x' });
  }
  const t = ms('familyDeep', () => family.computeLayout(deep));
  assert.ok(t < 600, `computeLayout(500深链) 耗时 ${t.toFixed(1)}ms 超出预算`);
});

// ─── 扇形布局（800 人扇区焦点重排）───
test('F10 perf: fanLayout 801 人 < 400ms（基线 ~30ms）', () => {
  const nodes = [
    { _id: 'f', path: '/A/B/C/', genealogyName: '郝继宗', gender: 'MALE' },
    ...Array.from({ length: 200 }, (_, i) => ({
      _id: 'c' + i, path: '/A/B/C/' + String(i).padStart(4, '0') + '/', genealogyName: '子' + i
    })),
    ...Array.from({ length: 600 }, (_, i) => ({
      _id: 'g' + i,
      path: '/A/B/C/' + String(i % 200).padStart(4, '0') + '/' + String(i).padStart(5, '0') + '/',
      genealogyName: '孙' + i
    }))
  ];
  const t = ms('fan', () => fan.fanLayout(nodes, '/A/B/C/'));
  assert.ok(t < 400, `fanLayout(801) 耗时 ${t.toFixed(1)}ms 超出预算`);
});

// ─── 梨园评分/成长（每次登台 perform，游戏高频）───
test('F10 perf: opera.perform 3000 次 < 200ms（基线 ~5ms）', () => {
  const tk = {
    id: 't1', name: 'N', role: '生', skills: { 唱: 60, 念: 55, 做: 50, 打: 40 },
    level: 3, exp: 0, createdAt: 'x'
  };
  const t = ms('opera', () => {
    for (let i = 0; i < 3000; i++) opera.perform(tk, { mood: '开心', stage: '唱段' });
  });
  assert.ok(t < 200, `opera.perform×3000 耗时 ${t.toFixed(1)}ms 超出预算`);
});

// ─── 记分板（8 人 × 40 轮 + 200 次排名）───
test('F10 perf: scoreboard 40轮×8人记分 + 排名200次 < 200ms', () => {
  const sc = score.createScorecard(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'].map(id => ({ id, name: id })));
  const t = ms('score', () => {
    for (let k = 0; k < 40; k++) {
      for (let r = 0; r < 8; r++) score.addRound(sc, 'p' + (r + 1), r * 3 + 1, '');
    }
    for (let k = 0; k < 200; k++) score.getRankings(sc);
  });
  assert.ok(t < 200, `scoreboard 记分+排名 耗时 ${t.toFixed(1)}ms 超出预算`);
});

// ─── 灯谜谜底 sha256 比对（服务端每次作答 2 次哈希；20000 次模拟 1 万次作答）───
test('F10 perf: sha256×20000 < 500ms（基线 ~87ms，R6 灯谜比对路径）', () => {
  const t = ms('sha', () => {
    for (let i = 0; i < 20000; i++) crypto.createHash('sha256').update('半青半紫谜底' + i).digest('hex');
  });
  assert.ok(t < 500, `sha256×20000 耗时 ${t.toFixed(1)}ms 超出预算`);
});
