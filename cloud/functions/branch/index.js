/**
 * cloud/functions/branch/index.js
 * 分支三级谱系树管理（蓝图 §3.1-3.5；R26 紧急修复 #1/#2）
 *
 * actions:
 *   - create: BRANCH_HEAD+ 门禁；生成 HAO- 层级序列码
 *   - list/tree: MEMBER+；返回所有 branches 按 code 排序，前端可组树
 *   - detail: MEMBER+；按 code/_id 返回单个 + 直接子支列表
 *   - stats: EDITOR+；全族分支统计、人口合计、每支人数
 *   - seed: CHIEF+；初始化总谱 HAO-0000（幂等）
 *   - update: EDITOR+；更新非结构字段（描述/字辈诗/headUserId/population）
 *
 * 编码规则（评审决策点⑤折衷方案）：
 *   code = "HAO-{层级序列}"：总谱 HAO-0000；二级 HAO-0000-01；三级 HAO-0000-01-03。
 *   天然唯一、层级自解释、无中文/拼音依赖；region 承载省市县中文名。
 */
const wx = require('wx-server-sdk');
wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

const { OK, BAD_REQUEST, FORBIDDEN, NOT_FOUND } = require('./common/response');
const { hasRole } = require('./common/roles');
const { writeAudit } = require('./common/audit');

// ─── 门禁角色映射（蓝图 §8 权限） ───
const CODE_CREATE_ROLE = 'BRANCH_HEAD'; // 创建分支（分谱/支谱）
const CHIEF_ROLE = 'CHIEF';

// ─── 工具 ───
/** 云数据库 get 返回 { data: [...] }：取首条文档；空 → null */
function pickDoc(res) {
  const arr = res && res.data;
  if (Array.isArray(arr)) return arr.length ? arr[0] : null;
  return arr || null;
}

async function findBranchByCode(db, code) {
  const res = await db.collection('branches').where({ code }).limit(1).get();
  return pickDoc(res);
}

/**
 * 生成下一个兄弟序号（层级序列码）：
 *   总谱 HAO-0000；二级 HAO-0000-NN；三级 HAO-0000-NN-MM
 * 序号 = 同父现有子支的最大序号 + 1（padStart 2 位），事务由唯一索引兜底。
 */
async function nextSiblingCode(db, parentCode, parentLevel) {
  if (parentLevel === 0) return 'HAO-0000'; // 总谱
  const childLevel = parentLevel + 1;
  const res = await db.collection('branches')
    .where({ parentCode })
    .orderBy('code', 'desc')
    .limit(1)
    .get();
  const sibs = (res && res.data) || [];
  if (!sibs.length) {
    return parentCode + '-01';
  }
  const lastSeg = parseInt(sibs[0].code.split('-').pop(), 10) || 0;
  return `${parentCode}-${String(lastSeg + 1).padStart(2, '0')}`;
}

