/**
 * cloud/functions/doc/index.js
 * MVP Core: 谱库档案上传/检索（旧谱 PDF/照片/碑拓/文书）
 */
const wx = require('wx-server-sdk');
wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

async function main(params, context) {
  const { action, type, era, fileId } = params;
  const db = wx.getDatabase();
  
  if (action === 'list') {
    // 文档列表查询
    const where = {};
    if (type) where.type = type;
    if (era) where.era = era;
    
    const res = await db.collection('documents')
      .where(where)
      .orderBy('createdAt', 'desc')
      .limit(50).get();
    
    return { success: true, docs: res.data };
  }
  
  if (action === 'upload') {
    // 文档元数据上传（文件实际走云存储签名）
    const docId = wx.cloud.generateObjectId();
    
    await db.collection('documents').add({
      data: {
        _id: docId,
        title: params.title,
        type: params.type,
        era: params.era,
        fileUrl: params.fileUrl,
        thumbUrl: params.thumbUrl,
        ocrText: params.ocrText || '',
        contributorId: context.openid,
        level: params.level || 'L2',
        size: params.size || 0,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });
    
    return { success: true, docId };
  }
  
  if (action === 'get') {
    // 获取单个文档详情
    const res = await db.collection('documents').doc(fileId).get();
    return { success: true, doc: res.data[0] };
  }
}

module.exports = { main };
