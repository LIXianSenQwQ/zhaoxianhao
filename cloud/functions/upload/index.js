/**
 * cloud/functions/upload/index.js
 * 上传约束：策略下发 / 元数据登记（大小与类型校验）
 * Sprint R2 补齐：统一响应 + 隐私级校验（V1.1 相册对应）
 * V2.0 F3c 补齐：2GB 大文件分片上传（chunk 会话 + 断点续传 + MPS 转码骨架）
 */
const wx = require('wx-server-sdk');
const { OK, BAD_REQUEST, FORBIDDEN } = require('./common/response');
const { hasRole } = require('./common/roles');

wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

/** 按上传场景区分预算（谱库旧谱扫描件放宽，头像收紧；video 支持 2GB 分片） */
const POLICY = {
  avatar:    { maxFileSize:  5 * 1024 * 1024, allowedTypes: ['image/jpeg', 'image/png', 'image/webp'] },
  album:     { maxFileSize: 20 * 1024 * 1024, allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'video/mp4'] },
  docscan:   { maxFileSize: 50 * 1024 * 1024, allowedTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] },
  eventimg:  { maxFileSize: 20 * 1024 * 1024, allowedTypes: ['image/jpeg', 'image/png', 'image/webp'] },
  video:     { maxFileSize: 2 * 1024 * 1024 * 1024, allowedTypes: ['video/mp4', 'video/quicktime'], chunked: true }
};

const GB2 = 2 * 1024 * 1024 * 1024;
const DEFAULT_CHUNK_SIZE = 2 * 1024 * 1024; // 2MB
const MIN_CHUNK_SIZE = 1024 * 1024;         // 1MB
const MAX_CHUNKS = 2048;                    // 2GB / 1MB
const SESSION_TTL_HOURS = 24;               // 断点续传窗口 24h

async function main(event, context) {
  const openid = context.OPENID || context.openid;
  if (!openid) return FORBIDDEN('请先登录');
  const db = wx.getDatabase();
  const { action } = event;

  switch (action) {
    case 'policy': {
      const { scene = 'album' } = event;
      const p = POLICY[scene];
      if (!p) return BAD_REQUEST(`未知上传场景: ${scene}`);
      return OK({ scene, ...p });
    }
    case 'meta': {
      // 上传完成后登记元数据（含校验，双保险）
      const { scene = 'album', fileId, size, mimeType, visibility = 'PRIVATE', groupId } = event;
      const p = POLICY[scene];
      if (!p) return BAD_REQUEST(`未知上传场景: ${scene}`);
      if (!fileId) return BAD_REQUEST('缺少 fileId');
      if (Number(size) > p.maxFileSize) return BAD_REQUEST(`文件超出 ${scene} 场景大小上限`);
      if (!p.allowedTypes.includes(mimeType)) return BAD_REQUEST(`不支持的类型: ${mimeType}`);
      if (!['PUBLIC', 'PRIVATE', 'GROUP'].includes(visibility)) return BAD_REQUEST('visibility 取值非法');
      if (visibility === 'GROUP' && !groupId) return BAD_REQUEST('GROUP 可见性必须指定 groupId');

      const addRes = await db.collection('upload_metas').add({
        data: {
          scene, fileId, size: Number(size), mimeType,
          ownerOpenid: openid,
          visibility, groupId: groupId || null,
          createdAt: new Date()
        }
      });
      return OK({ metaId: addRes._id });
    }
    case 'triggerCi': {
      // V1.1 R20: 数据万象 CI 调用（头像/相册缩略图压缩 + WEBP 转码）
      const { fileId, scene = 'avatar' } = event;
      if (!fileId) return BAD_REQUEST('缺少 fileId');
      return await triggerCi(context, fileId, scene);
    }
    case 'triggerMps': {
      // V1.1 R20: 媒体处理 MPS 调用（视频 H.264 转码 + 封面截取）
      const { fileId, duration } = event;
      if (!fileId || typeof duration !== 'number') return BAD_REQUEST('fileId/duration 必需');
      return await triggerMps(context, fileId, duration);
    }
    // ─── F3c 分片上传（2GB） ───
    case 'chunk.init': return await chunkInit(context, openid, event);
    case 'chunk.put': return await chunkPut(context, openid, event);
    case 'chunk.progress': return await chunkProgress(context, openid, event);
    case 'chunk.complete': return await chunkComplete(context, openid, event);
    case 'chunk.status': return await chunkStatus(context, openid, event);
    default:
      return BAD_REQUEST(`unknown action: ${action}`);
  }
}

