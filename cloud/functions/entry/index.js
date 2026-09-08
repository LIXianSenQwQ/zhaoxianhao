/**
 * cloud/functions/entry/index.js
 * 智能入谱审核工作流（OCR + Excel + Manual）
 * 双人审核链 + 公示期 + 自动挂接
 * Sprint R3 完整化：
 *   - 修复 importExcel 引用未定义函数导致的 ReferenceError
 *   - 统一响应格式 + 权限门禁 + 幂等提交
 *   - 双人审核：复审人 ≠ 初审人 ≠ 提交人（对齐族内双人审核文化 W2 口径）
 *   - finalize 真实入库：common/linkage 挂接校验 + 世代互指 + path 写入
 */
const wx = require('wx-server-sdk');
const { OK, BAD_REQUEST, FORBIDDEN, NOT_FOUND } = require('./common/response');
const { hasRole } = require('./common/roles');
const branchScope = require('./common/branch-scope'); // R34(B6): branchScope RBAC - debug import first
const { scopeOf, assertScope, isGlobalRole, requiresScopeCheck } = branchScope || {}; // safe destructuring
const { idempotencyKey } = require('./common/idempotency');
const { writeAudit } = require('./common/audit');
const { finalizePatch } = require('./common/linkage');

wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

const LIST_LIMIT = 50;
/** §7.6：默认不公示（0 天 = SECOND_PASS 直 APPROVED，MVP 兼容）；settings.publicityDays 配置启用 */
const DEFAULT_PUBLICITY_DAYS = 0;

async function main(event, context) {
  const db = wx.getDatabase();
  const { action } = event;

  // §7.6：定时扫描入口（config.json timer 触发），无需用户鉴权
  if (action === 'publicityScan') return await publicityScan(db);

  const openid = context.OPENID || context.openid;
  if (!openid) return FORBIDDEN('请先登录');

  switch (action) {
    case 'submit':
      return await submitEntry(db, openid, event.type, event.payload);
    case 'audit':
      return await auditEntry(db, openid, event);
    case 'importExcel':
      return await importRows(db, openid, event.payload);
    case 'mySubmissions':
      return await mySubmissions(db, openid);
    case 'pendingList':
      return await pendingList(db, openid);
    default:
      return BAD_REQUEST(`unknown action: ${action}`);
  }
}

/** 请求者角色（一次查齐） */
async function roleOf(db, openid) {
  const res = await db.collection('users').where({ openid }).limit(1).get();
  return (res.data[0] && res.data[0].role) || 'VISITOR';
}

/**
 * §7.6：公示天数 —— settings.publicityDays 可配（未配置/0 = 直 APPROVED），默认回退 0 向后兼容 MVP
 */
async function publicityDays(db) {
  try {
    const res = await db.collection('settings').where({ key: 'publicityDays' }).limit(1).get();
    const raw = res.data && res.data[0] && res.data[0].value;
    let n = NaN;
    if (raw !== null && raw !== undefined && typeof raw === 'object') n = Number(raw.days);
    if (Number.isNaN(n)) n = Number(raw);
    if (Number.isInteger(n) && n >= 0 && n <= 30) return n;
  } catch (e) { console.warn('[entry] publicityDays read failed:', e.message); }
  return DEFAULT_PUBLICITY_DAYS;
}

/** 校验必填 + 生成谱名（generations 集合字辈字） */
function validatePayload(p) {
  const reasons = [];
  if (!p || !p.name || !String(p.name).trim()) reasons.push('缺本名');
  if (!p || !Number.isInteger(Number(p.generation)) || Number(p.generation) < 1) reasons.push('缺世代数或非法');
  if (!p || !p.branchId) reasons.push('缺房支');
  return reasons;
}

/**
 * 框架§4.5 入谱类型（V2.0 R35 对齐）：录入渠道 type(OCR/EXCEL/MANUAL) 之外的场景语义。
 * NEWBORN=新生儿入谱；MIGRATION_IN=迁入（需原分支编码+原分支证明来源标注）；
 * ADOPTION=过继/收养（需证明来源标注）；RETURN=归宗（需证据来源标注）。
 * 证明材料按类型强制；迁出(MIGRATION_OUT)非入谱场景，走 branch.migrate 迁徙记录，此处不受理。
 */
