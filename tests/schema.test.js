/**
 * tests/schema.test.js
 * 云数据库 schema 一致性门禁（node --test 风格，与仓库其他测试同口径）
 *
 * 校验目标（防漂移）：
 *   T1. 每个 *.schema.json 都是合法 JSON
 *   T2. required 字段必须 ⊆ properties 键
 *   T3. enum 类型字段必须声明 enum 数组
 *   T4. 云函数代码里引用的集合名必须都有 schema 定义（引用⊆定义）
 *   T5. 集合命名符合 snake_case
 *   T6. 索引定义 keys 值只能是 1 / -1
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SCHEMA_DIR = path.join(ROOT, 'cloud', 'db-schemas');
const FUNC_DIR = path.join(ROOT, 'cloud', 'functions');

/** 去除 JS 块注释后提取 JSON（兼容 "头部注释 + 裸 JSON" 格式）。
 *  注意：只删块注释——不删行注释，否则会误伤 "$schema" 里的 http 双斜杠 */
function extractJsonFromJsFile(src) {
  const stripped = src.replace(/\/\*[\s\S]*?\*\//g, '');
  return JSON.parse(stripped);
}

/** 读取全部 schema 文件（带文件名） */
function loadSchemas() {
  return fs
    .readdirSync(SCHEMA_DIR)
    .filter((f) => f.endsWith('.schema.json'))
    .map((f) => {
      const raw = fs.readFileSync(path.join(SCHEMA_DIR, f), 'utf8');
      const json = extractJsonFromJsFile(raw);
      return { file: f, name: f.replace(/\.schema\.json$/, ''), json };
    });
}

/** 扫描云函数源码中的 db.collection('xxx') 引用集合名 */
function scanReferencedCollections() {
  const names = new Set();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith('.js')) {
        const src = fs.readFileSync(p, 'utf8');
        const re = /collection\('([a-zA-Z0-9_]+)'\)/g;
        let m;
        while ((m = re.exec(src)) !== null) names.add(m[1]);
      }
    }
  };
  walk(FUNC_DIR);
  return names;
}

test('T1 所有 schema 文件都是合法 JSON', () => {
  const schemas = loadSchemas();
  assert.ok(schemas.length >= 20, `schema 文件数量应 ≥20，实际 ${schemas.length}`);
  for (const s of schemas) {
    assert.ok(s.json && typeof s.json === 'object', `${s.file} JSON 解析失败`);
  }
});

test('T2 required 字段必须 ⊆ properties 键', () => {
  for (const s of loadSchemas()) {
    const { required = [], properties = {} } = s.json;
    for (const field of required) {
      assert.ok(
        Object.prototype.hasOwnProperty.call(properties, field),
        `${s.file}: required 字段 "${field}" 未在 properties 中声明`
      );
    }
  }
});

test('T3 enum 类型字段必须声明 enum 数组', () => {
  for (const s of loadSchemas()) {
    for (const [field, def] of Object.entries(s.json.properties || {})) {
      if (def && def.type === 'string' && /type|status|role|level|pool|visibility|scope|scene|gender|era/i.test(field)) {
        // 排除开放的类型字段（mimeType/bizType/typeLabel 等开放字符串；前缀匹配覆盖复合名）
        const openFields = /^(mime|biz|action|label|typeLabel|desc|detail|comment|note|body|targetRoute|ocrText|generation)/i;
        const openExact = ['roleTitle', 'roleDesc', 'generationPoem'];
        if (openFields.test(field) || openExact.includes(field)) continue;
        assert.ok(
          Array.isArray(def.enum),
          `${s.file}: 字段 "${field}" 疑似枚举但未声明 enum`
        );
      }
    }
  }
});

test('T4 云函数引用的集合 ⊆ schema 定义（防漏定义）', () => {
  const defined = new Set(loadSchemas().map((s) => s.name));
  const referenced = scanReferencedCollections();
  const missing = [...referenced].filter((n) => !defined.has(n));
  assert.deepStrictEqual(missing, [], `以下集合被云函数引用但缺少 schema：${missing.join(', ')}`);
});

test('T5 集合命名符合 snake_case', () => {
  for (const s of loadSchemas()) {
    assert.match(
      s.name,
      /^[a-z][a-z0-9_]*$/,
      `${s.file}: 集合名应使用 snake_case`
    );
  }
});

test('T6 索引 keys 值只能是 1 / -1', () => {
  for (const s of loadSchemas()) {
    for (const idx of s.json.indexes || []) {
      for (const [field, dir] of Object.entries(idx.keys || {})) {
        assert.ok(
          dir === 1 || dir === -1,
          `${s.file}: 索引 "${idx.name || field}" 字段 "${field}" 方向非法（${dir}）`
        );
      }
    }
  }
});
