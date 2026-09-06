/**
 * cloud/functions/news/index.js
 * V2.0 模块二：新闻资讯模块（合规外链版）
 * Blueprint R22: 数据源配置（5 家）→ 增量拉取 → 指纹去重 → 入库 + 倒排索引
 * API 接入点：
 *   • news.source.list/register/refresh
 *   • news.fetch → 从所有可用源增量拉取（每 10 分钟定时触发器入口：news.cron.pull）
 *   • news.item.list / news.item.search
 *   • news.favorite.* / news.cache.*
 */
const wx = require('wx-server-sdk');
const { OK, BAD_REQUEST, FORBIDDEN } = require('./common/response');
const { hasRole } = require('./common/roles');
const { writeAudit } = require('./common/audit');
const crypto = require('crypto');

wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

// ─── 种子数据：5 家注册源（合规边界：时政仅标题 + 摘要 + 外链，正文缓存禁用） ───
const DEFAULT_SOURCES = [
  {
    name: '聚合数据新闻头条',
    type: 'API',
    baseUrl: 'https://api.juhe.cn/finance/new/index',
    apiKeyRef: 'juhe_news_key',
    categories: ['时政要闻','财经商业','科技数码','文化艺术','娱乐体育','健康生活','教育升学','三农乡土','法治社会'],
    quota: { daily: 1000, hourly: 60 },
    priority: 1,
    authorized: true,
    lastFetchAt: null,
    lastFetchStatus: 'NOT_RUN',
    status: 'ACTIVE',
    isOfficialPolicy: false,
    createdAt: new Date().toISOString()
  },
  {
    name: '天行数据',
    type: 'API',
    baseUrl: 'https://www.tianapi.com/newsapi/',
    apiKeyRef: 'tianapi_key',
    categories: ['国内新闻','国际新闻','社会','军事','体育','娱乐','科技','健康','财经','汽车','房产'],
    quota: { daily: 500, hourly: 30 },
    priority: 2,
    authorized: true,
    lastFetchAt: null,
    lastFetchStatus: 'NOT_RUN',
    status: 'ACTIVE',
    isOfficialPolicy: false,
    createdAt: new Date().toISOString()
  },
  {
    name: '拓尔思媒体大数据云服务',
    type: 'ENTERPRISE',
    baseUrl: 'https://www.trs.com.cn/api/news',
    apiKeyRef: 'trs_client_id',
    categories: ['权威发布','政策解读','经济','文化','国际','地方'],
    quota: { daily: 2000, hourly: 100 },
    priority: 3,
    authorized: true, // 假设已签署授权协议
    lastFetchAt: null,
    lastFetchStatus: 'NOT_RUN',
    status: 'ACTIVE',
    isOfficialPolicy: false,
    createdAt: new Date().toISOString()
  },
  {
    name: '新华网官方 RSS',
    type: 'RSS',
    baseUrl: 'http://rss.news.cn/rss/news.xml',
    apiKeyRef: null,
    categories: ['时政要闻','国际新闻','国内新闻','财经','科技','体育','文化'],
    quota: { daily: 999999, hourly: 999999 },
    priority: 4,
    authorized: true,
    lastFetchAt: null,
    lastFetchStatus: 'NOT_RUN',
    status: 'ACTIVE',
    isOfficialPolicy: true,
    createdAt: new Date().toISOString()
  },
  {
    name: '人民网官方 RSS',
    type: 'RSS',
    baseUrl: 'http://rss.peopledaily.com.cn/rss/rmrb.xml',
    apiKeyRef: null,
    categories: ['时政要闻','国际','社会','法制','财经','文化'],
    quota: { daily: 999999, hourly: 999999 },
    priority: 5,
    authorized: true,
    lastFetchAt: null,
    lastFetchStatus: 'NOT_RUN',
    status: 'ACTIVE',
    isOfficialPolicy: true,
    createdAt: new Date().toISOString()
  }
];

/** 初始化：种子源登记（幂等） */
async function ensureSources(ctx) {
  const db = wx.getDatabase();
  const countRes = await db.collection('news_sources').count();
  const countTotal = countRes.total || 0;
  if (countTotal === 0) {
    const now = Date.now();
    for (let i = 0; i < DEFAULT_SOURCES.length; i++) {
      await db.collection('news_sources').add({
        ...DEFAULT_SOURCES[i],
        _id: `src-${now}-${i}`,
        createdAt: new Date().toISOString()
      });
    }
    await writeAudit(db, {
      userId: ctx.openid, action: 'news.sources.seed', target: 'news_sources',
      detail: JSON.stringify({ count: DEFAULT_SOURCES.length }), time: new Date()
    });
    return OK({ seeded: true, count: DEFAULT_SOURCES.length });
  }
  return OK({ seeded: false });
}

