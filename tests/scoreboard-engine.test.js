/**
 * tests/scoreboard-engine.test.js
 * V2.0 F8: 牌局记分板纯函数单测（合规版）
 */

const assert = require('assert');
const { test } = require('node:test');
const { createScorecard, addRound, finishScorecard, resetScorecard, getRankings, getPlayerStats, COMPLIANCE_TEXT } = require('../utils/scoreboard-engine');

test('F8 createScorecard: 初始化有效玩家列表', () => {
  const players = [{ id: 'p1', name: '郝一' }, { id: 'p2', name: '郝二' }];
  const sc = createScorecard(players);
  assert.equal(sc.status, 'IN_PROGRESS');
  assert.equal(sc.players.length, 2);
  assert.ok(sc.entries.p1 && sc.entries.p2);
});

test('F8 addRound: 正常累计得分', () => {
  const sc = createScorecard([{ id: 'p1', name: '郝一' }]);
  addRound(sc, 'p1', 100, '第 1 局');
  addRound(sc, 'p1', -50, '第 2 局');
  assert.equal(sc.entries.p1.total, 50);
  assert.equal(sc.currentRound, 2);
});

test('F8 addRound: 未知玩家报错', () => {
  const sc = createScorecard([{ id: 'p1', name: '郝一' }]);
  assert.throws(() => addRound(sc, 'p2', 100), Error, 'Player not found');
});

test('F8 finishScorecard: 结束状态锁定', () => {
  const sc = createScorecard([{ id: 'p1', name: '郝一' }]);
  finishScorecard(sc);
  assert.equal(sc.status, 'FINISHED');
  assert.ok(sc.finishedAt);
  assert.throws(() => addRound(sc, 'p1', 100), Error, '记分单已结束');
});

test('F8 resetScorecard: 重置后分数归零', () => {
  const sc = createScorecard([{ id: 'p1', name: '郝一' }]);
  addRound(sc, 'p1', 200);
  resetScorecard(sc);
  assert.equal(sc.entries.p1.total, 0);
  assert.equal(sc.entries.p1.rounds.length, 0);
  assert.equal(sc.currentRound, 0);
});

test('F8 getRankings: 按总分降序', () => {
  const sc = createScorecard([
    { id: 'p1', name: 'A' },
    { id: 'p2', name: 'B' },
    { id: 'p3', name: 'C' }
  ]);
  addRound(sc, 'p1', 100);
  addRound(sc, 'p2', 150);
  addRound(sc, 'p3', 50);
  const rankings = getRankings(sc);
  assert.equal(rankings[0].name, 'B');
  assert.equal(rankings[1].name, 'A');
  assert.equal(rankings[2].name, 'C');
});

test('F8 getPlayerStats: 统计信息计算正确', () => {
  const sc = createScorecard([{ id: 'p1', name: '郝一' }]);
  addRound(sc, 'p1', 100);
  addRound(sc, 'p1', -50);
  addRound(sc, 'p1', 200);
  const stats = getPlayerStats(sc, 'p1').stats;
  assert.equal(stats.totalRounds, 3);
  assert.equal(stats.wins, 2); // score > 0
  assert.equal(stats.losses, 1); // score < 0
  assert.equal(stats.highestScore, 200);
  assert.equal(stats.lowestScore, -50);
  const expectedAvg = 250 / 3;
  assert.ok(Math.abs(stats.averageScore - expectedAvg) < 0.01, `average 应为${expectedAvg}`);
});

test('F8 COMPLIANCE_TEXT: 合规声明存在', () => {
  assert.ok(COMPLIANCE_TEXT);
  assert.ok(COMPLIANCE_TEXT.includes('禁止赌博'));
  assert.ok(COMPLIANCE_TEXT.includes('offline entertainment only'));
});