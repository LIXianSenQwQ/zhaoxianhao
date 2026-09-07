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
 * 从 relations collection 查询指定成员的配偶（ACTIVE SPOUSE edge）
 * @param {string} memberId — find spouse of this member (either fromId or toId)
 * @returns {Promise<{id:string,type:'SPOUSE',otherId:string}|null>}
 */
async function findSpouse(db, memberId) {
  const res = await db.collection('relations')
    .where({ $or: [{ fromId: memberId }, { toId: memberId }], type: 'SPOUSE', status: 'ACTIVE' })
    .limit(1).get();
  if (!res || !res.data.length) return null;
  const rel = res.data[0];
  const otherId = rel.fromId === memberId ? rel.toId : rel.fromId;
  return { id: rel._id, type: 'SPOUSE', otherId };
}

/**
 * 规则一：A 的血亲 X 之配偶 B → A calls B as my [X-title]'s spouse (e.g., 姐夫/妹夫/嫂子/弟媳/姑父/伯母/婶婶/儿媳/女婿)
 * @param {object} a — member doc
 * @param {object} b — member doc whose title we want (B = spouse of some blood kin X of A)
 * @returns {Promise<string|null>}
 */
async function spouseOfMyKinTitle(db, a, b) {
  // Find X = spouse of B (i.e., B is spouse of X, who should be blood kin of A)
  const spouseRel = await findSpouse(db, b._id);
  if (!spouseRel) return null;
  const xRes = await db.collection('members').doc(spouseRel.otherId).get().catch(() => null);
  const x = pickDoc(xRes);
  if (!x) return null;

  // Compute blood relation A↔X via path prefixes
  const as = String(a.path).split('/').filter(Boolean);
  const xs = String(x.path).split('/').filter(Boolean);
  let commonAX = 0;
  while (commonAX < as.length && commonAX < xs.length && as[commonAX] === xs[commonAX]) commonAX++;

  if (commonAX === 0) return null; // no blood link between A and X
  const nAX = as.length - commonAX;     // A→X up steps
  const mAX = xs.length - commonAX;     // common ancestor↓X down steps

  // Only compute for certain levels (same gen sibling, parent's sibling, child, niece/nephew)
  if (!((nAX === 1 && mAX === 1) || (nAX === 2 && mAX === 1) || (nAX === 0 && mAX === 1) || (nAX === 1 && mAX === 2))) {
    return null;
  }

  const seniorityKey = `${nAX}-${mAX}`;
  const xGender = x.gender; // 'MALE'|'FEMALE'
  let title = null;

  if (seniorityKey === '1-1') { // X is A's sibling
    // Same generation sibling: seniority = X is elder than A → 'elder'，否则 'younger'
    const ka = birthKeyOf(a);
    const kx = birthKeyOf(x);
    const sen = (ka !== null && kx !== null) ? (ka < kx ? 'younger' : 'elder') : 'elder';
    if (xGender === 'FEMALE') {
      title = sen === 'elder' ? '姐夫' : '妹夫'; // X 是姐→B=姐夫；X 是妹→B=妹夫
    } else { // X male
      title = sen === 'elder' ? '嫂子' : '弟媳'; // X 兄→B=嫂子; X弟→B=弟媳
    }
  } else if (seniorityKey === '2-1') { // X is parent's sibling (叔伯/姑)
    title = xGender === 'FEMALE' ? '姑父' : '伯母/婶婶'; // simplified generic
  } else if (seniorityKey === '0-1') { // X is A's child
    title = xGender === 'MALE' ? '儿媳' : '女婿';
  } else if (seniorityKey === '1-2') { // X is A's nephew/niece (one gen lower)
    title = xGender === 'MALE' ? '侄媳妇' : '侄女婿';
  }

  return title || null;
}

/**
 * 规则二：B is blood relative of A's spouse X → A calls B as per Chinese in-law conventions
 * Covers first-order: spouse's parents & siblings
 * @param {object} a — member doc
 * @param {object} b — member doc
 * @returns {Promise<string|null>}
 */
