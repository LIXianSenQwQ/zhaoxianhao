/**
 * scripts/migrate-plaza.js
 * R25: plaza 广场内容格式迁移（从 oldFormat → newSchema）
 * 目标集合：plaza_posts (已存在，schema 兼容)
 * 迁移逻辑：确保每篇 posts 都有 fields like: {id,type,content,mediaIds?,likes[],createdAt,updatedAt}
 */

const fs = require('fs');
const path = require('path');

console.log(`
Plaza Schema Migration Script v1.0
=====================================
Purpose: Ensure plaza_posts schema consistency
Target collection: plaza_posts
Migration status: N/A (stub - run on production data only)

Instructions:
1. Export real data from cloud collection plaza_posts
2. Update this script with real query/transform
3. Run locally against backup collection
4. Dry-run with --dry-run flag first

Example:
node scripts/migrate-plaza.js --dry-run
node scripts/migrate-plaza.js --target plaza_new
`);

function migrateItem(item, dryRun = false) {
  // Ensure required fields
  if (!item._id || !item.type || !item.content) {
    return { error: 'missing_required_fields', item };
  }
  
  const migrated = {
    _id: item._id,
    userId: item.userId || item.authorId,
    authorOpenid: item.authorOpenid || '',
    type: item.type === 'text' ? 'post' : item.type, // normalize types
    content: typeof item.content === 'string' ? item.content : JSON.stringify(item.content),
    mediaIds: Array.isArray(item.mediaIds) ? item.mediaIds : [],
    likes: Array.isArray(item.likes) ? item.likes : [],
    status: item.status || 'PUBLISHED',
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  if (dryRun) {
    console.log(`[DRY] ${migrated._id}: migrated to version 2.0`);
  } else {
    console.log(`Migrating ${migrated._id}`);
  }
  
  return { original: item, migrated };
}

module.exports = {
  migrateItem,
  run: function(options = {}) {
    const { dryRun = true, targetCollection = null } = options;
    
    if (dryRun) {
      console.log('Running in dry-run mode (no actual migration)');
      // Placeholder for future implementation
      return Promise.resolve({ migrated: 0, errors: 0 });
    }
    
    // Real migration would use:
    // const db = wx.getDatabase();
    // const cursor = await db.collection('plaza_posts').where({}).skip(...).get();
    // ... batch processing ...
    throw new Error('Real migration requires deployment environment');
  }
};

if (require.main === module) {
  // CLI entry point
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  console.log(`Migration started${isDryRun ? ' (dry-run)' : ''}...`);
  
  module.exports.run({ dryRun: isDryRun })
    .then(result => {
      console.log('Migration complete:', result);
      process.exit(0);
    })
    .catch(err => {
      console.error('Migration failed:', err.message);
      process.exit(1);
    });
}