/**
 * tests/collections-audit.test.js — V2.0 12 集合/接口骨架完整性复查
 *
 * 依据 tracker F1「集合/接口骨架完整性复查（news_items 等 12 个 V2.0 集合 schema 逐项核对）」。
 * 权威清单来源 commit 0710428「V2.0 12 集合 schema 补齐」（11 个）+ f3de416 content_categories（第 12 个）：
 *   search_index / news_sources / news_items / news_favorites / user_interests /
 *   family_moments / moment_interactions / clan_notices / game_records /
 *   home_worlds / home_avatars / content_categories
 *
 * 核对维度：
 *  A 集合面：12 个 schema 文件齐备且 JSON 可解析（T3 枚举规则由 tests/schema.test.js 统一兜底）
 *  B 接口面：云函数引用的每个集合都有 schema 文件（T4 正向）+ 12 集合中每个均有「接线状态」判定
 *  C 种子面：stub 动态 getCol 支持 12 集合零配置 seeding（脚本级能力）
 */
const fs = require('fs');
const path = require('path');
const { test } = require('node:test');
const assert = require('node:assert');

const rootDir = __dirname + '/../';
const schemaDir = rootDir + 'cloud/db-schemas/';

// ─── V2.0 12 集合权威清单（schema 文件名，无扩展） ───
const V2_COLLECTIONS = [
  'search_index', 'news_sources', 'news_items', 'news_favorites', 'user_interests',
  'family_moments', 'moment_interactions', 'clan_notices', 'game_records',
  'home_worlds', 'home_avatars', 'content_categories'
];

// ─── 云函数引用扫描 ───
function collectFunctionRefs() {
  const refs = {}; // collection -> Set(file)
  const re = /\.collection\(\s*['"]([a-zA-Z_][a-zA-Z0-9_]*)['"]\s*\)/g;
  function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.js')) {
        const c = fs.readFileSync(full, 'utf8');
        let m;
        while ((m = re.exec(c))) {
          (refs[m[1]] = refs[m[1]] || new Set()).add(path.relative(rootDir, full).replace(/\\/g, '/'));
        }
      }
    }
  }
  walk(rootDir + 'cloud/functions');
  return refs;
}

// ─── 预留集合白名单（有 schema 但刻意不接线，附理由） ───
const RESERVED_WITH_RATIONALE = {
  game_records: '游戏合规设计：F7-F8 记分板/棋谱为本地零联机（零上云），云端 game_records 预留不启用'
};

test('K1 V2.0 12 集合 schema 文件齐备且 JSON 合法', () => {
  const missing = [];
  for (const name of V2_COLLECTIONS) {
    const fp = schemaDir + name + '.schema.json';
    if (!fs.existsSync(fp)) { missing.push(name); continue; }
    // JSON 可解析
    assert.doesNotThrow(() => JSON.parse(fs.readFileSync(fp, 'utf8')), `${name}.schema.json 非法 JSON`);
  }
  assert.deepStrictEqual(missing, [], '缺失 schema: ' + missing.join(', '));
});

test('K2 接口面：云函数引用 ⊆ schema 定义（无漏网集合）', () => {
  const refs = collectFunctionRefs();
  const schemas = new Set(fs.readdirSync(schemaDir).filter(f => f.endsWith('.schema.json')).map(f => f.replace('.schema.json', '')));
  const noSchema = Object.keys(refs).filter(n => !schemas.has(n));
  assert.deepStrictEqual(noSchema, [], '被引用但无 schema: ' + noSchema.join(', '));
});

test('K3 12 集合逐一接线状态判定（无未声明孤儿）', () => {
  const refs = collectFunctionRefs();
  const orphan = [];
  for (const name of V2_COLLECTIONS) {
    if (!refs[name] && !RESERVED_WITH_RATIONALE[name]) orphan.push(name);
  }
  assert.deepStrictEqual(orphan, [], '未接线且未声明预留: ' + orphan.join(', '));
  // 预留项必须有理由声明
  const reserved = V2_COLLECTIONS.filter(n => RESERVED_WITH_RATIONALE[n]);
  assert.ok(reserved.length >= 1 && RESERVED_WITH_RATIONALE.game_records, 'game_records 应声明预留理由');
  // 输出接线分布（审计底稿可读）
  for (const name of V2_COLLECTIONS) {
    const src = refs[name] ? [...refs[name]].map(p => p.split('/')[2]).filter(Boolean) : [];
    const uniq = [...new Set(src)].join(',') || '（预留：' + (RESERVED_WITH_RATIONALE[name] || '未接线') + '）';
    console.log(`  [K3] ${name.padEnd(22)} -> ${uniq}`);
  }
});

test('K4 种子面：stub 动态集合能力覆盖 12 集合（零配置可 seed）', () => {
  const stubSrc = fs.readFileSync(rootDir + 'scripts/wx-server-sdk-stub.js', 'utf8');
  // stub 的 getCol 对任意未定义集合动态创建空数组 => 12 集合均可在测试内 seed
  assert.ok(/if \(!seed\.collections\[name\]\) seed\.collections\[name\] = \[\];/.test(stubSrc), 'stub 应动态创建集合');
  // smoke seedDB 已显式声明 V2.0 关键集合键（样本抽查）
  const smoke = fs.readFileSync(rootDir + 'tests/smoke-functions.test.js', 'utf8');
  const declared = ['search_index: searchIndex', 'news_items: newsItems', 'family_moments: familyMoments',
    'home_worlds: homeWorlds', 'content_categories: contentCategories', 'clan_notices: clanNotices',
    'moment_interactions: momentInteractions', 'news_sources: newsSources', 'user_interests: userInterests',
    'news_favorites: newsFavorites', 'home_avatars: homeAvatars'];
  const undeclared = declared.filter(d => !smoke.includes(d));
  assert.deepStrictEqual(undeclared, [], 'smoke seedDB 缺声明: ' + undeclared.join(', '));
});