async function mySpouseKinTitle(db, a, b) {
  // Find X = spouse of A
  const spouseRel = await findSpouse(db, a._id);
  if (!spouseRel) return null;
  const xRes = await db.collection('members').doc(spouseRel.otherId).get().catch(() => null);
  const x = pickDoc(xRes);
  if (!x) return null;

  // Compute blood relation X↔B via path prefixes
  const xs = String(x.path).split('/').filter(Boolean);
  const bs = String(b.path).split('/').filter(Boolean);
  let commonXB = 0;
  while (commonXB < xs.length && commonXB < bs.length && xs[commonXB] === bs[commonXB]) commonXB++;

  if (commonXB === 0) return null; // X and B not blood related
  const nXB = xs.length - commonXB;     // X→B up
  const mXB = bs.length - commonXB;     // common ancestor↓B down

  // Only cover parents (1-0) & siblings (1-1), skip deeper generations
  if (!( (nXB===1 && mXB===0) || (nXB===1 && mXB===1) )) {
    return null;
  }

  // Seniority: B relative to X (for sibling case). birthKey 小者年长
  const kb = birthKeyOf(b);
  const kx = birthKeyOf(x);
  const bElderThanX = kb !== null && kx !== null && kb < kx;

  const xGender = x.gender; // 'MALE'|'FEMALE'

  let title = null;
  if (nXB === 1 && mXB === 0) {
    // B is X's parent
    if (xGender === 'FEMALE') { // X is wife of A (a is MALE)
      title = b.gender === 'MALE' ? '岳父' : '岳母';
    } else { // X is husband (a is FEMALE)
      title = b.gender === 'MALE' ? '公公' : '婆婆';
    }
  } else if (nXB === 1 && mXB === 1) {
    // B is X's sibling
    if (xGender === 'FEMALE') { // X is wife
      if (b.gender === 'MALE') title = bElderThanX ? '大舅子' : '小舅子';
      else title = bElderThanX ? '大姨子' : '小姨子';
    } else { // X is husband
      if (b.gender === 'MALE') title = bElderThanX ? '大伯子' : '小叔子';
      else title = bElderThanX ? '大姑子' : '小姑子';
    }
  }

  return title || null;
}

async function calcRelation(db, openid, aId, bId) {
  if (!aId || !bId) return BAD_REQUEST('缺少 aId 或 bId');

  // L2 门禁（蓝图 9.1：relation.calc 权限 L2）
  const userRes = await db.collection('users').where({ openid }).limit(1).get();
  const role = (userRes.data[0] && userRes.data[0].role) || 'VISITOR';
  if (!hasRole(role, 'MEMBER')) return FORBIDDEN('认证族人方可使用称谓计算');

  if (aId === bId) {
    return OK({ related: true, formalTitle: '本人', fiveFu: fiveFu(0), upSteps: 0, downSteps: 0, path: '' });
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
    // §7.2 姻亲桥：无血亲共同祖先时尝试通过 SPOUSE 边计算姻亲称谓
    const spouseTitle = await spouseOfMyKinTitle(db, a, b) || await mySpouseKinTitle(db, a, b);
    if (spouseTitle) {
      await writeAudit(db, { userId: openid, action: 'relation.calc', target: `${aId}->${bId}`, detail: `姻亲: ${spouseTitle}` }).catch(() => {});
      return OK({ related: true, formalTitle: spouseTitle, fiveFu: '姻亲', upSteps: 0, downSteps: 0, path: '', through: 'SPOUSE' });
    }
    return OK({ related: false, formalTitle: '同宗', fiveFu: '同宗', upSteps: null, downSteps: null, path: '' });
  }

  const upSteps = as.length - common;    // A 上溯至共同祖先 n
  const downSteps = bs.length - common;  // 共同祖先下溯至 B m
  
  // §7.2 方言：从 settings 读取 kindshipDialect 覆盖表（key 约定见蓝图 42 settings {key,value,scope}）
  let dialectOverride = null;
  try {
    const setRes = await db.collection('settings').where({ key: 'kindshipDialect' }).limit(1).get();
    const sett = pickDoc(setRes);
    if (sett && sett.value != null) {
      const raw = typeof sett.value === 'string' ? (() => { try { return JSON.parse(sett.value); } catch (e) { return null; } })() : sett.value;
      dialectOverride = (raw && raw.overrides) ? raw.overrides : raw; // value 可为 {overrides:{...}} 或直接 {...}
    }
  } catch { /* read failure → no override, safe fallback */ }

  /** 同代（up===down）且需 seniority：按实际出生信息决定；无数据则保持确定性默认值 elder（向后兼容） */
  let seniority = 'elder'; // deterministic default
  if (upSteps === downSteps && upSteps > 0) {
    const ka = birthKeyOf(a);
    const kb = birthKeyOf(b);
    if (ka !== null && kb !== null && ka !== kb) {
      seniority = ka < kb ? 'younger' : 'elder'; // A 年长 → B 为 younger sibling
    }
  }
  const result = kinshipTitle(upSteps, downSteps, b.gender === 'FEMALE' ? 'FEMALE' : 'MALE', seniority, dialectOverride);

  await writeAudit(db, { userId: openid, action: 'relation.calc', target: `${aId}->${bId}`, detail: `n=${upSteps} m=${downSteps}` }).catch(() => {});

  return OK({
    related: true,
    formalTitle: result.formal,
    dialectTitle: result.dialect || null, // additive field, optional
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
