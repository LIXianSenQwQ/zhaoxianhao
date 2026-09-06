/**
 * cloud/functions/common/gateway.js
 * 云开发 → 自建后端迁移预案：转发适配器骨架（蓝图 §7.10 · P3 收口）
 * 
 * 用途：在灰度启用时，将业务动作转发至 NestJS 自建服务，保证前端 services 层零改动；
 *   触发条件：process.env.SELF_HOSTED_BASE_URL 非空 + settings.migration.selfHosted.enabled=true
 *   行为：转发调用原样透传 event/context，保持响应结构 {success,code,data,message}
 * 用法（在各云函数 main 中按需引入）：
 *   const gw = require('./common/gateway');
 *   if (gw.shouldProxy()) return gw.proxy(event, context);  // 转发到 NestJS
 * 
 * 注意：本骨架在当前版本仅作为预留位，未达触发条件时不启用实际转发（由 shouldProxy 控制）。
 */
const https = require('https');
let cachedSettings = null;

async function fetchSelfHostedFlag() {
  const base = process.env.SELF_HOSTED_BASE_URL;
  if (!base) return false;
  try {
    const db = require('../database-init').db || (wx && wx.getDatabase ? wx.getDatabase() : null);
    if (!db) return true; // 环境缺失时假设关闭（灰度开关以运维配置为准）
    const res = await db.collection('settings')
      .where({ key: 'migration.selfHosted.enabled' }).limit(1).get().catch(() => null);
    const val = res && res.data[0] ? res.data[0].value === 'true' : false;
    cachedSettings = { ts: Date.now(), enabled: !!val };
    return val;
  } catch (e) {
    console.warn('[gateway] settings read error:', e.message);
    return false;
  }
}

function shouldProxy() {
  const base = process.env.SELF_HOSTED_BASE_URL;
  if (!base) return false;
  const flag = cachedSettings ? cachedSettings.enabled : false;
  if (cachedSettings && Date.now() - cachedSettings.ts < 60000) return flag;
  return flag; // 短时缓存决策，避免频繁 DB 查询
}

async function proxy(event, context) {
  const base = process.env.SELF_HOSTED_BASE_URL;
  if (!base) throw new Error('SELF_HOSTED_BASE_URL not set');
  const action = event.action || 'main';
  const body = JSON.stringify({ event, context });
  
  return new Promise((resolve, reject) => {
    const url = new URL(`/fn/${encodeURIComponent(action)}`, base);
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-openid': (context.OPENID || context.openid || '').toString(),
        'Content-Length': Buffer.byteLength(body)
      },
      timeout: 3000
    }, (res) => {
      let data = '';
      res.on('data', c => { if (data.length < 8192) data += c; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch {
          resolve({ success: false, code: 502, message: 'bad gateway body' });
        }
      });
    });
    req.on('timeout', () => reject(new Error('timeout')));
    req.on('error', () => reject(new Error('network error')));
    req.write(body);
    req.end();
  });
}

// 公共导出（兼容各云函数主入口调用）
module.exports = { shouldProxy, proxy };
