/**
 * tests/linkage.test.js - 挂接校验 + path 回填 + 退避重试单测（Sprint R3）
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { buildPath, rebuildPaths } = require('../cloud/functions/common/tree');
const { validateLink, finalizePatch } = require('../cloud/functions/common/linkage');
const { retryDelayMs, isRetryable, withRetry } = require('../utils/retry');

// ─── linkage.validateLink ───

test('挂接：世代互指通过并产出 path', () => {
  const parent = { path: '/001/', generation: 1, branchId: 'long' };
  const child = { generation: 2, branchId: 'long' };
  const v = validateLink(child, parent, { memberNo: '3' });
  assert.equal(v.ok, true);
  assert.equal(v.path, '/001/003/');
});

test('挂接：世代断裂拒绝（子≠父+1）', () => {
  const v = validateLink({ generation: 3, branchId: 'long' }, { path: '/001/', generation: 1, branchId: 'long' }, { memberNo: '1' });
  assert.equal(v.ok, false);
  assert.ok(v.reasons.some(r => r.includes('世代互指失败')));
});

test('挂接：跨支拒绝（fail-closed，可特批参数豁免）', () => {
  const parent = { path: '/001/', generation: 1, branchId: 'long' };
  const v1 = validateLink({ generation: 2, branchId: 'ci' }, parent, { memberNo: '1' });
  assert.equal(v1.ok, false);
  const v2 = validateLink({ generation: 2, branchId: 'ci' }, parent, { memberNo: '1', allowCrossBranch: true });
  assert.equal(v2.ok, true);
});

test('挂接：父未挂接 path 时拒绝（先回填父代）', () => {
  const v = validateLink({ generation: 2, branchId: 'long' }, { generation: 1, branchId: 'long' }, { memberNo: '1' });
  assert.equal(v.ok, false);
  assert.ok(v.reasons.some(r => r.includes('path')));
});

test('挂接：无父挂根仅允许第 1 世', () => {
  assert.equal(validateLink({ generation: 1, branchId: 'long' }, null, { memberNo: '1' }).ok, true);
  assert.equal(validateLink({ generation: 5, branchId: 'long' }, null, { memberNo: '1' }).ok, false);
});

test('finalizePatch：字段补丁统一出口', () => {
  const fin = finalizePatch({ child: { generation: 2, branchId: 'long' }, parent: { path: '/001/', generation: 1, branchId: 'long' }, memberNo: '7' });
  assert.equal(fin.ok, true);
  assert.equal(fin.patch.path, '/001/007/');
  assert.equal(fin.patch.generation, 2);
  assert.ok(fin.patch.linkedAt);
});

// ─── tree.rebuildPaths（存量回填算法） ───

test('rebuildPaths：三代森林全量回填与 demo 断言一致', () => {
  const members = [
    { _id: 'a', memberNo: '1' }, { _id: 'b', memberNo: '1' }, { _id: 'c', memberNo: '2' },
    { _id: 'd', memberNo: '1' }, { _id: 'e', memberNo: '3' }
  ];
  const edges = [
    { childId: 'b', parentId: 'a' }, { childId: 'c', parentId: 'a' },
    { childId: 'd', parentId: 'b' }, { childId: 'e', parentId: 'b' }
  ];
  const { patches, conflicts, roots } = rebuildPaths(members, edges);
  assert.equal(conflicts.length, 0);
  assert.equal(roots.length, 1);
  const map = new Map(patches.map(p => [p._id, p.path]));
  assert.equal(map.get('a'), '/001/');
  assert.equal(map.get('b'), '/001/001/');
  assert.equal(map.get('c'), '/001/002/');
  assert.equal(map.get('d'), '/001/001/001/');
  assert.equal(map.get('e'), '/001/001/003/');
});

test('rebuildPaths：多根（多始祖）各树独立编号', () => {
  const members = [{ _id: 'r1', memberNo: '1' }, { _id: 'r2', memberNo: '2' }, { _id: 'c', memberNo: '1' }];
  const { patches, conflicts, roots } = rebuildPaths(members, [{ childId: 'c', parentId: 'r2' }]);
  assert.equal(conflicts.length, 0);
  assert.equal(roots.length, 2);
  const map = new Map(patches.map(p => [p._id, p.path]));
  assert.equal(map.get('r1'), '/001/');
  assert.equal(map.get('r2'), '/002/');
  assert.equal(map.get('c'), '/002/001/');
});

test('rebuildPaths：成环检测阻断', () => {
  const members = [{ _id: 'x', memberNo: '1' }, { _id: 'y', memberNo: '1' }];
  const { conflicts } = rebuildPaths(members, [
    { childId: 'x', parentId: 'y' }, { childId: 'y', parentId: 'x' }
  ]);
  assert.ok(conflicts.length > 0);
});

test('rebuildPaths：同父编号重复检测', () => {
  const members = [
    { _id: 'p', memberNo: '1' }, { _id: 's1', memberNo: '1' }, { _id: 's2', memberNo: '1' }
  ];
  const { conflicts } = rebuildPaths(members, [
    { childId: 's1', parentId: 'p' }, { childId: 's2', parentId: 'p' }
  ]);
  assert.ok(conflicts.some(c => c.includes('编号重复')));
});

test('rebuildPaths：边引用不存在成员', () => {
  const { conflicts } = rebuildPaths([{ _id: 'a', memberNo: '1' }], [{ childId: 'a', parentId: 'ghost' }]);
  assert.ok(conflicts.some(c => c.includes('不存在')));
});

test('rebuildPaths：自引用成环', () => {
  const { conflicts } = rebuildPaths([{ _id: 'a', memberNo: '1' }], [{ childId: 'a', parentId: 'a' }]);
  assert.ok(conflicts.some(c => c.includes('自引用')));
});

// ─── retry 退避 ───

test('retryDelayMs：1s/2s/4s/8s/16s 封顶', () => {
  assert.equal(retryDelayMs(0), 1000);
  assert.equal(retryDelayMs(1), 2000);
  assert.equal(retryDelayMs(2), 4000);
  assert.equal(retryDelayMs(3), 8000);
  assert.equal(retryDelayMs(4), 16000);
  assert.equal(retryDelayMs(10), 16000); // 封顶
  assert.equal(retryDelayMs(-1), 1000);  // 负数归零步
  assert.equal(retryDelayMs('x'), 1000);
});

test('isRetryable：仅瞬时故障码可重试，4xx 业务错误不重试', () => {
  [408, 500, 502, 503].forEach(c => assert.equal(isRetryable(c), true));
  [400, 403, 404, 401].forEach(c => assert.equal(isRetryable(c), false));
});

test('withRetry：可重试错误按预期重试后成功', async () => {
  let calls = 0;
  const res = await withRetry(async () => {
    calls++;
    return calls < 3 ? { error: { code: 502 } } : { data: 'ok' };
  }, 2, () => Promise.resolve()); // 假时钟零等待
  assert.equal(res.data, 'ok');
  assert.equal(calls, 3);
});

test('withRetry：业务错误 403 立即返回不重试', async () => {
  let calls = 0;
  const res = await withRetry(async () => {
    calls++;
    return { error: { code: 403 } };
  }, 2, () => Promise.resolve());
  assert.equal(calls, 1);
  assert.equal(res.error.code, 403);
});

test('withRetry：耗尽重试次数返回最后错误', async () => {
  let calls = 0;
  const res = await withRetry(async () => {
    calls++;
    return { error: { code: 408 } };
  }, 1, () => Promise.resolve());
  assert.equal(calls, 2);
  assert.equal(res.error.code, 408);
});
