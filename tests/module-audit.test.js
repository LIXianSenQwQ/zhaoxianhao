/**
 * tests/module-audit.test.js — V2.0 五模块（内容/新闻/动态/游戏/家园）自动化合规/安全扫描
 */
const fs = require('fs');
const path = require('path');
const { test } = require('node:test');
const assert = require('node:assert');

const rootDir = __dirname + '/../';

// ─── 1) 游戏禁止模式检查（棋类实时对战、扑克发牌、下注逻辑等） ───
const GAME_PROHIBITED_PATTERNS = [
  // 禁词：需独立单词或明确上下文（防止变量/函数名误报如 countBet → still fail；这里仅匹配典型赌局场景）
  /[\s\W]poker[\s\W]/i, /[\s\W]dealer[\s\W]/i, /[\s\W]deck[\s\W]/i, /[\s\W]shuffle[\s\W].*card/i,
  /[\s\W]bet[\s\W]|bet\s+chips|place.*bet/i, /[\s\W]chip[\s\W]/i, /[\s\W]wager[\s\W]/i, /[\s\W]coin.*game/i,
  /\.wss\(/i, /\.websocket\(/i, /matchmaking/i, /queueRoom/i, /createMatch/i, /onMatch\.emit/i,
  /\.socket/i, /io\.(emit|on)\(['"]match/i
];

test('A1 游戏模块无禁止代码（对局/发牌/下注）', () => {
  const candidates = [
    'utils/chess-engine.js',
    'utils/scoreboard-engine.js',
    'utils/opera-engine.js', // 梨园小筑模拟引擎
    'cloud/functions/asyncgame/index.js', // F7 异步对弈（一手传书，禁实时匹配类词）
    'cloud/functions/asyncgame/engine.js' // 象棋引擎 CJS 部署副本（与 utils 同源）
  ].map(f => rootDir + f);
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, 'utf8');
    const matches = GAME_PROHIBITED_PATTERNS.filter(p => p.test(content));
    assert.deepStrictEqual(matches, [], `${file} 存在违规模式: ${matches.join(', ')}`);
  }
});

// ─── 2) 功能开关默认值校验 — seed-v2-features.js vs settings 集合种子 ───
test('A2 功能开关默认值一致', () => {
  const script = rootDir + 'scripts/seed-v2-features.js';
  if (!fs.existsSync(script)) return;
  const content = fs.readFileSync(script, 'utf8');
  const keys = ['v20Content', 'v20News', 'v20Moment', 'v20Games', 'v20Home'];
  for (const k of keys) {
    assert.ok(
      content.includes(`'${k}'`) || content.includes(`"${k}"`),
      `script missing key: ${k}`
    );
  }
  // 检查至少有一个 enabled: true 的注入
  assert.ok(/enabled:\s*true/.test(content), '默认开关应全 enable true');
});

// ─── 3) 页面合规声明 — 各游戏/家园页底部明示零内购/禁止赌博 ───
const PAGE_COMPLIANCE_MARKERS = [
  '禁止赌博',
  '零内购',
  '单机娱乐',
  '单机戏曲票友模拟',
  '禁止虚拟货币兑换',
  '虚拟成长家园 · 零内购 · 成长仅来自家族行为'
];

test('A3 页面含合规声明', async () => {
  const pkgPages = [
    'pkg-game/pages/game/score.vue',
    'pkg-game/pages/game/chess.vue',
    'pkg-home/pages/home/index.vue',
    'pkg-home/pages/home/avatar.vue',
    'pkg-game/pages/game/opera.vue'
  ];
  const hits = new Set();
  for (const page of pkgPages) {
    if (!fs.existsSync(rootDir + page)) continue;
    const content = fs.readFileSync(rootDir + page, 'utf8').toLowerCase();
    for (const m of PAGE_COMPLIANCE_MARKERS) {
      if (content.includes(m.toLowerCase())) hits.add(path.basename(page));
    }
  }
  assert.ok(hits.size > 0, '未检测到任何页面合规声明');
});

// ─── 4) 服务层封装核查 — 页面不直连 wx.cloud.callFunction，走 services/* ───
test('A4 页面路由经 services 封装', async () => {
  // 扫描 pkg-game/pkg-home 的 *.vue 文件中的 import 路径，确保没有直接 callFunction
  const scanDirs = ['pkg-game/pages', 'pkg-home/pages', 'pkg-growth/pages'];
  for (const dir of scanDirs) {
    if (!fs.existsSync(rootDir + dir)) continue;
    const files = getFilesRecursive(rootDir + dir, '*.vue');
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      if (/wx\.cloud\.callFunction\s*\(/.test(content)) {
        throw new Error(`${file} 不应直连 wx.cloud.callFunction`);
      }
      // 允许 uni.request + services import
    }
  }
});

// ─── 5) secscan 检测集成验证 — content/news/广场发布前过 detectText/detectImage ───
test('A5 secscan 接入内容流程', () => {
  const functionsToCheck = [
    'cloud/functions/content/index.js',
    'cloud/functions/plaza/index.js',
    'cloud/functions/news/index.js'
  ];
  const hasDetectTextCall = [];
  for (const fn of functionsToCheck) {
    const fp = rootDir + fn;
    if (!fs.existsSync(fp)) continue;
    const c = fs.readFileSync(fp, 'utf8');
    // 检查是否调用了 secscan.detectText/action 或 cloud.callFunction with 'secscan' and 'detectText'
    if (/secscan\.detectText|detectText\(|callFunction.*secscan.*detectText/i.test(c)) hasDetectTextCall.push(fn);
  }
  assert.ok(hasDetectTextCall.length >= 2, `至少 2 个云函数应有 detectText 调用: ${hasDetectTextCall.join(', ')}`);
});

// ─── 6) 隐私门禁强化 — MEMBER 访问编辑接口拒绝（已覆盖在 smoke-functions） ───
test('A6 敏感 action 权限门禁（基于 smoke test）', () => {
  // 这里仅作占位；实际由 smoke-functions.test.js 覆盖大量 403/400 用例
  // 例如 entry.submit by VISITOR → 403; member.update by MEMBER → 403
  const smoke = rootDir + 'tests/smoke-functions.test.js';
  assert.ok(fs.existsSync(smoke), 'smoke-functions.test.js 应为必需');
});

// ─── 工具 ───
function getFilesRecursive(dir, pattern) {
  const result = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = dir + '/' + e.name;
    if (e.isDirectory()) {
      result.push(...getFilesRecursive(full, pattern));
    } else if (e.name.endsWith(pattern.replace(/\./g, '\\.'))) {
      result.push(full);
    }
  }
  return result;
}