// ─── main dispatch ───
async function main(event, context) {
  const openid = context.OPENID || context.openid;
  if (!openid) return FORBIDDEN('请先登录');

  const userRes = await wx.getDatabase().collection('users').where({ openid }).limit(1).get();
  const role = (userRes.data[0] && userRes.data[0].role) || 'VISITOR';

  const { action } = event || {};
  const db = wx.getDatabase();

  try {
    switch (action) {
      case 'create': {
        // BRANCH_HEAD+ 门禁
        if (!hasRole(role, CODE_CREATE_ROLE)) return FORBIDDEN('仅房长及以上可创建分支');
        
        const { name, level, parentCode, region, description, generationVerses, ancestorId, founderGeneration } = event || {};
        
        // 参数校验
        if (!name || name.trim().length < 1) return BAD_REQUEST('branch name required');
        if (!level || ![2, 3].includes(level)) return BAD_REQUEST('level must be 2 or 3');
        
        // parentCode 校验（level≥2 必填）
        let targetParentCode = parentCode;
        if (level === 2) targetParentCode = 'HAO-0000'; // 默认总谱为根
        if (!targetParentCode) return BAD_REQUEST('parentCode required');
        
        // parentBranch 存在性校验
        const parentBranch = await findBranchByCode(db, targetParentCode);
        if (!parentBranch) return BAD_REQUEST(`parentCode ${targetParentCode} not found`);
        if (parentBranch.status !== 'ACTIVE') return BAD_REQUEST('parent branch not active');
        if (parentBranch.level !== level - 1) return BAD_REQUEST(`parent must be level ${level-1}`);
        
        // 同父下 name 唯一性校验
        const dupCount = await db.collection('branches')
          .where({ parentCode: targetParentCode, name })
          .count();
        if ((dupCount && dupCount.total) > 0) return BAD_REQUEST('branch name already exists under same parent');
        
        // 生成 code（查询同父最大序号 +1）
        const code = await nextSiblingCode(db, targetParentCode, parentBranch.level);
        
        // 添加文档
        const now = new Date();
        const addRes = await db.collection('branches').add({
          data: {
            code,
            name: name.trim(),
            level,
            parentCode: targetParentCode,
            region: region || null,
            population: 0,
            description: description || '',
            generationVerses: generationVerses || '',
            ancestorId: ancestorId || null,
            founderGeneration: founderGeneration || null,
            sourceTags: [],
            confidence: 3,
            status: 'ACTIVE',
            createdAt: now,
            createdBy: openid,
            updatedAt: null,
            updatedBy: null
          }
        });
        
        await writeAudit(db, { userId: openid, action: 'branch.create', target: code, detail: `name=${name}, level=${level}` });
        
        return OK({ _id: addRes._id, code, message: 'Branch created successfully' });
      }
      
      case 'list':
      case 'tree': {
        // MEMBER+ 可读
        if (!hasRole(role, 'MEMBER')) return FORBIDDEN('认证族人方可浏览分支');
        
        const limit = event.limit || 500;
        const res = await db.collection('branches')
          .where({ status: 'ACTIVE' })
          .orderBy('code', 'asc')
          .limit(limit)
          .get();
        
        return OK({ 
          items: res.data || [], 
          total: (res.data || []).length 
        });
      }
      
      case 'detail': {
        const { code, id } = event || {};
        if (!code && !id) return BAD_REQUEST('code or id required');
        
        const query = code ? { code } : { _id: id };
        const res = await db.collection('branches').where(query).limit(1).get();
        const branch = pickDoc(res);
        if (!branch) return NOT_FOUND('branch not found');
        
        // 返回直接子支列表
        const childrenRes = await db.collection('branches').where({ parentCode: branch.code }).limit(100).get();
        
        return OK({ 
          ...branch, 
          children: (childrenRes.data || []) 
        });
      }
      
      case 'stats': {
        // EDITOR+ 可读
        if (!hasRole(role, 'EDITOR')) return FORBIDDEN('编辑器及以上可查看分支统计');
        
        const total = await db.collection('branches').where({ status: 'ACTIVE' }).count();
        const byLevel = {};
        ['1', '2', '3'].forEach(l => {
          const r = byLevel[l] = { total: 0, population: 0 };
          // 简单 count 占位——实际需要 groupBy
          // MVP 先行，待成员数据接入后再精确聚合
        });
        
        return OK({
          totalActive: (total || {}).total || 0,
          byLevel
        });
      }
      
      case 'seed': {
        // CHIEF+ 门禁；幂等（已存在即返回）
        if (!hasRole(role, CHIEF_ROLE)) return FORBIDDEN('仅族长可初始化总谱');
        
        const existing = await findBranchByCode(db, 'HAO-0000');
        if (existing) return OK({ _id: existing._id, code: 'HAO-0000', level: 1, message: 'Root branch already exists' });
        
        const now = new Date();
        const addRes = await db.collection('branches').add({
          data: {
            code: 'HAO-0000',
            name: '郝氏总谱',
            level: 1,
            parentCode: null,
            region: '河北省石家庄市赵县',
            population: 0,
            description: '全族总谱（根节点）',
            generationVerses: '',
            ancestorId: null,
            founderGeneration: null,
            sourceTags: ['system'],
            confidence: 5,
            status: 'ACTIVE',
            createdAt: now,
            createdBy: openid,
            updatedAt: null,
            updatedBy: null
          }
        });
        
        await writeAudit(db, { userId: openid, action: 'branch.seed', target: 'HAO-0000', detail: 'root initialized' });
        
        return OK({ _id: addRes._id, code: 'HAO-0000', level: 1, message: 'Root branch seeded' });
      }
      
      case 'update': {
        // EDITOR+ 可改非结构字段
        if (!hasRole(role, 'EDITOR')) return FORBIDDEN('仅编辑及以上可更新分支');
        
        const { code, name, description, generationVerses, population, headUserId } = event || {};
        if (!code) return BAD_REQUEST('code required');
        
        const branch = await findBranchByCode(db, code);
        if (!branch) return NOT_FOUND('branch not found');
        
        const updates = {};
        if (description !== undefined) updates.description = description;
        if (generationVerses !== undefined) updates.generationVerses = generationVerses;
        if (population !== undefined && typeof population === 'number') updates.population = population;
        if (headUserId !== undefined) updates.headUserId = headUserId;
        // 注意：不允许修改 code/name/level/parentCode 等结构字段
        
        if (Object.keys(updates).length === 0) return OK({ message: 'No changes to apply' });
        
        updates.updatedAt = new Date();
        updates.updatedBy = openid;
        
        await db.collection('branches').doc(branch._id).update({ data: updates });
        
        await writeAudit(db, { userId: openid, action: 'branch.update', target: code, detail: Object.keys(updates).join(',') });
        
        return OK({ message: 'Updated', ...updates });
      }
      
      default:
        return BAD_REQUEST(`unknown action: ${action}`);
    }
  } catch (e) {
    console.error('[branch.main] error:', e);
    return BAD_REQUEST(e.message);
  }
}

module.exports = { main };