/** 指纹计算（标题 + 来源标识 + URL） */
function makeFingerprint(sourceId, title, url) {
  const str = `${sourceId}|${title.trim()}|${url.trim()}`;
  return crypto.createHash('md5').update(str).digest('hex');
}

/** 模拟 HTTP 请求（真实环境：调用云函数 http 或云开发 HTTP 客户端；测试占位）
 * 注意：标题/URL 基于固定池生成以保证同源两次拉取可去重（确定性指纹）。 */
const MOCK_TITLES = [
  '赵州桥文物保护修缮工程启动',
  '梨乡文化节即将开幕',
  '秋季农技培训走进田间',
  '县域非遗名录新增三项',
  '郝氏家族年度祭祖活动举行',
  '本地优质农产品产销对接会召开'
];

async function fetchJson(url) {
  // TODO: 真实环境替换为 wx.cloud.callFunction({name:'http',data:{url}})
  // 测试阶段返回模拟数据
  const now = new Date();
  const count = MOCK_TITLES.length;
  return {
    articles: MOCK_TITLES.map((title, i) => ({
      id: `${url.split('/').pop()}-${i}`,
      title,
      summary: `[模拟摘要] ${title}：本条为测试源生成的演示内容，正文请点击来源外链查看。`,
      url: `${url}?id=${i}`,
      publish_time: new Date(now.getTime() - i * 60000).toISOString(),
      categories: ['本地', '文化']
    })),
    total: count,
    time: now.toISOString()
  };
}

/** 归一化单篇文章为 news_items 文档 */
function normalizeItem(source, article) {
  const now = new Date(article.publish_time || Date.now());
  return {
    sourceId: source.name.toLowerCase().replace(/\s+/g, '_'),
    sourceName: source.name,
    title: article.title || '',
    summary: article.summary || '',
    url: article.url || '',
    coverUrl: article.cover || '',
    tags: article.categories || [],
    publishAt: now,
    fetchedAt: new Date(),
    status: 'PUBLISHED',
    hotScore: 0 // 后续更新
  };
}

