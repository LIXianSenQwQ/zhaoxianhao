/**
 * cloud/functions/ceremony/index.js
 * Sprint R13 大修（蓝图 9.1 / 11 / 7.9 对齐）：
 *   worship 祭拜（点灯/上香/献花/合拜）· spirits 灵位列表 · list 祭记分页 · remindScan 忌日扫描
 *
 * 修复（原遗留桩不可运行缺陷）：
 *   - `_` 未定义（_.inc/_.eq/_.lte 必崩）→ db.command
 *   - wx.cloud.generateObjectId 不存在 → 不再自造 _id
 *   - awardPoints / notifyUser 未定义函数 → common/points 幂等发放 + notifications 站内通知
 *   - 无鉴权 / 无类型校验 / 裸响应 → MEMBER 门禁 + 白名单 + 统一响应
 *
 * 口径：
 *   - 祭记每次都记（同日可多次祭拜）；积分同人同类型同灵位当日仅 1 次（幂等键含日期）
 *   - 灵位仅限已故族人（status=DECEASED）；计数原子 +1（文档 11：计数原子 +1）
 *   - remindScan 为系统定时入口：扫 calendar_items(忌日) → notifications 站内通知（蓝图 7.9）
 */
const wx = require('wx-server-sdk');
const { OK, BAD_REQUEST, FORBIDDEN, NOT_FOUND } = require('./common/response');
const { hasRole } = require('./common/roles');
const { writeAudit } = require('./common/audit');
const { awardSystemPoints } = require('./common/points');

wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

const WORSHIP_TYPES = Object.freeze(['lamp', 'incense', 'flower', 'group']);
const WORSHIP_LABELS = Object.freeze({ lamp: '点灯', incense: '上香', flower: '献花', group: '合拜' });
const MESSAGE_MAX = 100;     // 祝福语上限（文档 11：长按触发祝福语）
const LOG_PAGE = 20;         // 祭记分页
const SPIRIT_PAGE = 20;      // 灵位分页
const BLESSING_POINTS = 10;  // 祭拜功德分（文档 TYPE_AMOUNTS.worship）

async function main(params, context) {
  const db = wx.getDatabase();
  const openid = context.OPENID || context.openid;
  const { action, type, targetMemberId, targetId, message, page } = params || {};
  const target = targetMemberId || targetId;

  switch (action) {
    case 'worship':
      return await worship(db, openid, type, target, message);
    case 'spirits':
      return await listSpirits(db, openid, page);
    case 'list':
      return await listLogs(db, openid, target, page);
    case 'remindScan':
      return await scanReminders(db);
    default:
      return BAD_REQUEST(`unknown action: ${action}`);
  }
}

/** 取请求者角色（无记录按 VISITOR） */
async function roleOf(db, openid) {
  if (!openid) return 'VISITOR';
  const res = await db.collection('users').where({ openid }).limit(1).get();
  return res.data.length ? res.data[0].role : 'VISITOR';
}

