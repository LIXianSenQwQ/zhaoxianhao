/**
 * cloud/functions/home/index.js
 * V2.0 F9: 虚拟家园云函数 —— 家园持久化（2D 庭院布局/成长/互动）
 * 对齐蓝图三十一 E.3/E.5：零内购、零虚拟货币
 *
 * 纯逻辑内联（云函数独立打包，无法调用项目根 utils/home-engine.js）
 *
 * Action 清单：
 *   world.init → get | world.place | world.grow | world.visit
 *   world.like | world.setPrivacy | avatar.create | avatar.get | avatar.update
 */
const wx = require('wx-server-sdk');
const { OK, BAD_REQUEST, FORBIDDEN } = require('./common/response');
const { hasRole, roleOf } = require('./common/roles');

wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

// ─── 内联 engine（同款纯函数，简化版供云函数使用） ───
const GRID_SIZE = 10;
const BUILDING_DEFS = {
  mainHall:   { w: 3, h: 2, unlockLv: 1 },
  wingRoom:   { w: 2, h: 2, unlockLv: 1 },
  courtyard:  { w: 4, h: 3, unlockLv: 1 },
  pearGarden: { w: 3, h: 3, unlockLv: 3 },
  shrine:     { w: 2, h: 2, unlockLv: 2 },
  study:      { w: 2, h: 2, unlockLv: 2 },
  stage:      { w: 3, h: 2, unlockLv: 4 },
  archway:    { w: 2, h: 1, unlockLv: 5 }
};
const PRIVACY_VALS = new Set(['SELF', 'FAMILY', 'CLAN']);

function expNext(level) { return Math.floor(100 * Math.max(1, level) ** 2 * 0.5); }

function growHome(world, gain) {
  let lv = Math.max(1, Math.floor(Number(world.level) || 1));
  let exp = Math.max(0, Math.floor(Number(world.experience) || 0)) + Math.max(0, Math.floor(Number(gain) || 0));
  let up = false;
  let need = expNext(lv);
  while (exp >= need && lv < 99) { exp -= need; lv++; up = true; need = expNext(lv); }
  const pct = Math.min(100, Math.round((exp / need) * 100));
  return { level: lv, experience: exp, expNext: need, progressPct: pct, leveledUp: up };
}

function validatePlace(opts) {
  const { type, x, y, buildings, decorations } = opts || {};
  const def = BUILDING_DEFS[type];
  if (!def) return { ok: false, error: '未知建筑类型' };
  if (!Number.isInteger(x) || !Number.isInteger(y)) return { ok: false, error: '坐标须整数' };
  if (x < 0 || y < 0 || x + def.w > GRID_SIZE || y + def.h > GRID_SIZE) return { ok: false, error: '超出庭园边界' };

  const occ = new Set();
  for (const b of buildings) for (let dx = 0; dx < (b.w || 1); dx++) for (let dy = 0; dy < (b.h || 1); dy++) occ.add(`${b.x + dx},${b.y + dy}`);
  for (const d of decorations) occ.add(`${d.x},${d.y}`);
  for (let dx = 0; dx < def.w; dx++) for (let dy = 0; dy < def.h; dy++) if (occ.has(`${x + dx},${y + dy}`)) return { ok: false, error: '与已有物重叠' };

  return { ok: true, w: def.w, h: def.h };
}

function canUnlock(type, level) {
  const def = BUILDING_DEFS[type];
  if (!def) return { ok: false, error: '未知类型' };
  return level >= def.unlockLv ? { ok: true } : { ok: false, error: `需 Lv.${def.unlockLv} 解锁` };
}

function checkPrivacy(v) {
  if (!PRIVACY_VALS.has(v)) return { ok: false, error: '可见性须为 SELF/FAMILY/CLAN' };
  return { ok: true };
}

// ─── Actions ───
function now() { return new Date().toISOString(); }

