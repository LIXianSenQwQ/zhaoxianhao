/**
 * cloud/functions/entry/index.js
 * MVP Core: 智能入谱审核工作流（OCR+Excel+Manual）
 * 双人审核链 + 公示期 + 自动挂接
 */
const wx = require('wx-server-sdk');
wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

async function main(params, context) {
  const { action, type, payload } = params;
  
  if (action === 'submit') {
    return await submitEntryRecord(type, payload, context.openid);
  }
  
  if (action === 'audit') {
    // 初审/复审/公示
    return await auditEntryRecord(params, context);
  }
  
  if (action === 'importExcel') {
    return await importFromExcel(payload.fileId, context);
  }
}

async function submitEntryRecord(type, payload, operatorId) {
  const db = wx.getDatabase();
  
  // Step 1: 生成工单号
  const recordId = wx.cloud.generateObjectId();
  
  // Step 2: 校验数据完整性
  if (!payload.name || !payload.generation || !payload.branchId) {
    return { error: 'Missing required fields', recordId };
  }
  
  // Step 3: 生成谱名（字辈定位）
  const character = await getCharacterByGeneration(payload.generation, payload.branchId);
  const genealogyName = `郝${character}${payload.name}`; // 示例逻辑
  
  // Step 4: 预建关系草稿
  const relationsDraft = [];
  if (payload.fatherId && payload.motherId) {
    relationsDraft.push(
      { fromId: recordId, toId: payload.fatherId, type: 'PARENT_CHILD', status: 'PENDING' },
      { fromId: recordId, toId: payload.motherId, type: 'PARENT_CHILD', status: 'PENDING' }
    );
  }
  
  // Step 5: 写入 entry_records
  await db.collection('entry_records').add({
    data: {
      _id: recordId,
      type,
      ocrConfidence: payload.ocrConfidence || null,
      payload: { ...payload, genealogyName },
      auditChain: [{ step: 'SUBMITTED', userId: operatorId, time: new Date() }],
      status: 'SUBMITTED',
      createdAt: new Date(),
      createdBy: operatorId
    }
  });
  
  // Step 6: 保存关系草稿
  await db.collection('relations').add({ data: relationsDraft });
  
  return { success: true, recordId };
}

async function auditEntryRecord(params, context) {
  const { recordId, action: auditAction, comment } = params;
  const db = wx.getDatabase();
  
  // 读取现有工单
  const res = await db.collection('entry_records').doc(recordId).get();
  const record = res.data[0];
  
  // 更新审计链
  const auditStep = {
    userId: context.openid,
    action: auditAction,
    time: new Date(),
    comment
  };
  
  switch (auditAction) {
    case 'FIRST_PASS':
      await updateStatus(recordId, 'FIRST_PASS', auditStep);
      break;
    case 'SECOND_PASS':
      await updateStatus(recordId, 'APPROVED', auditStep);
      // 正式入库 members + 激活 relations
      await finalizeApprovedMember(record.payload, recordId);
      break;
    default:
      await updateStatus(recordId, 'REJECTED', auditStep);
  }
}

async function getCharacterByGeneration(generation, branchId) {
  // 从 generations 集合获取字辈字
  // ... 实际需查询数据库
  return '维'; // 占位符
}

module.exports = { main };
