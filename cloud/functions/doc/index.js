/**
 * cloud/functions/doc/index.js
 * 谱库档案：旧谱 PDF / 照片 / 碑拓 / 文书
 * Sprint R3 完整化：统一响应、贡献权限门禁、分页、OCR 检索、404
 */
const wx = require('wx-server-sdk');
const { OK, BAD_REQUEST, FORBIDDEN, NOT_FOUND } = require('./common/response');
const { hasRole } = require('./common/roles');
const { writeAudit } = require('./common/audit');

wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

const PAGE_SIZE = 20;
const DOC_TYPES = ['old_genealogy', 'photo', 'stele', 'document'];
const DOC_LEVELS = ['L2', 'L3', 'L4'];

async function main(event, context) {
  const openid = context.OPENID || context.openid;
  if (!openid) return FORBIDDEN('请先登录');
  const db = wx.getDatabase();
  const { action } = event;

  switch (action) {
    case 'list':
      return await listDocs(db, event);
    case 'get':
      return await getDoc(db, openid, event.docId);
    case 'upload':
      return await uploadDoc(db, openid, event);
    case 'search':
      return await searchDocs(db, event);
    default:
      return BAD_REQUEST(`unknown action: ${action}`);
  }
}

async function roleOf(db, openid) {
  const res = await db.collection('users').where({ openid }).limit(1).get();
  return (res.data[0] && res.data[0].role) || 'VISITOR';
}

/** 列表：类型/年代筛选 + 分页（limit 预算封顶） */
async function listDocs(db, { type, era, page = 1 }) {
  const where = {};
  if (type) {
    if (!DOC_TYPES.includes(type)) return BAD_REQUEST(`未知文档类型: ${type}`);
    where.type = type;
  }
  if (era) where.era = era;

  const p = Math.max(1, Number(page) || 1);
  const res = await db.collection('documents')
    .where(where)
    .orderBy('createdAt', 'desc')
    .skip((p - 1) * PAGE_SIZE).limit(PAGE_SIZE)
    .get();
  return OK({ docs: res.data, page: p, hasMore: res.data.length === PAGE_SIZE });
}

/** 详情：404 + 隐藏 ocrText 大字段（检索态按需拉取） */
async function getDoc(db, openid, docId) {
  if (!docId) return BAD_REQUEST('缺少 docId');
  const res = await db.collection('documents').doc(docId).get().catch(() => null);
  const doc = res && res.data && !Array.isArray(res.data) ? res.data : (res && res.data && res.data[0]);
  if (!doc) return NOT_FOUND('档案不存在');
  return OK({ doc: { ...doc, ocrText: undefined } });
}

/** 登记上传（文件本体走 upload.policy 签名直传云存储）：MEMBER+ 贡献 */
async function uploadDoc(db, openid, { title, type, era, fileId, thumbUrl, level = 'L2', ocrText = '', size = 0 }) {
  const role = await roleOf(db, openid);
  if (!hasRole(role, 'MEMBER')) return FORBIDDEN('仅认证会员可贡献谱库档案');

  if (!title || !String(title).trim()) return BAD_REQUEST('缺标题');
  if (!DOC_TYPES.includes(type)) return BAD_REQUEST(`未知文档类型: ${type}`);
  if (!DOC_LEVELS.includes(level)) return BAD_REQUEST(`密级须为 ${DOC_LEVELS.join('/')}`);
  if (!fileId) return BAD_REQUEST('缺云存储 fileId（先走 upload.policy 直传）');
  if (String(ocrText).length > 20000) return BAD_REQUEST('ocrText 超 20000 字符上限');

  const addRes = await db.collection('documents').add({
    data: {
      title: String(title).trim(),
      type, era: era || null,
      fileId, thumbUrl: thumbUrl || null,
      ocrText,
      contributorId: openid,
      level,
      size: Number(size) || 0,
      status: 'PUBLISHED',
      createdAt: new Date(),
      updatedAt: new Date()
    }
  });
  await writeAudit(db, { userId: openid, action: 'doc.upload', target: addRes._id, detail: title });
  return OK({ docId: addRes._id });
}

/** OCR 全文检索：标题/正文正则（转义 + limit） */
async function searchDocs(db, { keyword, page = 1 }) {
  const kw = String(keyword || '').trim();
  if (!kw) return BAD_REQUEST('缺检索词');
  if (kw.length > 50) return BAD_REQUEST('检索词过长');

  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = { $regex: `.*${escaped}.*`, $options: 'i' };
  const p = Math.max(1, Number(page) || 1);

  // 标题或 OCR 正文命中（优先标题命中：两次查询按标题置前）
  const [titleHits, textHits] = await Promise.all([
    db.collection('documents').where({ title: re }).skip((p - 1) * PAGE_SIZE).limit(PAGE_SIZE).get(),
    db.collection('documents').where({ ocrText: re }).limit(PAGE_SIZE).get()
  ]);

  const seen = new Set();
  const merged = [];
  for (const d of [...titleHits.data, ...textHits.data]) {
    if (!seen.has(d._id)) { seen.add(d._id); merged.push(d); }
  }
  return OK({ docs: merged.slice(0, PAGE_SIZE), page: p, hasMore: merged.length === PAGE_SIZE });
}

module.exports = { main };
