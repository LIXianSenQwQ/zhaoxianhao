/**
 * scripts/wx-server-sdk-stub.js
 * 仅供 scripts/check-functions.js 与 node:test 冒烟测试使用的 wx-server-sdk 替身。
 * 真实运行时由微信云开发环境提供原生模块，本文件不参与部署。
 *
 * Sprint R9：支持数据注入——测试通过 globalThis.__HCS_STUB_SEED__ 预置集合数据：
 *   globalThis.__HCS_STUB_SEED__ = { collections: { users: [{ openid, role }] }, seq: 0 };
 * 默认空 seed 时行为与旧版一致（所有查询返回空数组），向后兼容。
 */
module.exports = {
  init: () => {},
  DYNAMIC_CURRENT_ENV: Symbol('env'),
  getDatabase: () => {
    const seedGet = () => {
      if (!globalThis.__HCS_STUB_SEED__) globalThis.__HCS_STUB_SEED__ = { collections: {}, seq: 0 };
      return globalThis.__HCS_STUB_SEED__;
    };
    const getCol = (name) => {
      const seed = seedGet();
      if (!seed.collections[name]) seed.collections[name] = [];
      return seed.collections[name];
    };
    // where 条件全等匹配（RegExp 标记对象走 test）
    const matches = (row, where) => Object.entries(where || {}).every(([k, v]) => {
      if (v && typeof v === 'object' && typeof v.test === 'function') return v.test(row[k]);
      return row[k] === v;
    });

    const chain = (name) => {
      const state = { where: null, skip: 0, limit: Infinity, order: null, orderDir: 'asc' };
      const apply = (rows) => {
        let out = rows.filter(r => !state.where || matches(r, state.where));
        if (state.order) {
          out = out.slice().sort((a, b) => {
            const av = a[state.order], bv = b[state.order];
            const c = av < bv ? -1 : av > bv ? 1 : 0;
            return state.orderDir === 'desc' ? -c : c;
          });
        }
        return out.slice(state.skip, state.skip + state.limit).map(r => ({ ...r }));
      };
      const q = {
        where: (w) => { state.where = w; return q; },
        field: () => q,
        orderBy: (k, dir) => { state.order = k; state.orderDir = dir === 'desc' ? 'desc' : 'asc'; return q; },
        skip: (n) => { state.skip = n; return q; },
        limit: (n) => { state.limit = n; return q; },
        doc: (id) => ({
          get: async () => {
            const row = getCol(name).find(r => r._id === id);
            return { data: row ? { ...row } : (row === undefined ? [] : null) };
          },
          update: async ({ data }) => {
            const row = getCol(name).find(r => r._id === id);
            if (row) Object.assign(row, data);
            return { stats: { updated: row ? 1 : 0 } };
          },
          remove: async () => {
            const col = getCol(name);
            const i = col.findIndex(r => r._id === id);
            if (i >= 0) col.splice(i, 1);
            return { stats: { removed: i >= 0 ? 1 : 0 } };
          }
        }),
        get: async () => ({ data: apply(getCol(name)) }),
        add: async ({ data }) => {
          const seed = seedGet();
          const col = getCol(name);
          const _id = `stub-${++seed.seq}`;
          col.push({ ...data, _id });
          return { _id };
        },
        update: async ({ data }) => {
          const col = getCol(name);
          let n = 0;
          for (const r of col) {
            if (!state.where || matches(r, state.where)) { Object.assign(r, data); n++; }
          }
          return { stats: { updated: n } };
        },
        remove: async () => {
          const col = getCol(name);
          const before = col.length;
          seedGet().collections[name] = col.filter(r => !state.where || matches(r, state.where));
          return { stats: { removed: before - seedGet().collections[name].length } };
        },
        count: async () => ({ total: apply(getCol(name)).length })
      };
      return q;
    };
    return {
      collection: chain,
      RegExp: (opts) => new RegExp(opts.regexp, opts.options),
      command: { eq: (v) => v, in: (arr) => arr, inc: (n) => n }
    };
  },
  getOpenData: async () => ({}),
  cloud: { callFunction: async () => ({ result: { success: true, data: null } }) },
  updateConfig: () => {}
};
