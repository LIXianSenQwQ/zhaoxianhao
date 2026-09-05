/**
 * scripts/check-functions.js
 * 云函数加载校验（零依赖）：
 * 沙箱无 wx-server-sdk（npm 受阻），用 stub 注入隔离依赖，
 * 真正 require 每个云函数入口——暴露语法错误/结构错误/同步缺失，
 * 与"依赖缺失"区分开。
 * 用法：node scripts/check-functions.js
 * 退出码：0 全部通过 / 1 存在失败
 */
const Module = require('module');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const FN_DIR = path.join(ROOT, 'cloud', 'functions');

// ─── wx-server-sdk stub：仅用于加载校验，不承载业务断言 ───
function makeDbStub() {
  const chain = () => {
    const q = {
      where: () => q, field: () => q, orderBy: () => q, skip: () => q,
      limit: () => q, doc: () => q, collection: () => q,
      get: async () => ({ data: [] }),
      add: async () => ({ _id: 'stub-id' }),
      update: async () => ({ stats: { updated: 1 } }),
      remove: async () => ({ stats: { removed: 1 } }),
      count: async () => ({ total: 0 })
    };
    return q;
  };
  return {
    collection: chain,
    RegExp: (opts) => new RegExp(opts.regexp, opts.options),
    command: { eq: (v) => v, in: (arr) => arr, inc: (n) => n }
  };
}

const wxStub = {
  init: () => {},
  DYNAMIC_CURRENT_ENV: Symbol('env'),
  getDatabase: () => makeDbStub(),
  getOpenData: async () => ({}),
  cloud: { callFunction: async () => ({ result: { success: true, data: null } }) },
  updateConfig: () => {}
};

// 拦截 wx-server-sdk 解析，返回 stub
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === 'wx-server-sdk') {
    return require.resolve('./wx-server-sdk-stub');
  }
  return origResolve.call(this, request, ...rest);
};

// ─── 扫描 ───
function main() {
  const fns = fs.readdirSync(FN_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name !== 'common')
    .map(d => d.name);

  const fails = [];
  let ok = 0;

  for (const name of fns) {
    const entry = path.join(FN_DIR, name, 'index.js');
    try {
      if (!fs.existsSync(entry)) throw new Error('缺少 index.js 入口');
      delete require.cache[require.resolve(entry)];
      const mod = require(entry);
      if (typeof mod.main !== 'function') throw new Error('main 导出缺失或非函数');
      // 校验 common 副本同步：入口至少 require 一个 common 模块时须能解析
      const src = fs.readFileSync(entry, 'utf8');
      if (/require\('\.\/common\//.test(src)) {
        const hasCommon = fs.existsSync(path.join(FN_DIR, name, 'common'));
        if (!hasCommon) throw new Error('引用 ./common/ 但副本未同步（先跑 npm run sync:common）');
      }
      ok++;
      console.log(`  ✓ ${name}`);
    } catch (e) {
      fails.push({ name, err: e.message.split('\n')[0] });
      console.log(`  ✗ ${name}: ${e.message.split('\n')[0]}`);
    }
  }

  console.log(`\n云函数加载校验: ${ok}/${fns.length} 通过`);
  if (fails.length) {
    console.log('❌ 存在加载失败，逐项修复后重跑');
    process.exit(1);
  }
  console.log('✅ 全部云函数语法与结构校验通过');
}

main();
