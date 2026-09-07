/**
 * scripts/migrate-family-moments.js
 * V2.0 F5: 家族动态迁移脚本（plaza_posts 旧格式 → family_moments V2.0 新格式）
 *
 * 迁移映射（对齐 cloud/db-schemas/family_moments.schema.json）：
 *   type:       text|moment|notice|alert → TEXT/IMAGE/VIDEO/MIXED/POLL（见 typeMap）
 *   stats:      {like,comment,share} 透传（缺 share 补 0）
 *   visibility: PUBLIC/GROUP/PRIVATE 透传（新增 FAMILY 枚举由新发布默认）
 *   status:     PUBLISHED→PUBLISHED, DELETED→DELETED, HIDDEN→DELETED（新枚举无 HIDDEN）
 *   publishAt:  归一化为 ISO 字符串（Date → toISOString）
 *   新增:       topicTags[], mentions[], hotScore 0, updatedAt
 *
 * 纯函数可单测；批量执行需部署环境（云数据库），本地仅提供 dry-run。
 */

// 旧类型 → V2.0 枚举（媒体优先推断）
function normalizeType(item) {
  const t = String(item.type || '').toLowerCase();
  if (['image', 'img'].includes(t)) return 'IMAGE';
  if (['video'].includes(t)) return 'VIDEO';
  if (['poll'].includes(t)) return 'POLL';
  if (['mixed'].includes(t)) return 'MIXED';
  // 文本类（含旧 moment/notice/alert 归并为 TEXT，公告走 clan_notices 新集合）
  return 'TEXT';
}

function toISO(v) {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString();
  const d = new Date(v);
  return isNaN(d.getTime()) ? String(v) : d.toISOString();
}

/**
 * migrateLegacyPost - 单条 plaza_posts → family_moments 文档
 * @param {object} item 旧格式动态
 * @returns {{ migrated?: object, error?: string, original: object }}
 */
function migrateLegacyPost(item, dryRun = true) {
  if (!item || !item._id) return { error: 'missing_id', original: item };
  if (!item.authorId) return { error: 'missing_authorId', original: item };

  const stats = (item.stats && typeof item.stats === 'object') ? item.stats : {};
  const publishAt = toISO(item.publishAt) || toISO(item.createdAt) || new Date().toISOString();
  const oldStatus = String(item.status || 'PUBLISHED').toUpperCase();

  const migrated = {
    _id: item._id,
    authorId: item.authorId,
    authorName: item.authorName || '',
    type: normalizeType(item),
    content: typeof item.content === 'string' ? item.content : (item.content ? JSON.stringify(item.content) : ''),
    mediaIds: Array.isArray(item.mediaIds) ? item.mediaIds.slice(0, 9) : [],
    topicTags: [],
    mentions: [],
    visibility: ['PUBLIC', 'GROUP', 'PRIVATE'].includes(item.visibility) ? item.visibility : 'PUBLIC',
    groupIds: [],
    stats: {
      like: Number.isFinite(Number(stats.like)) ? Number(stats.like) : 0,
      comment: Number.isFinite(Number(stats.comment)) ? Number(stats.comment) : 0,
      share: Number.isFinite(Number(stats.share)) ? Number(stats.share) : 0
    },
    hotScore: 0,
    publishAt,
    status: oldStatus === 'HIDDEN' ? 'DELETED' : (oldStatus === 'PUBLISHED' || oldStatus === 'DELETED' ? oldStatus : 'PUBLISHED'),
    updatedAt: new Date().toISOString()
  };

  if (dryRun) {
    console.log(`[DRY] family_moments ${migrated._id}: ${item.type || '?'} → ${migrated.type} (${migrated.status})`);
  } else {
    console.log(`Migrating family_moments ${migrated._id}`);
  }
  return { original: item, migrated };
}

/**
 * run - 批量迁移入口（本地 dry-run / 部署后全量）
 * @param {object} options { dryRun, items }
 */
async function run(options = {}) {
  const { dryRun = true, items = [] } = options;
  const migrated = [];
  const errors = [];
  for (const item of items) {
    const out = migrateLegacyPost(item, dryRun);
    if (out.error) errors.push({ id: item && item._id, error: out.error });
    else migrated.push(out.migrated);
  }
  return { migrated, errors, total: items.length };
}

module.exports = { migrateLegacyPost, normalizeType, toISO, run };

if (require.main === module) {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  console.log(`family_moments 迁移启动${isDryRun ? '（dry-run）' : ''}...`);
  module.exports.run({ dryRun: isDryRun, items: [] })
    .then(result => {
      console.log('迁移完成:', JSON.stringify(result));
      process.exit(0);
    })
    .catch(err => {
      console.error('迁移失败:', err.message);
      process.exit(1);
    });
}
