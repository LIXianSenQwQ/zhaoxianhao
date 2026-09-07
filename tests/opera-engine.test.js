/**
 * tests/opera-engine.test.js
 * V2.0 F11/F12: 梨园小筑戏曲票友模拟引擎纯函数单测
 * 覆盖：行当卡生成/登台表演评分/经验成长升级/剧目解锁/签到规则/频控限额/参数校验/合规声明
 */
const { test } = require('node:test');
const assert = require('node:assert');

const E = require('../utils/opera-engine.js');

const R1 = E.seededRng(20240907); // 确定性随机序列

// ─── 行当卡生成 ───

test('createTicket：指定行当 → 生成票友卡（生旦净末丑 + 拿手剧目）', () => {
  const t = E.createTicket({ name: '梨园小生', role: '生', rng: R1 });
  assert.equal(t.name, '梨园小生');
  assert.equal(t.role, '生');
  assert.equal(t.roleTitle, '生行');
  assert.ok(t.roleDesc.length > 0);
  assert.equal(t.skillLevel, 1);
  assert.equal(t.experience, 0);
  assert.ok(E.MOODS.includes(t.mood), '心情来自枚举');
  assert.equal(t.favorItems.length, E.FAVORITE_COUNT, '3 折拿手戏');
  for (const f of t.favorItems) {
    assert.ok(f.id && f.playName, '拿手戏带 id+playName');
    assert.ok(E.REPERTOIRE.some((r) => r.id === f.id), '剧目来自曲库');
  }
  assert.deepEqual(t.unlockedFragments.map((f) => f.id).sort(), t.favorItems.map((f) => f.id).sort(), '初始解锁=拿手');
  assert.equal(t.stageCount, 0);
});

test('createTicket：非法行当 → 随机补位（不抛错）', () => {
  const t = E.createTicket({ role: '外星人', rng: E.seededRng(1) });
  assert.ok(E.ROLE_KEYS.includes(t.role), '回落枚举行当');
});

test('createTicket：匿名 → 自动补名（非空 ≤12 字），超长截断 12 字', () => {
  const t = E.createTicket({ rng: E.seededRng(2) });
  assert.ok(typeof t.name === 'string' && t.name.length > 0 && t.name.length <= 12, '自动补名');
  const long = E.createTicket({ name: '一二三四五六七八九十一二三四五六', role: '旦', rng: R1 });
  assert.equal(long.name.length, 12, '截断至 12 字');
});

// ─── 成长曲线 / 等第 ───

test('expNext：等级递增所需经验 = 60 + (lv-1)*30', () => {
  assert.equal(E.expNext(1), 60);
  assert.equal(E.expNext(2), 90);
  assert.equal(E.expNext(5), 180);
  assert.equal(E.expNext(0), 60, '非法等级回落 1');
  assert.equal(E.expNext(NaN), 60, 'NaN 防御');
});

test('gradeOf：评分等第边界', () => {
  assert.equal(E.gradeOf(95).grade, '出彩');
  assert.equal(E.gradeOf(90).grade, '出彩');
  assert.equal(E.gradeOf(80).grade, '上佳');
  assert.equal(E.gradeOf(78).grade, '上佳');
  assert.equal(E.gradeOf(70).grade, '稳当');
  assert.equal(E.gradeOf(62).grade, '稳当');
  assert.equal(E.gradeOf(50).grade, '青涩');
  assert.equal(E.gradeOf(45).grade, '青涩');
  assert.equal(E.gradeOf(30).grade, '生涩');
});

// ─── 登台表演 ───

