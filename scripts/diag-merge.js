/**
 * scripts/diag-merge.js — 临时诊断脚本：验证 branch.merge 四维匹配
 */
const Module = require('module');
const stubPath = require.resolve('./wx-server-sdk-stub.js');
const orig = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === 'wx-server-sdk') return stubPath;
  return orig.call(this, request, ...rest);
};

globalThis.__HCS_STUB_SEED__ = {
  collections: {
    users: [{ openid: 'u-editor', role: 'EDITOR' }],
    branches: [
      { _id: 'b1', code: 'HAO-0000-01', name: 'S', level: 2, status: 'ACTIVE', parentCode: 'HAO-0000' },
      { _id: 'b2', code: 'HAO-0000-02', name: 'T', level: 2, status: 'ACTIVE', parentCode: 'HAO-0000' }
    ],
    members: [
      { _id: 'm0a', genealogyName: '郝德祖', generation: 17, branchId: 'HAO-0000-01', path: '/001/' },
      { _id: 'm0b', genealogyName: '郝德祖', generation: 17, branchId: 'HAO-0000-02', path: '/002/' },
      { _id: 'm1', genealogyName: '郝德生', generation: 18, branchId: 'HAO-0000-01', path: '/001/005/', lifespan: { birth: '1680-05-01' } },
      { _id: 'm3', genealogyName: '郝德生', generation: 18, branchId: 'HAO-0000-02', path: '/002/007/', lifespan: { birth: '1680-05-01' } }
    ]
  },
  seq: 0
};

const FN = require('../cloud/functions/branch/index.js');
FN.main({ action: 'merge', fromCode: 'HAO-0000-01', toCode: 'HAO-0000-02' }, { OPENID: 'u-editor', openid: 'u-editor' })
  .then((r) => {
    console.log('success:', r.success);
    console.log('code:', r.code, 'message:', r.message || '');
    console.log('mergeReport:', JSON.stringify(r.data && r.data.mergeReport, null, 2));
  })
  .catch((e) => console.error('ERR:', e.stack));
