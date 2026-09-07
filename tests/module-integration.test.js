/**
 * tests/module-integration.test.js — V2.0 五模块集成完整性 + 关键路径旅程
 */
const fs = require('fs');
const path = require('path');
const { test } = require('node:test');
const assert = require('node:assert');
const Module = require('module');

const rootDir = __dirname + '/../';

// ─── stub 注入：wx-server-sdk → scripts/wx-server-sdk-stub.js ───
const stubPath = require.resolve('../scripts/wx-server-sdk-stub.js');
if (!Module._resolveFilename.__hcsPatched) {
  const orig = Module._resolveFilename;
  Module._resolveFilename = function (request, ...rest) {
    if (request === 'wx-server-sdk') return stubPath;
    return orig.call(this, request, ...rest);
  };
  Module._resolveFilename.__hcsPatched = true;
}

// ─── 全局工具：与 smoke-functions 同一 seed 机制 ───
function seedDB({ users = [], members = [], homeWorlds = [], homeAvatars = [], operaRoster = [], operaPerformances = [], pointsAccounts = [], ...rest } = {}) {
  globalThis.__HCS_STUB_SEED__ = {
    collections: {
      users, members,
      home_worlds: homeWorlds, home_avatars: homeAvatars,
      opera_roster: operaRoster, opera_performances: operaPerformances,
      points_accounts: pointsAccounts,
      ...rest
    },
    seq: 1000
  };
}
const FN = (name) => require(path.join(rootDir, 'cloud', 'functions', name, 'index.js'));

// ─── IJ1 核心模块四角检查（仅包含已交付文件） ───
const MODULES = [
  { name: 'games', fn: null, services: null, pages: ['pkg-game/pages/game/score.vue','pkg-game/pages/game/chess.vue','pkg-game/pages/game/riddle.vue','pkg-game/pages/game/quiz.vue','pkg-game/pages/game/opera.vue'], schemas: ['riddles.schema.json','riddle_votes.schema.json','questions.schema.json','quiz_records.schema.json','opera_roster.schema.json','opera_performances.schema.json'] },
  { name: 'home',   fn: 'home', services: 'services/home.ts',      pages: ['pkg-home/pages/home/index.vue','pkg-home/pages/home/visit.vue','pkg-home/pages/home/avatar.vue'],          schemas: ['home_worlds.schema.json','home_avatars.schema.json'] },
  { name: 'plaza',  fn: 'plaza', services: 'services/plaza.ts',    pages: ['pkg-home/pages/home/visit.vue'],                        schemas: ['family_moments.schema.json','clan_notices.schema.json'] },
  { name: 'task',   fn: 'task', services: null,                   pages: ['pkg-growth/pages/task/task.vue'],                        schemas: null }
];

test('IJ1 核心模块文件齐全度', () => {
  const missing = [];
  for (const m of MODULES) {
    if (m.fn && !fs.existsSync(rootDir + 'cloud/functions/' + m.fn + '/index.js')) {
      missing.push(`${m.name}: missing cloud function`);
    }
    if (m.services && !fs.existsSync(rootDir + m.services)) {
      missing.push(`${m.name}: missing ${m.services}`);
    }
    for (const p of (m.pages || [])) {
      if (!fs.existsSync(rootDir + p)) missing.push(`${m.name}: missing page ${p}`);
    }
    for (const s of (m.schemas || [])) {
      if (!fs.existsSync(rootDir + 'cloud/db-schemas/' + s)) missing.push(`${m.name}: missing schema ${s}`);
    }
  }
  if (missing.length) {
    assert.fail('文件缺失:\n' + missing.join('\n'));
  }
});

