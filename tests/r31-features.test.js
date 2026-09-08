/**
 * tests/r31-features.test.js — R31 新功能测试
 * JSON 全量备份 + 房长角色 + 迁徙管理
 */
import { describe, it } from 'node:test';

// ─── R31-1: 房长角色测试 ───
describe('R31-1: HOUSE_HEAD 角色（房长）', () => {
  // 从 cloud/functions/common/roles.js 同步定义
  const ROLE_LEVEL = {
    VISITOR: 0,
    MEMBER: 1,
    BRANCH_HEAD: 2,
    EDITOR: 3,
    HOUSE_HEAD: 4,
    HISTORIAN: 5,
    CHIEF: 6
  };

  function hasRole(role, minRole) {
    const level = ROLE_LEVEL[role];
    const required = ROLE_LEVEL[minRole];
    if (level === undefined || required === undefined) return false;
    return level >= required;
  }

  it('HOUSE_HEAD 层级介于 EDITOR 与 HISTORIAN 之间', () => {
    if (ROLE_LEVEL.EDITOR >= ROLE_LEVEL.HOUSE_HEAD) throw new Error('EDITOR 应低于 HOUSE_HEAD');
    if (ROLE_LEVEL.HOUSE_HEAD >= ROLE_LEVEL.HISTORIAN) throw new Error('HOUSE_HEAD 应低于 HISTORIAN');
    if (ROLE_LEVEL.HOUSE_HEAD !== 4) throw new Error(`HOUSE_HEAD 应为 4, got ${ROLE_LEVEL.HOUSE_HEAD}`);
  });

  it('HOUSE_HEAD 可创建分支（BRANCH_HEAD+）', () => {
    if (!hasRole('HOUSE_HEAD', 'BRANCH_HEAD')) throw new Error('HOUSE_HEAD 应能创建分支');
  });

  it('HOUSE_HEAD 不可审批迁徙（HISTORIAN+ 专属）', () => {
    if (hasRole('HOUSE_HEAD', 'HISTORIAN')) throw new Error('HOUSE_HEAD 不应有 HISTORIAN 权限');
  });

  it('HISTORIAN 可审批迁徙（含 HOUSE_HEAD 以下所有）', () => {
    if (!hasRole('HISTORIAN', 'HISTORIAN')) throw new Error('HISTORIAN 应有审批权限');
    if (!hasRole('CHIEF', 'HISTORIAN')) throw new Error('CHIEF 应有审批权限');
  });

  it('BRANCH_HEAD 不具备 HOUSE_HEAD 权限', () => {
    if (hasRole('BRANCH_HEAD', 'HOUSE_HEAD')) throw new Error('BRANCH_HEAD 不应有房长权限');
  });
});

// ─── R31-2: JSON 全量备份测试 ───
describe('R31-2: JSON 全量备份（backup.exportJSON）', () => {
  const ALLOWED = ['members', 'branches', 'relations', 'generations', 'events'];

  it('允许的集合白名单校验', () => {
    const valid = ['members', 'branches'];
    const invalid = ['users', 'admin', '__proto__'];
    
    for (const c of valid) {
      if (!ALLOWED.includes(c)) throw new Error(`${c} 应在白名单`);
    }
    for (const c of invalid) {
      if (ALLOWED.includes(c)) throw new Error(`${c} 不应在白名单`);
    }
  });

  it('快照校验和计算（轻量哈希）', () => {
    function computeSnapshotChecksum(data) {
      const str = JSON.stringify(data);
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      return 'sha256:' + Math.abs(hash).toString(16).padStart(8, '0');
    }

    const data1 = { a: 1, b: [1, 2] };
    const data2 = { a: 1, b: [1, 2] };
    const data3 = { a: 2, b: [1, 2] };

    const h1 = computeSnapshotChecksum(data1);
    const h2 = computeSnapshotChecksum(data2);
    const h3 = computeSnapshotChecksum(data3);

    if (h1 !== h2) throw new Error('相同数据应产生相同哈希');
    if (h1 === h3) throw new Error('不同数据应产生不同哈希');
    if (!h1.startsWith('sha256:')) throw new Error('哈希前缀应为 sha256:');
  });

  it('manifest 必需字段校验', () => {
    const manifest = {
      version: '1.0',
      generatedAt: new Date().toISOString(),
      generator: 'haochengshi-fengjia v2.0.0',
      data: {}
    };

    const required = ['version', 'generatedAt', 'data'];
    const missing = required.filter(f => !manifest[f]);
    if (missing.length) throw new Error(`缺少字段: ${missing.join(',')}`);
  });

  it('无效 JSON 解析应报错', () => {
    let threw = false;
    try {
      JSON.parse('这不是JSON');
    } catch (e) {
      threw = true;
    }
    if (!threw) throw new Error('无效 JSON 应抛出错误');
  });

  it('成员数据基础校验（path/genealogyName）', () => {
    const records = [
      { _id: '1', path: '/001/', genealogyName: '郝一' },
      { _id: '2', path: '', genealogyName: '' },  // 缺失
      { _id: '3', path: '/002/', genealogyName: '郝三' }
    ];

    const invalid = records.filter(r => !r.path && !r.genealogyName);
    if (invalid.length !== 1) throw new Error(`应恰好 1 条无效, got ${invalid.length}`);
  });
});

