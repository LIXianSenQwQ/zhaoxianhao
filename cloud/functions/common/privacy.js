/**
 * cloud/functions/common/privacy.js
 * 隐私校验纯函数（文档 7.4 privacyCheck + V1.1 8.3.1 visibilityCheck）
 *
 * 设计约定：不直接访问数据库——请求者的角色/房支/授权列表由调用方查好传入，
 * 本模块只做纯判定，保证可单测、口径唯一（文档：称谓与五服不落库，同此理）。
 */

const { hasRole } = require('./roles');

/**
 * privacyCheck - L 级隐私判定（members 字段级）
 * @param {object} req       请求者 { role, branchId, openid, authedMemberIds:Set<string> }
 * @param {object} target    目标成员 { branchId, status, linkedOpenid, _id }
 * @param {string} level     '公开' | '限制' | '私密'
 * @returns {'allow'|'needAuth'}
 */
function privacyCheck(req, target, level) {
  // 已故成员：非私密可读；私密需族史委审批（文档 7.4）
  if (target.status === 'DECEASED') {
    return level !== '私密' || hasRole(req.role, 'HISTORIAN') ? 'allow' : 'needAuth';
  }

  if (level === '公开') {
    return hasRole(req.role, 'MEMBER') ? 'allow' : 'needAuth';
  }

  if (level === '限制') {
    const sameBranch = req.branchId && req.branchId === target.branchId;
    const directKin = req.authedMemberIds && req.authedMemberIds.has(target._id);
    const elevated = hasRole(req.role, 'CHIEF');
    return sameBranch || directKin || elevated ? 'allow' : 'needAuth';
  }

  // 私密：本人或持有有效 authorizations
  const isSelf = target.linkedOpenid === req.openid;
  const hasAuth = req.authedMemberIds && req.authedMemberIds.has(target._id);
  return isSelf || hasAuth ? 'allow' : 'needAuth';
}

/**
 * visibilityCheck - V1.1 三级可见性（avatars/albums/contents 等）
 * 与 L 级体系并行，取更严格一侧生效（文档 6.2 第 3 条）
 * @param {object} req        { openid, familyIds:Set, branchGroupIds:Set, authedTargetIds:Set }
 * @param {object} content    { visibility:'PRIVATE'|'PUBLIC'|'GROUP', ownerOpenid, groupIds?:string[] }
 * @returns {'allow'|'deny'}
 */
function visibilityCheck(req, content) {
  if (content.visibility === 'PUBLIC') {
    return 'allow'; // 是否"认证族人"由中间件上游的 role>=MEMBER 保证
  }
  if (content.visibility === 'PRIVATE') {
    const isSelf = content.ownerOpenid === req.openid;
    const delegated = req.authedTargetIds && req.authedTargetIds.has(content._id);
    return isSelf || delegated ? 'allow' : 'deny';
  }
  if (content.visibility === 'GROUP') {
    const isSelf = content.ownerOpenid === req.openid;
    const delegated = req.authedTargetIds && req.authedTargetIds.has(content._id);
    const inGroup =
      req.familyIds && content.groupIds
        ? content.groupIds.some(g => req.familyIds.has(g))
        : false;
    return isSelf || delegated || inGroup ? 'allow' : 'deny';
  }
  // 未知可见性按最严格处理（fail-closed）
  return 'deny';
}

module.exports = { privacyCheck, visibilityCheck };