// ─── IJ2 MEMBER 跨模块旅程 ───
test('IJ2 MEMBER 跨模块旅程（home→opera）', async () => {
  seedDB({ users: [{ openid: 'u-m', role: 'MEMBER' }], members: [{ _id: 'm-1' }] });

  const CTX = { OPENID: 'u-m', openid: 'u-m' };
  const ok = (r, msg) => assert.equal(r.success, true, `${msg}: ${JSON.stringify(r)}`);

  // world.init（新建）
  let r = await FN('home').main({ action: 'world.init', name: '静园' }, CTX);
  ok(r, 'world.init');
  assert.equal(r.data.isNew, true, '首次初始化应新建');
  const worldId = r.data.world._id;

  // world.place（Lv1 解锁 mainHall）
  r = await FN('home').main({ action: 'world.place', type: 'mainHall', x: 0, y: 0 }, CTX);
  ok(r, 'world.place');

  // world.grow（需 gain 参数）
  r = await FN('home').main({ action: 'world.grow', gain: 120 }, CTX);
  ok(r, 'world.grow');
  assert.ok(r.data.level >= 1 && r.data.experience >= 0, JSON.stringify(r.data));

  // avatar.create + get
  r = await FN('home').main({ action: 'avatar.create', name: '试戏人', face: { emoji: 'x' } }, CTX);
  ok(r, 'avatar.create');
  assert.ok(r.data.avatar._id);

  r = await FN('home').main({ action: 'avatar.get' }, CTX);
  ok(r, 'avatar.get');
  assert.equal(r.data.avatar.name, '试戏人');

  // opera roster + perform + checkin
  r = await FN('opera').main({ action: 'roster.create', name: '老生常谈', role: '生' }, CTX);
  ok(r, 'roster.create');
  const rid = r.data.ticket._id;

  r = await FN('opera').main({ action: 'stage.perform', rosterId: rid }, CTX);
  ok(r, 'stage.perform');

  r = await FN('opera').main({ action: 'daily.checkin' }, CTX);
  ok(r, 'daily.checkin');
  assert.ok(r.data.points > 0 || r.data.alreadyDone, `checkin: ${r.data.points}/${r.data.alreadyDone}`);

  // member.tree.all
  r = await FN('member').main({ action: 'tree.all' }, CTX);
  ok(r, 'tree.all');
  assert.ok(Array.isArray(r.data.nodes));
});

// ─── IJ3 用户数据隔离（home/opera 按 ownerOpenid/userId 隔离） ───
test('IJ3 用户数据隔离（home/opera 隔离）', async () => {
  seedDB({ users: [{ openid: 'u1', role: 'MEMBER' }, { openid: 'u2', role: 'MEMBER' }], members: [{ _id: 'm-1' }] });
  const A = { OPENID: 'u1', openid: 'u1' };
  const B = { OPENID: 'u2', openid: 'u2' };

  // A 建家园 + 角色 + 票友
  let aInit = await FN('home').main({ action: 'world.init' }, A);
  assert.equal(aInit.success, true, JSON.stringify(aInit));
  await FN('home').main({ action: 'avatar.create', name: 'A角' }, A);
  let aRoster = await FN('opera').main({ action: 'roster.create', name: 'A生', role: '生' }, A);
  assert.equal(aRoster.success, true, JSON.stringify(aRoster));

  // B 视角：家园独立、角色为空、票友列表不含 A 的
  let bWorld = await FN('home').main({ action: 'world.get' }, B);
  assert.ok(bWorld.code === 404 || bWorld.code === 400 || !bWorld.success, 'B 无家园（隔离）:' + JSON.stringify(bWorld));
  let bAvatar = await FN('home').main({ action: 'avatar.get' }, B);
  assert.equal(bAvatar.data.avatar, null, 'B 无角色（隔离）');
  let bList = await FN('opera').main({ action: 'roster.list' }, B);
  assert.equal(bList.data.tickets.length, 0, 'B 票友列表不含 A 的');

  // B 不能更新 A 的角色
  let bUpdate = await FN('home').main({ action: 'avatar.update', name: '篡改' }, B);
  assert.equal(bUpdate.code, 400, 'B 更新无角色应失败');
});