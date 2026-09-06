/**
 * scripts/check-env.js
 * W1 环境验证工具：一键核查开发环境（node/依赖/配置/云函数/页面/环境变量）
 * 用法：npm run check:env      （全部通过退出码 0；存在 error 退出码 1）
 * 文档：docs/ENVIRONMENT.md「环境验证方法」一节
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let errors = 0;
let warns = 0;

const ok = (msg) => console.log(`  [OK]   ${msg}`);
const warn = (msg) => { warns++; console.log(`  [WARN] ${msg}`); };
const err = (msg) => { errors++; console.log(`  [ERR]  ${msg}`); };
const section = (t) => console.log(`\n=== ${t} ===`);

function readJSON(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    return null;
  }
}

// 1. Node / npm 版本
section('1) 运行时版本');
const nodeMajor = Number(process.versions.node.split('.')[0]);
if (nodeMajor >= 18 && nodeMajor <= 25) {
  ok(`node ${process.versions.node}（要求 18–25，推荐 20/22 LTS）`);
} else {
  err(`node ${process.versions.node} 不在支持范围（18–25），请安装 20/22 LTS`);
}
ok(`npm ${process.versions.npm || '未知'}，平台 ${process.platform}`);

// 2. 关键文件存在性
section('2) 关键工程文件');
const requiredFiles = [
  'package.json', 'pages.json', 'manifest.json', 'App.vue', 'main.js',
  'tsconfig.json', 'vite.config.ts', 'env.d.ts', '.env.example',
  'styles/tokens.scss', 'styles/home.scss', 'cloud.config.json',
  'utils/routes.ts', 'utils/feature-flags.ts', 'services/request.ts',
  'stores/user.ts'
];
for (const f of requiredFiles) {
  if (fs.existsSync(path.join(ROOT, f))) ok(f);
  else err(`缺少关键文件 ${f}`);
}

// 3. 依赖安装与版本一致性
section('3) 依赖安装与版本一致性');
const pkg = readJSON(path.join(ROOT, 'package.json'));

/** 语义化版本满足判断：支持 ^x.y.z（同大版本且 >= x.y.z）、~x.y.z（同大版本同小版本）、精确版本 */
function satisfiesRange(installed, range) {
  if (!range) return true;
  const parse = (v) => String(v).split('.').map((n) => parseInt(n, 10) || 0);
  const [imaj, imin, ipat] = parse(installed);
  if (range.startsWith('^')) {
    const [maj, min, pat] = parse(range.slice(1));
    return imaj === maj && (imaj > 0 ? true : (imin > min || (imin === min && ipat >= pat)));
  }
  if (range.startsWith('~')) {
    const [maj, min, pat] = parse(range.slice(1));
    return imaj === maj && imin === min && ipat >= pat;
  }
  const [maj, min, pat] = parse(range.replace(/^[^\d]*/, ''));
  return imaj === maj && imin === min && ipat >= pat;
}

if (!pkg) {
  err('package.json 无法解析');
} else {
  const needPkgs = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {})
  ].filter((n) => n !== 'vue-i18n'); // vue-i18n 为预留依赖，允许未装
  const nmDir = path.join(ROOT, 'node_modules');
  if (!fs.existsSync(nmDir)) {
    err('node_modules 不存在，请先执行 npm install（见 docs/ENVIRONMENT.md）');
  } else {
    for (const name of needPkgs) {
      const pj = readJSON(path.join(nmDir, name, 'package.json'));
      if (!pj) { err(`依赖未安装：${name}`); continue; }
      const declared = (pkg.dependencies || {})[name] || (pkg.devDependencies || {})[name] || '';
      if (declared && !satisfiesRange(pj.version, declared)) {
        warn(`${name} 已装 ${pj.version}，不满足声明范围 ${declared}（建议 npm install 对齐）`);
      } else {
        ok(`${name}@${pj.version}${declared ? `（${declared}）` : ''}`);
      }
    }
  }
}

