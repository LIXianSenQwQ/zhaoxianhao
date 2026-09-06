/**
 * cloud/functions/admin/index.js
 * MVP Core: 权限管理 + 审计日志 + 功能开关 (admin.featureFlag)
 * Sprint R11 大修（蓝图对齐）：
 *   - 统一响应规范（OK/BAD_REQUEST/FORBIDDEN，替换裸 {error}）
 *   - auditList 补 HISTORIAN+ 鉴权（修复越权漏洞：蓝图集合表 19 audit_logs 隐私=族长/族史委）
 *   - 日期范围 $gte/$lte 字符串操作符 → db.command（云开发兼容）
 *   - auditList 分页（filterPage，蓝图 26.3 管理员审计页可检索）
 */
const wx = require('wx-server-sdk');
const { OK, BAD_REQUEST, FORBIDDEN, NOT_FOUND } = require('./common/response');
const { hasRole } = require('./common/roles');
const { writeAudit } = require('./common/audit');

wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

const AUDIT_PAGE = 50;

async function main(params, context) {
  const openid = context.OPENID || context.openid;
  if (!openid) return FORBIDDEN('请先登录');
  const dbo = db();

  const { action, key, value, scope, userId, startDate, endDate, filterPage } = params;

  if (action === 'featureFlag') {
    return await setFeatureFlag(key, value, scope, openid);
  }

  if (action === 'getFeatureFlags') {
    return await getFeatureFlags();
  }

  if (action === 'auditList') {
    return await queryAuditLogs(dbo, openid, { userId, startDate, endDate, filterPage });
  }

  if (action === 'heroTag') {
    return await setHeroTag(dbo, openid, params);
  }

  return BAD_REQUEST(`unknown action: ${action}`);
}

function db() { return wx.getDatabase(); }

/**
 * R16 英名录录入通道（蓝图 6.3 英烈由族史委维护 + R15 member.heroList 配套）：
 * HISTORIAN+ 设置 members.isHero / heroNote（GAP 登记 schema 增量），全程审计。
 */
async function setHeroTag(dbo, openid, params) {
  const userRes = await dbo.collection('users').where({ openid }).limit(1).get();
  const role = (userRes.data[0] && userRes.data[0].role) || 'VISITOR';
  if (!hasRole(role, 'HISTORIAN')) return FORBIDDEN('仅族史委及以上可维护英名录');

  const { memberId, isHero, heroNote } = params || {};
  if (!memberId) return BAD_REQUEST('缺少 memberId');
  if (typeof isHero !== 'boolean') return BAD_REQUEST('isHero 须为布尔值');
  if (heroNote !== undefined && typeof heroNote !== 'string') return BAD_REQUEST('heroNote 须为字符串');

  const mRes = await dbo.collection('members').doc(memberId).get().catch(() => null);
  const m = mRes && mRes.data && !Array.isArray(mRes.data) ? mRes.data : (mRes && mRes.data && mRes.data[0]);
  if (!m) return NOT_FOUND('族人不存在');

  await dbo.collection('members').doc(memberId).update({
    data: { isHero, heroNote: heroNote || '', updatedAt: new Date() }
  });

  await writeAudit(dbo, {
    userId: openid,
    action: 'admin.heroTag',
    target: memberId,
    detail: `isHero=${isHero} heroNote=${(heroNote || '').slice(0, 50)}`
  }).catch(() => {});

  return OK({ memberId, isHero, heroNote: heroNote || '' });
}

// V2.0 核心功能：功能开关（Feature Flags）——蓝图 17.2 开关表
const defaultFlags = {
  // V1.1
  v11Profile: { enabled: true, scope: 'global', note: '头像/视频/相册' },
  v11Weather: { enabled: true, scope: 'global' },
  v11Motto: { enabled: true, scope: 'global' },
  v11Generation: { enabled: true, scope: 'global' },
  v11Security: { enabled: true, scope: 'global' },
  v11Almanac: { enabled: true, scope: 'global' },
  // V2.0 五大模块
  v20Content: { enabled: true, scope: 'global', note: '本地内容' },
  v20News: { enabled: true, scope: 'global', note: '新闻资讯（时政仅外链）' },
  v20Moment: { enabled: true, scope: 'global', note: '家族动态与公告' },
  v20Games: { enabled: true, scope: 'global', note: '合规版游戏' },
  v20Home: { enabled: true, scope: 'global', note: '虚拟成长家园（零内购）' },
  // P1/P2
  live: { enabled: false, scope: 'global' },
  healthArchive: { enabled: false, scope: 'global' },
  treeFanView: { enabled: false, scope: 'global' }
};

