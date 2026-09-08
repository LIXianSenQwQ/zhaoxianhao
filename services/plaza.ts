/**
 * services/plaza.ts — 广场动态 服务封装
 * 云函数：plaza（list/publish/like）
 */
import { call, write, read } from './request';

/** 广场动态列表 */
export function list(page = 1, pageSize = 20) {
  return read('plaza', { action: 'list', page, pageSize }, `plaza_list_${page}`, 30000);
}

/** 发布广场动态（需要 content 和 visibility） */
export function publish(content: string, attachments?: string[], visibility = 'PUBLIC') {
  return write('plaza', { action: 'publish', content, attachments, visibility }, 'plaza', `pub_${Date.now()}`);
}

/** 点赞/取消点赞 */
export function like(postId: string) {
  return call('plaza', { action: 'like', postId }, undefined);
}