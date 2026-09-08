/**
 * scripts/fix-service-timeout.js — 修复 call(name, data, undefined, ttl) 超时丢失
 * 背景：call 第三参为 opts 对象；误传 undefined 使 timeout 重置为 3s 默认值，
 *       导致备份/导入/PDF/XML 等 30~120s 长操作在 3s 处必然超时。
 * 修复：call(A, B, undefined, T) → call(A, B, { timeout: T })
 */
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'services');
let n = 0;
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.ts'))) {
  const p = path.join(dir, f);
  const s = fs.readFileSync(p, 'utf8');
  const out = s.replace(
    /(?<![a-zA-Z_.'`"])call\(([\s\S]*?),\s*undefined\s*,\s*(\d+)\s*\)/g,
    (m, inner, ttl) => {
      n++;
      return 'call(' + inner + ', { timeout: ' + ttl + ' })';
    }
  );
  if (out !== s) fs.writeFileSync(p, out, 'utf8');
}
console.log('fixed undefined-timeout:', n);