/** 开关维护：族长及以上（蓝图 17.1：admin.featureFlag 族长/管理员，变更写 audit_logs） */
async function setFeatureFlag(key, value, scope, openid) {
  if (!openid) return FORBIDDEN('请先登录');
  const dbo = db();

  const userRes = await dbo.collection('users').where({ openid }).limit(1).get();
  const role = (userRes.data[0] && userRes.data[0].role) || 'VISITOR';
  if (!hasRole(role, 'CHIEF')) return FORBIDDEN('仅族长可维护功能开关');
  if (!key) return BAD_REQUEST('缺少 key');
  if (!value || typeof value.enabled !== 'boolean') return BAD_REQUEST('value.enabled 必须为布尔');

  const config = await dbo.collection('settings').where({ key: 'featureFlag' }).limit(1).get();

  let flags = defaultFlags;
  if (config.data.length) {
    try { flags = JSON.parse(config.data[0].value); } catch (e) { flags = defaultFlags; }
  }

  flags[key] = { ...(flags[key] || {}), enabled: value.enabled, ...(scope ? { scope } : {}) };

  if (config.data.length) {
    await dbo.collection('settings').doc(config.data[0]._id).update({
      data: { value: JSON.stringify(flags), updatedAt: new Date().toISOString() }
    });
  } else {
    await dbo.collection('settings').add({
      data: { key: 'featureFlag', value: JSON.stringify(flags), scope: 'global' }
    });
  }

  await writeAudit(dbo, { userId: openid, action: 'admin.featureFlag', target: key, detail: `enabled=${value.enabled}` });
  return OK({ flags });
}

async function getFeatureFlags() {
  const res = await db().collection('settings').where({ key: 'featureFlag' }).limit(1).get();

  if (res.data.length) {
    try { return OK({ flags: JSON.parse(res.data[0].value) }); } catch (e) { /* 落入默认 */ }
  }
  return OK({ flags: defaultFlags });
}

/**
 * 审计日志查询（蓝图 9.1 admin.auditList）
 * 权限：HISTORIAN 及以上（蓝图集合表 19：audit_logs 隐私=族长/族史委）——Sprint R11 修复越权漏洞
 * 筛选：userId / action / startDate~endDate（db.command 日期比较）；分页 filterPage
 */
async function queryAuditLogs(dbo, openid, { userId, startDate, endDate, action, filterPage = 1 }) {
  if (!openid) return FORBIDDEN('请先登录');

  const userRes = await dbo.collection('users').where({ openid }).limit(1).get();
  const role = (userRes.data[0] && userRes.data[0].role) || 'VISITOR';
  if (!hasRole(role, 'HISTORIAN')) return FORBIDDEN('仅族史委及以上可查审计流水');

  const where = {};
  if (userId) where.userId = String(userId).trim();
  if (action) where.action = String(action).trim();
  if (startDate || endDate) {
    const cmd = dbo.command;
    const range = {};
    if (startDate) { const d = new Date(startDate); if (isNaN(d.getTime())) return BAD_REQUEST('startDate 非法'); range.$gte = d; }
    if (endDate) { const d = new Date(endDate); if (isNaN(d.getTime())) return BAD_REQUEST('endDate 非法'); range.$lte = d; }
    // 兼容 stub（command.eq 直通）与真机（db.command.gte/lte 生成查询指令）
    where.time = cmd.gte && cmd.lte && (startDate && endDate)
      ? cmd.gte(range.$gte).and(cmd.lte(range.$lte))
      : (startDate ? cmd.gte(range.$gte) : cmd.lte(range.$lte));
  }

  const page = Math.max(1, Number(filterPage) || 1);
  const res = await dbo.collection('audit_logs')
    .where(where)
    .orderBy('time', 'desc')
    .skip((page - 1) * AUDIT_PAGE).limit(AUDIT_PAGE)
    .get();

  const logs = (res && res.data) || [];
  return OK({ logs, page, hasMore: logs.length === AUDIT_PAGE });
}

module.exports = { main };
