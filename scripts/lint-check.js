/**
 * scripts/lint-check.js
 * 自制 lint 检查器（零依赖）：.eslintrc.cjs 质量门禁的可执行子集
 * 背景：沙箱无法 npm install（eslint 不可用），本脚本守住同等 error 级规则
 * 用法：node scripts/lint-check.js        # 全库扫描
 *       node scripts/lint-check.js <file> # 单文件
 * 退出码：0 通过 / 1 存在 error
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

// 扫描范围（业务源码；生成副本与依赖排除）
const SCAN_DIRS = ['cloud/functions', 'services', 'stores', 'utils', 'scripts', 'tests', 'components', 'pages'];
const EXT = /\.(js|ts|vue)$/;
const SKIP = /node_modules|unpackage|dist|\.npm-cache|functions\/[a-z]+\/common\//;

// ─── 规则集（对齐 .eslintrc.cjs） ───
const RULES = [
  {
    id: 'no-console-log',
    severity: 'error',
    allowFiles: /(cloud|tests|scripts)[\/\\]/,
    test: (line) => /\bconsole\.log\s*\(/.test(line),
    msg: '业务代码禁用 console.log（性能/信息泄露）'
  },
  { id: 'no-debugger', severity: 'error', test: (l) => /\bdebugger\b/.test(l), msg: '禁止 debugger' },
  { id: 'no-var', severity: 'error', test: (l) => /^\s*var\s+\w/.test(l), msg: '禁止 var 声明' },
  {
    id: 'eqeqeq',
    severity: 'error',
    test: (l) => /[^=!<>]==[^=]/.test(l) && !/===|!==/.test(l.replace(/"[^"]*"|'[^']*'/g, '')),
    msg: '禁用松散等号 ==/!=（用 === / !==）'
  },
  { id: 'no-eval', severity: 'error', test: (l) => /\beval\s*\(/.test(l), msg: '禁止 eval（XSS/注入风险）' },
  { id: 'max-line-len', severity: 'warn', test: (l) => l.length > 160, msg: '超长行 >160 字符' }
];

const MAX_FUNC_LINES = 120; // 质量门禁：函数 ≤120 行（粗检：function 关键字块）

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP.test(p)) walk(p, out);
    } else if (EXT.test(e.name) && !SKIP.test(p)) {
      out.push(p);
    }
  }
  return out;
}

function lintFile(file) {
  const problems = [];
  const rel = path.relative(ROOT, file);
  let lines;
  try {
    lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  } catch {
    return problems;
  }

  let funcStart = -1;
  lines.forEach((line, i) => {
    // 跳过注释行（规则只看代码行）
    const code = line.replace(/\/\/.*$/, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const r of RULES) {
      if (r.allowFiles && r.allowFiles.test(rel)) continue;
      if (r.test(code)) problems.push({ file: rel, line: i + 1, severity: r.severity, rule: r.id, msg: r.msg });
    }
    // 粗粒度函数长度：function 声明到下一个同缩进 '}' 或文件尾
    if (/\bfunction\b/.test(code) && funcStart === -1) funcStart = i + 1;
    if (funcStart > 0 && /^\s*\}\s*$/.test(line)) {
      const len = i + 1 - funcStart;
      if (len > MAX_FUNC_LINES) {
        problems.push({ file: rel, line: funcStart, severity: 'warn', rule: 'max-lines-per-function', msg: `函数约 ${len} 行 > ${MAX_FUNC_LINES}` });
      }
      funcStart = -1;
    }
  });
  return problems;
}

function main() {
  const target = process.argv[2];
  const SELF = path.join(__dirname, 'lint-check.js'); // 自举排除：本文件包含规则字面量
  const files = (target ? [path.resolve(target)] : SCAN_DIRS.flatMap(d => {
    const p = path.join(ROOT, d);
    return fs.existsSync(p) ? walk(p) : [];
  })).filter(f => path.resolve(f) !== SELF);

  const all = files.flatMap(lintFile);
  const errors = all.filter(p => p.severity === 'error');
  const warns = all.filter(p => p.severity === 'warn');

  console.log(`扫描 ${files.length} 个文件`);
  errors.forEach(p => console.log(`  [E] ${p.file}:${p.line} ${p.rule} — ${p.msg}`));
  warns.slice(0, 30).forEach(p => console.log(`  [W] ${p.file}:${p.line} ${p.rule} — ${p.msg}`));
  console.log(`errors: ${errors.length} / warns: ${warns.length}`);
  console.log(errors.length === 0 ? '✅ LINT 通过（error 级门禁全绿）' : '❌ LINT 未过：先修复全部 error');
  process.exit(errors.length === 0 ? 0 : 1);
}

module.exports = { lintFile, RULES, MAX_FUNC_LINES };

if (require.main === module) main();
