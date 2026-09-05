/**
 * cloud/functions/event/index.js
 * 家族史记/大事记：列表（分页+年份筛选）/ 详情 / 发布（族史委）
 * Sprint R2 补齐：统一响应、HISTORIAN 权限门禁、分页 limit
 */
const wx = require('wx-server-sdk');
const { OK, BAD_REQUEST, FORBIDDEN, NOT_FOUND } = require('./common/response');
const { isHistorian } = require('./common/roles');
const { writeAudit } = require('./common/audit');

wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

const PAGE_SIZE = 20;

async function main(event, context) {
  const openid = context.OPENID || context.openid;
  if (!openid) return FORBIDDEN('请先登录');
  const db = wx.getDatabase();
  const { action, eventId, year, page = 1 } = event;

  switch (action) {
    case 'list': {
      const where = { status: 'PUBLISHED' };
      if (year) where.year = Number(year);
      const skip = (Math.max(1, Number(page) || 1) - 1) * PAGE_SIZE;
      const res = await db.collection('events')
        .where(where)
        .orderBy('year', 'desc').orderBy('createdAt', 'desc')
        .skip(skip).limit(PAGE_SIZE)
        .get();
      return OK({ events: res.data, page: Number(page) || 1, hasMore: res.data.length === PAGE_SIZE });
    }
    case 'detail': {
      if (!eventId) return BAD_REQUEST('缺少 eventId');
      const res = await db.collection('events').doc(eventId).get().catch(() => null);
      const ev = res && res.data && !Array.isArray(res.data) ? res.data : (res && res.data && res.data[0]);
      if (!ev) return NOT_FOUND('大事记不存在');
      return OK({ event: ev });
    }
    case 'create': {
      // 族史委专属：HISTORIAN 及以上
      const me = await db.collection('users').where({ openid }).limit(1).get();
      const user = me.data[0];
      if (!user || !isHistorian(user.role)) return FORBIDDEN('仅族史委可发布大事记');

      const { title, content, year, images = [] } = event;
      if (!title || !content || !year) return BAD_REQUEST('标题/正文/年份必填');
      if (String(year).length !== 4 || !/^\d{4}$/.test(String(year))) return BAD_REQUEST('年份须为 4 位数字');

      const addRes = await db.collection('events').add({
        data: {
          title, content,
          year: Number(year),
          images,
          createdBy: openid,
          status: 'PUBLISHED',
          createdAt: new Date()
        }
      });
      await writeAudit(db, { userId: openid, action: 'event.create', target: addRes._id, detail: title });
      return OK({ eventId: addRes._id });
    }
    default:
      return BAD_REQUEST(`unknown action: ${action}`);
  }
}

module.exports = { main };
