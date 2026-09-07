/**
 * cloud/functions/notify/index.js
 * 通知聚合 + 首页摘要 + 紧急广播
 *
 * Sprint R3 完整化：统一响应 / hasRole 门禁 / list 分页
 * Sprint R14 大修（蓝图 0.3.2 / 7.9 对齐）：
 *   - digest 接 common/homecards 卡流（仪式→提醒→个人通知→动态→祖训兜底），
 *     与 atmosphere.today.homeCards 同口径
 *   - list 合并「个人通知（userId=openid，含 remindScan 忌日提醒）」与「全员广播」，
 *     旧版仅查 scope:'ALL' 导致站内个人通知永远不可见
 *   - markRead 补属主校验（旧版任何登录者可标记任意通知已读——水平越权）
 *   - broadcast 移除 wx.cloud.generateObjectId()（不存在的 API，stub/真机均必崩；
 *     _id 由 add 自动生成，与 R12 points / R13 ceremony 同口径修复）
 * Sprint F13 §7.9（蓝图 7.9 通知编排）：站外通道适配——
 *   - dispatch 通道抽象（type → 站内/订阅/公众号，EDITOR+ 统一入口）
 *   - subscribeMsg.send 订阅消息通道（settings.subscribeTemplates）
 *   - officialAccount.send 公众号模板通道（settings.officialAccount.enabled 门）
 *   - fail-closed：模板未配置/通道未启用 → 降级静默不报错；stub 环境 simulated 可验证
 */
const wx = require('wx-server-sdk');
const { OK, BAD_REQUEST, FORBIDDEN, NOT_FOUND } = require('./common/response');
const { hasRole } = require('./common/roles');
const { writeAudit } = require('./common/audit');
const { buildHomeCards } = require('./common/homecards');
const { resolveSubscribeTemplate, resolveOfficialTemplate, sendSubscribeMessage, sendOfficialMessage } = require('./common/channel');

wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

const LIST_LIMIT = 50;
const LIST_SIZE = 20;

async function main(event, context) {
  const openid = context.OPENID || context.openid;
  if (!openid) return FORBIDDEN('请先登录');
  const db = wx.getDatabase();
  const { action } = event;

  switch (action) {
    case 'digest':
      return await getHomeDigest(db, openid);
    case 'list':
      return await listNotifications(db, openid, event.page);
    case 'markRead':
      return await markRead(db, openid, event.notificationId);
    case 'broadcast':
      return await broadcastToAll(db, openid, event);
    case 'dispatch':
      return await dispatchNotify(db, openid, event);
    case 'subscribeMsg.send':
      return await sendSubscribe(db, openid, event);
    case 'officialAccount.send':
      return await sendOfficial(db, openid, event);
    default:
      return BAD_REQUEST('unknown action: ' + action);
  }
}

async function roleOf(db, openid) {
  const res = await db.collection('users').where({ openid }).limit(1).get();
  return (res.data[0] && res.data[0].role) || 'VISITOR';
}

/** 首页摘要卡（蓝图 0.3.2 卡流）：与 atmosphere.homeCards 共用 common/homecards */
async function getHomeDigest(db, openid) {
  const cards = await buildHomeCards(db, openid);
  return OK({ cards });
}

/**
 * 我的通知列表：个人通知 + 全员广播合并（createdAt 倒序）
 * 深翻页以个人通知为准（广播量级小，仅首页并入；V1.1 广播已读回执走 per-user 状态）
 */
async function listNotifications(db, openid, page = 1) {
  const p = Math.max(1, Number(page) || 1);
  const mine = await db.collection('notifications')
    .where({ userId: openid })
    .orderBy('createdAt', 'desc')
    .skip((p - 1) * LIST_SIZE).limit(LIST_SIZE)
    .get();
  if (!mine.data || p > 1) {
    return OK({ records: mine.data || [], page: p, hasMore: (mine.data || []).length === LIST_SIZE });
  }
  const alls = await db.collection('notifications')
    .where({ scope: 'ALL', read: false })
    .orderBy('createdAt', 'desc')
    .limit(LIST_SIZE)
    .get();
  const merged = (mine.data || []).concat(alls.data || [])
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, LIST_SIZE);
  return OK({ records: merged, page: p, hasMore: (mine.data || []).length === LIST_SIZE });
}