const ENTRY_KINDS = Object.freeze({
  NEWBORN: { label: '新生儿入谱', requiredProof: [] },
  MIGRATION_IN: { label: '迁入入谱', requiredProof: ['sourceBranchCode', 'proofSourceTag'] },
  ADOPTION: { label: '过继入谱', requiredProof: ['proofSourceTag'] },
  RETURN: { label: '归宗入谱', requiredProof: ['proofSourceTag'] }
});

/** 按 entryKind 校验证明材料（鉴权后调用，缺证明细节仅对已授权者可见） */
function validateEntryKind(payload) {
  const kind = (payload && payload.entryKind) || 'NEWBORN';
  const def = ENTRY_KINDS[kind];
  if (!def) return { ok: false, reason: `entryKind 须为 ${Object.keys(ENTRY_KINDS).join('/')}` };
  const missing = def.requiredProof.filter((f) => !payload[f] || !String(payload[f]).trim());
  if (missing.length) {
    return { ok: false, reason: `${def.label}缺证明材料: ${missing.join(', ')}` };
  }
  return { ok: true, kind, def };
}

/**
 * R31(B3) 移动端审核通知：站内 notifications 直写（与 ceremony.remindScan 同口径）
 * notifyAuditors：新工单/进入公示 → 通知 BRANCH_HEAD+/HISTORIAN+ 审核人（MVP 全量通知，分支过滤待 B6 branchScope 收口）
 */
async function notifyAuditors(db, recordId, message, extra = {}) {
  try {
    const res = await db.collection('users')
      .where({ role: db.command.in(['BRANCH_HEAD', 'EDITOR', 'HISTORIAN', 'CHIEF']) })
      .limit(100).get();
    const now = new Date();
    const seen = new Set();
    for (const u of (res.data || [])) {
      if (!u.openid || seen.has(u.openid)) continue;
      seen.add(u.openid);
      await db.collection('notifications').add({
        data: {
          type: 'audit.pending',
          content: message,
          toUserId: u.openid,
          read: false,
          createdAt: now,
          extra: { recordId, ...extra }
        }
      });
    }
  } catch (e) {
    console.warn('[entry.notifyAuditors] failed:', e.message); // 通知失败不阻断主流程
  }
}

/** notifySubmitter：审核结果 → 通知提交人 */
async function notifySubmitter(db, submitterId, message, extra = {}) {
  if (!submitterId) return;
  try {
    await db.collection('notifications').add({
      data: {
        type: extra.type || 'audit.result',
        content: message,
        toUserId: submitterId,
        read: false,
        createdAt: new Date(),
        extra
      }
    });
  } catch (e) {
    console.warn('[entry.notifySubmitter] failed:', e.message);
  }
}

async function genealogyChar(db, generation, branchId) {
  const res = await db.collection('generations')
    .where({ branchId, generation: Number(generation) })
    .limit(1).get();
  return (res.data[0] && res.data[0].character) || ''; // 字辈表未配置时返回空，谱名退化为 郝+本名
}

