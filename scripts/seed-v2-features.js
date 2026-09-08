/**
 * scripts/seed-v2-features.js
 * V2.0 五大模块功能开关初始化脚本
 *
 * 用途：首次运行或迁移时，向 settings 集合写入 v20Content/v20News/v20Moment/v20Games/v20Home 初始开关表
 * 执行方式：node scripts/seed-v2-features.js --env=stub | --env=production
 *
 * 设计：模块同时导出纯函数（validateFlags / mergeFlags）供单测引用，
 *      仅在直接执行时（require.main === module）触发写入逻辑。
 */

const assert = require('assert');

// ═══════════ V2.0 功能开关默认值（按蓝图 17.2 扩展）═══════════
const INITIAL_FLAGS = {
  // 基线 MVP 已有开关
  live:            { enabled: false, scope: 'global' },
  healthArchive:   { enabled: false, scope: 'global' },
  homeFamilyCard:  { enabled: true,  scope: 'global' },
  treeFanView:     { enabled: false, scope: 'global' },
  emotionAccount:  { enabled: true,  scope: 'branch', branchIds: ['b01'] },

  // V1.1 增强包
  v11Profile:      { enabled: true,  scope: 'global', note: '头像/视频/相册' },
  v11Weather:      { enabled: true,  scope: 'global' },
  v11Motto:        { enabled: true,  scope: 'global' },
  v11Generation:   { enabled: true,  scope: 'global' },
  v11Security:     { enabled: true,  scope: 'global', note: '委托/改密/反向密码/百年设置' },
  v11Almanac:      { enabled: true,  scope: 'global' },

  // V2.0 五大模块
  v20Content:      { enabled: true,  scope: 'global', note: '个人本地内容管理' },
  v20News:         { enabled: true,  scope: 'global', note: '新闻资讯（时政仅外链）' },
  v20Moment:       { enabled: true,  scope: 'global', note: '家族动态与公告' },
  v20Games:        { enabled: true,  scope: 'global', note: '合规版游戏（无联机无内购）' },
  v20Home:         { enabled: true,  scope: 'global', note: '虚拟成长家园（零内购）' },
  v20Branch:       { enabled: true,  scope: 'global', note: '分支管理（总谱/分谱/支谱三级）' }
};

/** V2.0 必须存在的开关键（测试断言用） */
const REQUIRED_V2_KEYS = ['v20Content', 'v20News', 'v20Moment', 'v20Games', 'v20Home', 'v20Branch'];

// ═══════════ 验证结构完整性（纯函数，可单测）═══════════
function validateFlags(flags = INITIAL_FLAGS) {
  const requiredKeys = [
    ...REQUIRED_V2_KEYS,
    'v11Profile', 'v11Weather', 'v11Motto', 'v11Generation', 'v11Security', 'v11Almanac'
  ];
  const errors = [];
  for (const key of requiredKeys) {
    if (!(key in flags)) { errors.push(`Missing key: ${key}`); continue; }
    const f = flags[key];
    if (typeof f.enabled !== 'boolean') errors.push(`${key}.enabled must be boolean`);
    if (!['global', 'branch'].includes(f.scope)) errors.push(`${key}.scope invalid`);
    if (f.scope === 'branch' && !Array.isArray(f.branchIds)) errors.push(`${key}.branchIds required when scope=branch`);
  }
  return { valid: errors.length === 0, errors };
}

// ═══════════ 新旧开关合并（纯函数，幂等可单测）═══════════
function mergeFlags(existing = {}) {
  const merged = { ...(existing || {}) };
  for (const [k, v] of Object.entries(INITIAL_FLAGS)) {
    if (!(k in merged)) merged[k] = v; // 保留已存在开关，仅补新键（幂等）
  }
  return merged;
}

// ═══════════ Stub 模式（测试环境模拟数据库）═══════════
async function runStub() {
  console.log('[Seed] Stub mode detected');
  const seed = () => {
    if (!globalThis.__HCS_STUB_SEED__) globalThis.__HCS_STUB_SEED__ = { collections: {}, seq: 0 };
    return globalThis.__HCS_STUB_SEED__;
  };

  let existing = null;
  const s = seed();
  if (s.collections.settings && s.collections.settings.length > 0) {
    const doc = s.collections.settings[0];
    if (doc.key === 'featureFlag') {
      try { existing = JSON.parse(doc.value); } catch {}
    }
  }

  const merged = mergeFlags(existing);

  s.collections.settings = [{
    _id: `stub-${++s.seq}`,
    key: 'featureFlag',
    value: JSON.stringify(merged),
    scope: 'global'
  }];

  console.log('[Seed] Settings initialized with keys:', Object.keys(merged).join(', '));
  return { success: true, keys: Object.keys(merged) };
}

// ═══════════ 主入口：仅直接执行时触发 ═══════════
if (require.main === module) {
  (async () => {
    try {
      const check = validateFlags();
      if (!check.valid) throw new Error(check.errors.join('; '));

      const mode = process.argv.find(a => a.startsWith('--env='))?.split('=')[1] || 'stub';
      if (mode === 'production') {
        console.log('[Seed] Production mode detected – skipping automatic seeding');
        console.log('[Seed] Please deploy via cloud function admin.seedV2Settings or manual entry');
        process.exit(0);
      }
      await runStub();
      console.log('[Seed] ✓ All V2.0 features injected successfully');
      process.exit(0);
    } catch (e) {
      console.error('[Seed] ✗ Failed:', e.message);
      process.exit(1);
    }
  })();
}

module.exports = { INITIAL_FLAGS, REQUIRED_V2_KEYS, validateFlags, mergeFlags, runStub };