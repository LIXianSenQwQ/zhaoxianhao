/**
 * cloud/functions/admin/database-init.js
 * 初始化 42 个数据库集合及索引策略
 * 「好诚事家风」家谱系统 V2.0
 */

const db = wx.cloud.database();
const _ = db.command;

// 核心集合定义（V2.0: 42 collections）
const collections = {
  // === V1.0 (MVP) 21 集合 ===
  
  // 1. users - 用户账号（L5 隐私）
  users: {
    indexes: [{ key: 'openid', unique: true }, { key: 'status', index: true }, { key: 'role', index: true }]
  },
  
  // 2. members - 族人档案（分级隐私）
  members: {
    indexes: [
      { key: '_id', unique: true },
      { key: 'branchId', index: true },
      { key: 'generation', index: true },
      { key: 'status', index: true }
    ]
  },
  
  // 3. relations - 亲缘关系边（L2）
  relations: {
    indexes: [
      { key: 'fromId', index: true },
      { key: 'toId', index: true },
      { key: 'type', index: true },
      { key: 'status', index: true }
    ]
  },
  
  // 4. generations - 字辈字派库（L2）
  generations: {
    indexes: [{ key: 'branchId', index: true }, { key: 'order', index: true }]
  },
  
  // 5. branches - 房支层级库（L2）
  branches: {
    indexes: [{ key: 'parentId', index: true }, { key: 'level', index: true }]
  },
  
  // 6. entry_records - 入谱审核工单（L4）
  entry_records: {
    indexes: [{ key: 'status', index: true }, { key: 'createdAt', index: true }]
  },
  
  // 7. documents - 谱库档案（L2/L4）
  documents: {
    indexes: [{ key: 'type', index: true }, { key: 'era', index: true }]
  },
  
  // 8. media - 多媒体文件索引（分级）
  media: {
    indexes: [
      { key: 'personId', index: true },
      { key: 'albumId', index: true },
      { key: 'ownerLevel', index: true }
    ]
  },
  
  // 9. events - 家族史记/大事记（L2）
  events: {
    indexes: [{ key: 'year', index: true }, { key: 'tag', index: true }]
  },
  
  // 10. worship_logs - 祭祀礼拜记录（L2）
  worship_logs: {
    indexes: [{ key: 'targetMemberId', index: true }, { key: 'userId', index: true }]
  },
  
  // 11. ceremonies - 仪式活动（L2/L4）
  ceremonies: {
    indexes: [{ key: 'type', index: true }, { key: 'date', index: true }]
  },
  
  // 12. chat_groups - 群组（群内可见）
  chat_groups: {
    indexes: [{ key: 'type', index: true }, { key: 'adminIds', index: true }]
  },
  
  // 13. plaza_posts - 广场动态（L2/L4）
  plaza_posts: {
    indexes: [{ key: 'authorId', index: true }, { key: 'level', index: true }]
  },
  
  // 14. calendar_items - 日历事件（分级）
  calendar_items: {
    indexes: [
      { key: 'date', index: true },
      { key: 'personId', index: true },
      { key: 'scope', index: true }
    ]
  },
  
  // 15. notifications - 通知（本人可见）
  notifications: {
    indexes: [{ key: 'userId', index: true }, { key: 'read', index: true }]
  },
  
  // 16. points_accounts - 积分账户（本人可见）
  points_accounts: {
    indexes: [{ key: 'userId', unique: true }]
  },
  
  // 17. points_logs - 积分流水（本人可见）
  points_logs: {
    indexes: [{ key: 'userId', index: true }, { key: 'time', index: true }]
  },
  
  // 18. tasks / task_records - 任务定义/打卡（L2）
  tasks: { indexes: [] },
  task_records: {
    indexes: [{ key: 'userId', index: true }, { key: 'taskId', index: true }]
  },
  
  // 19. audit_logs - 审计日志（≥1 年保留）
  audit_logs: {
    indexes: [{ key: 'userId', index: true }, { key: 'time', index: true }]
  },
  
  // 20. authorizations - 隐私授权记录（本人）
  authorizations: {
    indexes: [{ key: 'grantor', index: true }, { key: 'expiresAt', index: true }]
  },
  
  // 21. settings - 家族配置/功能开关（管理）
  settings: {
    indexes: [{ key: 'key', unique: true }]
  },
  
  // === V1.1 新增 9 集合 ===
  
  // 22. avatars - 头像记录（三级可见性）
  avatars: {
    indexes: [{ key: 'userId', index: true }, { key: 'isCurrent', index: true }]
  },
  
  // 23. intro_videos - 介绍视频（三级可见性）
  intro_videos: {
    indexes: [{ key: 'userId', index: true }, { key: 'transcodeStatus', index: true }]
  },
  
  // 24. albums - 多级相册（≤5 级）
  albums: {
    indexes: [{ key: 'userId', index: true }, { key: 'level', index: true }]
  },
  
  // 25. album_photos - 相册照片
  album_photos: {
    indexes: [{ key: 'albumId', index: true }, { key: 'userId', index: true }]
  },
  
  // 26. photo_tags - 照片标签
  photo_tags: {
    indexes: [{ key: 'userId', index: true }]
  },
  
  // 27. greeting_cards - 家庭问候语
  greeting_cards: {
    indexes: [{ key: 'familyId', index: true }, { key: 'userId', index: true }]
  },
  
  // 28. family_mottos - 家风家训
  family_mottos: {
    indexes: [{ key: 'status', index: true }, { key: 'recommended', index: true }]
  },
  
  // 29. generation_poems - 字辈序列展示
  generation_poems: {
    indexes: [{ key: 'branchId', unique: true }]
  },
  
  // 30. time_capsules - 百年设置
  time_capsules: {
    indexes: [{ key: 'userId', index: true }, { key: 'unlockDate', index: true }]
  },
  
  // 辅助集合
  weather_cities: { indexes: [{ key: 'cityId', unique: true }] },
  almanac_ext: { indexes: [{ key: 'year', index: true }] },
  
  // === V2.0 新增 12 集合 ===
  
  // 31. local_contents - 本地内容（三级可见性）
  local_contents: {
    indexes: [
      { key: 'userId', index: true },
      { key: 'categoryPath', index: true },
      { key: 'visibility', index: true }
    ]
  },
  
  // 32. content_categories - 三级分类
  content_categories: {
    indexes: [{ key: 'parentId', index: true }, { key: 'depth', index: true }]
  },
  
  // 33. search_index - 内容搜索倒排索引
  search_index: {
    indexes: [{ key: 'docId', index: true }, { key: 'keywords', index: true }]
  },
  
  // 34. news_items - 新闻条目
  news_items: {
    indexes: [{ key: 'sourceId', index: true }, { key: 'publishTime', index: true }]
  },
  
  // 35. news_sources - 数据源配置
  news_sources: {
    indexes: [{ key: 'provider', unique: true }]
  },
  
  // 36. user_interests - 用户兴趣标签
  user_interests: {
    indexes: [{ key: 'userId', unique: true }]
  },
  
  // 37. news_favorites - 收藏与离线包
  news_favorites: {
    indexes: [{ key: 'userId', index: true }, { key: 'newsId', index: true }]
  },
  
  // 38. family_moments - 家族动态
  family_moments: {
    indexes: [{ key: 'authorId', index: true }, { key: 'visibility', index: true }]
  },
  
  // 39. moment_interactions - 互动记录
  moment_interactions: {
    indexes: [{ key: 'momentId', index: true }, { key: 'userId', index: true }]
  },
  
  // 40. clan_notices - 家族公告
  clan_notices: {
    indexes: [{ key: 'publishedBy', index: true }, { key: 'pinned', index: true }]
  },
  
  // 41. game_records - 游戏对局记录
  game_records: {
    indexes: [{ key: 'gameType', index: true }, { key: 'players', index: true }]
  },
  
  // 42. home_avatars / home_worlds - 虚拟家园（合并类型）
  home_avatars: { indexes: [{ key: 'userId', unique: true }] },
  home_worlds: { indexes: [{ key: 'userId', unique: true }] }
};

async function createCollections() {
  console.log('Starting database initialization...');
  let successCount = 0;
  let failCount = 0;
  
  for (const [name, config] of Object.entries(collections)) {
    try {
      await db.collection(name).add({ data: {} });
      console.log(`✓ Collection "${name}" created`);
      successCount++;
    } catch (err) {
      console.error(`✗ Failed to create "${name}":`, err.message);
      failCount++;
    }
  }
  
  return { successCount, failCount };
}

module.exports = { init: createCollections };