/** 提交入谱申请（幂等：同人同代同支同内容 24h 内不重复建单） */
async function submitEntry(db, openid, type, payload) {
  if (!['OCR', 'EXCEL', 'MANUAL'].includes(type)) return BAD_REQUEST('type 须为 OCR/EXCEL/MANUAL');
  const reasons = validatePayload(payload);
  if (reasons.length) return BAD_REQUEST(reasons.join('；'));

  const role = await roleOf(db, openid);
  if (!hasRole(role, 'MEMBER')) return FORBIDDEN('仅认证会员可提交入谱申请');

  // 框架§4.5 入谱类型校验（鉴权后执行：证明材料缺失细节不暴露给未授权者）
  const kindCheck = validateEntryKind(payload);
  if (!kindCheck.ok) return BAD_REQUEST(kindCheck.reason);

  // 幂等：同 key 已有未结单 → 返回既有单
  const key = idempotencyKey({ bizType: 'entry.submit', bizId: `${payload.branchId}:${payload.generation}:${payload.name}`, userId: openid });
  const dup = await db.collection('entry_records').where({ idemKey: key, status: 'SUBMITTED' }).limit(1).get();
  if (dup.data.length) return OK({ recordId: dup.data[0]._id, deduplicated: true });

  const char = await genealogyChar(db, payload.generation, payload.branchId);
  const genealogyName = `郝${char}${payload.name}`;

  // 谱名冲突检测（蓝图 7.7）：与在库谱名查重——命中不阻断（人工复核决策），随单返回统计供审核参考
  let conflictCount = 0;
  try {
    const same = await db.collection('members')
      .where({ genealogyName }).limit(11).get();
    conflictCount = (same.data || []).length;
  } catch (e) {
    console.warn('[entry.submit] genealogyName conflict scan failed:', e.message);
  }

  const addRes = await db.collection('entry_records').add({
    data: {
      idemKey: key,
      type,
      entryKind: kindCheck.kind,
      ocrConfidence: payload.ocrConfidence || null,
      payload: { ...payload, entryKind: kindCheck.kind, genealogyName },
      auditChain: [{ step: 'SUBMITTED', userId: openid, time: new Date() }],
      status: 'SUBMITTED',
      createdAt: new Date(),
      createdBy: openid
    }
  });
  await writeAudit(db, { userId: openid, action: 'entry.submit', target: addRes._id, detail: `${genealogyName}; kind=${kindCheck.kind}` });
  // R31(B3): 新工单 → 通知审核人（BRANCH_HEAD+/HISTORIAN+）
  await notifyAuditors(db, addRes._id, `新的入谱工单待审：${genealogyName}（第 ${payload.generation} 世 · 支:${payload.branchId}）`, { status: 'SUBMITTED' });
  return OK({
    recordId: addRes._id,
    genealogyName,
    conflict: conflictCount > 0,
    conflictCount,
    conflictHint: conflictCount > 0 ? `在库已有 ${conflictCount} 位同谱名成员，请核对字辈/名后由族史委裁决` : ''
  });
}

/**
 * 审核：FIRST_PASS 初审 / SECOND_PASS 复审 / PUBLICITY_PASS 提前结束公示 / REJECT 驳回
 * 双人链：初审、复审、提交 三者两两不同人
 * §7.6 状态机：SUBMITTED→{FIRST_PASS,REJECT}；FIRST_PASS→{SECOND_PASS,REJECT}；
 *   PUBLICITY→{PUBLICITY_PASS,REJECT}；SECOND_PASS 按 publicityDays 分叉
 */