/** 祭拜：写祭记 → 灵位计数原子+1 → 功德分幂等发放 → 审计 */
async function worship(db, openid, type, targetMemberId, message) {
  if (!openid) return FORBIDDEN('请先登录');
  const role = await roleOf(db, openid);
  if (!hasRole(role, 'MEMBER')) return FORBIDDEN('仅认证族人可参与祭拜');

  if (!WORSHIP_TYPES.includes(type)) {
    return BAD_REQUEST(`type 须为 ${WORSHIP_TYPES.join('/')}`);
  }
  if (!targetMemberId) return BAD_REQUEST('缺少灵位 targetMemberId');
  const msg = typeof message === 'string' ? message.trim() : '';
  if (msg.length > MESSAGE_MAX) return BAD_REQUEST(`祝福语不超过 ${MESSAGE_MAX} 字`);

  const memRes = await db.collection('members').doc(targetMemberId).get().catch(() => null);
  const data = memRes && memRes.data;
  const member = Array.isArray(data) ? data[0] : data;
  if (!member) return NOT_FOUND('灵位不存在');
  if (member.status !== 'DECEASED') return BAD_REQUEST('祖堂灵位仅限已故族人');

  // 1) 祭记每次都记录
  const addRes = await db.collection('worship_logs').add({
    data: {
      type,
      typeLabel: WORSHIP_LABELS[type] || type,
      targetMemberId,
      userId: openid,
      message: msg,
      date: new Date()
    }
  });

  // 2) 灵位计数原子 +1（失败不阻塞祭记）
  // R36 注：worshipCount 为纯计数器，db.command.inc 原子自增本身并发安全，
  // 不属于「编辑冲突」域，豁免 members.version 乐观锁（见 common/version.js 豁免说明）。
  const currentCount = member.worshipCount || 0;
  let worshipCount = currentCount;
  try {
    await db.collection('members').doc(targetMemberId).update({
      data: { worshipCount: db.command.inc(1) }
    });
    worshipCount = currentCount + 1;
  } catch (e) {
    console.warn('[ceremony.worship] count inc failed:', e.message);
  }

  // 3) 功德分幂等发放：同人同类型同灵位当日 1 次
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  let blessing = null;
  try {
    blessing = await awardSystemPoints(db, {
      userId: openid,
      pool: 'gongde',
      bizType: 'ceremony.worship',
      bizId: `${type}:${targetMemberId}:${dateStr}`,
      amount: BLESSING_POINTS,
      note: `祭拜·${WORSHIP_LABELS[type]}`
    });
  } catch (e) {
    console.warn('[ceremony.worship] points failed, will compensate:', e.message);
  }

  await writeAudit(db, {
    userId: openid,
    action: 'ceremony.worship',
    target: targetMemberId,
    detail: blessing
      ? `${WORSHIP_LABELS[type]}${blessing.duplicated ? '（积分幂等跳过）' : `（功德+${blessing.delta}）`}`
      : `${WORSHIP_LABELS[type]}（积分发放失败）`
  });

  return OK({ logId: addRes._id || addRes.id || null, type, typeLabel: WORSHIP_LABELS[type], worshipCount, blessing });
}

/** 灵位列表（已故族人，蓝图 shrine/index：点灯/上香/灵位列表） */
async function listSpirits(db, openid, page) {
  if (!openid) return FORBIDDEN('请先登录');
  const role = await roleOf(db, openid);
  if (!hasRole(role, 'MEMBER')) return FORBIDDEN('仅认证族人可查看灵位');

  const pageNo = Math.max(1, Number(page) || 1);
  const res = await db.collection('members')
    .where({ status: 'DECEASED' })
    .orderBy('name', 'asc')
    .skip((pageNo - 1) * SPIRIT_PAGE)
    .limit(SPIRIT_PAGE)
    .get();

  return OK({
    spirits: res.data.map(m => ({
      id: m._id,
      name: m.genealogyName || m.name,
      generation: m.generation || null,
      deathDate: m.deathDate || '',
      worshipCount: m.worshipCount || 0
    })),
    page: pageNo,
    hasMore: res.data.length === SPIRIT_PAGE
  });
}

/** 祭记分页（按灵位可选过滤，date 倒序） */
async function listLogs(db, openid, targetMemberId, page) {
  if (!openid) return FORBIDDEN('请先登录');
  const role = await roleOf(db, openid);
  if (!hasRole(role, 'MEMBER')) return FORBIDDEN('仅认证族人可查看祭记');

  const pageNo = Math.max(1, Number(page) || 1);
  let q = db.collection('worship_logs');
  if (targetMemberId) q = q.where({ targetMemberId });
  const res = await q.orderBy('date', 'desc')
    .skip((pageNo - 1) * LOG_PAGE)
    .limit(LOG_PAGE)
    .get();

  return OK({ logs: res.data, page: pageNo, hasMore: res.data.length === LOG_PAGE });
}

/** 忌日提醒扫描（系统定时入口，蓝图 7.9：站内 notifications） */
async function scanReminders(db) {
  const today = new Date();
  const res = await db.collection('calendar_items')
    .where({ type: '忌日', notified: false, remindAt: db.command.lte(today) })
    .limit(100)
    .get();

  const items = [];
  for (const item of res.data) {
    if (!item.userId) continue; // 家族级提醒无属主：暂跳过，待订阅分发（R14）
    await db.collection('notifications').add({
      data: {
        userId: item.userId,
        type: 'remind',
        title: '忌日提醒',
        body: `今日是 ${item.memberName || item.title || '先人'} 的忌日，宜往祖堂上香`,
        targetRoute: '/pkg-shrine/pages/shrine/shrine',
        read: false,
        createdAt: new Date()
      }
    });
    await db.collection('calendar_items').doc(item._id).update({ data: { notified: true } });
    items.push({ id: item._id, status: 'sent' });
  }

  return OK({ total: items.length, items });
}

module.exports = { main };