/** F3c-1: 初始化分片会话（可断点续传：同 fileName 复用未完成会话） */
async function chunkInit(ctx, openid, { scene = 'video', fileName, totalSize, mimeType, chunkSize = DEFAULT_CHUNK_SIZE }) {
  const db = wx.getDatabase();
  const p = POLICY[scene];
  if (!p || !p.chunked) return BAD_REQUEST(`场景 ${scene} 不支持分片上传`);
  if (!fileName) return BAD_REQUEST('缺少 fileName');
  if (!p.allowedTypes.includes(mimeType)) return BAD_REQUEST(`不支持的类型: ${mimeType}`);
  const size = Number(totalSize);
  if (!(size > 0)) return BAD_REQUEST('totalSize 非法');
  if (size > GB2) return BAD_REQUEST('文件不得超过 2GB');
  const cs = Number(chunkSize) >= MIN_CHUNK_SIZE ? Math.min(Number(chunkSize), 8 * 1024 * 1024) : DEFAULT_CHUNK_SIZE;
  const totalChunks = Math.ceil(size / cs);
  if (totalChunks > MAX_CHUNKS) return BAD_REQUEST(`分片数超限（≤${MAX_CHUNKS}）`);

  const now = new Date();
  // 断点续传：同用户 + 同文件 + 未完成 → 复用会话返回已收分片
  const exist = (await db.collection('upload_sessions')
    .where({ userId: openid, fileName, completed: false }).limit(1).get()).data || [];
  if (exist.length && exist[0].totalSize === size) {
    return OK({
      sessionId: exist[0]._id, resumed: true, chunkSize: exist[0].chunkSize,
      totalChunks: exist[0].totalChunks,
      uploadedChunks: exist[0].uploadedChunks || [], uploadedCount: (exist[0].uploadedChunks || []).length,
      expireAt: exist[0].expireAt
    });
  }

  const sessionId = `cs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await db.collection('upload_sessions').add({
    data: {
      sessionId, userId: openid, scene, fileName, mimeType, totalSize: size,
      chunkSize: cs, totalChunks, uploadedChunks: [], completed: false, fileId: null,
      createdAt: now, updatedAt: now,
      expireAt: new Date(Date.now() + SESSION_TTL_HOURS * 3600 * 1000)
    }
  });
  return OK({ sessionId, resumed: false, chunkSize: cs, totalChunks, uploadedChunks: [], uploadedCount: 0 });
}

/** 会话归属校验 + 查询 */
async function findSession(db, openid, sessionId) {
  if (!sessionId) return null;
  const res = (await db.collection('upload_sessions').where({ sessionId, userId: openid }).limit(1).get()).data || [];
  return res[0] || null;
}

/** F3c-2: 上传单个分片（登记下标；真实环境先把分片落云存储临时路径再入下标） */
async function chunkPut(ctx, openid, { sessionId, index }) {
  const db = wx.getDatabase();
  const session = await findSession(db, openid, sessionId);
  if (!session) return BAD_REQUEST('会话不存在或不属于你');
  if (session.completed) return BAD_REQUEST('会话已完成');
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= session.totalChunks) {
    return BAD_REQUEST(`分片下标越界（0-${session.totalChunks - 1}）`);
  }
  const uploaded = Array.from(new Set([...(session.uploadedChunks || []), i])).sort((a, b) => a - b);
  await db.collection('upload_sessions').doc(session._id).update({
    data: { uploadedChunks: uploaded, updatedAt: new Date() }
  });
  return OK({ sessionId, index: i, accepted: true, uploadedCount: uploaded.length });
}

/** F3c-3: 断点续传进度查询 */
async function chunkProgress(ctx, openid, { sessionId }) {
  const db = wx.getDatabase();
  const session = await findSession(db, openid, sessionId);
  if (!session) return BAD_REQUEST('会话不存在或不属于你');
  const uploaded = session.uploadedChunks || [];
  const missing = [];
  for (let i = 0; i < session.totalChunks; i++) if (!uploaded.includes(i)) missing.push(i);
  return OK({
    sessionId, uploadedChunks: uploaded, uploadedCount: uploaded.length,
    totalChunks: session.totalChunks, missing, completed: session.completed,
    pct: Math.round((uploaded.length / session.totalChunks) * 1000) / 10,
    fileId: session.fileId || null
  });
}

/** F3c-4: 合并完成（校验全部片 → 生成 fileId → 视频触发 MPS 转码骨架） */
async function chunkComplete(ctx, openid, { sessionId }) {
  const db = wx.getDatabase();
  const session = await findSession(db, openid, sessionId);
  if (!session) return BAD_REQUEST('会话不存在或不属于你');
  const uploaded = session.uploadedChunks || [];
  if (uploaded.length < session.totalChunks) {
    return BAD_REQUEST(`分片未齐全（${uploaded.length}/${session.totalChunks}），请续传缺失片`);
  }
  if (session.completed) return OK({ sessionId, fileId: session.fileId, repeatedComplete: true });

  // 真实环境：云存储 merge 临时分片 → 最终 fileId；此处确定性占位
  const fileId = `cloud://merged/${session.sessionId}/${encodeURIComponent(session.fileName || 'file')}`;
  // 视频：登记 MPS 转码任务骨架
  const isVideo = (session.mimeType || '').startsWith('video/');
  let transcode = null;
  if (isVideo) {
    const mps = await triggerMps(ctx, fileId, 0).catch(() => ({ data: { note: 'MPS 未配置' } }));
    transcode = {
      status: 'PENDING', template: 'h264_mp4_720p',
      transcodedFileId: (mps.data && mps.data.transcodedFileId) || null,
      coverUrl: (mps.data && mps.data.coverFrameUrl) || null,
      message: (mps.data && mps.data.note) || ''
    };
  }
  const now = new Date();
  await db.collection('upload_sessions').doc(session._id).update({
    data: { completed: true, fileId, transcode, updatedAt: now }
  });
  await db.collection('upload_metas').add({
    data: {
      scene: session.scene, fileId, size: session.totalSize, mimeType: session.mimeType,
      ownerOpenid: openid, visibility: 'PRIVATE', groupId: null, createdAt: now
    }
  });
  return OK({ sessionId, fileId, completed: true, transcode, metaRegistered: true });
}

