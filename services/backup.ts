/**
 * services/backup.ts — JSON 全量备份/恢复（R31）
 */
import { call } from './request';

/**
 * exportJSON: 导出指定集合的 JSON 快照
 * @param collections - 要导出的集合列表 ['members', 'branches', ...]
 * @param userId - 如果指定，只导出该用户相关数据；否则全族
 * @returns JSON 字符串 + manifest
 */
export function exportJSON({ collections = ['members', 'branches', 'relations'], userId }) {
  return call(
    'backup',
    { action: 'exportJSON', collections, userId },
    { timeout: 120000 } // 较长超时
  );
}

/**
 * restoreJSON: 预览 JSON 文件（dryRun=true），返回结构校验结果
 * @param jsonString - JSON 完整内容
 * @param dryRun - true=仅校验不写入；false=提交入库（暂不支持）
 * @returns preview + canCommit
 */
export function restoreJSON({ jsonString, dryRun = true }) {
  return call(
    'backup',
    { action: 'restoreJSON', jsonString, dryRun }, { timeout: 60000 });
}
