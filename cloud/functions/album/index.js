/**
 * cloud/functions/album/index.js
 * V1.1 22.3: 多级相册管理（最多 5 级 + 批量上传 ≤20 张 + 标签 + 自动备份）
 */

const wx = require('wx-server-sdk');
const { OK, BAD_REQUEST, FORBIDDEN } = require('./common/response');
const { hasRole } = require('./common/roles');
const { visibilityCheck } = require('./common/privacy');

wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

const MAX_LEVEL = 5;
const MAX_BATCH = 20;
const MAX_NAME_LEN = 50;

/**
 * R21: album.save 创建/更新相册
 * 入参：{ name, parentId?, visibility?, autoBackup?, albumId? }
 */
async function saveAlbum(ctx, userId, { albumId, name, parentId = null, visibility = 'PRIVATE', autoBackup = true }) {
  const db = wx.getDatabase();

  // 门禁：本人 or EDITOR+
  if (!hasRole(ctx.role, 'EDITOR') && ctx.openid !== userId) {
    return FORBIDDEN('仅属主或管理员可操作相册');
  }

  // 名称校验
  if (!name || typeof name !== 'string' || name.length < 1 || name.length > MAX_NAME_LEN) {
    return BAD_REQUEST(`相册名长度须在 1-${MAX_NAME_LEN} 字之间`);
  }

  // 可见性校验
  if (!['PRIVATE', 'PUBLIC', 'GROUP'].includes(visibility)) {
    return BAD_REQUEST('visibility 取值非法');
  }

  // 层级校验（最多 5 级）
  let level = 1;
  if (parentId) {
    let cur = await db.collection('albums').doc(parentId).get();
    const parentRow = cur.data && !Array.isArray(cur.data) ? cur.data : null;
    if (!parentRow) return BAD_REQUEST('父相册不存在');
    level = (parentRow.level || 1) + 1;
    if (level > MAX_LEVEL) return BAD_REQUEST(`相册层级不得超过 ${MAX_LEVEL} 级`);
  }

  const now = new Date();
  const col = db.collection('albums');

  if (albumId) {
    // 更新
    const existing = await col.doc(albumId).get();
    if (!existing.data) return BAD_REQUEST('相册不存在');
    await col.doc(albumId).update({
      data: { name, visibility, autoBackup, updatedAt: now }
    });
    return OK({ albumId, action: 'updated' });
  }

  // 新建
  const res = await col.add({
    userId, name, parentId, level, visibility, autoBackup,
    photoCount: 0, createdAt: now, updatedAt: now
  });
  return OK({ albumId: res._id, level, action: 'created' });
}

/**
 * R21: album.uploadBatch 批量上传照片（≤20 张）
 * 入参：{ albumId, photos: [{ fileId, shotAt?, tags? }] }
 */
async function uploadBatch(ctx, userId, albumId, photos = []) {
  const db = wx.getDatabase();

  if (!albumId) return BAD_REQUEST('缺少 albumId');
  if (!Array.isArray(photos) || photos.length < 1) return BAD_REQUEST('photos 必需为非空数组');
  if (photos.length > MAX_BATCH) return BAD_REQUEST(`单次最多 ${MAX_BATCH} 张`);

  const album = await db.collection('albums').doc(albumId).get();
  if (!album.data) return BAD_REQUEST('相册不存在');
  if (!hasRole(ctx.role, 'EDITOR') && album.data.userId !== ctx.openid) {
    return FORBIDDEN('仅属主或管理员可上传');
  }

  const now = new Date();
  const col = db.collection('album_photos');
  const added = [];

  for (const p of photos) {
    if (!p.fileId) return BAD_REQUEST('每张照片须含 fileId');
    const res = await col.add({
      albumId, userId,
      fileId: p.fileId,
      thumbUrl: '',          // CI 生成后回填
      lazySizes: [],          // 80/200/600 三档
      tags: Array.isArray(p.tags) ? p.tags : [],
      shotAt: p.shotAt || now,
      backupStatus: 'PENDING',
      createdAt: now
    });
    added.push(res._id);
  }

  // 更新相册 photoCount
  const newCount = (album.data.photoCount || 0) + added.length;
  await db.collection('albums').doc(albumId).update({ data: { photoCount: newCount, updatedAt: now } });

  return OK({ photoIds: added, count: added.length });
}

/**
 * R21: album.tag 打标签（照片或相册级）
 * 入参：{ photoIds: [...], tags: [...] }
 */
async function applyTag(ctx, userId, photoIds = [], tags = []) {
  const db = wx.getDatabase();

  if (!Array.isArray(photoIds) || photoIds.length < 1) return BAD_REQUEST('photoIds 必需为非空数组');
  if (!Array.isArray(tags) || tags.length < 1) return BAD_REQUEST('tags 必需为非空数组');

  let updated = 0;
  const now = new Date();
  const col = db.collection('album_photos');

  for (const pid of photoIds) {
    const photo = await col.doc(pid).get();
    if (!photo.data) continue;
    if (!hasRole(ctx.role, 'EDITOR') && photo.data.userId !== ctx.openid) continue;
    const merged = Array.from(new Set([...(photo.data.tags || []), ...tags]));
    await col.doc(pid).update({ data: { tags: merged, updatedAt: now } });
    updated++;
  }

  return OK({ updated });
}

/**
 * R21: album.list 相册列表（scope: 'mine' 默认我的 | 'all' 全部可见）
 */
async function listAlbums(ctx, userId, scope = 'mine') {
  const db = wx.getDatabase();
  
  let query;
  if (scope === 'mine') {
    // 我的相册 + 他人的 PUBLIC/GROUP 我可见的
    // 由于无法用 where 同时查两个 userId，先查全部，再用 filter 处理权限
    query = {};
  } else {
    query = { userId };
  }
  
  const res = await db.collection('albums').where(query).orderBy('level', 'asc').get();
  const albums = res.data || [];
  
  // 可见性过滤（无论 mine/all 都要做）
  const hasMemberRole = hasRole(ctx.role, 'MEMBER');
  const visible = albums.filter(a => {
    if (a.userId === ctx.openid) return true; // 本人的内容都可见
    if (a.visibility === 'PUBLIC') return hasMemberRole; // MEMBER 及以上可读 PUBLIC
    if (a.visibility === 'GROUP') {
      const viewer = { openid: ctx.openid, authedTargetIds: new Set([ctx.openid]), role: ctx.role };
      return visibilityCheck(viewer, a) === 'allow';
    }
    return false; // PRIVATE 非本人不可见
  });
  
  // 如果是 mine 模式，进一步过滤只保留属于本人的（加上可见性过滤后的结果）
  // 这里有个问题：如果 scope='mine'，我们希望看到：自己的所有相册 + 他人的 PUBLIC/GROUP 我可见的
  // 上面的 filter 已经实现了这个逻辑，所以不用二次过滤
  
  return OK({ albums: visible, total: visible.length });
}

module.exports = { main: async (params, context) => {
  const { action } = params || {};
  const userId = params.userId || context.openid;
  const ctx = { OPENID: context.OPENID || context.openid, openid: context.openid, role: context.role || 'VISITOR' };
  
  switch (action) {
    case 'save':
      return await saveAlbum(ctx, userId, params);
    case 'uploadBatch':
      return await uploadBatch(ctx, userId, params.albumId, params.photos);
    case 'tag':
      return await applyTag(ctx, userId, params.photoIds, params.tags);
    case 'list':
      return await listAlbums(ctx, userId);
    default:
      return BAD_REQUEST(`unknown action: ${action}`);
  }
}};
