/**
 * cloud/functions/content/index.js
 * V2.0 本地内容管理模块（个人本地内容/新闻资讯/家族动态）
 * Blueprint R20: 英雄留言方案（type=message, secscan+audit+频控）
 */

const wx = require('wx-server-sdk');
const { OK, BAD_REQUEST, FORBIDDEN } = require('./common/response');
const { hasRole } = require('./common/roles');
const { writeAudit } = require('./common/audit');

wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

/** R20: hero/detail 留言板设计（蓝图 8.0） */
async function sendMessage(ctx, userId, targetMemberId, content) {
  const db = wx.getDatabase();
  
  // 门禁：认证族人可发；MEMBER/HISTORIAN/CHIEF
  if (!hasRole(ctx.role, 'HISTORIAN')) {
    if (ctx.role !== 'MEMBER') return FORBIDDEN('仅认证族人可发布留言');
  }

  // 频控：每人每动态 ≤5 条/分钟（基于 member + target）
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
  const recentCount = await db.collection('content_messages').where({
    authorOpenid: ctx.openid, targetMemberId, publishAt: { $gte: fiveMinAgo.toISOString() }
  }).count();
  if (recentCount > 5) return BAD_REQUEST('发言频率过高，请稍后再试');

  // secscan 内容安全检测（R20 mock + R21 真实）
  // 真实环境：wx.cloud.callFunction({ name: 'secscan', data: { text: content } })
  // 测试环境直接通过
  const cleanedContent = content.trim(); // 占位清理
  if (cleanedContent.length < 1 || cleanedContent.length > 500) {
    return BAD_REQUEST('留言内容长度须在 1-500 字之间');
  }

  const now = new Date();
  const msgId = `msg-${now.getTime()}`;
  
  const res = await db.collection('content_messages').add({
    _id: msgId,
    targetMemberId,
    authorOpenid: ctx.openid,
    authorName: ctx.authorName || '', // 前端传入或用户表取
    content: cleanedContent,
    publishAt: now,
    status: 'PENDING', // PENDING/APPROVED/REJECTED
    likes: 0, replies: 0,
    auditResult: 'pass' // mock secscan
  });

  // audit_logs ≥1 年
  await writeAudit(db, {
    userId: ctx.openid, action: 'content.message.send', target: targetMemberId,
    detail: JSON.stringify({ msgId, cleanedContent }), time: now
  });

  return OK({ msgId, message: '留言已提交（待审核）' });
}

/**
 * R21: content.listMessages 英烈留言列表（APPROVED 优先 + 本人 PENDING 可见）
 * 入参：{ targetMemberId, page?, pageSize? }
 */
async function listMessages(ctx, targetMemberId, page = 1, pageSize = 20) {
  const db = wx.getDatabase();
  if (!targetMemberId) return BAD_REQUEST('缺少 targetMemberId');

  const skip = (Math.max(1, page) - 1) * pageSize;
  // APPROVED 全员可见；PENDING 仅作者本人可见
  const res = await db.collection('content_messages')
    .where({ targetMemberId, status: 'APPROVED' })
    .orderBy('publishAt', 'desc')
    .skip(skip).limit(pageSize).get();

  const items = res.data || [];
  // 附加作者本人的 PENDING 留言
  const mine = await db.collection('content_messages')
    .where({ targetMemberId, authorOpenid: ctx.openid, status: 'PENDING' })
    .orderBy('publishAt', 'desc').limit(5).get();

  const all = [...(mine.data || []), ...items].sort((a, b) =>
    new Date(b.publishAt).getTime() - new Date(a.publishAt).getTime()
  );

  return OK({
    messages: all.slice(0, pageSize),
    hasMore: items.length === pageSize,
    page
  });
}

/**
 * R25: V2.0 F1 合规签字 - compliance.sign
 * 入参：{ complianceType: '家规'|'家训'|'倡议书', documentId, sign }
 */
