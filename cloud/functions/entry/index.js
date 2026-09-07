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
const { idempotencyKey } = require('./common/idempotency');
const { writeAudit } = require('./common/audit');
const { finalizePatch } = require('./common/linkage');

wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

const LIST_LIMIT = 50;

async function main(event, context) {
  const openid = context.OPENID || context.openid;
  if (!openid) return FORBIDDEN('请先登录');
  const db = wx.getDatabase();
  const { action } = event;

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

/** 校验必填 + 生成谱名（generations 集合字辈字） */
function validatePayload(p) {
  const reasons = [];
  if (!p || !p.name || !String(p.name).trim()) reasons.push('缺本名');
  if (!p || !Number.isInteger(Number(p.generation)) || Number(p.generation) < 1) reasons.push('缺世代数或非法');
  if (!p || !p.branchId) reasons.push('缺房支');
  return reasons;
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
      ocrConfidence: payload.ocrConfidence || null,
      payload: { ...payload, genealogyName },
      auditChain: [{ step: 'SUBMITTED', userId: openid, time: new Date() }],
      status: 'SUBMITTED',
      createdAt: new Date(),
      createdBy: openid
    }
  });
  await writeAudit(db, { userId: openid, action: 'entry.submit', target: addRes._id, detail: genealogyName });
  return OK({
    recordId: addRes._id,
    genealogyName,
    conflict: conflictCount > 0,
    conflictCount,
    conflictHint: conflictCount > 0 ? `在库已有 ${conflictCount} 位同谱名成员，请核对字辈/名后由族史委裁决` : ''
  });
}

/**
 * 审核：FIRST_PASS 初审 / SECOND_PASS 复审（触发入库）/ REJECT 驳回
 * 双人链：初审、复审、提交 三者两两不同人
 */
async function auditEntry(db, openid, { recordId, auditAction, comment }) {
  // 鉴权先行（粗门禁）：仅房长及以上可触达审核（蓝图 7.6 初审支系 BRANCH_HEAD；复审细门禁查单后判定）
  const role = await roleOf(db, openid);
  if (!hasRole(role, 'BRANCH_HEAD')) return FORBIDDEN('仅房长及以上可执行审核');

  if (!recordId || !['FIRST_PASS', 'SECOND_PASS', 'REJECT'].includes(auditAction)) {
    return BAD_REQUEST('缺少 recordId 或 auditAction 非法');
  }

  const res = await db.collection('entry_records').doc(recordId).get().catch(() => null);
  const record = res && res.data && !Array.isArray(res.data) ? res.data : (res && res.data && res.data[0]);
  if (!record) return NOT_FOUND('工单不存在');
  if (record.status !== 'SUBMITTED' && record.status !== 'FIRST_PASS') {
    return BAD_REQUEST(`工单状态 ${record.status} 不可审核`);
  }

  // 细门禁（蓝图 7.6）：复审/驳回已入审的工单须 HISTORIAN+（族史委）
  const needHistorian = record.status === 'FIRST_PASS' || auditAction === 'SECOND_PASS';
  if (needHistorian && !hasRole(role, 'HISTORIAN')) {
    return FORBIDDEN('仅族史委可执行复审');
  }

  // 蓝图 11：通过/驳回必填意见（驳回强制留痕）
  if (auditAction === 'REJECT' && !(comment && String(comment).trim())) {
    return BAD_REQUEST('驳回必须填写意见（蓝图 11 审核定案）');
  }

  const submitter = record.createdBy || record.submittedBy; // R16 CHANGE 工单用 submittedBy
  const step = { userId: openid, action: auditAction, time: new Date(), comment: comment || '' };

  if (auditAction === 'FIRST_PASS') {
    if (submitter === openid) return BAD_REQUEST('提交人不得自审（初审）');
    await db.collection('entry_records').doc(recordId).update({
      data: { status: 'FIRST_PASS', auditChain: [...(record.auditChain || []), step] }
    });
    return OK({ status: 'FIRST_PASS' });
  }

  if (auditAction === 'SECOND_PASS') {
    const firstPass = (record.auditChain || []).find(s => s.step === 'FIRST_PASS');
    if (!firstPass) return BAD_REQUEST('须先完成初审');
    if (firstPass.userId === openid) return BAD_REQUEST('复审人不得与初审人相同（双人审核）');
    if (submitter === openid) return BAD_REQUEST('提交人不得自审（复审）');

    const stepChain = [...(record.auditChain || []), step];

    // R17：关系变更工单（R16 relation.edit 产物）→ APPROVED 后 relations 生效（蓝图 7.7）
    if (record.payload && record.payload.changeType === 'RELATION') {
      const fin = await finalizeApprovedRelation(db, record, [firstPass.userId, openid]);
      if (!fin.ok) return BAD_REQUEST(`关系生效失败: ${fin.reasons.join('；')}`);
      await db.collection('entry_records').doc(recordId).update({
        data: { status: 'APPROVED', relationId: fin.relationId, auditChain: stepChain }
      });
      await writeAudit(db, { userId: openid, action: 'entry.approve.relation', target: recordId, detail: fin.relationId });
      return OK({ status: 'APPROVED', relationId: fin.relationId });
    }

    // 入谱工单：挂接校验 + 正式写入 members
    const fin = await finalizeApprovedMember(db, record);
    if (!fin.ok) return BAD_REQUEST(`入库挂接失败: ${fin.reasons.join('；')}`);

    await db.collection('entry_records').doc(recordId).update({
      data: { status: 'APPROVED', memberId: fin.memberId, auditChain: stepChain }
    });
    await writeAudit(db, { userId: openid, action: 'entry.approve', target: recordId, detail: fin.memberId });
    return OK({ status: 'APPROVED', memberId: fin.memberId });
  }

  // REJECT
  await db.collection('entry_records').doc(recordId).update({
    data: { status: 'REJECTED', auditChain: [...(record.auditChain || []), step] }
  });
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
      sourceRecordId: record._id,
      createdAt: new Date()
    }
  });
  return { ok: true, memberId: addRes._id };
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
 * R18 审核工作台待办列表（蓝图 7.6）：BRANCH_HEAD+ 可见 SUBMITTED/FIRST_PASS 工单；
 * 附 canFirstPass/canSecondPass 供前端按角色渲染操作按钮（初审支系 BRANCH_HEAD+，复审族史委 HISTORIAN+）。
 */
async function pendingList(db, openid) {
  const role = await roleOf(db, openid);
  if (!hasRole(role, 'BRANCH_HEAD')) return FORBIDDEN('仅房长及以上可查看审核待办');

  const [subRes, fpRes] = await Promise.all([
    db.collection('entry_records').where({ status: 'SUBMITTED' }).orderBy('createdAt', 'desc').limit(LIST_LIMIT).get(),
    db.collection('entry_records').where({ status: 'FIRST_PASS' }).orderBy('createdAt', 'desc').limit(LIST_LIMIT).get()
  ]);

  const isHistorian = hasRole(role, 'HISTORIAN');
  const decorate = (r) => ({
    ...r,
    canFirstPass: r.status === 'SUBMITTED' && r.createdBy !== openid && r.submittedBy !== openid,
    canSecondPass: isHistorian && r.status === 'FIRST_PASS' &&
      !(r.auditChain || []).some(s => s.step === 'FIRST_PASS' && s.userId === openid) &&
      r.createdBy !== openid && r.submittedBy !== openid
  });

  return OK({
    pending: [...(subRes.data || []).map(decorate), ...(fpRes.data || []).map(decorate)],
    total: (subRes.data || []).length + (fpRes.data || []).length
  });
}

module.exports = { main };