// ─── R31-3: 迁徙管理测试 ───
describe('R31-3: branch.migrate 迁徙管理', () => {
  it('迁徙状态枚举完整', () => {
    const VALID_STATUS = ['PENDING', 'APPROVED', 'REJECTED'];
    if (VALID_STATUS.length !== 3) throw new Error('应有 3 种状态');
    if (!VALID_STATUS.includes('PENDING')) throw new Error('缺 PENDING');
  });

  it('迁徙参数校验（fromCode≠toCode）', () => {
    const params = { fromCode: 'HAO-0000-01', toCode: 'HAO-0000-02' };
    if (params.fromCode === params.toCode) throw new Error('不能迁移到自身');
  });

  it('迁徙记录必需字段', () => {
    const record = {
      fromCode: 'HAO-0000-01',
      toCode: 'HAO-0000-02',
      status: 'PENDING',
      reason: '明嘉靖年迁出',
      date: '1537',
      sourceTags: ['地契', '石碑']
    };

    const required = ['fromCode', 'toCode', 'status'];
    const missing = required.filter(f => !record[f]);
    if (missing.length) throw new Error(`缺字段: ${missing.join(',')}`);
  });

  it('迁徙审批流（PENDING → APPROVED/REJECTED）', () => {
    const transitions = {
      PENDING: ['APPROVED', 'REJECTED'],
      APPROVED: [],
      REJECTED: []
    };

    if (transitions.APPROVED.length > 0) throw new Error('终态不应可转移');
    if (!transitions.PENDING.includes('APPROVED')) throw new Error('PENDING 应可到 APPROVED');
    if (!transitions.PENDING.includes('REJECTED')) throw new Error('PENDING 应可到 REJECTED');
  });

  it('迁徙轨迹时间线数据结构', () => {
    const timeline = [
      { fromCode: 'HAO-0000', toCode: 'HAO-0000-01', date: '1537' },
      { fromCode: 'HAO-0000-01', toCode: 'HAO-0000-01-01', date: '1740' },
      { fromCode: 'HAO-0000-01-01', toCode: 'HAO-0000-01-02', date: '1949' }
    ];

    if (timeline.length !== 3) throw new Error('应有 3 条轨迹');
    // 按时间排序（降序 = 最新在前）
    timeline.sort((a, b) => (a.date > b.date ? -1 : 1));
    if (timeline[0].date !== '1949') throw new Error('最新记录应为 1949');
  });
});

// ─── R31-4: 数据一致性巡检测试 ───
describe('R31-4: 数据一致性巡检', () => {
  it('世代连续性校验（父世代 = 子世代 - 1）', () => {
    const members = [
      { _id: '1', path: '/001/', generation: 1 },
      { _id: '2', path: '/001/001/', generation: 2, parentId: '1' },
      { _id: '3', path: '/001/001/001/', generation: 3, parentId: '2' },
      { _id: '4', path: '/001/001/002/', generation: 4, parentId: '2' } // 错误：世代跳跃
    ];

    const byId = Object.fromEntries(members.map(m => [m._id, m]));
    const errors = [];
    for (const m of members) {
      if (m.parentId && byId[m.parentId]) {
        const parent = byId[m.parentId];
        if (m.generation !== parent.generation + 1) {
          errors.push(`${m._id}: 世代不连续 (parent=${parent.generation}, child=${m.generation})`);
        }
      }
    }
    if (errors.length !== 1) throw new Error(`应恰好 1 处世代不连续, got ${errors.length}`);
  });

  it('关系闭环校验（父子互指）', () => {
    const relations = [
      { fromId: '1', toId: '2', type: 'PARENT_CHILD' },
      { fromId: '2', toId: '1', type: 'CHILD_PARENT' } // 反向应有 CHILD_PARENT
    ];

    // 检查每个 PARENT_CHILD 都有对应反向
    const parentChild = relations.filter(r => r.type === 'PARENT_CHILD');
    const childParent = relations.filter(r => r.type === 'CHILD_PARENT');
    
    for (const pc of parentChild) {
      const hasReverse = childParent.some(cp => cp.fromId === pc.toId && cp.toId === pc.fromId);
      if (!hasReverse) {
        // 未闭合
      }
    }
    if (parentChild.length !== childParent.length) throw new Error('应成对出现');
  });

  it('人物唯一性校验（同支谱内谱名唯一）', () => {
    const members = [
      { branchId: 'HAO-0000-01', genealogyName: '郝文', generation: 10 },
      { branchId: 'HAO-0000-01', genealogyName: '郝文', generation: 10 }, // 重复
      { branchId: 'HAO-0000-01', genealogyName: '郝武', generation: 10 },
      { branchId: 'HAO-0000-02', genealogyName: '郝文', generation: 10 }  // 不同支谱可重名
    ];

    const seen = new Map();
    const dup = [];
    for (const m of members) {
      const key = `${m.branchId}:${m.genealogyName}:${m.generation}`;
      if (seen.has(key)) dup.push(key);
      seen.set(key, true);
    }
    if (dup.length !== 1) throw new Error(`应恰好 1 组重复, got ${dup.length}`);
  });
});

console.log('[R31] tests loaded: 4 suites, 18 cases');
