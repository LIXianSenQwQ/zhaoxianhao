/**
 * cloud/functions/relation/index.js
 * MVP Core: 称谓计算与五服判定（蓝图 7.2 / 7.3 / 9.1 relation.calc 权限 L2）
 * Sprint R11 重写（修复遗留桩代码：calc 引用未定义函数 findShortestPath 等 → 调用即 ReferenceError）：
 *   - 物化路径求共同祖先（R2 方案）：O(1) 前缀交集，取代双向 BFS（P95 预算）
 *   - 称谓/五服统一走 common/kindship 纯函数（口径唯一，与单测同源）
 *   - 统一响应规范（替换裸 {error}）+ L2 门禁 + 鉴权先行
 */
const wx = require('wx-server-sdk');
const { OK, BAD_REQUEST, FORBIDDEN, NOT_FOUND } = require('./common/response');
const { hasRole } = require('./common/roles');
const { fiveFu, kinshipTitle } = require('./common/kindship');
const { writeAudit } = require('./common/audit');

wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

async function main(event, context) {
  const openid = context.OPENID || context.openid;
  if (!openid) return FORBIDDEN('请先登录');
  const db = wx.getDatabase();
  const { action, aId, bId } = event;

  switch (action) {
    case 'calc':
      return await calcRelation(db, openid, aId, bId);
    case 'edit':
      return await editRelationship(db, openid, event);
    default:
      return BAD_REQUEST(`unknown action: ${action}`);
  }
}

function pickDoc(res) {
  if (!res || !res.data) return null;
  if (Array.isArray(res.data)) return res.data[0] || null;
  return res.data;
}

/**
 * 称谓计算（蓝图 7.2）：
 * 输入 A/B → 物化路径前缀交集求共同祖先 → n(A 上溯)/m(祖先下溯 B) → 矩阵查称谓 + 五服
 * 无共同祖先 → related:false + 同宗（fail-closed 口径与单测一致）
 */
/**
 * 解析成员出生序次：优先 birthOrder（整数，小者长），次之 birthDate（YYYY-MM-DD 转为 int），否则 null。
 */
function birthKeyOf(member) {
  if (member && member.birthOrder != null) return Number(member.birthOrder);
  const bd = member && typeof member.birthDate === 'string' ? member.birthDate : null;
  if (!bd) return null;
  // YYYYMMDD int for comparison
  const y = parseInt(bd.slice(0,4), 10);
  const m = parseInt(bd.slice(5,7), 10);
  const d = parseInt(bd.slice(8,10), 10);
  if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) return y * 10000 + m * 100 + d;
  return null;
}

/**
 * SPOUSE 姻亲称谓映射表（规则一：A 的血亲 X 之配偶 B）
 * 参数：X-blood-title (A calls X), X-gender, A-gender, seniority (A↔X generation/age context)
 * 返回值：姻亲标题或 null (未覆盖则回退到原行为)
 */
const SPICE_BY_BLOOD_X = Object.freeze({
  // X = A's sister (female, same gen, elder/younger)
  '姐': { female: { MALE: '姐夫', FEMALE: '妯娌' }, male: { MALE: '哥', FEMALE: '' } }, // partial
  '妹妹': { female: { MALE: '妹夫', FEMALE: '' } },
  '哥哥': { female: { MALE: '', FEMALE: '嫂子' } },
  '弟弟': { female: { MALE: '', FEMALE: '弟媳' } },
  '女儿': { female: { MALE: '女婿', FEMALE: '' } },
  '儿子': { female: { MALE: '儿媳', FEMALE: '' } },
  '姑姑': { female: { MALE: '姑父', FEMALE: '' } },
  '叔叔': { male: { FEMALE: '婶婶', MALE: '' } },
  '伯父': { male: { FEMALE: '伯母', MALE: '' } }
});

/**
 * 姻亲映射表（规则二：A 的配偶 X 之血亲 B）
 * 基于 A-gender, X-gender, X→B-title, B-gender
 * 注：仅实现第一层级（spouse 的父母/兄弟姐妹）
 */
const BY_SPOUSES_BLOOD_KIN = Object.freeze({
  // X=A's wife (X=FEMALES, A=MALE)
  'wife_parent_MALE': { result: '岳父' },      // wife's father
  'wife_parent_FEMALE': { result: '岳母' },    // wife's mother
  'wife_sib_MALE_older': { result: '大舅子' }, // wife's older brother (relative to her age)
  'wife_sib_MALE_younger': { result: '小舅子' },
  'wife_sib_FEMALE_older': { result: '大姨子' },
  'wife_sib_FEMALE_younger': { result: '小姨子' },
  // X=A's husband (X=MALE, A=FEMALE)
  'husband_parent_MALE': { result: '公公' },
  'husband_parent_FEMALE': { result: '婆婆' },
  'husband_sib_MALE_older': { result: '大伯子' },
  'husband_sib_MALE_younger': { result: '小叔子' },
  'husband_sib_FEMALE_older': { result: '大姑子' },
  'husband_sib_FEMALE_younger': { result: '小姑子' }
});

