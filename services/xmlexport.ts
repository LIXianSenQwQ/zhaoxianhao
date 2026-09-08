/**
 * services/xmlexport.ts — XML/RDF 语义网导出服务封装（R33 P3）
 */
import { call } from './request';

/**
 * exportXML: GEDCOM-X XML 导出（FamilySearch 兼容）
 * @param {string} branchId - 分支编码
 * @param {number} maxRecords - 最大记录数
 * @returns { xmlString, recordCount, byteSize }
 */
export function exportXML(branchId, maxRecords = 5000) {
  if (!branchId) return Promise.reject(new Error('branchId required'));
  return call('xml-export', { action: 'exportXML', branchId, maxRecords }, undefined, 120000);
}

/**
 * exportRDF: RDF 语义网导出（FOAF 本体）
 * @param {string} branchId - 分支编码
 * @param {string} format - turtle | rdfxml | ntriples
 * @returns { content, recordCount, byteSize }
 */
export function exportRDF(branchId, format = 'turtle') {
  if (!branchId) return Promise.reject(new Error('branchId required'));
  if (!['turtle', 'rdfxml', 'ntriples'].includes(format)) {
    return Promise.reject(new Error('format must be turtle|rdfxml|ntriples'));
  }
  return call('xml-export', { action: 'exportRDF', branchId, format }, undefined, 120000);
}
