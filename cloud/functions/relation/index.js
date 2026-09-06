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
  const title = kinshipTitle(upSteps, downSteps, b.gender === 'FEMALE' ? 'FEMALE' : 'MALE', upSteps >= downSteps ? 'elder' : 'younger');

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

/** L4 权限关系编辑（双人审核走 entry 工单；此处仅校验+占位） */
async function editRelationship(db, openid, params) {
  const userRes = await db.collection('users').where({ openid }).limit(1).get();
  const role = (userRes.data[0] && userRes.data[0].role) || 'VISITOR';
  if (!hasRole(role, 'EDITOR')) return FORBIDDEN('仅编辑及以上可维护关系');

  return BAD_REQUEST('关系变更请走入谱工作流 entry.submit(type=CHANGE)（双人审核链）');
}

module.exports = { main };
