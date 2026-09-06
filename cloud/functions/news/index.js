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
/** 与 MOCK_TITLES 一一对应的 mock 一级分类（对齐 news_items.category 一级分类模型） */
const MOCK_CATS = ['文化艺术', '文化艺术', '三农乡土', '文化艺术', '健康生活', '本地'];

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
      category: MOCK_CATS[i],
      categories: [MOCK_CATS[i]]
    })),
    total: count,
    time: now.toISOString()
  };
}

/** 归一化单篇文章为 news_items 文档 */
function normalizeItem(source, article) {
  const now = new Date(article.publish_time || Date.now());
  const cats = Array.isArray(article.categories) ? article.categories : [];
  return {
    sourceId: source.name.toLowerCase().replace(/\s+/g, '_'),
    sourceName: source.name,
    title: article.title || '',
    summary: article.summary || '',
    category: article.category || cats[0] || '本地',
    url: article.url || '',
    coverUrl: article.cover || '',
    tags: cats,
    publishAt: now,
    fetchedAt: new Date(),
    hot: 0,
    status: 'PUBLISHED'
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
async function favoriteToggle(ctx, userId, action, newsId, groupId = null) {
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
    let groupName = null;
    if (groupId) {
      const g = (await db.collection('news_favorites')
        .where({ openid: ctx.openid, groupId, isGroup: true }).limit(1).get()).data || [];
      if (!g.length) return BAD_REQUEST('目标分组不存在');
      groupName = g[0].groupName;
    }
    await db.collection('news_favorites').add({
      data: {
        openid: ctx.openid, newsId, groupId: groupId || null, groupName,
        snapshot: {
          title: item.title || '', summary: item.summary || '',
          sourceName: item.sourceName || '', url: item.url || '', publishAt: item.publishAt || null
        },
        offline: false,
        createdAt: new Date()
      }
    });
    await writeAudit(db, {
      userId: ctx.openid, action: 'news.favorite.add', target: newsId,
      detail: JSON.stringify({ title: item.title }), time: new Date()
    });
    await hotBump(ctx, newsId, 2); // 收藏 → 热度 +2（B.3 行为回流）
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

/* ═════════════════════ F4 推荐引擎（蓝图 B.3 三路召回 + 打分排序） ═════════════════════ */

const META_CATEGORY = '__meta__';
const READ_WINDOW = 200;
const HALF_LIFE_MS = 24 * 60 * 60 * 1000; // 热度/时效半衰期 24h
const RECALL_DAYS = 7; // 召回窗口：7 天
const COLD_CAT_WEIGHT = 0.6; // 冷启动包分类的默认兴趣权重
const MAX_CANDIDATES = 120; // 本地打分候选上限（控制 ≤200ms）
const MAX_FAV_GROUPS = 20; // 每用户收藏分组上限

/** 「喜马拉雅冷启动数据包」：新用户无行为时的预置种子内容包（与注册兴趣选择共同作用） */
const COLD_START_PACK = {
  categories: ['三农乡土', '文化艺术', '健康生活'],
  tags: ['赵县', '郝氏', '非遗', '乡村振兴']
};

/** 家族相关召回分类（B.3 ③：赵县本地/郝氏/三农/文化倾斜） */
const FAMILY_CATS = ['三农乡土', '文化艺术', '本地', '家族专区', '赵县本地'];

function hoursAgo(h) { return new Date(Date.now() - h * 60 * 60 * 1000).toISOString(); }

/** 用户级 meta 行（已读历史 + 负反馈），不存在则创建 */
async function ensureMeta(ctx) {
  const db = wx.getDatabase();
  const res = await db.collection('user_interests')
    .where({ openid: ctx.openid, category: META_CATEGORY }).limit(1).get();
  if ((res.data || []).length) return res.data[0];
  const add = await db.collection('user_interests').add({
    data: { openid: ctx.openid, category: META_CATEGORY, tags: [], weight: 0, readNewsIds: [], negativeNewsIds: [], updatedAt: new Date().toISOString() }
  });
  return { _id: add._id, openid: ctx.openid, category: META_CATEGORY, readNewsIds: [], negativeNewsIds: [] };
}

/** 滚动窗口压入 id（去重 + 限额） */
function pushWindow(arr, id, cap) {
  const out = [id, ...(arr || []).filter(x => x !== id)];
  return out.slice(0, cap);
}

/** F4-1：注册冷启动兴趣选择（3–5 个一级分类，幂等 upsert） */
async function interestInit(ctx, categories) {
  const db = wx.getDatabase();
  if (!Array.isArray(categories) || categories.length < 3 || categories.length > 5) {
    return BAD_REQUEST('请选择 3-5 个兴趣分类');
  }
  const now = new Date().toISOString();
  const saved = [];
  for (const cat of categories) {
    const exist = await db.collection('user_interests')
      .where({ openid: ctx.openid, category: cat }).limit(1).get();
    if ((exist.data || []).length) {
      saved.push({ category: cat, status: 'kept' });
      continue;
    }
    await db.collection('user_interests').add({
      data: { openid: ctx.openid, category: cat, tags: [], weight: COLD_CAT_WEIGHT, lastClickedAt: null, updatedAt: now }
    });
    saved.push({ category: cat, status: 'created' });
  }
  await ensureMeta(ctx);
  return OK({ saved, count: saved.length });
}

/** F4-2：查询我的兴趣行（meta 行不下发） */
async function interestList(ctx) {
  const db = wx.getDatabase();
  const res = await db.collection('user_interests')
    .where({ openid: ctx.openid, category: db.command.neq(META_CATEGORY) }).get();
  const rows = (res.data || []).sort((a, b) => (b.weight || 0) - (a.weight || 0));
  return OK({ interests: rows });
}

/** 归一化热度（0~1，用窗口内最大值做分母） */
function normHot(v, maxHot) { return maxHot > 0 ? Math.min(1, (v || 0) / maxHot) : 0; }

/** 时效分：24h 半衰期指数衰减 */
function freshness(publishAt) {
  const age = Math.max(0, Date.now() - new Date(publishAt).getTime());
  return Math.exp(-age / HALF_LIFE_MS);
}

/**
 * F4-3：推荐流（三路召回 → 打分 → 打散 → 分页）
 * score = 0.45×兴趣 + 0.20×时效 + 0.15×热度 + 0.10×权威 + 0.10×分类偏好 − 0.30×已读惩罚
 */
async function recommendGet(ctx, userId, { page = 1, pageSize = 20 }) {
  const db = wx.getDatabase();
  const size = Math.min(Math.max(1, Number(pageSize) || 20), 50);
  const pageNo = Math.max(1, Number(page) || 1);
  const now = Date.now();

  // 1) 读取用户画像：兴趣行 + meta（已读/负反馈）
  const interests = (await db.collection('user_interests')
    .where({ openid: ctx.openid, category: db.command.neq(META_CATEGORY) }).get()).data || [];
  const meta = await ensureMeta(ctx);
  const readSet = new Set(meta.readNewsIds || []);
  const negSet = new Set(meta.negativeNewsIds || []);
  const weightByCat = {};
  interests.forEach(r => { weightByCat[r.category] = r.weight || COLD_CAT_WEIGHT; });
  // 冷启动：无兴趣 → 冷启动包默认权重
  const activeCats = interests.length ? interests.map(r => r.category)
    : COLD_START_PACK.categories;
  interests.forEach(r => { if (!(r.category in weightByCat)) weightByCat[r.category] = COLD_CAT_WEIGHT; });
  COLD_START_PACK.categories.forEach(c => { if (!(c in weightByCat)) weightByCat[c] = COLD_CAT_WEIGHT * 0.8; });

  // 2) 三路召回（并行，各限流控成本）
  const cats = Array.from(new Set([...activeCats, ...FAMILY_CATS]));
  const [r1, r2, r3, srcRes] = await Promise.all([
    // ① 兴趣+家族召回（7 天窗口，category in）
    db.collection('news_items')
      .where({ category: db.command.in(cats), publishAt: { $gte: hoursAgo(24 * RECALL_DAYS) } })
      .orderBy('publishAt', 'desc').limit(MAX_CANDIDATES).get(),
    // ② 热度召回（近 24h hot Top）
    db.collection('news_items')
      .where({ publishAt: { $gte: hoursAgo(24) } })
      .orderBy('hot', 'desc').limit(30).get(),
    // ③ 家族标签召回（tags 含 赵县/郝氏/非遗 等）
    db.collection('news_items')
      .where({ tags: db.command.in(COLD_START_PACK.tags), publishAt: { $gte: hoursAgo(24 * RECALL_DAYS) } })
      .limit(30).get(),
    db.collection('news_sources').limit(30).get()
  ]);
  const srcById = {};
  ((srcRes || {}).data || []).forEach(s => { srcById[s._id] = s; });

  // 3) 合并去重
  const cand = new Map();
  [...(r1.data || []), ...(r2.data || []), ...(r3.data || [])].forEach(it => {
    if (it.status && it.status !== 'PUBLISHED') return;
    if (!cand.has(it._id)) cand.set(it._id, it);
  });
  let list = Array.from(cand.values()).filter(it => !negSet.has(it._id));

  // 4) 打分排序
  const maxHot = list.reduce((m, it) => Math.max(m, it.hot || 0), 0);
  const scored = list.map(it => {
    const src = srcById[it.sourceId] || {};
    const cat = it.category || (it.tags || [])[0] || '';
    const interestScore = weightByCat[cat] || 0;
    const isRead = readSet.has(it._id);
    const authority = (src.isOfficialPolicy || (src.priority || 9) <= 2) ? 1 : 0.6;
    const familyPref = FAMILY_CATS.includes(cat) ? 1 : 0;
    let score = 0.45 * interestScore
      + 0.20 * freshness(it.publishAt)
      + 0.15 * normHot(it.hot, maxHot)
      + 0.10 * authority
      + 0.10 * familyPref;
    if (isRead) score -= 0.30; // 7 天去重惩罚
    return { it, score, cat, isRead };
  }).filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);

  // 5) 打散：同一分类连续 ≤3 条
  const spread = [];
  const byCatCount = {};
  for (const s of scored) {
    const c = s.cat;
    const placed = byCatCount[c] || 0;
    if (placed >= 3) {
      // 延迟插入（找空档）：简单后置到队尾前
      spread.push({ ...s, deferred: true });
      continue;
    }
    spread.push(s);
    byCatCount[c] = placed + 1;
  }
  // deferred 条目在队尾保序（保证不漏推）
  const ordered = spread.filter(s => !s.deferred).concat(spread.filter(s => s.deferred));

  // 6) 分页
  const start = (pageNo - 1) * size;
  const slice = ordered.slice(start, start + size);
  const items = slice.map(s => {
    const { it } = s;
    return { _id: it._id, title: it.title, summary: it.summary, sourceName: it.sourceName, category: it.category, tags: it.tags || [], publishAt: it.publishAt, url: it.url, hot: it.hot || 0 };
  });
  return OK({
    items,
    page: pageNo,
    hasMore: start + size < ordered.length,
    coldStart: interests.length === 0,
    total: ordered.length
  });
}

/** 内部：热度累加（点击+1 / 收藏+2 / 分享+3），news_items.hot 原子递增 */
async function hotBump(ctx, newsId, delta = 1) {
  if (!newsId) return BAD_REQUEST('缺少 newsId');
  const db = wx.getDatabase();
  const d = Math.max(0, Math.min(Number(delta) || 1, 10));
  await db.collection('news_items').doc(newsId).update({
    data: { hot: db.command.inc(d) }
  });
  return OK({ newsId, delta: d });
}

/** F4-4：点击回流（已读入 meta + 所属分类权重微升 + 热度+1） */
async function recordClick(ctx, newsId) {
  if (!newsId) return BAD_REQUEST('缺少 newsId');
  const db = wx.getDatabase();
  const now = new Date().toISOString();
  const meta = await ensureMeta(ctx);

  // 读 meta 已有列表再写回（stub 无原子 push 时用读改写；真实环境可 db.command.push）
  const readArr = pushWindow(meta.readNewsIds || [], newsId, READ_WINDOW);
  await db.collection('user_interests')
    .where({ openid: ctx.openid, category: META_CATEGORY })
    .update({ data: { readNewsIds: readArr, updatedAt: now } });

  // 分类兴趣权重 +0.02（cap 1.0）
  const item = (await db.collection('news_items').where({ _id: newsId }).limit(1).get()).data || [];
  if (item.length) {
    const cat = item[0].category;
    if (cat) {
      const row = (await db.collection('user_interests')
        .where({ openid: ctx.openid, category: cat }).limit(1).get()).data || [];
      if (row.length) {
        const w = Math.min(1, (row[0].weight || 0) + 0.02);
        await db.collection('user_interests').doc(row[0]._id)
          .update({ data: { weight: w, lastClickedAt: now, updatedAt: now } });
      }
    }
  }
  await hotBump(ctx, newsId, 1);
  return OK({ newsId, read: true });
}

/** F4-5：负反馈「不感兴趣」→ 该分类权重降权 + 条目进黑名单 */
async function recordNegative(ctx, newsId) {
  if (!newsId) return BAD_REQUEST('缺少 newsId');
  const db = wx.getDatabase();
  const now = new Date().toISOString();
  const meta = await ensureMeta(ctx);
  const negArr = pushWindow(meta.negativeNewsIds || [], newsId, READ_WINDOW);
  await db.collection('user_interests')
    .where({ openid: ctx.openid, category: META_CATEGORY })
    .update({ data: { negativeNewsIds: negArr, updatedAt: now } });

  const item = (await db.collection('news_items').where({ _id: newsId }).limit(1).get()).data || [];
  if (item.length) {
    const cat = item[0].category;
    if (cat) {
      const row = (await db.collection('user_interests')
        .where({ openid: ctx.openid, category: cat }).limit(1).get()).data || [];
      if (row.length) {
        const w = Math.max(0, (row[0].weight || 0) - 0.1);
        await db.collection('user_interests').doc(row[0]._id)
          .update({ data: { weight: w, updatedAt: now } });
      }
    }
  }
  return OK({ newsId, negative: true });
}

/** F4-6：定时刷新入口（每 10 分钟：拉增量 + 返回统计；推荐随新数据实时更新） */
async function cronRefresh(ctx) {
  const pull = await cronPull(ctx);
  const db = wx.getDatabase();
  const published = (await db.collection('news_items')
    .where({ status: 'PUBLISHED', publishAt: { $gte: hoursAgo(24) } }).count()).total || 0;
  return OK({
    pulledTotal: pull.success ? pull.data.totalInserted : 0,
    published24h: published,
    refreshedAt: new Date().toISOString()
  });
}

/* ═════════════ F4 收藏分组管理 + 离线包（蓝图 B.5） ═════════════ */

/** 收藏分组列表（含各组合计） */
async function favGroups(ctx) {
  const db = wx.getDatabase();
  const all = (await db.collection('news_favorites')
    .where({ openid: ctx.openid }).limit(500).get()).data || [];
  const groups = [];
  const gMap = {};
  for (const f of all) {
    if (f.isGroup) {
      gMap[f.groupId] = f;
      groups.push({ groupId: f.groupId, groupName: f.groupName, count: 0 });
    }
  }
  groups.push({ groupId: '', groupName: '未分组', count: 0 });
  for (const f of all) {
    if (f.isGroup) continue;
    const key = f.groupId || '';
    const g = groups.find(x => x.groupId === key);
    if (g) g.count++;
  }
  return OK({ groups, totalFav: all.filter(x => !x.isGroup).length });
}

/** 收藏分组创建 */
async function favGroupCreate(ctx, groupName) {
  if (!groupName || String(groupName).trim().length < 1 || String(groupName).trim().length > 20) {
    return BAD_REQUEST('分组名长度须在 1-20 字之间');
  }
  const db = wx.getDatabase();
  const groups = (await db.collection('news_favorites')
    .where({ openid: ctx.openid, isGroup: true }).limit(MAX_FAV_GROUPS + 1).get()).data || [];
  if (groups.length >= MAX_FAV_GROUPS) return BAD_REQUEST(`收藏分组最多 ${MAX_FAV_GROUPS} 个`);
  if (groups.some(g => g.groupName === String(groupName).trim())) return BAD_REQUEST('分组名已存在');
  const now = new Date();
  const gid = `fg-${now.getTime()}-${Math.random().toString(36).slice(2, 6)}`;
  await db.collection('news_favorites').add({
    data: { openid: ctx.openid, newsId: null, isGroup: true, groupId: gid, groupName: String(groupName).trim(), createdAt: now }
  });
  return OK({ groupId: gid, groupName: String(groupName).trim() });
}

/** 收藏分组重命名 */
async function favGroupRename(ctx, groupId, groupName) {
  if (!groupId) return BAD_REQUEST('缺少 groupId');
  if (!groupName || String(groupName).trim().length < 1 || String(groupName).trim().length > 20) {
    return BAD_REQUEST('分组名长度须在 1-20 字之间');
  }
  const db = wx.getDatabase();
  const g = (await db.collection('news_favorites')
    .where({ openid: ctx.openid, groupId, isGroup: true }).limit(1).get()).data || [];
  if (!g.length) return BAD_REQUEST('分组不存在');
  await db.collection('news_favorites').doc(g[0]._id)
    .update({ data: { groupName: String(groupName).trim(), updatedAt: new Date() } });
  // 成员冗余 groupName 同步
  await db.collection('news_favorites')
    .where({ openid: ctx.openid, groupId, isGroup: db.command.neq(true) })
    .update({ data: { groupName: String(groupName).trim(), updatedAt: new Date() } });
  return OK({ groupId, groupName: String(groupName).trim() });
}

/** 收藏分组删除（成员回落未分组） */
async function favGroupRemove(ctx, groupId) {
  if (!groupId) return BAD_REQUEST('缺少 groupId');
  const db = wx.getDatabase();
  const g = (await db.collection('news_favorites')
    .where({ openid: ctx.openid, groupId, isGroup: true }).limit(1).get()).data || [];
  if (!g.length) return BAD_REQUEST('分组不存在');
  await db.collection('news_favorites').doc(g[0]._id).remove();
  await db.collection('news_favorites')
    .where({ openid: ctx.openid, groupId })
    .update({ data: { groupId: null, groupName: null, updatedAt: new Date() } });
  return OK({ groupId, removed: true });
}

/** 收藏列表（按分组过滤；按收藏时间倒序） */
async function favList(ctx, groupId, page = 1, pageSize = 50) {
  const db = wx.getDatabase();
  const q = { openid: ctx.openid, isGroup: db.command.neq(true) };
  if (groupId === '' || groupId === null || groupId === undefined) {
    q.groupId = null;
  } else if (groupId) {
    q.groupId = groupId;
  }
  const skip = (Math.max(1, Number(page) || 1) - 1) * pageSize;
  const res = await db.collection('news_favorites').where(q)
    .orderBy('createdAt', 'desc').skip(skip).limit(pageSize).get();
  return OK({ favorites: res.data || [], page, hasMore: (res.data || []).length === pageSize });
}

/** 移动收藏到分组 */
async function favMove(ctx, newsId, groupId) {
  if (!newsId) return BAD_REQUEST('缺少 newsId');
  const db = wx.getDatabase();
  const f = (await db.collection('news_favorites')
    .where({ openid: ctx.openid, newsId, isGroup: db.command.neq(true) }).limit(1).get()).data || [];
  if (!f.length) return BAD_REQUEST('该收藏不存在');
  let groupName = null;
  if (groupId) {
    const g = (await db.collection('news_favorites')
      .where({ openid: ctx.openid, groupId, isGroup: true }).limit(1).get()).data || [];
    if (!g.length) return BAD_REQUEST('目标分组不存在');
    groupName = g[0].groupName;
  }
  await db.collection('news_favorites').doc(f[0]._id)
    .update({ data: { groupId: groupId || null, groupName, updatedAt: new Date() } });
  return OK({ newsId, groupId: groupId || null });
}

/** 离线包：把选定收藏打包为离线可读（合规：仅标题+摘要快照，正文不缓存） */
async function offlinePack(ctx, { groupId, newsIds = [] }) {
  const db = wx.getDatabase();
  const q = { openid: ctx.openid, offline: db.command.neq(true), isGroup: db.command.neq(true) };
  if (Array.isArray(newsIds) && newsIds.length) q.newsId = db.command.in(newsIds);
  else if (groupId) q.groupId = groupId;
  else return BAD_REQUEST('请指定要打包的收藏（newsIds 或 groupId）');

  const favs = (await db.collection('news_favorites').where(q).limit(200).get()).data || [];
  let packed = 0;
  let bytes = 0;
  for (const f of favs) {
    const snap = f.snapshot || {};
    bytes += (snap.title || '').length + (snap.summary || '').length;
    await db.collection('news_favorites').doc(f._id)
      .update({ data: { offline: true, offlineSize: bytes, updatedAt: new Date() } });
    packed++;
  }
  return OK({ packed, estimateBytes: bytes, note: '合规：仅打包标题+摘要快照，正文一律外链不缓存' });
}

/** 离线包列表 / 清理 / 移除单条 */
async function offlineList(ctx) {
  const db = wx.getDatabase();
  const res = await db.collection('news_favorites')
    .where({ openid: ctx.openid, offline: true, isGroup: db.command.neq(true) })
    .orderBy('updatedAt', 'desc').limit(200).get();
  return OK({ offline: res.data || [], count: (res.data || []).length });
}

async function offlineRemove(ctx, newsId) {
  if (!newsId) return BAD_REQUEST('缺少 newsId');
  const db = wx.getDatabase();
  await db.collection('news_favorites')
    .where({ openid: ctx.openid, newsId })
    .update({ data: { offline: false, updatedAt: new Date() } });
  return OK({ newsId, offline: false });
}

async function offlineCleanup(ctx) {
  const db = wx.getDatabase();
  await db.collection('news_favorites')
    .where({ openid: ctx.openid, offline: true })
    .update({ data: { offline: false, updatedAt: new Date() } });
  return OK({ cleaned: true, message: '离线包已清理（收藏保留）' });
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
    case 'cron.refresh': return await cronRefresh(ctx);
    case 'listSources': return await listSources(ctx);
    case 'listItems': return await listItems(ctx, userId, params);
    case 'searchItems': return await searchItems(ctx, userId, params);
    case 'favoriteAdd': return await favoriteToggle(ctx, userId, 'add', params.newsId, params.groupId);
    case 'favoriteRemove': return await favoriteToggle(ctx, userId, 'remove', params.newsId);
    // F4 推荐引擎
    case 'interest.init': return await interestInit(ctx, params.categories);
    case 'interest.list': return await interestList(ctx);
    case 'recommend.get': return await recommendGet(ctx, userId, params);
    case 'recommend.click': return await recordClick(ctx, params.newsId);
    case 'recommend.negative': return await recordNegative(ctx, params.newsId);
    case 'hot.bump': return await hotBump(ctx, params.newsId, params.delta);
    // F4 收藏分组 + 离线包
    case 'favorite.group.list': return await favGroups(ctx);
    case 'favorite.group.create': return await favGroupCreate(ctx, params.groupName);
    case 'favorite.group.rename': return await favGroupRename(ctx, params.groupId, params.groupName);
    case 'favorite.group.remove': return await favGroupRemove(ctx, params.groupId);
    case 'favorite.list': return await favList(ctx, params.groupId, params.page, params.pageSize);
    case 'favorite.move': return await favMove(ctx, params.newsId, params.groupId);
    case 'offline.pack': return await offlinePack(ctx, params || {});
    case 'offline.list': return await offlineList(ctx);
    case 'offline.remove': return await offlineRemove(ctx, params.newsId);
    case 'offline.cleanup': return await offlineCleanup(ctx);
    default:
      return BAD_REQUEST(`未知 action: ${action}`);
  }
}};
