/**
 * services/pdfgen.ts — PDF 谱书导出服务封装（R33 P3）
 */
import { call } from './request';

/**
 * generateBook: 生成整支族谱 PDF
 * @param {string} branchId - 分支编码
 * @param {string} format - 布局格式：fan（扇形）/ lineage（世系）/ table（表格）
 * @returns { success, jobId, estimate: { totalMembers, totalPages, fileSizeKB } }
 */
export function generateBook(branchId, format = 'fan') {
  if (!branchId) return Promise.reject(new Error('branchId required'));
  return call('pdf-gen', { action: 'generateBook', branchId, format }, undefined, 120000);
}

/**
 * previewConfig: PDF 预览配置
 * @param {string} branchId
 * @returns { pageSizes, scales, paperOrientation }
 */
export function previewConfig(branchId, scale = 1) {
  if (!branchId) return Promise.reject(new Error('branchId required'));
  return call('pdf-gen', { action: 'previewConfig', branchId, scale }, undefined, 30000);
}

/**
 * exportSvgTree: 导出 SVG 树图（矢量）
 * @param {string} branchId
 * @param {number} maxDepth - 最大世代深度
 * @returns { viewBox, membersCount, depth }
 */
export function exportSvgTree(branchId, maxDepth = 4) {
  if (!branchId) return Promise.reject(new Error('branchId required'));
  return call('pdf-gen', { action: 'exportSvgTree', branchId, maxDepth }, undefined, 60000);
}