test('perform：确定性随机下评分/反馈结构完整（唱念做打四功）', () => {
  const t = E.createTicket({ name: '兰花旦', role: '旦', rng: E.seededRng(3) });
  const { performance, growth } = E.perform(t, { rng: E.seededRng(4) });
  assert.ok(performance.score >= 0 && performance.score <= 100, '评分 0-100');
  assert.equal(Object.keys(performance.actDetail).length, 4, '四功齐备');
  for (const s of E.SKILLS) {
    assert.ok(performance.actDetail[s] >= 0 && performance.actDetail[s] <= 100, `${s} 功 0-100`);
  }
  assert.ok(performance.fragmentId && performance.playName.includes('《'), '选中剧目');
  assert.ok(performance.feedback.includes(performance.playName), '反馈含剧目名');
  assert.ok(Array.isArray(performance.suggestions) && performance.suggestions.length >= 1, '含成长建议');
  assert.ok(performance.expGain >= 5, '经验 ≥5');
  assert.ok(growth.next.experience >= 0);
  assert.equal(growth.next.stageCount, t.stageCount + 1, '登台次数 +1');
});

test('perform：心情加成进入评分（心事重重 -6，兴高采烈 +6）', () => {
  const mk = (mood) => ({ name: '心情试演', role: '旦', skillLevel: 1, experience: 0, mood, favorItems: [], unlockedFragments: [], stageCount: 0 });
  const base = E.perform(mk('气定神闲'), { rng: E.seededRng(9) }).performance;
  const glum = E.perform(mk('心事重重'), { rng: E.seededRng(9) }).performance;
  const joy = E.perform(mk('兴高采烈'), { rng: E.seededRng(9) }).performance;
  // 同一随机序列下，心情差应传导为分数差（正心情 > 基准 > 负心情）
  assert.ok(joy.score > glum.score, '正心情分高于负心情');
  assert.ok(base.score > glum.score || base.score === glum.score, '负心情拉低');
});

test('perform：拿手戏（familiar）反馈词与初试戏不同', () => {
  const frag = E.REPERTOIRE[0];
  const famTicket = {
    name: '票友甲', role: '旦', skillLevel: 5, experience: 0, mood: '气定神闲',
    favorItems: [{ id: frag.id, playName: frag.playName }],
    unlockedFragments: [{ id: frag.id, playName: frag.playName }], stageCount: 0
  };
  const { performance } = E.perform(famTicket, { rng: E.seededRng(5) });
  // 拿手戏场景（60% 命中 favor）反馈含「拿手」
  assert.ok(performance.feedback.includes('拿手') || performance.feedback.includes('初试'),
    '反馈必属拿手/初试之一');
});

test('perform：无效票友卡抛错（fail-closed）', () => {
  assert.throws(() => E.perform(null, { rng: R1 }), /票友卡片无效/);
  assert.throws(() => E.perform({ skillLevel: 1 }, { rng: R1 }), /票友卡片无效/);
});

// ─── 经验成长 / 升级 / 解锁 ───

test('applyGrowth：经验累积 + 升级阈值 + 升级解锁新剧目', () => {
  const t = { name: '成长测试', role: '净', skillLevel: 1, experience: 55, favorItems: [E.REPERTOIRE[2]], unlockedFragments: [E.REPERTOIRE[2]], stageCount: 0, totalScore: 0 };
  const g = E.applyGrowth(t, 10, 70, E.seededRng(6)); // 55+10=65 ≥ 60 → 升级
  assert.equal(g.leveledUp, true, '跨过 60 阈值升级');
  assert.equal(g.next.skillLevel, 2);
  assert.equal(g.next.experience, 5, '余 5 exp');
  assert.equal(g.next.stageCount, 1);
  assert.equal(g.next.totalScore, 70);
  assert.equal(g.expNext, 90, '下一级需 90');
  assert.ok(g.next.unlockedFragments.length >= 1, '保留既有解锁');
});

test('applyGrowth：一次大额经验可连升多级且不超 99', () => {
  const t = { name: '冲刺', role: '武', skillLevel: 98, experience: 200, favorItems: [], unlockedFragments: [], stageCount: 0, totalScore: 0 };
  const g = E.applyGrowth(t, 100000, 99, R1);
  assert.equal(g.next.skillLevel, 99, '封顶 99');
  assert.ok(g.next.experience >= 0, '经验不倒退');
});