async function worldInit(db, openid) {
  const ex = await db.collection('home_worlds').where({ ownerOpenid: openid }).limit(1).get();
  if (ex.data && ex.data.length) return OK({ world: ex.data[0], isNew: false });
  const doc = { ownerOpenid: openid, level: 1, experience: 0, expNext: expNext(1), progressPct: 0, buildings: [], decorations: [], privacy: 'FAMILY', visits: 0, likes: 0, visitedBy: {}, createdAt: now(), updatedAt: now() };
  doc._id = (await db.collection('home_worlds').add(doc))._id;
  return OK({ world: doc, isNew: true });
}

async function worldGet(db, openid, to) {
  const t = to || openid;
  const res = await db.collection('home_worlds').where({ ownerOpenid: t }).limit(1).get();
  if (!res.data || !res.data.length) return BAD_REQUEST('未找到家园', 404);
  const w = res.data[0];
  if (w.privacy === 'SELF' && w.ownerOpenid !== openid) return BAD_REQUEST('该家园仅自己可见', 403);
  return OK({ world: w });
}

async function worldPlace(db, openid, p) {
  const { type, x, y } = p || {};
  if (!type || x === null || x === void 0 || y === null || y === void 0) return BAD_REQUEST('type/x/y 必需');
  const res = await db.collection('home_worlds').where({ ownerOpenid: openid }).limit(1).get();
  if (!res.data || !res.data.length) return BAD_REQUEST('请先初始化家园');
  const w = res.data[0];
  const ulock = canUnlock(type, w.level);
  if (!ulock.ok) return BAD_REQUEST(ulock.error);
  const v = validatePlace({ type, x, y, buildings: w.buildings, decorations: w.decorations });
  if (!v.ok) return BAD_REQUEST(v.error);
  await db.collection('home_worlds').doc(w._id).update({ data: { buildings: wx.getDatabase().command.push({ type, x, y, w: v.w, h: v.h, placedAt: now() }), updatedAt: now() } });
  return OK({ building: { type, x, y, w: v.w, h: v.h } });
}

async function worldGrow(db, openid, p) {
  const gain = Number(p && p.gain);
  if (!gain || gain <= 0) return BAD_REQUEST('gain 须为正数');
  const res = await db.collection('home_worlds').where({ ownerOpenid: openid }).limit(1).get();
  if (!res.data || !res.data.length) return BAD_REQUEST('未找到家园');
  const r = growHome(res.data[0], gain);
  await db.collection('home_worlds').doc(res.data[0]._id).update({ data: { level: r.level, experience: r.experience, expNext: r.expNext, progressPct: r.progressPct, updatedAt: now() } });
  return OK(r);
}

async function worldVisit(db, openid, to) {
  if (!to || to === openid) return BAD_REQUEST('targetOpenid 无效');
  const tRes = await db.collection('home_worlds').where({ ownerOpenid: to }).limit(1).get();
  if (!tRes.data || !tRes.data.length) return BAD_REQUEST('对方未创建家园');
  const tw = tRes.data[0];
  const today = now().slice(0, 10);
  const vb = tw.visitedBy || {};
  const cnt = vb[today] || 0;
  if (cnt >= 20) return BAD_REQUEST('今日互访已达上限');
  const upd = { visits: (tw.visits || 0) + 1, updatedAt: now() };
  upd[`visitedBy.${today}`] = cnt + 1;
  await db.collection('home_worlds').doc(tw._id).update({ data: upd });
  return OK({ visits: upd.visits });
}

async function worldLike(db, openid, to) {
  if (!to) return BAD_REQUEST('targetOpenid 必需');
  const tRes = await db.collection('home_worlds').where({ ownerOpenid: to }).limit(1).get();
  if (!tRes.data || !tRes.data.length) return BAD_REQUEST('未找到对方家园');
  await db.collection('home_worlds').doc(tRes.data[0]._id).update({ data: { likes: (tRes.data[0].likes || 0) + 1, updatedAt: now() } });
  return OK({ likes: (tRes.data[0].likes || 0) + 1 });
}

