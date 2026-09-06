/**
 * cloud/functions/backup/index.js
 * V2.0 F3b: 相册自动备份队列 + 存储配额管理 + 恢复导出
 * 依赖：album_photos.backupStatus（PENDING/DONE/FAIL）+ backupAttempts + fileSize
 * 数据模型：
 *   • backup.process  —— 消费队列：PENDING/FAIL(attempts<3) → 备份 → DONE；失败累积 attempts
 *   • backup.retry    —— 重试队列视图（FAIL 未超限可手动重试）
 *   • backup.stats    —— 各状态统计 + 配额用量
 *   • backup.quota    —— 存储配额检查（默认 10GB/用户，settings 可覆盖 v20BackupQuotaGB）
 *   • backup.export   —— 恢复导出清单（DONE 的照片 → 下载清单）
 *   • backup.restore  —— 恢复：返回备份产物临时下载直链（真实环境由云存储回填）
 */
const wx = require('wx-server-sdk');
const { OK, BAD_REQUEST, FORBIDDEN } = require('./common/response');
const { hasRole } = require('./common/roles');
const { writeAudit } = require('./common/audit');

wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

const MAX_ATTEMPTS = 3;              // 重试上限
const BATCH_LIMIT = 50;              // 单批处理上限（云函数内存/时长控制）
const DEFAULT_QUOTA_GB = 10;         // 默认每用户备份配额
const GB = 1024 * 1024 * 1024;

/** 读取配额（settings 集合 key: v20BackupQuotaGB，未配置用默认值） */
async function readQuotaGB(db) {
  try {
    const s = (await db.collection('settings').where({ key: 'v20BackupQuotaGB' }).limit(1).get()).data || [];
    if (s.length && Number(s[0].value) > 0) return Number(s[0].value);
  } catch (e) { /* 默认值 */ }
  return DEFAULT_QUOTA_GB;
}

/** 用户已占用备份空间（DONE 行 fileSize 合计） */
async function usedBytesOf(db, userId) {
  const rows = (await db.collection('album_photos')
    .where({ userId, backupStatus: 'DONE' }).limit(1000).get()).data || [];
  return rows.reduce((acc, r) => acc + (Number(r.fileSize) || 0), 0);
}

/**
 * 执行单张照片备份。
 * 真实环境：wx.cloud.uploadFile 复制到 backup 前缀空间（异地/冷备），并返回产物 fileId；
 * 测试占位：fileId 以 `bad-` 开头模拟失败，否则返回 backup:// 产物标识。
 */