// 4. 云函数注册一致性（cloud.config.json ↔ cloud/functions/*）
section('4) 云函数注册一致性');
const cloudCfg = readJSON(path.join(ROOT, 'cloud.config.json'));
const fnDir = path.join(ROOT, 'cloud', 'functions');
if (!cloudCfg || !cloudCfg.functions) {
  err('cloud.config.json 缺失或格式错误（应含 functions 节点，数组或对象均可）');
} else if (!fs.existsSync(fnDir)) {
  err('cloud/functions 目录缺失');
} else {
  // 兼容两种格式：HBuilderX 对象式 {"functions":{"login":{}}} 与数组式 {"functions":["login"]}
  const fnode = cloudCfg.functions;
  const registered = Array.isArray(fnode)
    ? fnode.map((f) => (typeof f === 'string' ? f : Object.keys(f)[0]))
    : Object.keys(fnode);
  const onDisk = fs.readdirSync(fnDir)
    .filter((d) => fs.existsSync(path.join(fnDir, d, 'index.js')))
    .filter((d) => d !== 'common'); // common/ 是共享模块源目录（sync-common 同步用），非可部署函数
  const regSet = new Set(registered);
  const diskSet = new Set(onDisk);
  const onlyReg = [...regSet].filter((n) => !diskSet.has(n));
  const onlyDisk = [...diskSet].filter((n) => !regSet.has(n));
  ok(`cloud.config.json 注册 ${registered.length} 个；磁盘实现 ${onDisk.length} 个`);
  if (onlyReg.length) err(`已注册但无实现：${onlyReg.join(', ')}（需补 index.js 或撤注册）`);
  if (onlyDisk.length) warn(`有实现未注册：${onlyDisk.join(', ')}（部署前补入 cloud.config.json）`);
}

// 5. pages.json 页面与文件一致性
section('5) 页面路由与文件一致性');
const pagesCfg = readJSON(path.join(ROOT, 'pages.json'));
if (!pagesCfg) {
  err('pages.json 无法解析');
} else {
  const pageRefs = [];
  for (const p of pagesCfg.pages || []) pageRefs.push(p.path);
  for (const sub of pagesCfg.subPackages || []) {
    for (const p of sub.pages || []) pageRefs.push(`${sub.root}/${p.path}`);
  }
  let missing = 0;
  for (const ref of pageRefs) {
    const vuePath = path.join(ROOT, `${ref}.vue`);
    if (fs.existsSync(vuePath)) ok(`pages: ${ref}`);
    else { err(`pages.json 引用的页面不存在：${ref}.vue`); missing++; }
  }
  if (!missing) ok(`共 ${pageRefs.length} 个页面路由全部对齐`);
}

// 6. 环境变量
section('6) 环境变量（VITE_CLOUD_ENV_ID）');
const envLocal = path.join(ROOT, '.env');
const envProd = path.join(ROOT, '.env.production');
const envFile = fs.existsSync(envLocal) ? envLocal : (fs.existsSync(envProd) ? envProd : null);
if (!envFile) {
  warn('未找到 .env / .env.production —— 复制 .env.example 为 .env 并填入云开发环境 ID');
} else {
  const content = fs.readFileSync(envFile, 'utf8');
  const m = content.match(/VITE_CLOUD_ENV_ID\s*=\s*(.+)/);
  if (!m || !m[1].trim() || m[1].includes('YOUR_CLOUD_ENV_ID')) {
    warn(`${path.basename(envFile)} 中 VITE_CLOUD_ENV_ID 仍是占位符，云能力不可用（页面渲染不受影响）`);
  } else {
    ok(`VITE_CLOUD_ENV_ID 已配置（${m[1].trim().slice(0, 6)}***）`);
  }
}

// 7. 测试目录
section('7) 测试资产');
const testsDir = path.join(ROOT, 'tests');
if (fs.existsSync(testsDir)) {
  const n = fs.readdirSync(testsDir).filter((f) => f.endsWith('.test.js')).length;
  ok(`tests/ 共 ${n} 个测试文件（npm test 运行）`);
} else {
  err('tests/ 目录缺失');
}

console.log('\n──────────────────────────────');
console.log(`环境核查完成：errors=${errors} warns=${warns}`);
if (errors > 0) {
  console.log('❌ 未通过：请按上方 [ERR] 修复后重试（解决方案见 docs/ENVIRONMENT.md FAQ）');
  process.exit(1);
}
console.log('✅ 环境核查通过（WARN 项按文档指引处理即可）');
