/**
 * cloud/functions/auth/index.js
 * MVP Core + W2: 认证三选一 + 角色体系 + 认证工单
 *
 * 认证流程（文档 6.3）：
 *   1. 微信登录 → users(VISITOR)
 *   2. 三选一：① 房长邀请码 ② 父亲姓名+房支人工审核 ③ 族人邀请链接
 *   3. 双人审核通过 → 绑定 memberId → 角色 MEMBER → 解锁 L2
 *   4. 访客仅可浏览英烈献花（L1）
 */
const wx = require('wx-server-sdk');
const crypto = require('crypto');
const { OK, BAD_REQUEST, FORBIDDEN } = require('./common/response');
wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

// R23: 密码哈希占位（真实生产改 pbkdf2+独立盐；此处 sha256(salt:pwd) 保证可测确定性）
function simpleHash(pwd, salt) {
  return crypto.createHash('sha256').update(`${salt}:${pwd}`).digest('hex');
}
const PWD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

// 角色等级表（数值越大权限越高）
const ROLE_LEVEL = {
  VISITOR: 0,
  MEMBER: 1,
  BRANCH_HEAD: 2,
  EDITOR: 3,
  HISTORIAN: 4,
  CHIEF: 5
};

async function main(params, context) {
  const { action } = params;

  switch (action) {
    case 'certify':
      return await certify(params, context);
    case 'auditCertify':
      // 族史委/房长 审核认证工单
      return await auditCertify(params, context);
    case 'grantAuth':
      return await grantAuth(params, context);
    case 'setDelegates':
      return await setDelegates(params, context);
    case 'revokeDelegate':
      return await revokeDelegate(params, context);
    case 'setReversePassword':
      return await setReversePassword(params, context);
    case 'verifyReverse':
      return await verifyReverse(params, context);
    default:
      return { success: false, error: 'Unknown action: ' + action };
  }
}

/**
 * 认证三选一入口
 * method: INVITE_CODE | MANUAL_REVIEW | FAMILY_LINK
 */
async function certify(params, context) {
  const db = wx.getDatabase();
  const openid = context.OPENID || context.openid;
  const { method } = params;

  // 1. 确认用户存在且未认证
  const userRes = await db.collection('users').where({ openid }).get();
  if (!userRes.data.length) {
    return { success: false, error: '请先微信登录' };
  }
  const user = userRes.data[0];
  if (user.status === 'ACTIVE') {
    return { success: false, error: '您已完成认证' };
  }

  // 2. 按方式分发
  if (method === 'INVITE_CODE') {
    return await certifyByInviteCode(user, params.code, db);
  }

  if (method === 'MANUAL_REVIEW') {
    return await certifyByManualReview(user, params, db, openid);
  }

  if (method === 'FAMILY_LINK') {
    return await certifyByFamilyLink(user, params, db);
  }

  return { success: false, error: '未知认证方式' };
}

/** ① 房长邀请码：6 位码，房长生成后直接放行（房长本人担保） */
async function certifyByInviteCode(user, code, db) {
  if (!code || code.length !== 6) {
    return { success: false, error: '邀请码格式错误' };
  }

  const codeRes = await db.collection('settings')
    .where({ key: 'inviteCode', code }).get();

  if (!codeRes.data.length) {
    return { success: false, error: '邀请码无效或已过期' };
  }

  const invite = codeRes.data[0];
  if (invite.usedCount >= invite.maxUses) {
    return { success: false, error: '邀请码已达使用上限' };
  }

  // 直接通过（房长担保），绑定房支
  return await activateMember(user, {
    branchId: invite.branchId,
    method: 'INVITE_CODE',
    guarantor: invite.createdBy
  }, db);
}

/** ② 人工审核：创建认证工单，等待双人审核 */
async function certifyByManualReview(user, params, db, openid) {
  const { fatherName, branchName, contact } = params;
  if (!fatherName || !branchName) {
    return { success: false, error: '请填写父亲姓名与房支' };
  }

  const ticketId = db.collection('entry_records').doc()._id; // 生成 ID 占位

  await db.collection('entry_records').add({
    data: {
      type: 'CERTIFY',
      ticketId,
      applicantOpenid: openid,
      applicantUserId: user._id,
      payload: { fatherName, branchName, contact },
      auditChain: [{ step: 'SUBMITTED', userId: openid, time: new Date() }],
      status: 'SUBMITTED',
      createdAt: new Date()
    }
  });

  // 审计
  await db.collection('audit_logs').add({
    data: {
      userId: openid,
      action: 'auth.certify.submit',
      target: ticketId,
      detail: `人工审核认证申请：父亲=${fatherName} 房支=${branchName}`,
      time: new Date()
    }
  });

  return { success: true, ticketId, message: '已提交，等待族史委双人审核' };
}