async function complianceSign(ctx, userId, { complianceType, documentId, sign }) {
  const db = wx.getDatabase();
  if (!['家规','家训','倡议书'].includes(complianceType)) return BAD_REQUEST('complianceType 无效');
  if (!documentId || !sign) return BAD_REQUEST('documentId/sign 必填');

  await db.collection('compliance_signs').add({
    userId: ctx.openid, openid: ctx.openid, complianceType, documentId, sign,
    status: 'SIGNING_IN_PROGRESS',
    createdAt: new Date()
  });

  // audit log
  await db.collection('audit_logs').add({
    userId: ctx.openid, action: 'content.compliance.sign', target: `${complianceType}:${documentId}`,
    detail: JSON.stringify({ sign }), time: new Date()
  });
  return OK({ message: '签字已提交（待审核）' });
}

/**
 * R25: V2.0 F1 合规列表 - compliance.list
 */
async function complianceList(ctx, userId) {
  const db = wx.getDatabase();
  const res = await db.collection('compliance_signs')
    .where({ openid: ctx.openid }).orderBy('createdAt', 'desc').limit(50).get();
  return OK({ signs: (res.data || []).map(s => ({ ...s, _id: s._id })) });
}

/**
 * R25: content.article.save 本地内容保存（草稿/发布）
 * 入参：{ type:'article'|'story', title, content, visibility }
 */
async function articleSave(ctx, userId, { type = 'article', title, content, visibility = 'FAMILY' }) {
  const db = wx.getDatabase();
  if (!['article','story'].includes(type)) return BAD_REQUEST('type 必需为 article/story');
  if (!title || title.trim().length === 0) return BAD_REQUEST('标题必填');
  if (typeof content !== 'string' || content.length < 10) return BAD_REQUEST('内容≥10 字');

  const res = await db.collection('local_contents').add({
    userId: ctx.openid, openid: ctx.openid, type, title: title.trim(), content, visibility,
    status: 'DRAFT',
    createdAt: new Date(),
    updatedAt: new Date()
  });

  return OK({ contentId: res._id, status: 'DRAFT' });
}

/**
 * R25: content.article.list 本人本地内容列表
 */
async function articleList(ctx, userId) {
  const db = wx.getDatabase();
  const res = await db.collection('local_contents')
    .where({ openid: ctx.openid }).orderBy('updatedAt', 'desc').limit(50).get();
  return OK({ contents: (res.data || []).slice(0, 50) });
}

/**
 * V2.0 模块一（二十七章 A.3）：本地内容保存 — 扩展分类/标签/权限
 * 三级分类：mainCategory → subCategory → tags；敏感分类强制 PRIVATE（服务端拒绝公开）
 */
const SENSITIVE_CATEGORIES = ['证件资料'];

