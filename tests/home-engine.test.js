/**
 * tests/home-engine.test.js
 * V2.0 F9: 虚拟家园纯逻辑引擎单测
 */

const assert = require('assert');
const { test } = require('node:test');
const {
  GRID, BUILDING_CATALOG, DECORATION_TYPES, PRIVACY,
  expForNextLevel, growHome, validatePlacement, canPlaceBuilding,
  canVisitToday, privacyScope, initWorld
} = require('../utils/home-engine');

test('F9 initWorld: 默认家园状态', () => {
  const w = initWorld();
  assert.equal(w.level, 1);
  assert.equal(w.experience, 0);
  assert.equal(w.privacy, PRIVACY.FAMILY);
  assert.deepEqual(w.buildings, []);
  assert.deepEqual(w.decorations, []);
});

test('F9 expForNextLevel: 成长曲线单调递增', () => {
  const e1 = expForNextLevel(1);
  const e2 = expForNextLevel(2);
  const e3 = expForNextLevel(3);
  assert.ok(e1 < e2 && e2 < e3, '升级经验递增');
  assert.equal(e1, 50); // base 100 * 1^2 * 0.5
});

test('F9 growHome: 经验累积不升级', () => {
  const world = initWorld();
  const r = growHome(world, 20);
  assert.equal(r.leveledUp, false);
  assert.equal(r.level, 1);
  assert.equal(r.experience, 20);
});

test('F9 growHome: 跨级升级结算', () => {
  const world = initWorld();
  world.experience = 40; // 距 2 级还需 10
  const r = growHome(world, 70); // +70 → 110 总经验
  assert.equal(r.leveledUp, true);
  assert.ok(r.level >= 2, `升级到 ${r.level}`);
  assert.ok(r.progressPct >= 0 && r.progressPct <= 100, '进度 0-100');
});

test('F9 validatePlacement: 边界/重叠/非法类型', () => {
  // 出界
  const out = validatePlacement({ type: 'mainHall', x: 8, y: 0, existing: { buildings: [], decorations: [] } });
  assert.equal(out.ok, false, '3x2 建筑在 x=8 出界');
  assert.ok(out.error);

  // 非法类型
  const bad = validatePlacement({ type: 'rocket', x: 0, y: 0, existing: { buildings: [], decorations: [] } });
  assert.equal(bad.ok, false);

  // 正常
  const ok = validatePlacement({ type: 'mainHall', x: 0, y: 0, existing: { buildings: [], decorations: [] } });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.footprint, { w: 3, h: 2 });
});

test('F9 validatePlacement: 重叠检测', () => {
  const existing = {
    buildings: [{ type: 'mainHall', x: 0, y: 0 }], // 占 (0,0)-(2,1)
    decorations: []
  };
  const overlap = validatePlacement({ type: 'wingRoom', x: 1, y: 1, existing });
  assert.equal(overlap.ok, false, '与正房重叠');
  const free = validatePlacement({ type: 'wingRoom', x: 3, y: 0, existing });
  assert.equal(free.ok, true, '空闲位置可放');
});

test('F9 canPlaceBuilding: 解锁等级', () => {
  assert.equal(canPlaceBuilding({ type: 'pearGarden', level: 1 }).ok, false, '梨园需 3 级');
  assert.equal(canPlaceBuilding({ type: 'pearGarden', level: 3 }).ok, true, '3 级解锁');
  assert.equal(canPlaceBuilding({ type: 'rocket', level: 9 }).ok, false, '未知建筑');
  assert.equal(canPlaceBuilding({ type: 'mainHall', level: 1 }).ok, true, '正房 1 级可用');
});

test('F9 canVisitToday: 每日互访 ≤20', () => {
  assert.equal(canVisitToday(19).remaining, 1);
  assert.equal(canVisitToday(20).ok, false, '达上限');
  assert.equal(canVisitToday(0).remaining, 20);
});

test('F9 privacyScope: 可见性白名单', () => {
  assert.equal(privacyScope('SELF').ok, true);
  assert.equal(privacyScope('FAMILY').ok, true);
  assert.equal(privacyScope('CLAN').ok, true);
  assert.equal(privacyScope('PUBLIC').ok, false, 'PUBLIC 不在家园白名单');
  assert.equal(privacyScope('').ok, false);
});

test('F9 catalog: 建筑目录完整性', () => {
  assert.ok(BUILDING_CATALOG.mainHall);
  assert.ok(BUILDING_CATALOG.pearGarden);
  assert.ok(DECORATION_TYPES.includes('seasonal'));
  assert.equal(GRID.w, 10);
  assert.equal(GRID.h, 10);
});