async function calcRelation(db, openid, aId, bId) {
  if (!aId || !bId) return BAD_REQUEST('缺少 aId 或 bId');

  // L2 门禁（蓝图 9.1：relation.calc 权限 L2）
  const userRes = await db.collection('users').where({ openid }).limit(1).get();
  const role = (userRes.data[0] && userRes.data[0].role) || 'VISITOR';
  if (!hasRole(role, 'MEMBER')) return FORBIDDEN('认证族人方可使用称谓计算');

  if (aId === bId) {
    return OK({ related: true, formalTitle: '本人', fiveFu: fiveFu(1), upSteps: 0, downSteps: 0, path: '' });
  }

  const [aRes, bRes] = await Promise.all([
    db.collection('members').doc(aId).get().catch(() => null),
    db.collection('members').doc(bId).get().catch(() => null)
  ]);
  const a = pickDoc(aRes);
  const b = pickDoc(bRes);
  if (!a || !a.path) return NOT_FOUND('成员 A 不存在或未挂接世系');
  if (!b || !b.path) return NOT_FOUND('成员 B 不存在或未挂接世系');

  const as = String(a.path).split('/').filter(Boolean);
  const bs = String(b.path).split('/').filter(Boolean);
  let common = 0;
  while (common < as.length && common < bs.length && as[common] === bs[common]) common++;

  if (common === 0) {
    return OK({ related: false, formalTitle: '同宗', fiveFu: '同宗', upSteps: null, downSteps: null, path: '' });
  }

  const upSteps = as.length - common;    // A 上溯至共同祖先 n
  const downSteps = bs.length - common;  // 共同祖先下溯至 B m
  /** 同代（up===down）且需 seniority：按实际出生信息决定；无数据则保持确定性默认值 elder（向后兼容） */
  let seniority = 'elder'; // deterministic default
  if (upSteps === downSteps && upSteps > 0) {
    const ka = birthKeyOf(a);
    const kb = birthKeyOf(b);
    if (ka !== null && kb !== null && ka !== kb) {
      seniority = ka < kb ? 'younger' : 'elder'; // A 年长 → B 为 younger sibling
    }
  }
  const title = kinshipTitle(upSteps, downSteps, b.gender === 'FEMALE' ? 'FEMALE' : 'MALE', seniority);

  await writeAudit(db, { userId: openid, action: 'relation.calc', target: `${aId}->${bId}`, detail: `n=${upSteps} m=${downSteps}` }).catch(() => {});

  return OK({
    related: true,
    formalTitle: title,
    fiveFu: fiveFu(upSteps),
    upSteps,
    downSteps,
    path: '/' + as.slice(0, common).join('/') + '/'
  });
}

/**
 * L4 关系编辑（蓝图 9.1 relation.edit + 7.6/7.7 定案）：
 * 审核封存后修改须走修谱变更流程 → 不直改 relations，而是创建
 * entry_records(type=CHANGE) 工单进入双人审核链（初审→复审→公示→APPROVED 后生效）。
 * R16 兑现：占位桩 → 校验（类型白名单/自环/双方存在/重复 ACTIVE 边）+ 建工单 + 审计。
 */
const RELATION_TYPES = ['PARENT_CHILD', 'SPOUSE', 'SIBLING', 'ADOPTED', 'MENTOR'];

async function editRelationship(db, openid, params) {
  const userRes = await db.collection('users').where({ openid }).limit(1).get();
  const role = (userRes.data[0] && userRes.data[0].role) || 'VISITOR';
  if (!hasRole(role, 'EDITOR')) return FORBIDDEN('仅编辑及以上可维护关系');

  const { fromId, toId, type, subType, startDate, endDate, note } = params || {};
  if (!fromId || !toId) return BAD_REQUEST('缺少 fromId 或 toId');
  if (fromId === toId) return BAD_REQUEST('不能对同一成员建立关系');
  if (!RELATION_TYPES.includes(type)) {
    return BAD_REQUEST(`关系类型须为：${RELATION_TYPES.join(' / ')}`);
  }
  if (subType && typeof subType !== 'string') return BAD_REQUEST('subType 须为字符串');

  const [aRes, bRes] = await Promise.all([
    db.collection('members').doc(fromId).get().catch(() => null),
    db.collection('members').doc(toId).get().catch(() => null)
  ]);
  if (!pickDoc(aRes)) return NOT_FOUND('fromId 成员不存在');
  if (!pickDoc(bRes)) return NOT_FOUND('toId 成员不存在');

  const dup = await db.collection('relations')
    .where({ fromId, toId, type, status: 'ACTIVE' }).count();
  if ((dup && dup.total) > 0) return BAD_REQUEST('该关系已存在（ACTIVE）');

  const now = new Date();
  const addRes = await db.collection('entry_records').add({
    data: {
      type: 'CHANGE',
      payload: {
        changeType: 'RELATION',
        relation: { fromId, toId, type, subType: subType || '', startDate: startDate || '', endDate: endDate || '' }
      },
      status: 'SUBMITTED',
      auditChain: [{ step: 'SUBMITTED', userId: openid, action: 'CREATE', time: now, comment: note || '' }],
      submittedBy: openid,
      createdAt: now
    }
  });

  await writeAudit(db, {
    userId: openid,
    action: 'relation.edit',
    target: `${fromId}->${toId}:${type}`,
    detail: `工单 ${addRes._id}（双人审核链）`
  }).catch(() => {});

  return OK({
    recordId: addRes._id,
    status: 'SUBMITTED',
    message: '已提交修谱变更工单，双人审核通过并公示后生效'
  });
}

module.exports = { main };