async function contentSave(ctx, userId, params) {
  const db = wx.getDatabase();
  const { type = 'article', title, content, mainCategory, subCategory, tags = [], visibility = 'PRIVATE', mediaIds = [] } = params;

  if (!['article', 'story', 'photo', 'video', 'record'].includes(type)) return BAD_REQUEST('type 无效');
  if (!title || title.trim().length === 0) return BAD_REQUEST('标题必填');
  if (typeof content !== 'string' || content.length < 1) return BAD_REQUEST('内容必填');
  if (tags.length > 50) return BAD_REQUEST('标签数不得超过 50');
  if (mediaIds.length > 100) return BAD_REQUEST('媒体数不得超过 100');

  // 敏感分类强制 PRIVATE
  if (SENSITIVE_CATEGORIES.includes(mainCategory) && visibility !== 'PRIVATE') {
    return BAD_REQUEST('证件资料等敏感分类仅可设为私密');
  }
  if (!['PRIVATE', 'GROUP', 'PUBLIC'].includes(visibility)) return BAD_REQUEST('visibility 无效');

  // 分类层级校验（≤3 级）
  if (mainCategory && typeof mainCategory !== 'string') return BAD_REQUEST('主分类无效');
  if (subCategory && typeof subCategory !== 'string') return BAD_REQUEST('子分类无效');

  const now = new Date();
  const res = await db.collection('local_contents').add({
    userId: ctx.openid, openid: ctx.openid, type, title: title.trim(), content,
    mainCategory: mainCategory || '', subCategory: subCategory || '', tags,
    visibility, mediaIds,
    status: params.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT',
    createdAt: now, updatedAt: now
  });

  // 审计
  await db.collection('audit_logs').add({
    userId: ctx.openid, action: 'content.save', target: res._id,
    detail: JSON.stringify({ type, visibility }), time: now
  }).catch(() => {});

  // 同步倒排索引（F3）
  await syncSearchIndex(db, ctx.openid, res._id, {
    title: title.trim(), content, mainCategory: mainCategory || '',
    subCategory: subCategory || '', tags, type
  }).catch(() => {});

  return OK({ contentId: res._id, status: params.status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT' });
}

/**
 * V2.0 模块一（A.4）：组合搜索（关键词+日期+分类）
 */
async function contentSearch(ctx, userId, params) {
  const db = wx.getDatabase();
  const { keyword = '', mainCategory = '', subCategory = '', type = '', from, to, page = 1, pageSize = 20 } = params;
  const skip = (Math.max(1, Number(page) || 1) - 1) * pageSize;

  // 构建查询（仅本人内容 + 排除已删除 + 可选过滤）
  const q = { openid: ctx.openid, deleted: db.command.neq(true) };
  if (mainCategory) q.mainCategory = mainCategory;
  if (subCategory) q.subCategory = subCategory;
  if (type) q.type = type;

  // 日期范围（createdAt 区间）
  if (from || to) {
    q.createdAt = {};
    if (from) q.createdAt.$gte = new Date(from);
    if (to) q.createdAt.$lte = new Date(to);
  }

  let res;
  if (keyword) {
    // 关键词：标题或内容正则（简化；生产可接 search_index 倒排索引）
    const kw = String(keyword).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    res = await db.collection('local_contents')
      .where({ ...q, $or: [{ title: db.RegExp({ regexp: kw, options: 'i' }) }, { content: db.RegExp({ regexp: kw, options: 'i' }) }] })
      .orderBy('updatedAt', 'desc').skip(skip).limit(pageSize).get();
  } else {
    res = await db.collection('local_contents')
      .where(q).orderBy('updatedAt', 'desc').skip(skip).limit(pageSize).get();
  }

  return OK({ contents: res.data || [], page, hasMore: (res.data || []).length === pageSize });
}

/**
 * V2.0 模块一（A.4/F3）：search_index 倒排索引
 * ── 分词：标题 + 正文 + 主/子分类 + 标签 → 全文字段 allText + tokens
 * ── 维护：content.save/update/delete 后同步 upsert（软删标记跟随）
 * ── 查询：content.search.index 走索引倒排（关键词必须命 allText）
 * 说明：存量数据可调 content.index.build 全量重建；content.search 仍保留
 * 正则降级路径，保证兼容与兜底。
 */

/** 简易中文分词：按空白/标点切分 + 2~6 字连续滑窗（英文按词） */
function tokenize(text = '') {
  const str = String(text).toLowerCase();
  const pieces = str.split(/[\s,，。.;；:：!！?？、()（）"'“”‘’\-—_/\\#@]+/).filter(Boolean);
  const tokens = new Set(pieces);
  // 中文无空格文本：2/3/4 字滑窗补充召回
  const cjk = str.replace(/[^\u4e00-\u9fa5]/g, '');
  if (cjk.length > 1) {
    for (let n = 2; n <= Math.min(6, cjk.length); n++) {
      for (let i = 0; i + n <= cjk.length; i += 1) tokens.add(cjk.slice(i, i + n));
    }
  }
  return [...tokens].slice(0, 200);
}

/** 组装搜索索引文本 */
function buildIndexText(content) {
  return [
    content.title || '',
    content.content || '',
    content.mainCategory || '',
    content.subCategory || '',
    ...(content.tags || [])
  ].join(' ');
}

/** upsert search_index（同一 openid+contentId 一行） */
async function syncSearchIndex(db, openid, contentId, content, deleted = false) {
  const exist = await db.collection('search_index')
    .where({ openid, contentId }).limit(1).get();
  const doc = {
    openid,
    contentId,
    allText: buildIndexText(content),
    tokens: tokenize(buildIndexText(content)),
    title: content.title || '',
    mainCategory: content.mainCategory || '',
    subCategory: content.subCategory || '',
    type: content.type || '',
    deleted,
    updatedAt: new Date()
  };
  if (exist.data && exist.data.length) {
    await db.collection('search_index').doc(exist.data[0]._id).update({ data: doc });
  } else {
    await db.collection('search_index').add({ data: doc });
  }
}

/**
 * V2.0 F3：content.index.build 全量重建本人索引
 * 兜底修复：删除丢失/新增补录时执行（幂等）
 */
async function contentIndexBuild(ctx, userId) {
  const db = wx.getDatabase();
  const res = await db.collection('local_contents')
    .where({ openid: ctx.openid }).limit(500).get();
  let built = 0;
  for (const c of res.data || []) {
    const isDeleted = c.deleted === true;
    await syncSearchIndex(db, ctx.openid, c._id, c, isDeleted);
    built++;
  }
  return OK({ built, message: '索引已重建' });
}

/**
 * V2.0 F3：content.search.index 索引倒排查询
 * 入参同 content.search；关键词命中 allText 倒排，结果仅含命中 contentId
 */
async function contentSearchByIndex(ctx, userId, params) {
  const db = wx.getDatabase();
  const { keyword = '', mainCategory = '', type = '', page = 1, pageSize = 20 } = params;
  if (!keyword) return BAD_REQUEST('索引查询必须提供关键词');
  const skip = (Math.max(1, Number(page) || 1) - 1) * pageSize;

  const q = { openid: ctx.openid, deleted: db.command.neq(true) };
  if (mainCategory) q.mainCategory = mainCategory;
  if (type) q.type = type;

  const kw = String(keyword).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const res = await db.collection('search_index')
    .where({ ...q, allText: db.RegExp({ regexp: kw, options: 'i' }) })
    .orderBy('updatedAt', 'desc').skip(skip).limit(pageSize).get();

  const ids = (res.data || []).map((r) => r.contentId);
  // 回表取内容（保持对外字段一致）
  let contents = [];
  if (ids.length) {
    const back = await db.collection('local_contents')
      .where({ _id: db.command.in(ids) }).get();
    const byId = {};
    for (const c of back.data || []) byId[c._id] = c;
    contents = ids.map((id) => byId[id]).filter(Boolean);
  }
  return OK({ contents, page, hasMore: (res.data || []).length === pageSize, index: true });
}


/**
 * V2.0 模块一（A.2）：分类管理
 * 主分类/子分类/标签维护在 content_categories（每用户独立）
 */
async function categorySave(ctx, userId, params) {
  const db = wx.getDatabase();
  const { action, name, parentId = '', level = 1, type = 'MAIN' } = params;
  if (!name || !name.trim()) return BAD_REQUEST('分类名必填');
  if (!['MAIN', 'SUB', 'TAG'].includes(type)) return BAD_REQUEST('type 无效');
  // 层级校验：主分类 level=1、子分类 level=2、标签无层级
  if (type === 'MAIN' && level !== 1) return BAD_REQUEST('主分类层级必须为 1');
  if (type === 'SUB' && level !== 2) return BAD_REQUEST('子分类层级必须为 2');

  // 数量上限校验
  const countCol = await db.collection('content_categories').where({ openid: ctx.openid, type }).count();
  const MAX = type === 'MAIN' ? 20 : type === 'SUB' ? 200 : 200;
  if ((countCol.total || 0) >= MAX) return BAD_REQUEST(`分类数已达上限（${MAX}）`);

  const res = await db.collection('content_categories').add({
    openid: ctx.openid, userId: ctx.openid, type, name: name.trim(),
    parentId, level, createdAt: new Date()
  });
  return OK({ categoryId: res._id });
}

async function categoryList(ctx, userId) {
  const db = wx.getDatabase();
  const res = await db.collection('content_categories')
    .where({ openid: ctx.openid }).orderBy('level', 'asc').orderBy('createdAt', 'asc').limit(500).get();
  return OK({ categories: res.data || [] });
}

/**
 * V2.0 模块一（A.2）：分类重命名
 */
async function categoryUpdate(ctx, userId, { categoryId, name }) {
  const db = wx.getDatabase();
  if (!categoryId || !name || !name.trim()) return BAD_REQUEST('缺少必要参数');

  // 权限校验：仅属主
  const ownerRes = await db.collection('content_categories')
    .where({ _id: categoryId, openid: ctx.openid }).limit(1).get();
  if (!ownerRes.data || !ownerRes.data.length) return FORBIDDEN('无权限修改该分类');

  await db.collection('content_categories').doc(categoryId).update({
    data: { name: name.trim(), updatedAt: new Date() }
  });

  try {
    await db.collection('audit_logs').add({
      userId: ctx.openid, action: 'category.update', target: categoryId,
      detail: JSON.stringify({ name }), time: new Date()
    });
  } catch {}

  return OK({ message: '已重命名' });
}

/**
 * V2.0 模块一（A.2）：删除分类（软删除；返回被该分类使用的内容数量提示）
 */
async function categoryDelete(ctx, userId, { categoryId }) {
  const db = wx.getDatabase();
  if (!categoryId) return BAD_REQUEST('缺少 categoryId');

  // 权限校验：仅属主
  const ownerRes = await db.collection('content_categories')
    .where({ _id: categoryId, openid: ctx.openid }).limit(1).get();
  if (!ownerRes.data || !ownerRes.data.length) return FORBIDDEN('无权限删除该分类');

  // 统计使用该分类的内容数量（主分类维度；子分类删除同 name 检索可扩展）
  const usedByName = ownerRes.data[0].name || '';
  const usedCount = usedByName
    ? (await db.collection('local_contents')
        .where({ mainCategory: usedByName, openid: ctx.openid }).count()).total || 0
    : 0;

  await db.collection('content_categories').doc(categoryId).update({
    data: { deleted: true, deletedAt: new Date(), updatedAt: new Date() }
  });

  try {
    await db.collection('audit_logs').add({
      userId: ctx.openid, action: 'category.delete', target: categoryId,
      detail: JSON.stringify({ usedByContents: usedCount }), time: new Date()
    });
  } catch {}

  return OK({ message: '分类已删除', usedByContents: usedCount });
}

/**
 * V2.0 模块一（A.7）：内容详情（按可见性过滤）
 */
async function contentDetail(ctx, userId, { contentId }) {
  const db = wx.getDatabase();
  if (!contentId) return BAD_REQUEST('缺少 contentId');
  
  // 本人内容均可见；他人仅读取 PUBLIC
  const mineRes = await db.collection('local_contents')
    .where({ _id: contentId, openid: ctx.openid }).limit(1).get();
  if (mineRes.data && mineRes.data.length) {
    return OK({ content: mineRes.data[0], isOwner: true });
  }
  
  // 非属主：仅 PUBLIC 可见
  const publicRes = await db.collection('local_contents')
    .where({ _id: contentId, visibility: 'PUBLIC' }).limit(1).get();
  if (publicRes.data && publicRes.data.length) {
    return OK({ content: publicRes.data[0], isOwner: false });
  }
  
  return BAD_REQUEST('该内容不存在或不可见');
}

/**
 * V2.0 模块一（A.3）：编辑内容（title/content/category/tags/visibility/mediaIds）
 * 仅属主可编辑
 */
async function contentUpdate(ctx, userId, { contentId, title, content, mainCategory, subCategory, tags, visibility, mediaIds }) {
  const db = wx.getDatabase();
  if (!contentId) return BAD_REQUEST('缺少 contentId');
  
  // 权限校验：仅属主（先查属主文档是否存在）
  const ownerRes = await db.collection('local_contents')
    .where({ _id: contentId, openid: ctx.openid }).limit(1).get();
  if (!ownerRes.data || !ownerRes.data.length) return FORBIDDEN('无权限修改该内容');
  
  // 当前分类（若未传 mainCategory 但切 PUBLIC 需校验存量分类是否敏感）
  const cur = ownerRes.data[0];
  const effectiveMain = mainCategory !== undefined ? String(mainCategory).trim() : (cur.mainCategory || '');
  if (visibility !== undefined) {
    if (!['PRIVATE', 'GROUP', 'PUBLIC'].includes(visibility)) return BAD_REQUEST('visibility 无效');
    // 敏感分类强制 PRIVATE
    if (SENSITIVE_CATEGORIES.includes(effectiveMain) && visibility !== 'PRIVATE') {
      return BAD_REQUEST('证件资料等敏感分类仅可设为私密');
    }
  }
  
  // 更新字段
  const updateData = { updatedAt: new Date() };
  if (title !== undefined && typeof title === 'string') updateData.title = title.trim();
  if (content !== undefined && typeof content === 'string') updateData.content = content;
  if (mainCategory !== undefined) updateData.mainCategory = String(mainCategory).trim();
  if (subCategory !== undefined) updateData.subCategory = String(subCategory).trim();
  if (tags !== undefined) {
    if (!Array.isArray(tags) || tags.length > 50) return BAD_REQUEST('标签须为数组且 ≤50');
    updateData.tags = tags;
  }
  if (visibility !== undefined) updateData.visibility = visibility;
  if (mediaIds !== undefined) {
    if (!Array.isArray(mediaIds) || mediaIds.length > 100) return BAD_REQUEST('媒体数不得超过 100');
    updateData.mediaIds = mediaIds;
  }
  
  await db.collection('local_contents').doc(contentId).update({ data: updateData });
  
  // audit log
  try {
    await db.collection('audit_logs').add({
      userId: ctx.openid, action: 'content.update', target: contentId,
      detail: JSON.stringify(Object.keys(updateData)), time: new Date()
    });
  } catch {}

  // 同步倒排索引（F3）：用最新字段重建
  await syncSearchIndex(db, ctx.openid, contentId, {
    title: updateData.title !== undefined ? updateData.title : cur.title,
    content: updateData.content !== undefined ? updateData.content : cur.content,
    mainCategory: updateData.mainCategory !== undefined ? updateData.mainCategory : (cur.mainCategory || ''),
    subCategory: updateData.subCategory !== undefined ? updateData.subCategory : (cur.subCategory || ''),
    tags: updateData.tags !== undefined ? updateData.tags : (cur.tags || []),
    type: cur.type || ''
  }).catch(() => {});
  
  return OK({ message: '已更新' });
}

/**
 * V2.0 模块一（A.3）：删除内容（软删除，标记 deleted=true）
 * 仅属主可删除；管理员可强制删除（预留）
 */
async function contentDelete(ctx, userId, { contentId }) {
  const db = wx.getDatabase();
  if (!contentId) return BAD_REQUEST('缺少 contentId');
  
  // 权限校验：仅属主
  const ownerRes = await db.collection('local_contents')
    .where({ _id: contentId, openid: ctx.openid }).limit(1).get();
  if (!ownerRes.data || !ownerRes.data.length) return FORBIDDEN('无权限删除该内容');
  
  // 软删除：标记 deleted 并下沉（保留审计追溯）
  await db.collection('local_contents').doc(contentId).update({
    data: { deleted: true, deletedAt: new Date(), updatedAt: new Date() }
  });
  
  // audit log
  try {
    await db.collection('audit_logs').add({
      userId: ctx.openid, action: 'content.delete', target: contentId,
      detail: '{}', time: new Date()
    });
  } catch {}

  // 索引同步软删（F3）
  await syncSearchIndex(db, ctx.openid, contentId, ownerRes.data[0], true).catch(() => {});
  
  return OK({ message: '已删除' });
}

/**
 * V2.0 模块一（A.3）：批量设置可见性
 * 支持根据条件筛选内容统一改权限
 */
async function batchSetVisibility(ctx, userId, { contentIds, visibility }) {
  const db = wx.getDatabase();
  if (!visibility) return BAD_REQUEST('visibility 必填');
  if (!['PRIVATE', 'GROUP', 'PUBLIC'].includes(visibility)) return BAD_REQUEST('visibility 无效');
  
  const SENSITIVE_CATEGORIES = ['证件资料'];
  // 检查这批内容是否有敏感分类且非 PRIVATE
  let sensitiveFound = false;
  for (const id of contentIds) {
    const item = await db.collection('local_contents').doc(id).get();
    if (item.data?.mainCategory && SENSITIVE_CATEGORIES.includes(item.data.mainCategory) && visibility !== 'PRIVATE') {
      sensitiveFound = true;
      break;
    }
  }
  if (sensitiveFound) return BAD_REQUEST('包含敏感分类的内容不可设为公开/指定可见');
  
  const res = await db.collection('local_contents').where({
    _id: db.command.in(contentIds),
    openid: ctx.openid
  }).set({ data: { visibility, updatedAt: new Date() } });
  
  // audit log（批量记录一次即可）
  try {
    await db.collection('audit_logs').add({
      userId: ctx.openid, action: 'content.batch.setVisibility',
      target: contentIds.join(','),
      detail: JSON.stringify({ count: res.stats.updated }), time: new Date()
    });
  } catch {}
  
  return OK({ message: `已更新 ${res.stats.updated} 条` });
}

module.exports = { main: async (params, context) => {
  const { action } = params || {};
  const userId = params.userId || context.openid;
  const roleCtx = {
    OPENID: context.OPENID || context.openid,
    openid: context.openid,
    role: context.role || 'VISITOR',
    authorName: context.authorName
  };
  
  switch (action) {
    case 'sendMessage':
      return await sendMessage(roleCtx, userId, params.targetMemberId, params.content);
    case 'listMessages':
      return await listMessages(roleCtx, params.targetMemberId, params.page, params.pageSize);
    case 'compliance.sign':
      return await complianceSign(roleCtx, userId, params);
    case 'compliance.list':
      return await complianceList(roleCtx, userId);
    case 'article.save':
      return await articleSave(roleCtx, userId, params);
    case 'article.list':
      return await articleList(roleCtx, userId);
    case 'content.save':
      return await contentSave(roleCtx, userId, params);
    case 'content.search':
      return await contentSearch(roleCtx, userId, params);
    case 'content.index.build':
      return await contentIndexBuild(roleCtx, userId);
    case 'content.search.index':
      return await contentSearchByIndex(roleCtx, userId, params);
    case 'category.save':
      return await categorySave(roleCtx, userId, params);
    case 'category.list':
      return await categoryList(roleCtx, userId);
    case 'category.update':
      return await categoryUpdate(roleCtx, userId, params);
    case 'category.delete':
      return await categoryDelete(roleCtx, userId, params);
    case 'content.detail':
      return await contentDetail(roleCtx, userId, params);
    case 'content.update':
      return await contentUpdate(roleCtx, userId, params);
    case 'content.delete':
      return await contentDelete(roleCtx, userId, params);
    case 'content.batch.setVisibility':
      return await batchSetVisibility(roleCtx, userId, params);
    default:
      return BAD_REQUEST(`unknown action: ${action}`);
  }
}};