async function auditEntry(db, openid, { recordId, auditAction, comment }) {
  const role = await roleOf(db, openid);
  if (!hasRole(role, 'BRANCH_HEAD')) return FORBIDDEN('仅房长及以上可执行审核');
  if (!recordId || !['FIRST_PASS', 'SECOND_PASS', 'PUBLICITY_PASS', 'REJECT'].includes(auditAction)) {
    return BAD_REQUEST('缺少 recordId 或 auditAction 非法');
  }
  const res = await db.collection('entry_records').doc(recordId).get().catch(() => null);
  const record = res && res.data && !Array.isArray(res.data) ? res.data : (res && res.data && res.data[0]);
  if (!record) return NOT_FOUND('工单不存在');

  // R34(B6) branchScope RBAC：BRANCH_HEAD 仅可审核本支工单（HISTORIAN+ 全域；无 branchCode 时跳过，兼容旧数据）
  if (!hasRole(role, 'HISTORIAN') && ['BRANCH_HEAD'].includes(role)) {
    const targetBranch = (record.payload && record.payload.branchId) || null;
    // 无 branchId → 不强制执行 scope，防止遗留工单无法审核；无 user branchCode → 临时放宽，待 profile.updateBranch
    if (targetBranch) {
      const userDoc = await db.collection('users').where({ openid }).limit(1).get().catch(() => null);
      const userBranch = (userDoc && userDoc.data && userDoc.data[0] && userDoc.data[0].branchCode) || null;
      // 已设 branchCode 则严格匹配；未设则放行为宜（过渡期策略）
      if (userBranch && userBranch !== targetBranch) {
        return FORBIDDEN(`branchScope 拒绝：跨支操作不可用（本支=${userBranch} / 工单支=${targetBranch}）`);
      }
    }
  }

  // §7.6 状态机：仅允许合法迁移（终态不可再操作）
  const legalNext = { SUBMITTED: ['FIRST_PASS', 'REJECT'], FIRST_PASS: ['SECOND_PASS', 'REJECT'], PUBLICITY: ['PUBLICITY_PASS', 'REJECT'] };
  if (!(legalNext[record.status] || []).includes(auditAction)) {
    return BAD_REQUEST(`工单状态 ${record.status} 不可执行 ${auditAction}`);
  }

  // 细门禁：复审/提前结束公示须 HISTORIAN+；驳回已审/公示中工单亦须族史委
  const needHistorian = auditAction === 'SECOND_PASS' || auditAction === 'PUBLICITY_PASS' ||
    (auditAction === 'REJECT' && record.status !== 'SUBMITTED');
  if (needHistorian && !hasRole(role, 'HISTORIAN')) return FORBIDDEN('仅族史委可执行复审/结束公示');
  if (auditAction === 'REJECT' && !(comment && String(comment).trim())) return BAD_REQUEST('驳回必须填写意见（蓝图 11 审核定案）');

  const submitter = record.createdBy || record.submittedBy;
  const step = { userId: openid, action: auditAction, time: new Date(), comment: comment || '' };

  if (auditAction === 'FIRST_PASS') {
    if (submitter === openid) return BAD_REQUEST('提交人不得自审（初审）');
    await db.collection('entry_records').doc(recordId).update({ data: { status: 'FIRST_PASS', auditChain: [...(record.auditChain || []), step] } });
    return OK({ status: 'FIRST_PASS' });
  }

  if (auditAction === 'SECOND_PASS') {
    const firstPass = (record.auditChain || []).find(s => s.step === 'FIRST_PASS');
    if (!firstPass) return BAD_REQUEST('须先完成初审');
    if (firstPass.userId === openid) return BAD_REQUEST('复审人不得与初审人相同（双人审核）');
    if (submitter === openid) return BAD_REQUEST('提交人不得自审（复审）');

    // §7.6：公示期可配置 —— publicityDays>0 进入公示；=0 保持 MVP 直 APPROVED
    const days = await publicityDays(db);
    if (days > 0) {
      const deadline = new Date(Date.now() + days * 86400000);
      const stepChain = [...(record.auditChain || []), step,
        { step: 'PUBLICITY', userId: openid, action: 'PUBLICITY', time: new Date(), comment: `进入公示，${days}天后（${deadline.toISOString().slice(0, 10)}）自动生效` }];
      await db.collection('entry_records').doc(recordId).update({ data: { status: 'PUBLICITY', publicityDays: days, publicityDeadline: deadline, auditChain: stepChain } });
      await writeAudit(db, { userId: openid, action: 'entry.publicity.start', target: recordId, detail: `${days}天@${deadline.toISOString()}` });
      // R31(B3): 进入公示 → 通知提交人 + 审核人（催办公示期到点前处理）
      await notifySubmitter(db, submitter, `您的入谱申请「${record.payload?.genealogyName || ''}」已通过复审，进入公示期（${days} 天）`, { type: 'audit.publicity', recordId, status: 'PUBLICITY', publicityDeadline: deadline });
      await notifyAuditors(db, recordId, `工单「${record.payload?.genealogyName || ''}」进入公示期（${days} 天）`, { status: 'PUBLICITY' });
      return OK({ status: 'PUBLICITY', publicityDays: days, publicityDeadline: deadline });
    }

    // days=0：直 APPROVED（原 R17 语义）
    const stepChain = [...(record.auditChain || []), step];
    const fin = await finalizeApproved(db, record, stepChain, openid);
    if (!fin.ok) return BAD_REQUEST(fin.reason);
    // R31(B3): 终审通过 → 通知提交人
    await notifySubmitter(db, submitter, `您的入谱申请「${record.payload?.genealogyName || ''}」已通过双人审核并生效`, { type: 'audit.approved', recordId, status: 'APPROVED' });
    return OK(fin.data);
  }

  if (auditAction === 'PUBLICITY_PASS') {
    const secondPass = (record.auditChain || []).find(s => s.step === 'SECOND_PASS');
    if (!secondPass) return BAD_REQUEST('无复审记录，无法结束公示');
    if (secondPass.userId === openid) return BAD_REQUEST('复审人不得自行提前结束公示（须另一位族史委见证）');
    if (submitter === openid) return BAD_REQUEST('提交人不得自审（提前通过）');
    const stepChain = [...(record.auditChain || []), step];
    const fin = await finalizeApproved(db, record, stepChain, openid);
    if (!fin.ok) return BAD_REQUEST(`公示生效失败: ${fin.reason}`);
    await writeAudit(db, { userId: openid, action: 'entry.publicity.pass', target: recordId, detail: JSON.stringify(fin.data || {}) });
    // R31(B3): 提前结束公示生效 → 通知提交人
    await notifySubmitter(db, submitter, `您的入谱申请「${record.payload?.genealogyName || ''}」公示期经族史委确认，正式生效`, { type: 'audit.approved', recordId, status: 'APPROVED' });
    return OK(fin.data);
  }

  // REJECT（SUBMITTED/FIRST_PASS/PUBLICITY 均可驳回；公示中驳回 = 撤回）
  await db.collection('entry_records').doc(recordId).update({ data: { status: 'REJECTED', auditChain: [...(record.auditChain || []), step] } });
  if (record.status === 'PUBLICITY') await writeAudit(db, { userId: openid, action: 'entry.publicity.withdraw', target: recordId, detail: comment });
  // R31(B3): 驳回 → 通知提交人（含驳回理由）
  await notifySubmitter(db, submitter, `您的入谱申请「${record.payload?.genealogyName || ''}」被驳回：${comment || '（无补充说明）'}`, { type: 'audit.rejected', recordId, status: 'REJECTED', comment });
  return OK({ status: 'REJECTED' });
}

