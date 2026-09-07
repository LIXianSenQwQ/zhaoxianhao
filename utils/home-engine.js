/**
 * utils/home-engine.js
 * V2.0 F9: 虚拟家园纯逻辑引擎（2D 等距庭院布局/成长/互访）
 * 对齐蓝图三十一 E.3/E.5：零内购、零虚拟货币，成长资源仅来自家族行为。
 *
 * 纯函数可单测：
 *   · validatePlacement  建筑/装饰落位（10×10 格网 + 占地/重叠/边界）
 *   · canAffordBuild     花费校验（exp 行为兑换，非货币）
 *   · expForNextLevel    成长曲线
 *   · growHome           经验结算 + 自动升级
 *   · canVisitToday      每日互访频控（≤20）
 *   · privacyScope       家园可见性校验（SELF/FAMILY/CLAN）
 */

const GRID = { w: 10, h: 10 }; // 2D 等距庭院的俯视格网

// 建筑目录（type → footprint [w,h] + 解锁等级）
const BUILDING_CATALOG = {
  mainHall:   { name: '正房',   w: 3, h: 2, unlockLv: 1 },  // 主堂
  wingRoom:   { name: '厢房',   w: 2, h: 2, unlockLv: 1 },  // 厢房
  courtyard:  { name: '庭院',   w: 4, h: 3, unlockLv: 1 },  // 庭院
  pearGarden: { name: '梨园',   w: 3, h: 3, unlockLv: 3 },  // 梨园（经营入口）
  shrine:     { name: '祠堂角', w: 2, h: 2, unlockLv: 2 },  // 祠堂角（祭祀入口）
  study:      { name: '书房',   w: 2, h: 2, unlockLv: 2 },  // 书房
  stage:      { name: '戏台',   w: 3, h: 2, unlockLv: 4 },  // 戏台
  archway:    { name: '牌坊',   w: 2, h: 1, unlockLv: 5 }   // 牌坊（家族荣誉展示）
};

// 装饰类型（footprint 固定 1×1，仅用于小件）
const DECORATION_TYPES = ['furniture', 'plant', 'lantern', 'couplet', 'seasonal'];

// 可见性
const PRIVACY = { SELF: 'SELF', FAMILY: 'FAMILY', CLAN: 'CLAN' };
const PRIVACY_SET = new Set(Object.values(PRIVACY));

// 成长曲线：level n → 升级到 n+1 所需经验 = base * n^2
function expForNextLevel(level, base = 100) {
  const lv = Math.max(1, Math.floor(Number(level) || 1));
  return Math.floor(base * lv * lv * 0.5);
}

/**
 * growHome - 结算经验并自动升级
 * @returns {{ level, experience, leveledUp, expNext, expToNext }}
 */
function growHome(world, gainedExp) {
  const exp = Math.max(0, Math.floor(Number(gainedExp) || 0));
  if (exp === 0) {
    return { leveledUp: false, expNext: world.experience, ...levelInfo(world.level, world.experience) };
  }
  let level = Math.max(1, Math.floor(Number(world.level) || 1));
  let experience = Math.max(0, Math.floor(Number(world.experience) || 0)) + exp;
  let leveledUp = false;

  let need = expForNextLevel(level);
  while (experience >= need) {
    experience -= need;
    level += 1;
    leveledUp = true;
    need = expForNextLevel(level);
    if (level > 99) break;
  }
  return { level, experience, leveledUp, ...levelInfo(level, experience) };
}

function levelInfo(level, experience) {
  const expNext = expForNextLevel(level);
  return { expNext, expToNext: Math.max(0, expNext - experience), progressPct: Math.min(100, Math.round((experience / expNext) * 100)) };
}

/**
 * validatePlacement - 校验落位
 * @param {object} placement { grid, buildings, decorations, type, instanceId, x, y }
 * @returns {{ ok: boolean, error?: string, footprint?: {w,h} }}
 */
function validatePlacement(state) {
  const { type, x, y, footprint, existing } = state || {};
  if (!type) return { ok: false, error: 'type 必需' };
  if (!Number.isInteger(x) || !Number.isInteger(y)) return { ok: false, error: '坐标须为整数' };
  if (x < 0 || y < 0 || x >= GRID.w || y >= GRID.h) return { ok: false, error: '超出庭园边界' };

  const isBuilding = !!BUILDING_CATALOG[type];
  const isDecoration = DECORATION_TYPES.includes(type);
  if (!isBuilding && !isDecoration) return { ok: false, error: '未知类型' };

  const w = isBuilding ? BUILDING_CATALOG[type].w : 1;
  const h = isBuilding ? BUILDING_CATALOG[type].h : 1;
  if (footprint && footprint.w === w && footprint.h === h) {} // 兼容显式 footprint

  // 出界
  if (x + w > GRID.w || y + h > GRID.h) return { ok: false, error: '落位超出网格' };

  // 重叠检测（建筑 footprint 占格；装饰占 1 格）
  const occupied = new Set();
  for (const b of (existing && existing.buildings) || []) {
    for (let dx = 0; dx < (b.footprint ? b.footprint.w : (BUILDING_CATALOG[b.type] ? BUILDING_CATALOG[b.type].w : 1)); dx++) {
      for (let dy = 0; dy < (b.footprint ? b.footprint.h : (BUILDING_CATALOG[b.type] ? BUILDING_CATALOG[b.type].h : 1)); dy++) {
        occupied.add(`${b.x + dx},${b.y + dy}`);
      }
    }
  }
  for (const d of (existing && existing.decorations) || []) {
    occupied.add(`${d.x},${d.y}`);
  }

  for (let dx = 0; dx < w; dx++) {
    for (let dy = 0; dy < h; dy++) {
      if (occupied.has(`${x + dx},${y + dy}`)) return { ok: false, error: '与既有物重叠' };
    }
  }
  return { ok: true, footprint: { w, h } };
}

/**
 * canPlaceBuilding - 建筑解锁等级校验
 */
function canPlaceBuilding(state) {
  const { type, level } = state || {};
  const cat = BUILDING_CATALOG[type];
  if (!cat) return { ok: false, error: '未知建筑类型' };
  if (Math.floor(Number(level) || 1) < cat.unlockLv) {
    return { ok: false, error: `需家园 ${cat.unlockLv} 级解锁（当前 ${Math.floor(level || 1)} 级）` };
  }
  return { ok: true };
}

/**
 * canVisitToday - 每日互访频控（≤20）
 */
function canVisitToday(visitCountToday) {
  const n = Math.floor(Number(visitCountToday) || 0);
  if (n >= 20) return { ok: false, error: '今日互访已达上限（20 次）', remaining: 0 };
  return { ok: true, remaining: 20 - n };
}

/**
 * privacyScope - 可见性合法值校验
 */
function privacyScope(v) {
  if (!PRIVACY_SET.has(v)) return { ok: false, error: `可见性须为 ${Object.values(PRIVACY).join('/')}` };
  return { ok: true, value: v };
}

/**
 * initWorld - 新家园默认态
 */
function initWorld() {
  const now = new Date().toISOString();
  return {
    level: 1,
    experience: 0,
    buildings: [],
    decorations: [],
    privacy: PRIVACY.FAMILY,
    visits: 0,
    likes: 0,
    createdAt: now,
    updatedAt: now
  };
}

// ─── ESM 导出 ─────────────────────────────────
export { GRID, BUILDING_CATALOG, DECORATION_TYPES, PRIVACY, PRIVACY_SET, expForNextLevel, growHome, validatePlacement, canPlaceBuilding, canVisitToday, privacyScope, initWorld };
