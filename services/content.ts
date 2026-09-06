/**
 * services/content.ts — V2.0 个人本地内容服务封装
 * 
 * 模块一（二十七章）：本地内容管理
 *   · 三级分类（主/子/标签）
 *   · 权限（PRIVATE/GROUP/PUBLIC，敏感分类强制 PRIVATE）
 *   · 组合搜索（关键词+日期+分类）
 */
import { call, write } from './request';

export type ContentType = 'article' | 'story' | 'photo' | 'video' | 'record';
export type Visibility = 'PRIVATE' | 'GROUP' | 'PUBLIC';
export type CategoryType = 'MAIN' | 'SUB' | 'TAG';

/** 保存本地内容（含三级分类与权限） */
export function saveContent(params: {
  type: ContentType;
  title: string;
  content: string;
  mainCategory?: string;
  subCategory?: string;
  tags?: string[];
  visibility?: Visibility;
  mediaIds?: string[];
  status?: 'DRAFT' | 'PUBLISHED';
}) {
  return write('content', { action: 'content.save', ...params }, 'content', `content_${Date.now()}`);
}

/** 组合搜索（关键词/日期/分类） */
export function searchContent(params: {
  keyword?: string;
  mainCategory?: string;
  subCategory?: string;
  type?: ContentType;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}) {
  return call('content', { action: 'content.search', ...params }, undefined);
}

/** 本人内容列表 */
export function listMine(page = 1) {
  return call('content', { action: 'content.search', page, pageSize: 20 }, `content:mine:${page}`, 30000);
}

// ═══════════ 三级分类管理 ═══════════
/** 新增分类（主/子/标签） */
export function saveCategory(params: {
  name: string;
  type: CategoryType;
  parentId?: string;
}) {
  return write('content', { action: 'category.save', ...params }, 'category', `cat_${Date.now()}`);
}

/** 获取我的全部分类树 */
export function listCategories() {
  return call('content', { action: 'category.list' }, 'content:cats', 60000);
}