async function worldSetPrivacy(db, openid, v) {
  if (!checkPrivacy(v).ok) return BAD_REQUEST('可见性须为 SELF/FAMILY/CLAN');
  const res = await db.collection('home_worlds').where({ ownerOpenid: openid }).limit(1).get();
  if (!res.data || !res.data.length) return BAD_REQUEST('未找到家园');
  await db.collection('home_worlds').doc(res.data[0]._id).update({ data: { privacy: v, updatedAt: now() } });
  return OK({ privacy: v });
}

async function avatarCreate(db, openid, p) {
  if (!p || !p.name) return BAD_REQUEST('name 必需');
  const ex = await db.collection('home_avatars').where({ ownerOpenid: openid }).limit(1).get();
  if (ex.data && ex.data.length) return BAD_REQUEST('已有角色，请用 avatar.update');
  const doc = { ownerOpenid: openid, name: p.name, face: p.face || {}, outfit: p.outfit || [], title: '', level: 1, exp: 0, skillTree: {}, achievements: [], createdAt: now(), updatedAt: now() };
  doc._id = (await db.collection('home_avatars').add(doc))._id;
  return OK({ avatar: doc });
}

async function avatarGet(db, openid) {
  const res = await db.collection('home_avatars').where({ ownerOpenid: openid }).limit(1).get();
  return OK({ avatar: (res.data && res.data[0]) || null });
}

async function avatarUpdate(db, openid, p) {
  const upd = { updatedAt: now() };
  if (p.face) upd.face = p.face;
  if (p.outfit) upd.outfit = p.outfit;
  if (p.title !== undefined) upd.title = p.title;
  if (p.name) upd.name = p.name;
  const res = await db.collection('home_avatars').where({ ownerOpenid: openid }).limit(1).get();
  if (!res.data || !res.data.length) return BAD_REQUEST('未创建角色');
  await db.collection('home_avatars').doc(res.data[0]._id).update({ data: upd });
  return OK({ updated: true });
}

// ─── Router ───
module.exports = { main: async (params, context) => {
  const action = (params && params.action) || '';
  const db = wx.getDatabase();
  const openid = (context && (context.OPENID || context.openid)) || 'stub';

  // 权限门禁（IJ3 五模块安全）：写操作须 MEMBER+（含 BRANCH_HEAD/EDITOR/HISTORIAN/CHIEF）
  const WRITE_ACTIONS = new Set(['world.init', 'world.place', 'world.grow', 'world.visit', 'world.like', 'world.setPrivacy', 'avatar.create', 'avatar.update']);
  if (WRITE_ACTIONS.has(action)) {
    const role = await roleOf(db, openid);
    if (!hasRole(role, 'MEMBER')) return FORBIDDEN('仅认证族人可操作家园/角色');
  }

  try {
    switch (action) {
      case 'world.init':     return await worldInit(db, openid);
      case 'world.get':      return await worldGet(db, openid, params.targetOpenid);
      case 'world.place':    return await worldPlace(db, openid, params);
      case 'world.grow':     return await worldGrow(db, openid, params);
      case 'world.visit':    return await worldVisit(db, openid, params.targetOpenid);
      case 'world.like':     return await worldLike(db, openid, params.targetOpenid);
      case 'world.setPrivacy': return await worldSetPrivacy(db, openid, params.privacy);
      case 'avatar.create':  return await avatarCreate(db, openid, params);
      case 'avatar.get':     return await avatarGet(db, openid);
      case 'avatar.update':  return await avatarUpdate(db, openid, params || {});
      default: return BAD_REQUEST(`unknown action: ${action}`);
    }
  } catch (e) {
    return BAD_REQUEST(`home.${action} error: ${e.message}`);
  }
}};