/** F3c-5: 分片任务/MPS 转码状态查询（骨架） */
async function chunkStatus(ctx, openid, { sessionId }) {
  const db = wx.getDatabase();
  const session = await findSession(db, openid, sessionId);
  if (!session) return BAD_REQUEST('会话不存在或不属于你');
  return OK({
    sessionId, completed: session.completed, fileId: session.fileId || null,
    transcode: session.transcode || null,
    uploadedCount: (session.uploadedChunks || []).length, totalChunks: session.totalChunks
  });
}

/** R20: CI 数据万象触发器——压缩 + 转格式（WEBP）+ 多档缩略图（80/200/600） */
async function triggerCi(ctx, fileId, scene = 'avatar') {
  const p = POLICY[scene] || POLICY.avatar;
  if (!p) return BAD_REQUEST(`未知场景：${scene}`);

  try {
    // 真实环境：云开发扩展 ImageProcessJob → HTTP API
    const res = await wx.cloud.callFunction({
      name: 'ci', 
      data: { action: 'process', sourceFileId: fileId, rules: [
        { rule: 'thumb', format: 'webp', width: 80 },
        { rule: 'thumb', format: 'webp', width: 200 },
        { rule: 'thumb', format: 'webp', width: 600 }
      ] }
    });
    if (res.result && res.result.urls) return OK(res.result.urls);
  } catch (e) { /* CI 未配置降级 */ }

  // 占位模板（CI 回调更新真实 URL）
  const now = new Date();
  return OK({
    thumbnailUrls: { s: `https://cdn-thumb-${now.getTime()}/80.webp`, m: `https://cdn-thumb-${now.getTime()}/200.webp`, l: `https://cdn-thumb-${now.getTime()}/600.webp` },
    compressedUrl: `https://cdn-webp-${now.getTime()}.webp`,
    note: 'CI 未配置，占位 URL；真实环境由云开发回调更新'
  });
}

/** R20: MPS 媒体处理触发器——视频转码（H.264 MP4）+ 封面截取 */
async function triggerMps(ctx, videoFileId, duration) {
  if (duration > 60) return BAD_REQUEST('视频时长必须 ≤60s');

  try {
    const res = await wx.cloud.callFunction({
      name: 'mps', 
      data: { action: 'transcode', sourceFileId: videoFileId, templates: ['h264_mp4_720p', 'cover_frame'] }
    });
    if (res.result && res.result.fileIds) return OK(res.result);
  } catch (e) { /* MPS 未配置降级 */ }

  const now = new Date();
  return OK({ transcodedFileId: `video-h264-${now.getTime()}`, coverFrameUrl: `https://cdn-cover-${now.getTime()}.jpg`, note: 'MPS 未配置，占位 ID' });
}

module.exports = { main, POLICY, triggerCi, triggerMps };