/** R17：CHANGE(RELATION) 工单 APPROVED → relations 落库生效（蓝图 5.3 边结构 + 双审核人 verifiedBy） */
async function finalizeApprovedRelation(db, record, verifiedBy) {
  const rel = record.payload && record.payload.relation;
  if (!rel || !rel.fromId || !rel.toId || !rel.type) {
    return { ok: false, reasons: ['工单缺 relation 载荷'] };
  }
  // 终审时防重复：同 fromId/toId/type 已有 ACTIVE 边则拒绝（与 relation.edit 建单口径一致）
  const dup = await db.collection('relations').where({ fromId: rel.fromId, toId: rel.toId, type: rel.type, status: 'ACTIVE' }).count();
  if (dup && dup.total > 0) return { ok: false, reasons: ['该关系已存在（ACTIVE）'] };

  const addRes = await db.collection('relations').add({
    data: {
      fromId: rel.fromId,
      toId: rel.toId,
      type: rel.type,
      subType: rel.subType || '',
      startDate: rel.startDate || '',
      endDate: rel.endDate || '',
      status: 'ACTIVE',
      verifiedBy,
      sourceRecordId: record._id,
      createdAt: new Date()
    }
  });
  return { ok: true, relationId: addRes._id };
}

/** 复审通过 → 正式写入 members（含挂接校验 + 物化路径） */
async function finalizeApprovedMember(db, record) {
  const p = record.payload;
  const child = { generation: Number(p.generation), branchId: p.branchId, name: p.name };

  let parent = null;
  if (p.fatherId) {
    const res = await db.collection('members').doc(p.fatherId).get().catch(() => null);
    const doc = res && res.data && !Array.isArray(res.data) ? res.data : (res && res.data && res.data[0]);
    if (!doc) return { ok: false, reasons: [`父亲 memberId ${p.fatherId} 不存在`] };
    parent = { path: doc.path, generation: doc.generation, branchId: doc.branchId };
  }

  // memberNo：谱名中的辈分字优先，否则用提交序（挂接段由 buildPath 规整）
  const memberNo = p.memberNo || Math.floor(Date.now() / 1000) % 1000; // 临时编号策略，族史委可改
  const fin = finalizePatch({ child, parent, memberNo });
  if (!fin.ok) return fin;

  const addRes = await db.collection('members').add({
    data: {
      name: p.name,
      genealogyName: p.genealogyName || `郝${p.name}`,
      gender: p.gender || null,
      generation: fin.patch.generation,
      branchId: fin.patch.branchId,
      path: fin.patch.path,
      birthDate: p.birthDate || null,
      deathDate: p.deathDate || null,
      status: p.deathDate ? 'DECEASED' : 'LIVING',
      level: 'L2',
      version: 1, // R36 乐观锁基线（框架 §3.1：新入库成员 version=1 起算）
      sourceRecordId: record._id,
      createdAt: new Date()
    }
  });
  return { ok: true, memberId: addRes._id };
}

/**
 * §7.6：统一生效函数（入谱→members；关系变更→relations），被 SPECOND_PASS 直生效/PUBLICITY_PASS/publicityScan 共用
 */
