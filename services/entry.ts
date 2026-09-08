/**
 * services/entry.ts — 入谱工单统一封装（框架 §4.5 / §7.6）
 * 对应云函数：entry（R31 公示期 / R34 branchScope / R35 entryKind 四类语义）
 *
 * actions:
 *   submit        MEMBER+   —— 提交入谱工单（type=MANUAL/OCR/EXCEL 渠道 + entryKind 场景语义）
 *   mySubmissions MEMBER+   —— 我的工单列表
 *   pendingList   EDITOR+   —— 待审工单（canFirstPass/canSecondPass/canPublicityPass）
 *   audit         EDITOR+   —— 审核（FIRST_PASS/SECOND_PASS/PUBLICITY_PASS/REJECT）
 *
 * entryKind（框架 §4.5 六类入谱；迁出走 branch.migrate）：
 *   NEWBORN      新生儿入谱（必审：双人审核→公示→生效）
 *   MIGRATION_IN 迁入入谱（需 sourceBranchCode + proofSourceTag）
 *   ADOPTION     过继入谱（需 proofSourceTag）
 *   RETURN       归宗入谱（需 proofSourceTag）
 */
import { call, read, write } from './request';

export type EntryKind = 'NEWBORN' | 'MIGRATION_IN' | 'ADOPTION' | 'RETURN';

export const ENTRY_KIND_LABELS: Record<EntryKind, string> = {
  NEWBORN: '新生儿入谱',
  MIGRATION_IN: '迁入入谱',
  ADOPTION: '过继入谱',
  RETURN: '归宗入谱'
};

/** 提交入谱工单载荷（与 cloud/functions/entry/index.js::validatePayload 对齐） */
export interface EntrySubmitPayload {
  branchId: string;            // 支谱编码（HAO-…）
  name: string;                // 本名（谱名 = 郝 + 字辈 + name，后端自动拼）
  generation: number;          // 世代数（≥1）
  gender?: 'MALE' | 'FEMALE' | 'UNKNOWN';
  birthDate?: string;          // ISO YYYY-MM-DD
  deathDate?: string;
  birthPlace?: string;
  fatherId?: string;           // 已入库父代（挂接校验用）
  motherId?: string;
  note?: string;
  entryKind?: EntryKind;       // 缺省 NEWBORN
  // ─── 证明材料（按 entryKind 强制） ───
  sourceBranchCode?: string;   // MIGRATION_IN 必填：原分支编码
  proofSourceTag?: string;     // 证明来源标注（方志/碑刻/口述…）
  // ─── 证据链（框架 §3.2 元数据规范） ───
  sourceTags?: string[];       // 来源标注数组（≤20）
  confidence?: number;         // 置信度 1-5
  ocrFileId?: string;          // OCR 渠道：老谱照片 fileID
  ocrConfidence?: number;      // OCR 识别置信度（0-1）
}

/** 提交入谱工单（写操作，幂等键由 request 层注入） */
export function submitEntry(payload: EntrySubmitPayload, type: 'MANUAL' | 'OCR' | 'EXCEL' = 'MANUAL') {
  return write('entry', { action: 'submit', type, payload }, 'entry.submit',
    `${payload.branchId}:${payload.generation}:${payload.name}`);
}

/** 我的工单列表 */
export function mySubmissions() {
  return read('entry', { action: 'mySubmissions' }, 'entry_mine', 30 * 1000);
}

/** 待审工单（EDITOR+） */
export function pendingList(status = 'SUBMITTED', page = 1) {
  return call('entry', { action: 'pendingList', status, page }, { timeout: 30 * 1000 });
}

/** 审核工单（BRANCH_HEAD+；branchScope 校验；字段与云函数 auditEntry 契约对齐） */
export function auditEntry(recordId: string, auditAction: 'FIRST_PASS' | 'SECOND_PASS' | 'PUBLICITY_PASS' | 'REJECT', comment?: string) {
  return write('entry', { action: 'audit', recordId, auditAction, comment }, 'entry.audit', `${recordId}:${auditAction}`);
}

/** OCR：老谱照片 → 结构化字段（占位引擎，字段需人工校对后提交） */
export function detectFromPhoto(fileId: string) {
  return call('photo_ocr', { action: 'detectBranchFromPhoto', fileId }, { timeout: 30 * 1000 });
}
