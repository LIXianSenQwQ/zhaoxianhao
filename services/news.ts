/**
 * services/news.ts — 新闻资讯服务封装（蓝图 V2.0 §28 合规外链版）
 * 对应云函数 news（真实 actions：recommend.get / listItems / searchItems /
 *   favoriteAdd / favoriteRemove / favorite.list / favorite.group.* / favorite.move /
 *   recommend.click / recommend.negative / interest.init / interest.list /
 *   offline.pack / offline.list / offline.remove / offline.cleanup / listSources）
 * 契约：CallResult = { data, fromCache, latencyMs, error? }；data 已解包（body.data ?? body）
 */

import { call, write } from './request';

/** 新闻条目（news_items 实际字段，正文仅外链，合规摘要卡） */
export interface NewsItem {
  _id: string;
  title: string;
  summary?: string;
  sourceName?: string;
  category?: string;
  tags?: string[];
  publishAt?: string;
  url?: string;
  hot?: number;
  status?: string;
}

/** 收藏条目（news_favorites，含快照） */
export interface FavoriteItem {
  _id: string;
  newsId: string;
  groupId?: string | null;
  groupName?: string | null;
  snapshot?: { title: string; summary: string; sourceName: string; url: string; publishAt?: string | null };
  offline?: boolean;
  createdAt?: string;
}

export interface NewsFeedResult {
  items: NewsItem[];
  page: number;
  hasMore: boolean;
  coldStart?: boolean;
  total?: number;
}

export interface FavoriteGroup {
  groupId: string;
  groupName: string;
  count: number;
}

/** 一级分类（蓝本 B.2 十类；与 news 云函数 MOCK 种子 category 对齐） */
export const NEWS_CATEGORIES = [
  '时政要闻', '财经商业', '科技数码', '文化艺术', '娱乐体育',
  '健康生活', '教育升学', '三农乡土', '法治社会', '家族专区'
];

/** 推荐流（F4 三路召回 + 打分；index 页主数据源） */
export function getFeed(page: number = 1, pageSize: number = 20) {
  return call<NewsFeedResult>('news', { action: 'recommend.get', page, pageSize }, {
    cacheKey: `news:feed:${page}:${pageSize}`,
    cacheTTL: 5 * 60 * 1000
  });
}

/** 最新资讯（按 publishAt 倒序；分类浏览/最新 Tab 数据源） */
export function listLatest(page: number = 1, pageSize: number = 20) {
  return call<NewsFeedResult>('news', { action: 'listItems', page, pageSize }, {
    cacheKey: `news:latest:${page}`,
    cacheTTL: 5 * 60 * 1000
  });
}

/** 按一级分类浏览（listItems + category 过滤） */
export function listByCategory(category: string, page: number = 1, pageSize: number = 20) {
  return call<NewsFeedResult>('news', { action: 'listItems', category, page, pageSize }, {
    cacheKey: `news:cat:${category}:${page}`,
    cacheTTL: 5 * 60 * 1000
  });
}

/** 关键词搜索（命中 title/summary） */
export function searchNews(keyword: string, page: number = 1) {
  return call<NewsFeedResult>('news', { action: 'searchItems', keyword, page }, {
    cacheKey: `news:search:${keyword}:${page}`,
    cacheTTL: 60 * 1000
  });
}

/** 点击回流（已读入 meta + 热度 +1）——仅上报，不阻塞 UI */
export function reportClick(newsId: string) {
  return call('news', { action: 'recommend.click', newsId }, { timeout: 2000 });
}

/** 负反馈「不感兴趣」 */
export function reportNegative(newsId: string) {
  return write('news', { action: 'recommend.negative', newsId }, 'news', `neg_${newsId}`);
}

/** 收藏（幂等；groupId 可选） */
export function addFavorite(newsId: string, groupId?: string) {
  return write('news', { action: 'favoriteAdd', newsId, groupId: groupId || null }, 'news', `fav_${newsId}`);
}

/** 取消收藏（幂等） */
export function removeFavorite(newsId: string) {
  return write('news', { action: 'favoriteRemove', newsId }, 'news', `unfav_${newsId}`);
}

/** 我的收藏（按分组过滤；groupId='' 表示未分组，传 null/undefined 则不过滤） */
export function listFavorites(groupId?: string | null, page: number = 1, pageSize: number = 50) {
  const payload: Record<string, any> = { action: 'favorite.list', page, pageSize };
  if (groupId !== undefined) payload.groupId = groupId;
  return call<{ favorites: FavoriteItem[]; page: number; hasMore: boolean }>('news', payload, {
    cacheKey: `news:fav:${groupId ?? 'all'}:${page}`,
    cacheTTL: 30 * 1000
  });
}

/** 收藏分组列表（含各组合计） */
export function listFavoriteGroups() {
  return call<{ groups: FavoriteGroup[]; totalFav: number }>('news', { action: 'favorite.group.list' }, {
    cacheKey: 'news:favgroups',
    cacheTTL: 30 * 1000
  });
}

/** 新建收藏分组（1-20 字） */
export function createFavoriteGroup(groupName: string) {
  return write('news', { action: 'favorite.group.create', groupName }, 'news', `fgc_${Date.now()}`);
}

/** 重命名收藏分组 */
export function renameFavoriteGroup(groupId: string, groupName: string) {
  return write('news', { action: 'favorite.group.rename', groupId, groupName }, 'news', `fgr_${Date.now()}`);
}

/** 删除收藏分组（成员回落未分组） */
export function removeFavoriteGroup(groupId: string) {
  return write('news', { action: 'favorite.group.remove', groupId }, 'news', `fgd_${Date.now()}`);
}

/** 收藏移动到分组 */
export function moveFavorite(newsId: string, groupId: string) {
  return write('news', { action: 'favorite.move', newsId, groupId }, 'news', `fvm_${newsId}`);
}

/** 兴趣冷启动初始化（3-5 个一级分类，幂等） */
export function initInterests(categories: string[]) {
  return write('news', { action: 'interest.init', categories }, 'news', 'interest_init');
}

/** 我的兴趣行（不含 meta） */
export function listInterests() {
  return call<{ interests: Array<{ category: string; weight: number; lastClickedAt?: string }> }>(
    'news', { action: 'interest.list' }, { cacheKey: 'news:interests', cacheTTL: 60 * 1000 });
}

/** 数据源清单（about/来源页） */
export function listSources() {
  return call<{ sources: Array<{ name: string; type: string; categories: string[]; priority: number; status: string }> }>(
    'news', { action: 'listSources' }, { cacheKey: 'news:sources', cacheTTL: 30 * 60 * 1000 });
}

/** 打包离线（收藏夹勾选 → 正文快照缓存） */
export function packOffline(groupId?: string, newsIds: string[] = []) {
  return write('news', { action: 'offline.pack', groupId: groupId || null, newsIds }, 'news', `offline_${Date.now()}`);
}

/** 我的离线条目 */
export function listOffline() {
  return call<{ offline: FavoriteItem[]; count: number }>('news', { action: 'offline.list' }, {
    cacheKey: 'news:offline',
    cacheTTL: 30 * 1000
  });
}

/** 删除某条离线 */
export function removeOffline(newsId: string) {
  return write('news', { action: 'offline.remove', newsId }, 'news', `offrem_${newsId}`);
}

/** 一键清理全部离线 */
export function cleanupOffline() {
  return write('news', { action: 'offline.cleanup' }, 'news', `offclean_${Date.now()}`);
}