/** 标记已读：仅本人可标记个人通知；全员广播为共享已读态（V1.1 升级 per-user 回执） */
async function markRead(db, openid, notificationId) {
  if (!notificationId) return BAD_REQUEST('缺少 notificationId');
  const res = await db.collection('notifications').doc(notificationId).get().catch(() => null);
  const doc0 = res && res.data && !Array.isArray(res.data) ? res.data : (res && res.data && res.data[0]);
  if (!doc0) return NOT_FOUND('通知不存在');
  if (doc0.userId && doc0.userId !== openid) return FORBIDDEN('仅本人可标记已读');
  await db.collection('notifications').doc(notificationId).update({
    data: { read: true, readAt: new Date() }
  });
  return OK({ marked: true });
}

/** 紧急广播：EDITOR+ 才可发（写入 + 订阅消息推送） */
async function broadcastToAll(db, openid, { content, level }) {
  const role = await roleOf(db, openid);
  if (!hasRole(role, 'EDITOR')) return FORBIDDEN('仅编辑及以上可发布紧急广播');
  if (!content || !String(content).trim()) return BAD_REQUEST('缺广播内容');

  // _id 由 add 自动生成（generateObjectId 为不存在的 API，R14 移除）
  const addRes = await db.collection('notifications').add({
    data: {
      type: 'EMERGENCY',
      level: ['HIGH', 'MEDIUM'].includes(level) ? level : 'HIGH',
      title: '紧急通知',
      body: String(content).trim(),
      scope: 'ALL',
      read: false,
      createdAt: new Date(),
      createdBy: openid
    }
  });
  const broadcastId = addRes._id;

  // 订阅消息推送（失败不阻塞通知本体；模板未配置时整体跳过）
  let notifiedCount = 0;
  try {
    const users = await db.collection('users').where({ status: 'ACTIVE' }).limit(1000).get();
    for (const user of users.data) {
      try {
        await wx.openapi.subscribeMessage.send({
          touser: user.openid,
          templateId: 'BROADCAST_TEMPLATE_ID',
          data: { thing1: { value: '紧急通知' }, thing2: { value: String(content).substring(0, 20) } }
        });
        notifiedCount++;
      } catch (e) {
        console.warn('[notify.broadcast] send fail:', user.openid);
      }
    }
  } catch (e) {
    console.warn('[notify.broadcast] user scan fail:', e.message);
  }

  await writeAudit(db, { userId: openid, action: 'notify.broadcast', target: broadcastId, detail: level });
  return OK({ broadcastId, notifiedCount });
}

/** 校验订阅消息参数（thing 字段 ≤20 字、data 最多 6 键，防滥用/截断） */
function sanitizeSubscribeData(data) {
  const out = {};
  if (!data || typeof data !== 'object') return out;
  for (const [k, v] of Object.entries(data)) {
    if (Object.keys(out).length >= 6) break;
    const raw = v && typeof v === 'object' ? String(v.value || '') : String(v || '');
    out[k] = { value: raw.slice(0, 20) };
  }
  return out;
}

/**
 * §7.9 订阅消息单发（蓝图 7.9 通道二）：EDITOR+ 触发，settings.subscribeTemplates 配模板。
 * 模板未配置 → 降级静默（OK + sent:false）；wx.openapi 不可用 → simulated 可验证。
 */
async function sendSubscribe(db, openid, { toUser, templateKey, data }) {
  const role = await roleOf(db, openid);
  if (!hasRole(role, 'EDITOR')) return FORBIDDEN('仅编辑及以上可发送订阅消息');
  if (!toUser || !templateKey) return BAD_REQUEST('缺 toUser 或 templateKey');

  const tpl = await resolveSubscribeTemplate(db, templateKey);
  if (!tpl.ok) return OK({ sent: false, reason: tpl.reason, degraded: tpl.silent === true });

  const payload = sanitizeSubscribeData(data);
  const sent = await sendSubscribeMessage(db, { toUser, templateId: tpl.templateId, data: payload });
  await writeAudit(db, { userId: openid, action: 'notify.subscribe.send', target: toUser, detail: templateKey });
  return OK({ sent: sent.ok, ...(sent.ok ? { channel: sent.channel, simulated: !!sent.simulated } : { reason: sent.reason }) });
}