async function finalizeApproved(db, record, stepChain, actor) {
  const firstPass = (record.auditChain || []).find(s => s.step === 'FIRST_PASS');
  const secondPass = (record.auditChain || []).find(s => s.step === 'SECOND_PASS');

  if (record.payload && record.payload.changeType === 'RELATION') {
    const reviewerId = secondPass ? secondPass.userId : actor;
    const verifiedBy = [firstPass && firstPass.userId, reviewerId].filter(Boolean);
    const fin = await finalizeApprovedRelation(db, record, verifiedBy);
    if (!fin.ok) return { ok: false, reason: `关系生效失败: ${fin.reasons.join('；')}` };
    await db.collection('entry_records').doc(record._id).update({
      data: { status: 'APPROVED', relationId: fin.relationId, auditChain: stepChain }
    });
    await writeAudit(db, { userId: actor, action: 'entry.approve.relation', target: record._id, detail: fin.relationId });
    return { ok: true, data: { status: 'APPROVED', relationId: fin.relationId } };
  }

  const fin = await finalizeApprovedMember(db, record);
  if (!fin.ok) return { ok: false, reason: `入库挂接失败: ${fin.reasons.join('；')}` };
  await db.collection('entry_records').doc(record._id).update({
    data: { status: 'APPROVED', memberId: fin.memberId, auditChain: stepChain }
  });
  await writeAudit(db, { userId: actor, action: 'entry.approve', target: record._id, detail: fin.memberId });
  return { ok: true, data: { status: 'APPROVED', memberId: fin.memberId } };
}

/**
 * §7.6：定时扫描（config.json timer 每日触发）——公示期届满工单自动 APPROVED
 */
async function publicityScan(db) {
  const now = new Date();
  const res = await db.collection('entry_records')
    .where({ status: 'PUBLICITY', publicityDeadline: db.command.lte(now) })
    .limit(LIST_LIMIT).get();
  const promoted = [];
  const failed = [];
  for (const record of (res.data || [])) {
    const step = { step: 'APPROVED', userId: 'system:timer', action: 'PUBLICITY_EXPIRE', time: now, comment: '公示期满自动生效（蓝图 7.6）' };
    const stepChain = [...(record.auditChain || []), step];
    const fin = await finalizeApproved(db, record, stepChain, 'system:timer');
    if (fin.ok) promoted.push({ recordId: record._id, ...fin.data });
    else failed.push({ recordId: record._id, reason: fin.reason });
  }
  return OK({ scanned: (res.data || []).length, promoted, failed });
}

/**
 * Excel 批量导入：接受客户端解析后的行数组（职责分离：沙箱/云函数不依赖 xlsx 库）
 * 每行走挂接预校验，返回逐行结果报告；通过行生成草稿工单待双人审核
 */
async function importRows(db, openid, payload) {
  const role = await roleOf(db, openid);
  if (!hasRole(role, 'EDITOR')) return FORBIDDEN('仅编辑/族史委可批量导入');

  const rows = payload && Array.isArray(payload.rows) ? payload.rows : null;
  if (!rows || !rows.length) return BAD_REQUEST('payload.rows 必须为非空数组（客户端解析 Excel/CSV 后传入）');
  if (rows.length > 500) return BAD_REQUEST('单批上限 500 行，请分批导入');

  const results = { total: rows.length, valid: 0, invalid: [], draftIds: [] };
  // 预取本批涉及的父代（按 fatherName 索引已入库成员 + 批内先出现的成员）
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const reasons = validatePayload(row);
    if (reasons.length) {
      results.invalid.push({ row: i + 1, name: row.name || '', reason: reasons.join('；') });
      continue;
    }
    // 批内世代连续性：有父亲名则同批内必须存在该父（或已入库），且世代差为 1
    if (row.fatherName) {
      const fatherInBatch = rows.find((r, j) => j !== i && r.name === row.fatherName);
      if (fatherInBatch) {
        if (Number(fatherInBatch.generation) !== Number(row.generation) - 1) {
          results.invalid.push({ row: i + 1, name: row.name, reason: `批内世代断裂: 父=${fatherInBatch.generation} 子=${row.generation}` });
          continue;
        }
      } else {
        const fRes = await db.collection('members').where({ name: row.fatherName, branchId: row.branchId }).limit(1).get();
        if (fRes.data.length) {
          const father = fRes.data[0];
          if (Number(father.generation) !== Number(row.generation) - 1) {
            results.invalid.push({ row: i + 1, name: row.name, reason: `与库内父亲世代断裂: 父=${father.generation} 子=${row.generation}` });
            continue;
          }
        } else {
          results.invalid.push({ row: i + 1, name: row.name, reason: `父亲 ${row.fatherName} 不在批内也不在库中，无法挂接` });
          continue;
        }
      }
    }
    results.valid++;
  }

  // 有效行生成草稿工单（状态 IMPORTED_DRAFT，走双人审核后入库）
  for (let i = 0; i < rows.length; i++) {
    if (results.invalid.some(x => x.row === i + 1)) continue;
    const row = rows[i];
    const char = await genealogyChar(db, row.generation, row.branchId);
    const addRes = await db.collection('entry_records').add({
      data: {
        type: 'EXCEL',
        payload: { ...row, genealogyName: `郝${char}${row.name}` },
        auditChain: [{ step: 'IMPORTED', userId: openid, time: new Date() }],
        status: 'SUBMITTED',
        batchTag: payload.batchTag || `batch-${Date.now()}`,
        createdAt: new Date(),
        createdBy: openid
      }
    });
    results.draftIds.push(addRes._id);
  }

  await writeAudit(db, {
    userId: openid, action: 'entry.import',
    target: payload.batchTag || 'batch',
    detail: `valid=${results.valid}/total=${results.total}`
  });
  return OK(results);
}

