/**
 * scripts/fix-service-call.js — 一次性修复 services 层 call() 位置参数误用
 * 背景：call(name, data, opts: CallOptions) 第三参应为对象；
 *       多个服务误传 'cache_key' 字符串 → 缓存静默失效（TS 不阻断构建）。
 * 修复：第三参为字符串字面量的 call(...) → read(...)，并确保 import read。
 */
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'services');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.ts'));

function spliceCallToRead(src, startPos) {
  // 从 startPos 的 'call' 开始做括号配对，返回 [endPos, argsStr]
  let i = src.indexOf('(', startPos);
  if (i === -1) return null;
  let depth = 0;
  let inStr = null;
  for (; i < src.length; i++) {
    const ch = src[i];
    const prev = src[i - 1];
    if (inStr) {
      if (ch === inStr && prev !== '\\') inStr = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { inStr = ch; continue; }
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return { end: i, args: src.slice(src.indexOf('(', startPos) + 1, i) };
    }
  }
  return null;
}

function splitArgs(argsStr) {
  const parts = [];
  let depth = 0;
  let inStr = null;
  let cur = '';
  for (let i = 0; i < argsStr.length; i++) {
    const ch = argsStr[i];
    const prev = argsStr[i - 1];
    if (inStr) {
      cur += ch;
      if (ch === inStr && prev !== '\\') inStr = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { inStr = ch; cur += ch; continue; }
    if (ch === '(' || ch === '{' || ch === '[') depth++;
    if (ch === ')' || ch === '}' || ch === ']') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

let totalFixed = 0;
for (const f of files) {
  const p = path.join(dir, f);
  let src = fs.readFileSync(p, 'utf8');
  let out = '';
  let pos = 0;
  let fixed = 0;
  const wordRe = /\bcall\s*\(/g;
  let m;
  const ranges = [];
  while ((m = wordRe.exec(src)) !== null) {
    const parsed = spliceCallToRead(src, m.index);
    if (!parsed) continue;
    const args = splitArgs(parsed.args);
    // 第三参为字符串字面量 → 误用
    if (args.length >= 3 && /^\s*(['"`])/.test(args[2])) {
      ranges.push({ start: m.index, end: parsed.end + 1, replacement: `read(${parsed.args})` });
      fixed++;
      wordRe.lastIndex = parsed.end + 1;
    }
  }
  if (fixed) {
    for (let i = ranges.length - 1; i >= 0; i--) {
      const r = ranges[i];
      out = src.slice(0, r.start) + r.replacement + src.slice(r.end);
      src = out;
    }
    // 确保 import read
    if (!/\bimport\s*\{[^}]*\bread\b[^}]*\}\s*from\s*'\.\/request'/.test(src)) {
      if (/import\s*\{([^}]*)\}\s*from\s*'\.\/request'/.test(src)) {
        src = src.replace(/import\s*\{([^}]*)\}\s*from\s*'\.\/request'/, (im, inner) => {
          const names = inner.split(',').map((s) => s.trim()).filter(Boolean);
          if (!names.includes('read')) names.push('read');
          return `import { ${names.join(', ')} } from './request'`;
        });
      } else if (/import\s+type\s+\{[^}]*\}\s*from\s*'\.\/request'/.test(src)) {
        // 类型导入行后补值导入
        src = src.replace(/(import\s+type\s+\{[^}]*\}\s*from\s*'\.\/request';?)/, `$1\nimport { read } from './request'`);
      }
    }
    fs.writeFileSync(p, src, 'utf8');
    totalFixed += fixed;
    console.log(`fixed ${fixed} in ${f}`);
  }
}
console.log(`TOTAL fixed: ${totalFixed}`);
