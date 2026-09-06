/**
 * cloud/functions/common/points.js
 * 系统侧积分发放公共模块（文档 7.5 积分原子性 / 7.9 打卡与祭祀联动）
 *
 * 口径统一（R13 收口，ceremony.worship 与 task.checkin 共用本实现）：
 *   1. 流水先插（幂等键 = bizType + bizId + userId，文档 7.5 定案）
 *   2. 幂等命中 → 直接返回既有流水结果，绝不重复加分
 *   3. 账户四池原子 inc（不存在则建零账户后赋值）
 *
 * 注意：points.award 已收口为 EDITOR 代发门禁（R12）；系统内部发放
 * 一律走本模块本地实现，禁止再 callFunction 回环（stub 不可用 + 门禁不匹配）。
 */

const POOLS = Object.freeze(['xiaoqin', 'gongde', 'fuyun', 'normal']);

/**
 * 发放积分（幂等）
 * @param {object} db   wx.getDatabase() 实例
 * @param {object} opts { userId, pool, bizType, bizId, amount, note }
 * @returns {{duplicated:boolean, logId:string|null, delta:number, pool:string}}
 */
async function awardSystemPoints(db, { userId, pool, bizType, bizId, amount, note }) {
  if (!userId) throw badRequest('awardSystemPoints requires userId');
  if (!POOLS.includes(pool)) throw badRequest(`invalid points pool: ${pool}`);
  if (!bizType || !bizId) throw badRequest('awardSystemPoints requires bizType, bizId');

  const amt = Number(amount);
  if (!Number.isInteger(amt) || amt <= 0) throw badRequest(`invalid points amount: ${amount}`);

  const cmd = db.command;

  // 1) 幂等查重：同 bizType+bizId+userId 已有流水 → 返回既有结果
  const dup = await db.collection('points_logs').where({ bizType, bizId, userId }).limit(1).get();
  if (dup.data.length) {
    const hit = dup.data[0];
    return { duplicated: true, logId: hit._id, delta: hit.delta, pool: hit.pool || pool };
  }

  // 2) 流水先插（文档 7.5：先流水后账户）
  const logRes = await db.collection('points_logs').add({
    data: { userId, pool, delta: amt, bizType, bizId, note: note || '', time: new Date() }
  });
  const logId = logRes._id || logRes.id || null;

  // 3) 账户原子更新；缺账户则建零账户（新建无并发，直接赋首笔分值等价安全）
  const accRes = await db.collection('points_accounts').where({ userId }).limit(1).get();
  if (accRes.data.length) {
    await db.collection('points_accounts')
      .doc(accRes.data[0]._id)
      .update({ data: { [pool]: cmd.inc(amt), updatedAt: new Date() } });
  } else {
    await db.collection('points_accounts').add({
      data: {
        userId, xiaoqin: 0, gongde: 0, fuyun: 0, normal: 0,
        [pool]: amt, createdAt: new Date(), updatedAt: new Date()
      }
    });
  }

  return { duplicated: false, logId, delta: amt, pool };
}

function badRequest(msg) {
  const e = new Error(msg);
  e.code = 400;
  return e;
}

module.exports = { POOLS, awardSystemPoints };
