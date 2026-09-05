/**
 * cloud/functions/member/index.js
 * MVP Core: 族人档案查询接口 (L2/L3/L4 分级隐私)
 */
const wx = require('wx-server-sdk');
wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

async function main(params, context) {
  const { action, memberId, focusId, depth } = params;
  const db = wx.getDatabase();
  
  if (action === 'getDetail') {
    // Step 1: 获取人物基础信息（过滤敏感字段）
    const res = await db.collection('members').doc(memberId).get();
    if (!res.data.length) return { error: 'Member not found' };
    
    const member = res.data[0];
    const requesterOpenid = context.openid;
    
    // Step 2: 读取用户角色/房支信息（权限检查）
    const userRes = await db.collection('users').where({ openid: requesterOpenid }).get();
    const role = userRes.data[0]?.role || 'VISITOR';
    const userBranch = userRes.data[0]?.branchId;
    
    // Step 3: 按隐私级别返回字段
    const allowedFields = getVisibleFields(member, role, userBranch);
    
    // Step 4: 关联媒体资源
    if (allowedFields.photoIds) {
      const mediaRes = await db.collection('media').where({ _id: _.in(member.photoIds) }).get();
      allowedFields.photos = mediaRes.data.slice(0, 5); // 最多 5 张
    }
    
    return { success: true, data: allowedFields };
  }
  
  if (action === 'tree') {
    // 族谱树视图：焦点人物向上 2 代 + 向下 2 代 + 平辈全取
    return await buildTree(focusId, depth || 2, context);
  }
}

function getVisibleFields(member, role, userBranch) {
  // L2: 公开字段（所有认证会员可见）
  const fields = {
    _id: member._id,
    genealogyName: member.genealogyName,
    generation: member.generation,
    gender: member.gender,
    branchId: member.branchId,
    lifespan: member.lifespan,
    status: member.status
  };
  
  // L3/L4: 限制字段（仅同房支/直系亲属/高级别）
  if (isSameBranch(userBranch, member.branchId) || role >= 'CHIEF') {
    fields.name = member.name;
    fields.birthDate = member.birthDate;
    fields.deathDate = member.deathDate;
  }
  
  // L5: 私密字段（必须显式授权）
  if (role >= 'HISTORIAN') {
    fields.tomb = member.tomb;
    fields.marriage = member.marriage;
  }
  
  return fields;
}

async function buildTree(focusId, depth, context) {
  // 双向 BFS 查找祖先/后代
  // ... 简化实现，实际需递归调用
  return { nodes: [], edges: [] };
}

module.exports = { main };
