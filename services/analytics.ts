/**
 * services/analytics.ts — 统计分析服务封装（R32）
 */
import { call } from './request';

/**
 * overview: 人口总览（总数/男女比例/在世故世/分支数）
 * @returns { total, male, female, unknownGender, alive, deceased, malePct, generationCount, maxGeneration, branchCount }
 */
export function getOverview() {
  return call('analytics', { action: 'overview' }, undefined, 60000);
}

/**
 * getGenerationDist: 世代分布（柱状图数据 + 字辈字）
 * @returns { dist: GenerationNode[], peakGeneration }
 */
export function getGenerationDist() {
  return call('analytics', { action: 'generationDist' }, undefined, 60000);
}

/**
 * getBranchCompare: 分支对比（各分支人口/世代深度/男女比例）
 * @returns { branches: BranchStats[], totalBranches }
 */
export function getBranchCompare() {
  return call('analytics', { action: 'branchCompare' }, undefined, 90000); // 较长超时，可能需聚合大量数据
}