/** 拉取动作：从指定源获取增量（用于定时触发器或手动触发） */
async function fetchFromSource(ctx, userId, { sourceId }) {
  const db = wx.getDatabase();
  // 权限校验：管理员可刷新任何源；成员仅限查看列表
  if (!hasRole(ctx.role, 'CHIEF')) {
    if (ctx.role !== 'MEMBER' && ctx.role !== 'HISTORIAN') return FORBIDDEN('无权限刷新数据源');
  }
  // 确认源存在
  const srcRes = await db.collection('news_sources').where({ _id: sourceId }).limit(1).get();
  if (!srcRes.data?.length) return BAD_REQUEST('数据源不存在');
  const source = srcRes.data[0];
  if (source.status !== 'ACTIVE') return BAD_REQUEST('该数据源当前不可用');

  try {
    // 模拟 HTTP 拉取
    const res = await fetchJson(source.baseUrl);
    const items = res.articles || [];
    const normalized = items.map(a => normalizeItem(source, a));

    // 逐条去重插入
    const inserted = [];
    for (const item of normalized) {
      const fp = makeFingerprint(source._id, item.title, item.url);
      const dup = await db.collection('news_items').where({ fingerprint: fp }).limit(1).get();
      if (dup.data.length) continue; // 跳过重复
      const newItem = { ...item, _id: `item-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, fingerprint: fp };
      await db.collection('news_items').add(newItem);
      inserted.push(item.title);
    }
    // 更新源的最后拉取状态
    await db.collection('news_sources').doc(sourceId).update({
      data: { lastFetchAt: new Date().toISOString(), lastFetchStatus: inserted.length ? 'OK' : 'EMPTY', updatedAt: new Date() }
    });
    await writeAudit(db, {
      userId: ctx.openid, action: 'news.fetch', target: sourceId,
      detail: JSON.stringify({ pulled: inserted.length, total: normalized.length }), time: new Date()
    });
    return OK({ pulled: inserted.length, items: inserted.slice(0, 5) });
  } catch (e) {
    await db.collection('news_sources').doc(sourceId).update({
      data: { lastFetchStatus: 'FAILED', lastFetchError: e.message, updatedAt: new Date() }
    });
    return BAD_REQUEST(`拉取失败：${e.message}`);
  }
}

/** 全量拉取（所有可用源顺序执行，用于定时触发器） */
async function cronPull(ctx) {
  const db = wx.getDatabase();
  const activeSrcs = await db.collection('news_sources').where({ status: 'ACTIVE' }).get();
  let totalInserted = 0;
  const results = [];
  for (const src of activeSrcs.data || []) {
    const r = await fetchFromSource({ role: ctx.role || 'CHIEF' }, ctx.openid, { sourceId: src._id });
    if (r.success) {
      totalInserted += r.data.pulled;
      results.push({ sourceId: src._id, pulled: r.data.pulled });
    } else {
      results.push({ sourceId: src._id, error: r.message });
    }
  }
  return OK({ totalInserted, results });
}

/** 列出所有数据源 */
async function listSources(ctx) {
  const db = wx.getDatabase();
  const res = await db.collection('news_sources').orderBy('priority', 'asc').limit(20).get();
  return OK({ sources: res.data || [] });
}

/** 分页列出新闻项（F4 将扩展分类/推荐排序；此处为分页骨架） */
async function listItems(ctx, userId, { page = 1, pageSize = 20 }) {
  const db = wx.getDatabase();
  const skip = (Math.max(1, Number(page) || 1) - 1) * pageSize;
  const res = await db.collection('news_items')
    .orderBy('publishAt', 'desc').skip(skip).limit(pageSize).get();
  return OK({ items: res.data || [], page, hasMore: (res.data || []).length === pageSize });
}

/** 搜索新闻（关键词命中 title/summary） */
async function searchItems(ctx, userId, { keyword = '', page = 1, pageSize = 20 }) {
  const db = wx.getDatabase();
  if (!keyword) return BAD_REQUEST('搜索关键词不能为空');
  const skip = (Math.max(1, Number(page) || 1) - 1) * pageSize;
  const kw = String(keyword).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const res = await db.collection('news_items')
    .where({ $or: [{ title: db.RegExp({ regexp: kw, options: 'i' }) }, { summary: db.RegExp({ regexp: kw, options: 'i' }) }] })
    .orderBy('publishAt', 'desc').skip(skip).limit(pageSize).get();
  return OK({ items: res.data || [], page, hasMore: (res.data || []).length === pageSize });
}

/** 收藏添加/删除（openid+newsId 幂等；收藏保留标题/摘要快照便于外链失效后阅读） */
async function favoriteToggle(ctx, userId, action, newsId) {
  const db = wx.getDatabase();
  if (!['add', 'remove'].includes(action)) return BAD_REQUEST('action must be add/remove');
  if (!newsId) return BAD_REQUEST('缺少 newsId');

  const existRes = await db.collection('news_favorites')
    .where({ openid: ctx.openid, newsId }).limit(1).get();
  const exists = (existRes.data || []).length > 0;

  if (action === 'add') {
    if (exists) return OK({ message: '已收藏', favorite: true });
    // 读取条目快照（标题/摘要/来源/外链），防收藏后条目失效
    const itemRes = await db.collection('news_items').where({ _id: newsId }).limit(1).get();
    const item = (itemRes.data || [])[0] || {};
    await db.collection('news_favorites').add({
      openid: ctx.openid, newsId,
      snapshot: {
        title: item.title || '', summary: item.summary || '',
        sourceName: item.sourceName || '', url: item.url || '', publishAt: item.publishAt || null
      },
      offline: false,
      createdAt: new Date()
    });
    await writeAudit(db, {
      userId: ctx.openid, action: 'news.favorite.add', target: newsId,
      detail: JSON.stringify({ title: item.title }), time: new Date()
    });
    return OK({ message: '收藏成功', favorite: true });
  }
  if (exists) {
    await db.collection('news_favorites').doc(existRes.data[0]._id).remove();
  }
  await writeAudit(db, {
    userId: ctx.openid, action: 'news.favorite.remove', target: newsId,
    detail: '{}', time: new Date()
  });
  return OK({ message: '已取消收藏', favorite: false });
}

/* ─── 统一分派器（对齐既有约定：exports.main） ─── */
module.exports = { main: async (params = {}, context = {}) => {
  const userId = params.userId || context.openid;
  const ctx = {
    OPENID: context.OPENID || context.openid,
    openid: context.openid,
    role: context.role || 'VISITOR'
  };

  const { action } = params;
  switch (action) {
    case 'ensureSources': return await ensureSources(ctx);
    case 'fetchFromSource': return await fetchFromSource(ctx, userId, params);
    case 'cronPull': return await cronPull(ctx);
    case 'listSources': return await listSources(ctx);
    case 'listItems': return await listItems(ctx, userId, params);
    case 'searchItems': return await searchItems(ctx, userId, params);
    case 'favoriteAdd': return await favoriteToggle(ctx, userId, 'add', params.newsId);
    case 'favoriteRemove': return await favoriteToggle(ctx, userId, 'remove', params.newsId);
    default:
      return BAD_REQUEST(`未知 action: ${action}`);
  }
}};
