/**
 * services/migration.ts — 分支迁徙管理（R31）
 */
import { call } from './request';

/**
 * migrate: 提交迁徙申请（房长权限）
 * @param fromCode - 源分支编码
 * @param toCode - 目标分支编码
 * @param reason - 迁徙原因说明
 * @param date - 迁徙日期（ISO 或中文）
 * @returns { _id, status: 'PENDING' }
 */
export function submitMigrate({ fromCode, toCode, reason = '', date }) {
  return call(
    'branch',
    { action: 'migrate', fromCode, toCode, reason, date }, { timeout: 60000 });
}

/**
 * listMigrations: 获取迁徙轨迹时间线
 * @param code - 可选：指定分支编码；否则返回所有
 * @param limit - 最多条数，默认 50
 * @returns { items: MigrationRecord[], total: number }
 */
export function listMigrations({ code, limit = 50 } = {}) {
  return call(
    'branch',
    { action: 'migrate.list', code, limit }, { timeout: 30000 });
}

/**
 * approveMigrate: 审批迁徙（族史委权限）
 * @param migrateId - 迁徙记录 ID
 * @param status - APPROVED/REJECTED
 * @param comment - 审批意见
 * @returns { success, status }
 */
export function approveMigrate({ migrateId, status, comment = '' }) {
  if (!['APPROVED', 'REJECTED'].includes(status)) {
    throw new Error('status 必须为 APPROVED 或 REJECTED');
  }
  return call(
    'branch',
    { action: 'migrate.updateStatus', migrateId, status, comment }, { timeout: 60000 });
}
