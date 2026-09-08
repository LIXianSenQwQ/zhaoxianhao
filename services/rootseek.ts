/**
 * services/rootseek.ts — 寻根问祖服务封装（R32）
 */
import { call } from './request';

/**
 * searchKin: 同宗查询（关键词/世代/地域多维匹配）
 * @param {object} params - { keyword?, generation?, region?, limit? }
 * @returns { hits: KinHit[], total, page }
 */
export function searchKin({ keyword, generation, region, limit = 50 } = {}) {
  if (!keyword && generation === undefined && !region) {
    return Promise.reject(new Error('keyword/generation/region 至少其一'));
  }
  return call('rootseek', { action: 'searchKin', keyword, generation, region, limit }, { timeout: 30000 });
}

/**
 * traceAncestry: 分支溯源（物化路径向上追溯到总谱始祖）
 * @param {string} memberId - 成员 ID
 * @returns { currentMember, ancestryChain: AncestorNode[], directAncestorCount }
 */
export function traceAncestry(memberId) {
  if (!memberId) return Promise.reject(new Error('memberId required'));
  return call('rootseek', { action: 'traceAncestry', memberId }, { timeout: 30000 });
}

/**
 * linkDna: DNA 数据登记（EDITOR+，占位接口）
 * @param {object} params - { subjectId, testType?, marker?, result?, sourceTags? }
 */
export function linkDna({ subjectId, testType = 'Y-DNA', marker = '', result = '', sourceTags = [] } = {}) {
  if (!subjectId) return Promise.reject(new Error('subjectId required'));
  return call('rootseek', { action: 'dna.link', subjectId, testType, marker, result, sourceTags }, { timeout: 30000 });
}
