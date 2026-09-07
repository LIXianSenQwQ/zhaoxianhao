/**
 * utils/scoreboard-engine.js
 * V2.0 F8: 牌局记分板引擎（合规版：仅手动记账，零发牌算法、零随机性、零虚拟货币）
 *
 * 对齐蓝图 D.2 + 合规红线（9.0.1）：
 *   · 线下娱乐记分工具，禁止赌博提示
 *   · 支持多局累计、轮次、庄家记录
 *   · 无扑克玩法逻辑、无算番算法（仅数值加减）、无实时对战
 */

// 初始化空的记分单
function createScorecard(players) {
  if (!Array.isArray(players) || players.length === 0) throw new Error('至少一名玩家');
  const entries = {};
  for (const p of players) {
    entries[p.id] = {
      id: p.id,
      name: p.name,
      total: 0,
      rounds: [] // 每局 score + note
    };
  }
  return {
    id: Date.now().toString(36),
    createdAt: new Date().toISOString(),
    status: 'IN_PROGRESS',
    players,
    entries,
    currentRound: 0,
    lastUpdated: new Date().toISOString()
  };
}

// 添加一轮得分（仅记录，不验证输赢合法性）
function addRound(scorecard, playerId, score, note = '') {
  if (scorecard.status !== 'IN_PROGRESS') {
    throw new Error('记分单已结束或已关闭');
  }
  if (!scorecard.entries[playerId]) {
    throw new Error(`未知玩家 ${playerId}`);
  }
  const player = scorecard.entries[playerId];
  player.rounds.push({
    score: Number(score),
    note: String(note || ''),
    at: new Date().toISOString()
  });
  player.total += Number(score);
  scorecard.currentRound += 1;
  scorecard.lastUpdated = new Date().toISOString();
  return scorecard;
}

// 结束记分单
function finishScorecard(scorecard) {
  scorecard.status = 'FINISHED';
  scorecard.finishedAt = new Date().toISOString();
  return scorecard;
}

// 重置记分单
function resetScorecard(scorecard) {
  for (const key in scorecard.entries) {
    scorecard.entries[key].rounds = [];
    scorecard.entries[key].total = 0;
  }
  scorecard.currentRound = 0;
  scorecard.lastUpdated = new Date().toISOString();
  return scorecard;
}

// 获取排名（按总分降序）
function getRankings(scorecard) {
  const list = Object.values(scorecard.entries).map(p => ({ ...p }));
  list.sort((a, b) => b.total - a.total);
  return list;
}

// 获取某玩家详细统计
function getPlayerStats(scorecard, playerId) {
  const p = scorecard.entries[playerId];
  if (!p) throw new Error('Player not found');
  const wins = p.rounds.filter(r => r.score > 0).length;
  const losses = p.rounds.filter(r => r.score < 0).length;
  const highest = Math.max(...p.rounds.map(r => r.score), 0);
  const lowest = Math.min(...p.rounds.map(r => r.score), 0);
  return {
    player: { ...p },
    stats: {
      totalRounds: p.rounds.length,
      wins,
      losses,
      highestScore: highest,
      lowestScore: lowest,
      averageScore: p.rounds.length ? p.total / p.rounds.length : 0,
      lastScore: p.rounds[p.rounds.length - 1]?.score || 0
    }
  };
}

// 合规声明（底部固定文本）
const COMPLIANCE_TEXT = '⚠️ 本功能为线下娱乐记分工具，禁止赌博。\nScoreboard for offline entertainment only. Gambling prohibited.';

module.exports = {
  createScorecard,
  addRound,
  finishScorecard,
  resetScorecard,
  getRankings,
  getPlayerStats,
  COMPLIANCE_TEXT
};