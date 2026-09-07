/**
 * migrations/plaza_to_moment.js — 广场动态迁徙脚本（蓝图 V2.0 §29 C.1）
 * 用途：将既有 plaza_posts 集合历史数据幂等迁入 family_moments + moment_interactions
 * 执行方式：Node.js 或云函数手动触发器
 */

// ─── 配置 ──────────────────────────────────────────────────────────────
const BATCH_SIZE = 100;
const TYPE_MAP = {
  TEXT: 'TEXT', IMAGE: 'IMAGE', MIXED: 'MIXED'
};

// ─── 主流程 ──────────────────────────────────────────────────────────
async function migrate(db) {
  console.log('[Migration] Starting plaza → family_moments');

  // 1. 统计总数
  const totalCount = (await db.collection('plaza_posts').count()).total || 0;
  console.log(`[Migration] Total plaza_posts: ${totalCount}`);

  let offset = 0;
  let migrated = 0;
  let skipped = 0; // already exists in new collection

  while (offset < totalCount) {
    const posts = await db.collection('plaza_posts')
      .skip(offset).limit(BATCH_SIZE).get();
    
    for (const post of (posts.data || [])) {
      // 检查是否已存在（按 _id 字段映射）
      const existRes = await db.collection('family_moments')
        .where({ _id: post._id }).limit(1).get();
      if ((existRes.data || []).length) {
        skipped++;
        continue;
      }

      // 类型映射
      const type = post.mediaIds && post.mediaIds.length > 1 ? 'MIXED' 
                   : post.type === 'VIDEO' ? 'VIDEO' 
                   : 'TEXT';
      
      // 写入新集合
      await db.collection('family_moments').add({
        authorId: post.authorId,
        authorName: post.authorName,
        type,
        content: post.content,
        mediaIds: (post.mediaIds || []).slice(0, 9),
        topicTags: post.tags || [],
        stats: post.stats || { like: 0, comment: 0, share: 0 },
        hotScore: 0,
        status: 'PUBLISHED',
        publishAt: post.publishAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      // 迁移互动记录（点赞/评论）
      if (post.interactions) {
        for (const interaction of (post.interactions || [])) {
          await db.collection('moment_interactions').add({
            momentId: post._id,
            type: interaction.type === 'LIKE' ? 'LIKE' : 'COMMENT',
            userId: interaction.userId,
            userName: '', // stub: fetch later from users
            content: interaction.content || null,
            createdAt: interaction.createdAt || new Date().toISOString()
          });
        }
      }
      migrated++;
    }

    offset += BATCH_SIZE;
    console.log(`[Migration] Progress: ${offset}/${totalCount} (${migrated} migrated, ${skipped} skipped)`);
  }

  console.log(`[Migration] Complete: ${migrated} migrated, ${skipped} skipped`);
  return { migrated, skipped };
}

// ─── 导出供 Node/Cloud 调用 ──────────────────────────────────────────
module.exports = { migrate };

// ─── 本地测试入口 ─────────────────────────────────────────────────────
if (require.main === module) {
  // 需配置 wx.init() / DB 连接
  console.error('Usage: export WX_ENV=... && node migrations/plaza_to_moment.js');
}
