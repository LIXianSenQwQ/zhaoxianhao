/**
 * cloud/functions/common/homecards.js
 * 首页要事卡流公共实现（蓝图 0.3.2 / 0.3.3）
 * Sprint R14：notify.digest 与 atmosphere.today.homeCards 共用同一口径，
 * 避免两处聚合逻辑漂移（蓝图 0.6.3：首页三聚合接口之一）。
 *
 * 卡序（蓝图 0.3.2）：
 *   ① 仪式/红白事（朱砂边条，置顶）② 提醒/日程 ③ 个人未读通知 ④ 家族动态摘要
 *   兜底：卡流为空时降级「祖训今日」卡（首屏不空，0.3.3）
 * 容错：任一子集合查询失败仅跳过该级，不阻塞整卡流。
 */
const DEFAULT_MOTTO = '敬宗睦族，诗礼传家';

async function buildHomeCards(db, openid) {
  const cards = [];

  if (openid) {
    // ① 仪式/红白事（最高优先级，前端渲染朱砂边条）
    try {
      const cs = await db.collection('ceremonies')
        .where({ status: 'ACTIVE' }).orderBy('date', 'asc').limit(3).get();
      for (const c of cs.data) {
        cards.push({
          type: 'ceremony', accent: 'cinnabar', id: c._id,
          title: c.title || c.type || '家族仪式',
          desc: c.desc || '', date: c.date
        });
      }
    } catch (e) { console.warn('[homecards] ceremonies skip:', e.message); }

    // ② 个人提醒/日程（未提醒的日历项）
    try {
      const rs = await db.collection('calendar_items')
        .where({ userId: openid, notified: false }).limit(5).get();
      for (const r of rs.data) {
        cards.push({
          type: 'reminder', id: r._id,
          title: r.title || '日程提醒', desc: r.desc || '', date: r.date
        });
      }
    } catch (e) { console.warn('[homecards] reminders skip:', e.message); }

    // ③ 个人未读通知（忌日提醒/审核结果等站内通知）
    try {
      const ns = await db.collection('notifications')
        .where({ userId: openid, read: false }).limit(3).get();
      for (const n of ns.data) {
        cards.push({
          type: 'notice', id: n._id,
          title: n.title || '家族通知', desc: n.body || '', date: n.createdAt
        });
      }
    } catch (e) { console.warn('[homecards] notices skip:', e.message); }

    // ④ 家族动态摘要（2 行内收敛）
    try {
      const ms = await db.collection('plaza_posts')
        .orderBy('createdAt', 'desc').limit(3).get();
      for (const m of ms.data) {
        cards.push({
          type: 'moment', id: m._id,
          title: m.authorName || '族人动态',
          desc: (m.content || '').substring(0, 50)
        });
      }
    } catch (e) { console.warn('[homecards] moments skip:', e.message); }
  }

  // 祖训今日兜底（蓝图 0.3.3：空态降级，首屏不空；匿名访客同样可见）
  if (!cards.length) {
    let motto = DEFAULT_MOTTO;
    try {
      const ss = await db.collection('settings').where({ key: 'daily_motto' }).limit(1).get();
      if (ss.data[0] && ss.data[0].value) motto = ss.data[0].value;
    } catch (e) { /* 查询失败用默认祖训 */ }
    cards.push({ type: 'motto', id: 'daily-motto', title: '祖训今日', desc: motto });
  }

  return cards;
}

module.exports = { buildHomeCards, DEFAULT_MOTTO };
