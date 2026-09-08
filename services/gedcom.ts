/**
 * services/gedcom.ts — GEDCOM 导入导出服务封装（R30）
 */
import { call, read } from './request';

/** 导出当前分支的 GEDCOM 5.5.1/7.0 */
export function exportGedCom(branchId) {
  return call(
    'gedcom',
    { action: 'export', branchId }, { timeout: 60000 });
}

/** 预览 GEDCOM 文件内容（仅读取） */
export function previewGedCom(content) {
  return read(
    'gedcom',
    { action: 'import', content },
    'gedcom_preview',
    30000
  );
}

/** 提交导入，进入审核流程 */
export function commitImport({ memberDataArray, reviewerOpenids }) {
  return call(
    'gedcom',
    { action: 'commitImport', memberDataArray, reviewerOpenids }, { timeout: 120000 });
}
