/**
 * scripts/wx-server-sdk-stub.js
 * 仅供 scripts/check-functions.js 加载校验使用的 wx-server-sdk 替身。
 * 真实运行时由微信云开发环境提供原生模块，本文件不参与部署。
 */
module.exports = {
  init: () => {},
  DYNAMIC_CURRENT_ENV: Symbol('env'),
  getDatabase: () => {
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
  },
  getOpenData: async () => ({}),
  cloud: { callFunction: async () => ({ result: { success: true, data: null } }) },
  updateConfig: () => {}
};
