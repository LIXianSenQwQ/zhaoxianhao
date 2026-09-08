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
        // EDITOR+ 可读；R27 升级：真实人口聚合（members.branchId = branch code）
        if (!hasRole(role, 'EDITOR')) return FORBIDDEN('编辑器及以上可查看分支统计');

        const branchesRes = await db.collection('branches').where({ status: 'ACTIVE' }).limit(500).get();
        const branches = (branchesRes && branchesRes.data) || [];

        // 本地按层级计数
        const byLevel = { 1: { total: 0, population: 0 }, 2: { total: 0, population: 0 }, 3: { total: 0, population: 0 } };
        const levelByCode = {};
        for (const b of branches) {
          levelByCode[b.code] = b.level;
          if (byLevel[b.level]) byLevel[b.level].total += 1;
        }

        // 成员按 branchId 聚合（R28：游标分页，PAGE_SIZE=100 为云开发单次上限；
        // 真实 SDK 走 field 投影，stub 无 field 自动降级全量拉取）
        const PAGE_SIZE = 100;
        const members = [];
        let skip = 0;
        for (;;) {
          let pageQuery = db.collection('members').skip(skip).limit(PAGE_SIZE);
          if (typeof pageQuery.field === 'function') pageQuery = pageQuery.field({ branchId: true });
          const pageRes = await pageQuery.get();
          const page = (pageRes && pageRes.data) || [];
          if (page.length === 0) break;
          members.push(...page);
          if (page.length < PAGE_SIZE) break; // 最后一页
          skip += PAGE_SIZE;
        }
        const popByCode = {};
        let totalPopulation = 0;
        for (const m of members) {
          const bc = m && m.branchId;
          if (!bc) continue;
          popByCode[bc] = (popByCode[bc] || 0) + 1;
          totalPopulation += 1;
          const lv = levelByCode[bc];
          if (lv && byLevel[lv]) byLevel[lv].population += 1;
        }

        // 每支人口明细（仅列有人口的分支）
        const perBranch = branches
          .filter(b => popByCode[b.code])
          .map(b => ({ code: b.code, name: b.name, level: b.level, population: popByCode[b.code] }))
          .sort((a, b) => b.population - a.population);

        return OK({
          totalActive: branches.length,
          totalPopulation,
          byLevel,
          perBranch
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
      
      case 'archive': {
        // EDITOR+ 归档；总谱不可归档；存在活跃子支时须先归档子支
        if (!hasRole(role, 'EDITOR')) return FORBIDDEN('仅编辑及以上可归档分支');

        const { code } = event || {};
        if (!code) return BAD_REQUEST('code required');

        const branch = await findBranchByCode(db, code);
        if (!branch) return NOT_FOUND('branch not found');
        if (branch.code === 'HAO-0000') return BAD_REQUEST('总谱不可归档');
        if (branch.status !== 'ACTIVE') return BAD_REQUEST(`仅 ACTIVE 分支可归档（当前 ${branch.status}）`);

        const childRes = await db.collection('branches').where({ parentCode: code, status: 'ACTIVE' }).limit(1).get();
        const activeChild = (childRes && childRes.data && childRes.data[0]) || null;
        if (activeChild) return BAD_REQUEST(`存在活跃子分支 ${activeChild.code}，请先归档子分支`);

        const now = new Date();
        await db.collection('branches').doc(branch._id).update({
          data: { status: 'ARCHIVED', updatedAt: now, updatedBy: openid }
        });

        await writeAudit(db, { userId: openid, action: 'branch.archive', target: code, detail: 'archived' });

        return OK({ code, status: 'ARCHIVED', message: 'Branch archived' });
      }

      case 'update': {
        // EDITOR+ 可改非结构字段（含 mergedInto）
        if (!hasRole(role, 'EDITOR')) return FORBIDDEN('仅编辑及以上可更新分支');
        
        const { code, name, description, generationVerses, population, headUserId, mergedInto } = event || {};
        if (!code) return BAD_REQUEST('code required');
        
        const branch = await findBranchByCode(db, code);
        if (!branch) return NOT_FOUND('branch not found');
        
        const updates = {};
        if (description !== undefined) updates.description = description;
        if (generationVerses !== undefined) updates.generationVerses = generationVerses;
        if (population !== undefined && typeof population === 'number') updates.population = population;
        if (headUserId !== undefined) updates.headUserId = headUserId;
        if (mergedInto !== undefined) updates.mergedInto = mergedInto; // R28: 合并指向允许直接修改
        
        // 注意：不允许修改 code/name/level/parentCode 等结构字段
        if (Object.keys(updates).length === 0) return OK({ message: 'No changes to apply' });
        
        updates.updatedAt = new Date();
        updates.updatedBy = openid;
        
        await db.collection('branches').doc(branch._id).update({ data: updates });
        
        await writeAudit(db, { userId: openid, action: 'branch.update', target: code, detail: Object.keys(updates).join(',') });
        
        return OK({ message: 'Updated', ...updates });
      }
      
      case 'merge': {
        // EDITOR+ 门禁
        if (!hasRole(role, 'EDITOR')) return FORBIDDEN('仅编辑及以上可合并分支');
        
        const { fromCode, toCode } = event || {};
        if (!fromCode || !toCode) return BAD_REQUEST('fromCode and toCode required');
        if (fromCode === toCode) return BAD_REQUEST('不能合并到自身');
        
        // 1. 源分支必须 ACTIVE 且无活跃子支
        const fromBranch = await findBranchByCode(db, fromCode);
        if (!fromBranch) return NOT_FOUND('源分支不存在');
        if (fromBranch.status !== 'ACTIVE') return BAD_REQUEST(`源分支非 ACTIVE（当前 ${fromBranch.status}）`);
        const childRes = await db.collection('branches').where({ parentCode: fromCode, status: 'ACTIVE' }).limit(1).get();
        const activeChild = (childRes && childRes.data && childRes.data[0]) || null;
        if (activeChild) return BAD_REQUEST(`存在活跃子分支 ${activeChild.code}，请先归档子分支`);
        
        // 2. 目标分支必须 ACTIVE 且层级相同或更高
        const toBranch = await findBranchByCode(db, toCode);
        if (!toBranch) return NOT_FOUND('目标分支不存在');
        if (toBranch.status !== 'ACTIVE') return BAD_REQUEST('目标分支非 ACTIVE');
        if (toBranch.level > fromBranch.level) return BAD_REQUEST('不能合并到更低层级');
        
        // 3. 更新源分支状态 MERGED + mergedInto
        await db.collection('branches').doc(fromBranch._id).update({
          data: {
            status: 'MERGED',
            mergedInto: toCode,
            updatedAt: new Date(),
            updatedBy: openid
          }
        });
        
        // 4. 迁移 members.branchId: fromCode → toCode
        await db.collection('members').where({ branchId: fromCode }).update({
          data: { branchId: toCode }
        });
        
        // 5. 审计
        await writeAudit(db, { 
          userId: openid, 
          action: 'branch.merge', 
          target: `${fromCode} → ${toCode}`, 
          detail: 'merged' 
        });
        
        return OK({ fromCode, toCode, status: 'MERGED' });
      }
      
      /** R31 新增：branch.migrate — 迁徙记录（源分支→目标分支） */
      case 'migrate': {
        // HOUSE_HEAD+ 门禁（房长可管理本分谱内迁徙）
        if (!hasRole(role, 'HOUSE_HEAD')) return FORBIDDEN('仅房长及以上可创建迁徙');
        
        const { fromCode, toCode, reason, date, sourceTags } = event || {};
        
        // 参数校验
        if (!fromCode || !toCode) return BAD_REQUEST('fromCode and toCode required');
        if (fromCode === toCode) return BAD_REQUEST('不能迁移到自身');
        
        // 查询源/目标分支存在性
        const fromBranch = await findBranchByCode(db, fromCode);
        if (!fromBranch) return NOT_FOUND('源分支不存在');
        
        const toBranch = await findBranchByCode(db, toCode);
        if (!toBranch) return NOT_FOUND('目标分支不存在');
        
        // 层级校验：同级别或跨级均可（允许支谱迁到另一分谱，待族史委审批）
        if (fromBranch.status !== 'ACTIVE') return BAD_REQUEST('源分支已归档');
        if (toBranch.status !== 'ACTIVE') return BAD_REQUEST('目标分支不可用');
        
        // 创建迁徙记录
        const now = new Date();
        const addRes = await db.collection('migration_records').add({
          data: {
            fromCode,
            toCode,
            fromName: fromBranch.name,
            toName: toBranch.name,
            fromLevel: fromBranch.level,
            toLevel: toBranch.level,
            reason: reason || '',
            date: date || now.toISOString(),
            sourceTags: sourceTags || [],
            createdBy: openid,
            createdTime: now,
            updatedBy: openid,
            updatedTime: now,
            status: 'PENDING', // PENDING/APPROVED/REJECTED
            approvals: []     // audit_logs 自动补
          }
        });
        
        // 审计日志
        await writeAudit(db, {
          userId: openid,
          action: 'branch.migrate.create',
          target: `${fromCode}→${toCode}`,
          detail: JSON.stringify({ reason, date }),
          time: now
        });
        
        return OK({ 
          _id: addRes._id,
          fromCode,
          toCode,
          status: 'PENDING',
          message: '迁徙申请已提交，等待族史委审批' 
        });
      }
      
      /** R31 新增：branch.migrate.list — 获取迁徙轨迹时间线 */
      case 'migrate.list': {
        // MEMBER+ 可读（历史追溯）
        if (!hasRole(role, 'MEMBER')) return FORBIDDEN('认证族人方可浏览迁徙记录');
        
        const { code, limit = 50 } = event || {};
        const query = code ? { $or: [{ fromCode: code }, { toCode: code }] } : {};
        
        const res = await db.collection('migration_records')
          .where(query)
          .orderBy('createdTime', 'desc')
          .limit(limit)
          .get();
        
        return OK({ items: res.data || [], total: res.data.length });
      }
      
      /** R31 新增：branch.migrate.updateStatus — 审批通过/拒绝 */
      case 'migrate.updateStatus': {
        // HISTORIAN+ 权限
        if (!hasRole(role, 'HISTORIAN')) return FORBIDDEN('仅族史委可审批迁徙申请');
        
        const { migrateId, status, comment } = event || {};
        if (!migrateId || !['APPROVED', 'REJECTED'].includes(status)) {
          return BAD_REQUEST('migrateId and status required');
        }
        
        const migrateRes = await db.collection('migration_records').where({ _id: migrateId }).limit(1).get();
        const record = pickDoc(migrateRes);
        if (!record) return NOT_FOUND('迁徙记录不存在');
        
        // 更新状态
        await db.collection('migration_records').doc(migrateId).update({
          data: {
            status,
            approvedBy: openid,
            approvalComment: comment || '',
            approvalTime: new Date()
          }
        });
        
        // 审计
        await writeAudit(db, {
          userId: openid,
          action: 'branch.migrate.approve',
          target: `${record.fromCode}→${record.toCode}`,
          detail: JSON.stringify({ status, comment }),
          sensitive: true,
          time: new Date()
        });
        
        return OK({ success: true, status });
      }
      
      case 'import': {
        // EDITOR+ 门禁
        if (!hasRole(role, 'EDITOR')) return FORBIDDEN('仅编辑及以上可导入');
        
        const { rows } = event || [];
        if (!Array.isArray(rows) || rows.length === 0) return BAD_REQUEST('rows required');
        if (rows.length > 100) return BAD_REQUEST('单次导入上限 100 行');
        
        const results = { success: [], failed: [] };
        for (const [idx, row] of rows.entries()) {
          try {
            // 参数校验
            if (!row.name || !row.level) throw new Error('name and level required');
            if (!['string', 'number'].includes(typeof row.name)) throw new Error('invalid name');
            if (![2, 3].includes(Number(row.level))) throw new Error('level must be 2 or 3');
            
            let targetParentCode = row.parentCode?.trim();
            if (Number(row.level) === 2) targetParentCode = targetParentCode || 'HAO-0000'; // 默认总谱为根（与 create 一致）
            if (!targetParentCode) throw new Error('parentCode required');
            
            // parent 存在性和层级校验
            const parentBranch = await findBranchByCode(db, targetParentCode);
            if (!parentBranch) throw new Error(`parent ${targetParentCode} not found`);
            if (parentBranch.status !== 'ACTIVE') throw new Error('parent branch not active');
            if (parentBranch.level !== Number(row.level) - 1) throw new Error(`parent must be level ${Number(row.level)-1}`);
            
            // 同父名唯一性
            const dupRes = await db.collection('branches').where({ parentCode: targetParentCode, name: row.name.trim() }).get();
            if ((dupRes && dupRes.data && dupRes.data.length > 0)) throw new Error('branch name already exists under same parent');
            
            // 生成 code
            const newCode = await nextSiblingCode(db, targetParentCode, parentBranch.level);
            
            // add document
            await db.collection('branches').add({
              data: {
                code: newCode,
                name: row.name.trim(),
                level: Number(row.level),
                parentCode: targetParentCode,
                region: row.region || null,
                population: 0,
                description: row.description || '',
                generationVerses: (row.generationVerses || '').toString().slice(0, 500),
                ancestorId: null, founderGeneration: null, sourceTags: [], confidence: 3, status: 'ACTIVE',
                createdAt: new Date(), createdBy: openid, updatedAt: null, updatedBy: null
              }
            });
            
            results.success.push({ row: idx + 1, code: newCode, name: row.name.trim() });
          } catch (e) {
            console.error(`import row ${idx} error:`, e.message);
            results.failed.push({ row: idx + 1, name: row.name || `row${idx}`, reason: e.message });
          }
        }
        
        await writeAudit(db, { userId: openid, action: 'branch.import', target: `${results.success.length}/${rows.length}`, detail: 'excel-import' });
        
        console.log('[import] summary:', JSON.stringify({ total: rows.length, ok: results.success.length, failed: results.failed.length }));
        if (results.failed.length) console.log('[import] errors:', JSON.stringify(results.failed));
        
        return OK(results);
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