/** 我的提交列表 */
async function mySubmissions(db, openid) {
  const res = await db.collection('entry_records')
    .where({ createdBy: openid })
    .orderBy('createdAt', 'desc')
    .limit(LIST_LIMIT)
    .get();
  return OK({ records: res.data });
}

/**
 * R18 审核工作台待办列表（蓝图 7.6）：BRANCH_HEAD+ 可见 SUBMITTED/FIRST_PASS/PUBLICITY 工单；
 * 附 canFirstPass/canSecondPass/canPublicityPass 供前端按角色渲染操作按钮。
 */
async function pendingList(db, openid) {
  const role = await roleOf(db, openid);
  if (!hasRole(role, 'BRANCH_HEAD')) return FORBIDDEN('仅房长及以上可查看审核待办');

  const [subRes, fpRes, pubRes] = await Promise.all([
    db.collection('entry_records').where({ status: 'SUBMITTED' }).orderBy('createdAt', 'desc').limit(LIST_LIMIT).get(),
    db.collection('entry_records').where({ status: 'FIRST_PASS' }).orderBy('createdAt', 'desc').limit(LIST_LIMIT).get(),
    db.collection('entry_records').where({ status: 'PUBLICITY' }).orderBy('createdAt', 'desc').limit(LIST_LIMIT).get()
  ]);

  const isHistorian = hasRole(role, 'HISTORIAN');
  const decorate = (r) => {
    // R31(B3): 公示期倒计时（前端渲染便利：publicityRemainingDays 为整数天，向下取整，<0 视为 0）
    let publicityRemainingDays = null;
    if (r.status === 'PUBLICITY' && r.publicityDeadline) {
      const dl = new Date(r.publicityDeadline).getTime();
      if (!Number.isNaN(dl)) {
        publicityRemainingDays = Math.max(0, Math.ceil((dl - Date.now()) / 86400000));
      }
    }
    return {
      ...r,
      publicityRemainingDays,
      canFirstPass: r.status === 'SUBMITTED' && r.createdBy !== openid && r.submittedBy !== openid,
      canSecondPass: isHistorian && r.status === 'FIRST_PASS' &&
        !(r.auditChain || []).some(s => s.step === 'FIRST_PASS' && s.userId === openid) &&
        r.createdBy !== openid && r.submittedBy !== openid,
      canPublicityPass: isHistorian && r.status === 'PUBLICITY' &&
        !(r.auditChain || []).some(s => s.step === 'SECOND_PASS' && s.userId === openid) &&
        r.createdBy !== openid && r.submittedBy !== openid
    };
  };

  return OK({
    pending: [...(subRes.data || []).map(decorate), ...(fpRes.data || []).map(decorate), ...(pubRes.data || []).map(decorate)],
    total: (subRes.data || []).length + (fpRes.data || []).length + (pubRes.data || []).length
  });
}

module.exports = { main };