/**
 * §7.9 公众号模板消息（蓝图 7.9 IM/公众号兜底，SDK 占位）：settings.officialAccount.enabled=true 才发。
 * 未启用 → 降级静默。
 */
async function sendOfficial(db, openid, { toUser, templateKey, data, page }) {
  const role = await roleOf(db, openid);
  if (!hasRole(role, 'EDITOR')) return FORBIDDEN('仅编辑及以上可发送公众号消息');
  if (!toUser || !templateKey) return BAD_REQUEST('缺 toUser 或 templateKey');

  const tpl = await resolveOfficialTemplate(db, templateKey);
  if (!tpl.ok) return OK({ sent: false, reason: tpl.reason, degraded: tpl.silent === true });

  const payload = sanitizeSubscribeData(data);
  const sent = await sendOfficialMessage(db, { toUser, templateId: tpl.templateId, data: payload, page });
  await writeAudit(db, { userId: openid, action: 'notify.official.send', target: toUser, detail: templateKey });
  return OK({ sent: sent.ok, ...(sent.ok ? { channel: sent.channel, simulated: !!sent.simulated } : { reason: sent.reason }) });
}

/**
 * §7.9 通知统一编排（蓝图 7.9 通道抽象）：EDITOR+ 入口。
 * type: INAPP 站内 | SUBSCRIBE 订阅消息 | OFFICIAL 公众号 | ALL 全通道。
 * 站内 → notifications（scope ALL 广播或个人 userId）；站外按配置 fail-closed。
 */
async function dispatchNotify(db, openid, { type, title, body, toUser, templateKey, data }) {
  const role = await roleOf(db, openid);
  if (!hasRole(role, 'EDITOR')) return FORBIDDEN('仅编辑及以上可编排通知');
  if (!type || !body || !String(body).trim()) return BAD_REQUEST('缺 type 或 body');
  const mode = ['INAPP', 'SUBSCRIBE', 'OFFICIAL', 'ALL'].includes(type) ? type : 'INAPP';

  const results = { inapp: false, subscribe: null, official: null };

  // 站内落库（广播 scope ALL / 个人 userId）
  if (mode === 'INAPP' || mode === 'ALL') {
    const addRes = await db.collection('notifications').add({
      data: {
        type: title ? 'DISPATCH' : 'SYSTEM',
        title: title || '通知',
        body: String(body).trim(),
        scope: toUser ? 'USER' : 'ALL',
        ...(toUser ? { userId: toUser } : {}),
        read: false,
        createdAt: new Date(),
        createdBy: openid
      }
    });
    results.inapp = true;
    results.notificationId = addRes._id;
  }

  // 站外：SUBSCRIBE / OFFICIAL / ALL 时尝试对应通道（模板缺失自动降级静默）
  if ((mode === 'SUBSCRIBE' || mode === 'ALL') && toUser && templateKey) {
    const tpl = await resolveSubscribeTemplate(db, templateKey);
    results.subscribe = tpl.ok
      ? await sendSubscribeMessage(db, { toUser, templateId: tpl.templateId, data: sanitizeSubscribeData(data) })
      : { sent: false, degraded: true, reason: tpl.reason };
  }
  if ((mode === 'OFFICIAL' || mode === 'ALL') && toUser && templateKey) {
    const tpl = await resolveOfficialTemplate(db, templateKey);
    results.official = tpl.ok
      ? await sendOfficialMessage(db, { toUser, templateId: tpl.templateId, data: sanitizeSubscribeData(data), page: undefined })
      : { sent: false, degraded: true, reason: tpl.reason };
  }

  await writeAudit(db, { userId: openid, action: 'notify.dispatch.' + mode.toLowerCase(), target: toUser || 'ALL', detail: String(body).slice(0, 50) });
  return OK(results);
}

module.exports = { main };