/** ③ 族人邀请链接：链接携带邀请人 memberId，自动绑定同房支 */
async function certifyByFamilyLink(user, params, db) {
  const { inviterMemberId } = params;
  if (!inviterMemberId) {
    return { success: false, error: '邀请链接无效' };
  }

  const inviterRes = await db.collection('users')
    .where({ memberId: inviterMemberId }).get();
  if (!inviterRes.data.length || inviterRes.data[0].status !== 'ACTIVE') {
    return { success: false, error: '邀请人身份无效' };
  }

  const inviter = inviterRes.data[0];
  return await activateMember(user, {
    branchId: inviter.branchId,
    method: 'FAMILY_LINK',
    guarantor: inviter.openid
  }, db);
}

/** 激活会员：绑定 memberId、角色 MEMBER、解锁 L2 */
async function activateMember(user, meta, db) {
  const openid = user.openid;

  // 在 members 中创建或关联族人档案
  const memberRes = await db.collection('members')
    .where({ linkedOpenid: openid }).get();

  let memberId;
  if (memberRes.data.length) {
    memberId = memberRes.data[0]._id;
  } else {
    const addRes = await db.collection('members').add({
      data: {
        linkedOpenid: openid,
        branchId: meta.branchId,
        status: 'ALIVE',
        createdBy: openid,
        createdAt: new Date(),
        version: 1
      }
    });
    memberId = addRes._id;
  }

  // 更新用户：VISITOR → MEMBER
  await db.collection('users').doc(user._id).update({
    data: {
      role: 'MEMBER',
      memberId,
      branchId: meta.branchId,
      status: 'ACTIVE',
      privacyDefault: 'L2',
      certifiedAt: new Date(),
      certifyMethod: meta.method
    }
  });

  // 审计
  await db.collection('audit_logs').add({
    data: {
      userId: openid,
      action: 'auth.certify.approved',
      target: memberId,
      detail: `认证通过（${meta.method}），担保人=${meta.guarantor}`,
      time: new Date()
    }
  });

  return {
    success: true,
    userInfo: {
      id: user._id,
      role: 'MEMBER',
      memberId,
      branchId: meta.branchId,
      status: 'ACTIVE'
    }
  };
}

/** 双人审核认证工单（W2 核心） */
async function auditCertify(params, context) {
  const db = wx.getDatabase();
  const openid = context.OPENID || context.openid;
  const { ticketId, approve, comment } = params;

  // 审核权限：BRANCH_HEAD 以上
  const auditorRes = await db.collection('users').where({ openid }).get();
  const auditor = auditorRes.data[0];
  if (!auditor || ROLE_LEVEL[auditor.role] < ROLE_LEVEL.BRANCH_HEAD) {
    return { success: false, error: '无审核权限' };
  }

  const ticketRes = await db.collection('entry_records').doc(ticketId).get();
  const ticket = ticketRes.data;
  if (!ticket || ticket.status !== 'SUBMITTED' && ticket.status !== 'FIRST_PASS') {
    return { success: false, error: '工单状态不可审核' };
  }

  // 双人制：同一审核人不能审核两次
  const alreadyAudited = ticket.auditChain.some(
    s => s.userId === openid && (s.action === 'FIRST_PASS' || s.action === 'SECOND_PASS')
  );
  if (alreadyAudited) {
    return { success: false, error: '双人审核制：您已审核过此工单' };
  }

  if (!approve) {
    // 驳回必须填意见
    if (!comment) return { success: false, error: '驳回必须填写意见' };
    await db.collection('entry_records').doc(ticketId).update({
      data: {
        status: 'REJECTED',
        auditChain: [...ticket.auditChain, { step: 'REJECTED', userId: openid, comment, time: new Date() }]
      }
    });
    return { success: true, result: 'REJECTED' };
  }

  const step = ticket.status === 'SUBMITTED' ? 'FIRST_PASS' : 'SECOND_PASS';
  const newChain = [...ticket.auditChain, { step, userId: openid, comment: comment || '', time: new Date() }];

  if (step === 'FIRST_PASS') {
    await db.collection('entry_records').doc(ticketId).update({
      data: { status: 'FIRST_PASS', auditChain: newChain }
    });
    return { success: true, result: 'FIRST_PASS', message: '初审通过，等待第二位审核人' };
  }

  // SECOND_PASS：直接激活
  const userRes = await db.collection('users').doc(ticket.applicantUserId).get();
  const result = await activateMember(userRes.data, {
    branchId: ticket.payload.branchName,
    method: 'MANUAL_REVIEW',
    guarantor: openid
  }, db);

  await db.collection('entry_records').doc(ticketId).update({
    data: { status: 'APPROVED', auditChain: newChain }
  });

  return { success: true, result: 'APPROVED', userInfo: result.userInfo };
}

/** 隐私授权（authorizations 集合） */
async function grantAuth(params, context) {
  const db = wx.getDatabase();
  const openid = context.OPENID || context.openid;
  const { grantee, scope, expiresAt } = params;

  await db.collection('authorizations').add({
    data: {
      grantor: openid,
      grantee,
      scope,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      createdAt: new Date()
    }
  });

  await db.collection('audit_logs').add({
    data: { userId: openid, action: 'auth.grantAuth', target: grantee, detail: JSON.stringify(scope), time: new Date() }
  });

  return { success: true };
}

