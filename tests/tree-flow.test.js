/**
 * tests/tree-flow.test.js - 树视图编排层集成测试（Sprint R6）
 * 
 * 使用注入的 fakeRead，验证：
 *   - 根页/子树加载：请求参数、缓存命中、错误不缓存
 *   - 续载：hasMore=true 时调用、无数据返回 null
 *   - 并发去重：两次同时 loadRoot → single read
 *   - 刷新：clear cache + reload
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { createTreeFlow } = require('../utils/tree-flow');

function makeFakeCall(resultOrError) {
  let count = 0;
  return async (name, data, key) => {
    count++;
    if (resultOrError instanceof Error) {
      return Promise.resolve({ error: resultOrError.message });
    }
    // resultOrError is CallResult {data:{nodes:[],cursor?,hasMore?}} or {error:...}
    return Promise.resolve({ ...resultOrError, __calledCount: count });
  };
}

test('loadRoot：首次调用请求 API，结果写入 cache', async () => {
  let calls = 0;
  const state = { collapsed: {}, pages: new Map(), loading: new Set() };
  const flow = createTreeFlow({
    state,
    read: (n, d, k) => {
      calls++;
      return Promise.resolve({ data: { nodes: [{ path: '/a/' }], hasMore: false } });
    }
  });

  const res = await flow.loadRoot('/a/');
  assert.equal(calls, 1);
  assert.ok(res && res.nodes);
  assert.equal(state.pages.size, 1);
});

test('loadRoot：并发去重（两次同时调用 → single read）', async () => {
  let calls = 0;
  const state = { collapsed: {}, pages: new Map(), loading: new Set() };
  const flow = createTreeFlow({ state, read: () => { calls++; return Promise.resolve({ data: { nodes: [] }, hasMore: false }); }});
  const p1 = flow.loadRoot('/x/');
  const p2 = flow.loadRoot('/x/');
  await Promise.all([p1, p2]);
  assert.equal(calls, 1); // 应只调用一次
});

test('loadRoot：已有缓存直接返回（不请求）', async () => {
  let calls = 0;
  const state = { collapsed: {}, pages: new Map(), loading: new Set() };
  const flow = createTreeFlow({ state, read: () => { calls++; return Promise.resolve({ data: { nodes: [] } }); }});
  // pre-populate cache
  const key = `tree:/c/:r`;
  state.pages.set(key, { nodes: [], hasMore: false });
  const res = await flow.loadRoot('/c/');
  assert.equal(calls, 0);
  assert.ok(res);
});

test('loadRoot：错误不缓存（下次可重试）', async () => {
  const state = { collapsed: {}, pages: new Map(), loading: new Set() };
  const errRes = { error: 'network' };
  let callsAfterRetry = 0;
  const flow = createTreeFlow({ state, read: () => errRes }); // always error
  const r1 = await flow.loadRoot('/err/');
  assert.equal(r1, null);
  assert.equal(state.pages.has(`tree:/err/:r`), false);
  // retry same root should call again (or at least not use cache)
});

test('loadChildren：点击展开拉取子树', async () => {
  let calls = 0;
  const state = { collapsed: {}, pages: new Map(), loading: new Set() };
  const flow = createTreeFlow({ state, read: () => { calls++; return Promise.resolve({ data: { nodes: [{ path: '/x/1/' }], hasMore: false } }); }});
  const res = await flow.loadChildren('/x/');
  assert.equal(calls, 1);
  assert.ok(res && res.nodes.length === 1);
});

test('nextPage：hasMore=true 触发后续页', async () => {
  let pageCalled = 0;
  const state = { collapsed: {}, pages: new Map(), loading: new Set() };
  const flow = createTreeFlow({ state, read: async (n,d,k) => { pageCalled++; return Promise.resolve({ data: { nodes: [], cursor:'c', hasMore: true } }); }});
  // seed page 1 with hasMore=true
  const key1 = `tree:/root/:r`;
  state.pages.set(key1, { nodes: [], hasMore: true, cursor: 'c' });
  const res = await flow.nextPage('/root/', 2);
  assert.equal(pageCalled, 1); // should fetch page 2
  assert.ok(res);
});

test('nextPage：hasMore=false 或无缓存 → 不请求，返回 null', async () => {
  let calls = 0;
  const state = { collapsed: {}, pages: new Map(), loading: new Set() };
  const flow = createTreeFlow({ state, read: () => { calls++; return Promise.resolve({ data: { nodes: [] } });}});
  // seed no hasMore
  state.pages.set(`tree:/n/:r`, { nodes: [], hasMore: false });
  const res = await flow.nextPage('/n/', 3);
  assert.equal(calls, 0);
  assert.equal(res, null);
});

test('refreshRoot：清除本根前缀缓存并重新拉取', async () => {
  let calls = 0;
  const state = { collapsed: {}, pages: new Map(), loading: new Set() };
  const flow = createTreeFlow({ state, read: () => { calls++; return Promise.resolve({ data: { nodes: [{ path: '/new/' }], hasMore: false } });}});
  // pre-load root + child
  state.pages.set(`tree:/r/:r`, { nodes: [], hasMore: false });
  state.pages.set(`tree:/r/:c_children`, { nodes: [], hasMore: false });
  const oldSize = state.pages.size;
  const res = await flow.refreshRoot('/r/');
  assert.equal(calls, 1); // once for refresh
  assert.ok(res && res.nodes[0].path === '/new/');
  assert.equal(state.pages.size < oldSize, true); // cleared previous
});

test('reset：清空所有状态', async () => {
  const state = { collapsed: {}, pages: new Map(new Set([['k','v']]).entries()), loading: new Set(['l']) };
  const flow = createTreeFlow({ state, read: () => ({ data: { nodes: [] } }) });
  flow.reset();
  assert.deepEqual(state.collapsed, {});
  assert.equal(state.pages.size, 0);
  assert.equal(state.loading.size, 0);
});

test('isExpanded/toggleCollapse/setCollapse：正确管理折叠态', () => {
  const state = { collapsed: {}, pages: new Map(), loading: new Set() };
  const flow = createTreeFlow({ state, read: () => ({ data: { nodes: [] } }) });
  assert.equal(flow.isExpanded('/t/'), true);
  flow.toggleCollapse('/t/');
  assert.equal(flow.isExpanded('/t/'), false);
  flow.setCollapse('/t/', true);
  assert.equal(flow.isCollapsed?.('/t/') || !flow.isExpanded('/t/'), true);
});