async function performBackup(fileId) {
  // TODO: 真实环境接入云存储复制（备份目录），此处为确定性占位便于测试
  if (String(fileId).startsWith('bad-')) {
    throw new Error('模拟备份失败：源文件不可读（bad- 前缀）');
  }
  const checksum = cryptoCreate().update(fileId).digest('hex').slice(0, 12);
  return `backup://albums/${checksum}/${fileId.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
}

/** 轻量 hash（node:crypto 不可用时回退简单散列，保证可在无网络沙箱跑） */
function cryptoCreate() {
  try {
    // eslint-disable-next-line global-require
    return require('crypto').createHash('sha1');
  } catch (e) {
    return { update: () => ({ digest: () => String(fileId) }) };
  }
}

/** 候选查询（PENDING 或 FAIL 且未达上限）——拉取后代码过滤避免依赖 stub 的 lt 指令 */
async function fetchCandidates(db, userId, limit) {
  const where = {};
  if (userId) where.userId = userId;
  const rows = (await db.collection('album_photos').where(where).limit(200).get()).data || [];
  return rows
    .filter(r => (r.backupAttempts || 0) < MAX_ATTEMPTS && (r.backupStatus === 'PENDING' || r.backupStatus === 'FAIL'))
    .slice(0, limit);
}

/**
 * F3b-1: backup.process —— 消费备份队列
 * 权限：CHIEF / EDITOR（系统定时触发器以 EDITOR 运行）。普通成员只能处理自己的 userId。
 */
async function backupProcess(ctx, { limit = BATCH_LIMIT, userId } = {}) {
  const db = wx.getDatabase();
  const n = Math.min(Math.max(1, Number(limit) || BATCH_LIMIT), BATCH_LIMIT);

  // 权限：管理员处理全量；MEMBER 仅自己的照片
  let scope = null;
  if (hasRole(ctx.role, 'EDITOR')) {
    scope = userId || null;
  } else if (ctx.role === 'MEMBER') {
    if (userId && userId !== ctx.openid) return FORBIDDEN('只能备份本人的照片');
    scope = ctx.openid;
  } else {
    return FORBIDDEN('无权限执行备份');
  }

  const candidates = await fetchCandidates(db, scope, n);
  if (!candidates.length) return OK({ processed: 0, done: 0, failed: 0, message: '队列为空' });

  const quotaGB = await readQuotaGB(db);
  const quotaBytes = quotaGB * GB;
  const report = { processed: 0, done: 0, failed: 0, quotaExceeded: 0, attempts: [], details: [] };

  for (const photo of candidates) {
    // 配额预检：备份占用（已用 + 本文件）不可超过配额
    const used = await usedBytesOf(db, photo.userId);
    const size = Number(photo.fileSize) || 0;
    if (used + size > quotaBytes) {
      report.quotaExceeded++;
      report.details.push({ photoId: photo._id, error: 'QUOTA_EXCEEDED' });
      continue; // 不入队失败态：配额为系统级限制，等待清理后重试
    }
    const attempt = (photo.backupAttempts || 0) + 1;
    try {
      const backupFileId = await performBackup(photo.fileId);
      await db.collection('album_photos').doc(photo._id).update({
        data: {
          backupStatus: 'DONE', backupAttempts: attempt,
          backupFileId, backupAt: new Date().toISOString(), backupError: null
        }
      });
      report.done++;
      report.attempts.push({ photoId: photo._id, attempt, status: 'DONE' });
    } catch (e) {
      const finalFail = attempt >= MAX_ATTEMPTS;
      await db.collection('album_photos').doc(photo._id).update({
        data: {
          backupStatus: finalFail ? 'FAIL' : 'PENDING',
          backupAttempts: attempt,
          backupError: (e && e.message) || 'backup failed'
        }
      });
      report.failed++;
      report.attempts.push({ photoId: photo._id, attempt, status: finalFail ? 'FAIL' : 'PENDING_RETRY' });
    }
    report.processed++;
  }

  await writeAudit(db, {
    userId: ctx.openid || 'system:cron', action: 'backup.process', target: 'album_photos',
    detail: JSON.stringify({ processed: report.processed, done: report.done, failed: report.failed, quotaExceeded: report.quotaExceeded }),
    time: new Date()
  });
  return OK(report);
}

/** F3b-2: backup.retry —— 重试队列（FAIL 且未达上限；管理员可将某用户/某照片立即重试） */
async function backupRetry(ctx, { userId } = {}) {
  const db = wx.getDatabase();
  if (!hasRole(ctx.role, 'EDITOR') && !(ctx.role === 'MEMBER' && (!userId || userId === ctx.openid))) {
    return FORBIDDEN('无权限查看重试队列');
  }
  const where = { backupStatus: 'FAIL' };
  if (userId) where.userId = userId;
  const rows = (await db.collection('album_photos').where(where).limit(500).get()).data || [];
  const queue = rows.map(r => ({
    photoId: r._id, albumId: r.albumId, userId: r.userId, fileId: r.fileId,
    attempts: r.backupAttempts || 0, retryable: (r.backupAttempts || 0) < MAX_ATTEMPTS,
    lastError: r.backupError || null, lastTryAt: r.backupAt || null
  }));
  return OK({ queue, total: queue.length, maxAttempts: MAX_ATTEMPTS });
}

/** F3b-3: backup.stats —— 状态统计（可限定用户） */
async function backupStats(ctx, { userId } = {}) {
  const db = wx.getDatabase();
  if (!hasRole(ctx.role, 'EDITOR') && !(ctx.role === 'MEMBER' && (!userId || userId === ctx.openid))) {
    return FORBIDDEN('无权限查看统计');
  }
  const q = {};
  if (userId) q.userId = userId;
  const rows = (await db.collection('album_photos').where(q).limit(1000).get()).data || [];
  const stats = { PENDING: 0, DONE: 0, FAIL: 0, totalBytes: 0 };
  rows.forEach(r => {
    if (stats[r.backupStatus] !== undefined) stats[r.backupStatus]++;
    stats.totalBytes += Number(r.fileSize) || 0;
  });
  return OK({ stats, total: rows.length, maxAttempts: MAX_ATTEMPTS });
}

/** F3b-4: backup.quota —— 配额用量与可备份剩余 */
async function backupQuota(ctx, { userId } = {}) {
  const db = wx.getDatabase();
  if (!hasRole(ctx.role, 'EDITOR') && !(ctx.role === 'MEMBER' && (!userId || userId === ctx.openid))) {
    return FORBIDDEN('无权限查看配额');
  }
  const target = userId || ctx.openid || 'system';
  const used = await usedBytesOf(db, target);
  const quotaGB = await readQuotaGB(db);
  const quotaBytes = quotaGB * GB;
  return OK({
    userId: target, usedBytes: used, quotaBytes,
    remainingBytes: Math.max(0, quotaBytes - used),
    pct: quotaBytes ? Math.min(100, Math.round((used / quotaBytes) * 1000) / 10) : 0,
    quotaGB
  });
}

/** F3b-5: backup.export —— 恢复导出清单（仅 DONE 的照片，管理员全量 / 成员本人） */
async function backupExport(ctx, { userId, albumId, format = 'list' } = {}) {
  const db = wx.getDatabase();
  if (!hasRole(ctx.role, 'EDITOR') && !(ctx.role === 'MEMBER' && (!userId || userId === ctx.openid))) {
    return FORBIDDEN('无权限导出');
  }
  const q = { backupStatus: 'DONE' };
  if (userId) q.userId = userId;
  if (albumId) q.albumId = albumId;
  const rows = (await db.collection('album_photos').where(q).limit(1000).get()).data || [];
  const items = rows.map(r => ({
    photoId: r._id, albumId: r.albumId, fileId: r.fileId,
    backupFileId: r.backupFileId || null, fileSize: Number(r.fileSize) || 0,
    backupAt: r.backupAt || null
  }));
  const manifest = { format, exportedAt: new Date().toISOString(), count: items.length, items };
  // 真实环境：manifest 写入云存储并返回可下载 fileId；此处占位
  return OK({ manifest, note: '真实环境清单将写入云存储并返回下载 fileId（downloadUrl）' });
}

/** F3b-6: backup.restore —— 恢复指定照片（返回临时下载直链占位） */
async function backupRestore(ctx, { photoIds = [], userId } = {}) {
  const db = wx.getDatabase();
  if (!Array.isArray(photoIds) || !photoIds.length) return BAD_REQUEST('请指定要恢复的照片 photoIds');
  if (!hasRole(ctx.role, 'EDITOR') && !(ctx.role === 'MEMBER' && (!userId || userId === ctx.openid))) {
    return FORBIDDEN('无权限恢复');
  }
  const q = { backupStatus: 'DONE', _id: db.command.in(photoIds) };
  if (userId) q.userId = userId;
  const rows = (await db.collection('album_photos').where(q).limit(100).get()).data || [];
  const restored = rows.map(r => ({
    photoId: r._id, originalFileId: r.fileId, backupFileId: r.backupFileId,
    downloadUrl: r.backupFileId ? `https://backup-download/${encodeURIComponent(r.backupFileId)}` : null
  }));
  return OK({ restored, count: restored.length, note: '真实环境由云存储 getTempFileURL 生成直链' });
}

module.exports = { main: async (params = {}, context = {}) => {
  const ctx = { OPENID: context.OPENID || context.openid, openid: context.openid, role: context.role || 'VISITOR' };
  const { action } = params;
  switch (action) {
    case 'process': return await backupProcess(ctx, params || {});
    case 'retry': return await backupRetry(ctx, params || {});
    case 'stats': return await backupStats(ctx, params || {});
    case 'quota': return await backupQuota(ctx, params || {});
    case 'export': return await backupExport(ctx, params || {});
    case 'restore': return await backupRestore(ctx, params || {});
    default: return BAD_REQUEST(`未知 action: ${action}`);
  }
} };