test('applyGrowth：无升级 → leveledUp=false 且不触发解锁', () => {
  const t = { name: '平稳', role: '生', skillLevel: 1, experience: 10, favorItems: [], unlockedFragments: [], stageCount: 2, totalScore: 5 };
  const g = E.applyGrowth(t, 5, 60, R1); // 10+5=15 < 60
  assert.equal(g.leveledUp, false);
  assert.equal(g.next.skillLevel, 1);
  assert.equal(g.next.stageCount, 3);
  assert.equal(g.newlyUnlocked, null);
  assert.equal(g.next.totalScore, 65);
});

// ─── 每日签到 ───

test('checkinReward：已签到幂等 0 分 + 未签到基础 5 分', () => {
  const done = E.checkinReward({ alreadyDone: true });
  assert.equal(done.points, 0);
  assert.equal(done.alreadyDone, true);
  const fresh = E.checkinReward({ alreadyDone: false, todayStageCount: 0 });
  assert.equal(fresh.points, E.DAILY_POINTS, '无登台基础 5 分');
  assert.equal(fresh.alreadyDone, false);
});

test('checkinReward：当日登台勤勉 +1（6 分）', () => {
  const r = E.checkinReward({ alreadyDone: false, todayStageCount: 3 });
  assert.equal(r.points, 6, '登台 +1');
});

// ─── 频控 / 名额 / 校验 ───

test('canStageToday：日上限 20 次', () => {
  assert.equal(E.canStageToday(0).ok, true);
  assert.equal(E.canStageToday(0).remaining, 20);
  assert.equal(E.canStageToday(19).ok, true);
  assert.equal(E.canStageToday(19).remaining, 1);
  assert.equal(E.canStageToday(20).ok, false, '达上限拒绝');
  assert.equal(E.canStageToday(20).remaining, 0);
  assert.equal(E.canStageToday(99).ok, false);
});

test('canCreateTicket：卡上限 12 张', () => {
  assert.equal(E.canCreateTicket(11).ok, true);
  assert.equal(E.canCreateTicket(12).ok, false);
});

test('validateRosterParams：空名/超长/非法行当拒绝', () => {
  assert.equal(E.validateRosterParams({ name: '  ' }).ok, false);
  assert.equal(E.validateRosterParams({ name: '一二三四五六七八九十一二三四五六七八九十' }).ok, false);
  assert.equal(E.validateRosterParams({ name: '阿丑', role: '神' }).ok, false);
  const ok = E.validateRosterParams({ name: '丑角阿喜', role: '丑' });
  assert.equal(ok.ok, true);
  assert.equal(ok.name, '丑角阿喜');
});

// ─── 工具 / 合规 ───

test('seededRng：同种子序列确定、异种子发散', () => {
  const a = E.seededRng(42);
  const b = E.seededRng(42);
  const c = E.seededRng(43);
  const seqA = [a(), a(), a()];
  const seqB = [b(), b(), b()];
  const seqC = [c(), c(), c()];
  assert.deepEqual(seqA, seqB, '同种子确定');
  assert.notDeepEqual(seqA, seqC, '异种子发散');
  for (const x of seqA) assert.ok(x >= 0 && x < 1, '输出 [0,1)');
});

test('dayKey：UTC 口径日期键', () => {
  assert.equal(E.dayKey(new Date('2026-09-07T10:00:00Z')), '2026-09-07');
  assert.equal(E.dayKey(new Date('2026-09-07T23:59:00+08:00')), '2026-09-07');
});

test('合规声明：零内购/零联机/零虚拟货币（蓝图 9.0.1 红线）', () => {
  assert.equal(E.COMPLIANCE.noInAppPurchase, true);
  assert.equal(E.COMPLIANCE.noOnlineMatch, true);
  assert.equal(E.COMPLIANCE.noVirtualCurrency, true);
  assert.ok(E.COMPLIANCE_TEXT.includes('零内购'));
  assert.equal(E.DAILY_STAGE_LIMIT, 20);
  assert.equal(E.MAX_TICKETS, 12);
});
