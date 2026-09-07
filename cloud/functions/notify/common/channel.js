/**
 * cloud/functions/notify/common/channel.js
 * §7.9 站外通知通道适配层（订阅消息 + 公众号模板，P1 预留 + 纯代码可验证）：
 *   - 配置读取：settings.subscribeTemplates（key→templateId 映射）、settings.officialAccount（公众号启用 + templateMap）
 *   - fail-closed：模板缺失/通道未启用 → { ok:false, silent:true } 降级静默，不阻塞主流程（与 notify.broadcast 订阅推送同口径）
 *   - 发送分派：生产环境 wx.openapi 就绪 → 真实云调用；stub/未初始化 → simulated 模拟（返回结构可被冒烟测试验证）
 * 对齐蓝图 7.9「notify.dispatch→站内/订阅/紧急广播三通道」站外两通道的预留实现。
 */
const wx = require('wx-server-sdk');

const SUBSCRIBE_TEMPLATES_KEY = 'subscribeTemplates';
const OFFICIAL_ACCOUNT_KEY = 'officialAccount';

/** 读取 settings 单值（value 可为对象/JSON 字符串/标量） */
async function readSetting(db, key) {
  const res = await db.collection('settings').where({ key }).limit(1).get();
  const rec = res && res.data && res.data[0];
  if (!rec) return null;
  const v = rec.value;
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch (e) { return v; }
  }
  return v;
}

/**
 * 解析订阅消息模板：settings.subscribeTemplates = { [templateKey]: '模板ID', all: '兜底模板ID' }
 * 返回 { ok:true, templateId } 或 { ok:false, reason, silent:true }
 */
async function resolveSubscribeTemplate(db, templateKey) {
  const tpl = await readSetting(db, SUBSCRIBE_TEMPLATES_KEY);
  if (!tpl || typeof tpl !== 'object') return { ok: false, reason: 'subscribe_templates_not_configured', silent: true };
  const id = tpl[templateKey] || tpl.all;
  if (!id || typeof id !== 'string') return { ok: false, reason: `template_not_found:${templateKey}`, silent: true };
  return { ok: true, templateId: id };
}

/**
 * 解析公众号模板：settings.officialAccount = { enabled:true, appId?, templateMap:{[key]:'模板ID', all:'兜底'} }
 * enabled !== true 视为未启用（降级静默）
 */
async function resolveOfficialTemplate(db, templateKey) {
  const cfg = await readSetting(db, OFFICIAL_ACCOUNT_KEY);
  if (!cfg || cfg.enabled !== true) return { ok: false, reason: 'official_account_not_enabled', silent: true };
  const map = cfg.templateMap || {};
  const id = map[templateKey] || map.all;
  if (!id || typeof id !== 'string') return { ok: false, reason: `oa_template_not_found:${templateKey}`, silent: true };
  return { ok: true, templateId: id, appId: cfg.appId };
}

/**
 * 订阅消息真实/模拟发送。
 * 微信订阅消息（一次性模板）：需用户先 requestSubscribeMessage 授权；服务端 send 到单个 openid。
 * wx.openapi 未就绪（stub 测试 / 云调用未开通）→ simulated，不写库（模拟即验证通道参数结构）。
 */
async function sendSubscribeMessage(db, { toUser, templateId, data = {} }) {
  if (!toUser || !templateId) return { ok: false, reason: 'missing_toUser_or_templateId' };
  if (wx.openapi && typeof wx.openapi.subscribeMessage.send === 'function') {
    try {
      const r = await wx.openapi.subscribeMessage.send({ touser: toUser, templateId, data });
      return { ok: true, channel: 'WX_SUBSCRIBE', result: r };
    } catch (e) {
      console.warn('[channel.subscribe] real send failed:', e.message);
      return { ok: false, reason: `send_failed:${e.message}` };
    }
  }
  return { ok: true, channel: 'WX_SUBSCRIBE', simulated: true, toUser, templateId };
}

/**
 * 公众号模板消息真实/模拟发送（IM 兜底；SDK 占位——生产可换 msgSecCheck/客服消息等，接口不变）
 */
async function sendOfficialMessage(db, { toUser, templateId, data = {}, page }) {
  if (!toUser || !templateId) return { ok: false, reason: 'missing_toUser_or_templateId' };
  if (wx.openapi && typeof wx.openapi.subscribeMessage.send === 'function') {
    // 公众号模板走同一云调用族（若已开通）；SDK 占位保证接口一致
    try {
      const r = await wx.openapi.subscribeMessage.send({ touser: toUser, templateId, data, page });
      return { ok: true, channel: 'OFFICIAL_ACCOUNT', result: r };
    } catch (e) {
      console.warn('[channel.official] real send failed:', e.message);
      return { ok: false, reason: `send_failed:${e.message}` };
    }
  }
  return { ok: true, channel: 'OFFICIAL_ACCOUNT', simulated: true, toUser, templateId, page };
}

module.exports = { resolveSubscribeTemplate, resolveOfficialTemplate, sendSubscribeMessage, sendOfficialMessage };
