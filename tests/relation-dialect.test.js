/**
 * tests/relation-dialect.test.js - 称谓方言覆盖集成测试（蓝图 §7.2）
 * settings.kindshipDialect 覆盖表 → relation.calc 返回 dialectTitle（additive，formal 不变）
 */
const { test } = require('node:test');
const assert = require('node:assert');
const Module = require('module');
const stubPath = require.resolve('../scripts/wx-server-sdk-stub.js');
if (!Module._resolveFilename.__hcsPatched) {
  const orig = Module._resolveFilename;
  Module._resolveFilename = function (request, ...rest) {
    if (request === 'wx-server-sdk') return stubPath;
    return orig.call(this, request, ...rest);
  };
  Module._resolveFilename.__hcsPatched = true;
}
const { main } = require('../cloud/functions/relation');

const CTX = { OPENID: 'u-m', openid: 'u-m' };

function seed(collections) {
  globalThis.__HCS_STUB_SEED__ = { collections, seq: 0 };
}

test('§7.2 方言覆盖集成：无方言设置时 dialectTitle=null', async () => {
  seed({
    users: [{ _id: 'u-m', openid: 'u-m', role: 'MEMBER' }],
    members: [
      { _id: 'root', path: '/root/', gender: 'MALE' },
      { _id: 'a', path: '/root/a/', gender: 'MALE', birthOrder: 5 }, // younger
      { _id: 'b', path: '/root/b/', gender: 'MALE', birthOrder: 3 }  // elder
    ],
    relations: [],
    settings: []
  });
  const res = await main({ action: 'calc', aId: 'a', bId: 'b' }, CTX);
  assert.equal(res.success, true);
  assert.equal(res.data.formalTitle, '哥哥', 'A(younger)→B(elder)=“哥哥”');
  assert.equal(res.data.dialectTitle, null, '无方言设置时 dialectTitle 应为 null');
});

test('§7.2 方言覆盖集成：方言 value.overrides 覆盖“哥哥/弟弟”→“哥/弟”', async () => {
  seed({
    users: [{ _id: 'u-m', openid: 'u-m', role: 'MEMBER' }],
    members: [
      { _id: 'root', path: '/root/', gender: 'MALE' },
      { _id: 'a', path: '/root/a/', gender: 'MALE', birthOrder: 5 }, // younger → calls elder b
      { _id: 'b', path: '/root/b/', gender: 'MALE', birthOrder: 3 }  // elder
    ],
    relations: [],
    settings: [
      {
        key: 'kindshipDialect',
        scope: 'global',
        value: JSON.stringify({ dialect: 'undong', overrides: { '1-1': { male: { elder: '哥', younger: '弟' } } } })
      }
    ]
  });
  const res = await main({ action: 'calc', aId: 'a', bId: 'b' }, CTX);
  assert.equal(res.success, true);
  assert.equal(res.data.formalTitle, '哥哥', 'formal 不受方言影响');
  assert.equal(res.data.dialectTitle, '哥', '同代男性 elder → 方言应返回 "哥"');

  const r2 = await main({ action: 'calc', aId: 'b', bId: 'a' }, CTX);
  assert.equal(r2.success, true);
  assert.equal(r2.data.formalTitle, '弟弟', 'B(elber)→A(younger)=“弟弟”');
  assert.equal(r2.data.dialectTitle, '弟', '同代男性 younger → 方言应返回 "弟"');
});

test('§7.2 方言覆盖集成：直系上溯“父亲”→“爹”', async () => {
  // root = father (path=/root/, depth 1), c = child (path=/root/c/, depth 2)
  seed({
    users: [{ _id: 'u-m', openid: 'u-m', role: 'MEMBER' }],
    members: [
      { _id: 'root', path: '/root/', gender: 'MALE' },   // father
      { _id: 'c', path: '/root/c/', gender: 'MALE' }    // child calls father
    ],
    settings: [
      { key: 'kindshipDialect', scope: 'global', value: { overrides: { '1-0': { male: '爹' } } } }
    ]
  });
  const res = await main({ action: 'calc', aId: 'c', bId: 'root' }, CTX);
  assert.equal(res.success, true);
  assert.equal(res.data.formalTitle, '父亲');
  assert.equal(res.data.dialectTitle, '爹', '父 → 方言 "爹"');
});

test('§7.2 方言覆盖集成：female 母亲 → 方言 "娘"', async () => {
  // root = mother (path=/root/, female, depth 1), c2 = child
  seed({
    users: [{ _id: 'u-m', openid: 'u-m', role: 'MEMBER' }],
    members: [
      { _id: 'root', path: '/root/', gender: 'FEMALE' }, // mother
      { _id: 'c2', path: '/root/c2/', gender: 'MALE' }   // child calls mother
    ],
    settings: [
      { key: 'kindshipDialect', scope: 'global', value: { overrides: { '1-0': { female: '娘' } } } }
    ]
  });
  const res2 = await main({ action: 'calc', aId: 'c2', bId: 'root' }, CTX);
  assert.equal(res2.success, true);
  assert.equal(res2.data.formalTitle, '母亲');
  assert.equal(res2.data.dialectTitle, '娘', '母 → 方言 "娘"');
});

test('§7.2 方言覆盖集成：settings 读不到/坏 JSON 时安全降级 dialectTitle=null', async () => {
  seed({
    users: [{ _id: 'u-m', openid: 'u-m', role: 'MEMBER' }],
    members: [
      { _id: 'root', path: '/root/', gender: 'MALE' },
      { _id: 'a', path: '/root/a/', gender: 'MALE', birthOrder: 5 },
      { _id: 'b', path: '/root/b/', gender: 'MALE', birthOrder: 3 }
    ],
    relations: [],
    settings: [
      { key: 'kindshipDialect', scope: 'global', value: '{{ 坏 JSON' }
    ]
  });
  const res = await main({ action: 'calc', aId: 'a', bId: 'b' }, CTX);
  assert.equal(res.success, true);
  assert.equal(res.data.formalTitle, '哥哥');
  assert.equal(res.data.dialectTitle, null, '坏 JSON → 降级无方言');
});