module.exports = { main, ROLE_LEVEL };

// ─── R23: 私密委托（蓝图 24.2：每人最多 3 名代理人，细粒度授权） ───

/**
 * auth.setDelegates 设置代理人
 * 入参：{ delegates: [{ userId, scopes: ['ALBUM:a1','VIDEO:v1',...] }], smsCode? }
 * 限制：≤3 名；必须为认证族人（stub 内 users.status === 'ACTIVE'）
 */
async function setDelegates(params, context) {
  const db = wx.getDatabase();
  const openid = context.OPENID || context.openid;
  const { delegates, smsCode } = params || {};

  if (!Array.isArray(delegates) || delegates.length === 0) {
    return BAD_REQUEST('delegates 必需为非空数组');
  }
  if (delegates.length > 3) return BAD_REQUEST('代理人最多 3 名');
  if (smsCode !== '000000') return BAD_REQUEST('短信验证码错误'); // R23 占位：真实走腾讯云短信

  // 校验每个代理人是认证族人
  for (const d of delegates) {
    if (!d.userId) return BAD_REQUEST('代理人缺少 userId');
    const u = await db.collection('users').where({ openid: d.userId }).get();
    const row = u.data && u.data[0];
    if (!row || row.status !== 'ACTIVE') return BAD_REQUEST(`代理人 ${d.userId} 未认证`);
    if (!Array.isArray(d.scopes) || d.scopes.length === 0) return BAD_REQUEST(`代理人 ${d.userId} 缺少授权范围`);
  }

  await db.collection('users').where({ openid }).update({
    data: { delegates: delegates.map(d => ({ userId: d.userId, scopes: d.scopes })), updatedAt: new Date() }
  });
  await db.collection('audit_logs').add({
    userId: openid, action: 'auth.setDelegates', target: JSON.stringify(delegates.map(d => d.userId)),
    detail: 'R23 delegate set', time: new Date()
  });

  return OK({ delegates, message: '代理人已生效' });
}

/**
 * auth.revokeDelegate 撤销代理
 * 入参：{ delegateId }
 */
async function revokeDelegate(params, context) {
  const db = wx.getDatabase();
  const openid = context.OPENID || context.openid;
  const { delegateId } = params || {};
  if (!delegateId) return BAD_REQUEST('缺少 delegateId');

  const me = await db.collection('users').where({ openid }).get();
  const cur = (me.data && me.data[0] && me.data[0].delegates) || [];
  const remaining = cur.filter(d => d.userId !== delegateId);
  if (remaining.length === cur.length) return BAD_REQUEST('该代理人不存在');

  await db.collection('users').where({ openid }).update({
    data: { delegates: remaining, updatedAt: new Date() }
  });
  await db.collection('audit_logs').add({
    userId: openid, action: 'auth.revokeDelegate', target: delegateId, detail: 'R23 revoke', time: new Date()
  });
  return OK({ message: '代理人已撤销' });
}

// ─── R23: 反向密码（蓝图 24.4：独立第二密码，仅敏感操作二次验证） ───

/**
 * auth.setReversePassword 设置反向密码
 * 入参：{ newReversePwd }（≥8 位含大小写+数字；与主密码不同的校验由前端+服务端占位）
 */
async function setReversePassword(params, context) {
  const db = wx.getDatabase();
  const openid = context.OPENID || context.openid;
  const { newReversePwd } = params || {};

  if (!newReversePwd || !PWD_RE.test(newReversePwd)) {
    return BAD_REQUEST('反向密码需 ≥8 位且含大小写字母与数字');
  }

  const hash = simpleHash(newReversePwd, openid);
  await db.collection('users').where({ openid }).update({
    data: { reversePasswordHash: hash, updatedAt: new Date() }
  });
  await db.collection('audit_logs').add({
    userId: openid, action: 'auth.setReversePassword', target: openid, detail: 'reverse pwd set', time: new Date()
  });
  return OK({ message: '反向密码已设置' });
}

/**
 * auth.verifyReverse 校验反向密码 → 短期放行令牌
 * 入参：{ reversePwd }
 */
async function verifyReverse(params, context) {
  const db = wx.getDatabase();
  const openid = context.OPENID || context.openid;
  const { reversePwd } = params || {};
  if (!reversePwd) return BAD_REQUEST('缺少 reversePwd');

  const me = await db.collection('users').where({ openid }).get();
  const user = me.data && me.data[0];
  if (!user || !user.reversePasswordHash) return BAD_REQUEST('尚未设置反向密码');

  const expect = simpleHash(reversePwd, openid);
  if (expect !== user.reversePasswordHash) {
    return FORBIDDEN('反向密码错误');
  }

  // 短时效令牌占位（真实：JWT/签名 + 5 分钟过期）
  const token = simpleHash(`${openid}:${Date.now()}`, 'relax-token');
  return OK({ token, expiresIn: 300, message: '二次验证通过' });
}
