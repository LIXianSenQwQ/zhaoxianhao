/**
 * tests/idempotency.test.js + audit.test.js 合并 - 幂等键与审计口径单测
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { idempotencyKey, retryDelay } = require('../cloud/functions/common/idempotency');
const { isSensitiveAction, SENSITIVE_ACTIONS } = require('../cloud/functions/common/audit');

test('幂等键 = bizType:bizId:userId（文档 7.5）', () => {
  assert.equal(
    idempotencyKey({ bizType: 'worship', bizId: 'lamp_m1', userId: 'u1' }),
    'worship:lamp_m1:u1'
  );
});

test('幂等键缺参必须抛错（防静默重复加分）', () => {
  assert.throws(() => idempotencyKey({ bizType: 'x', bizId: 'y' }));
  assert.throws(() => idempotencyKey({ bizId: 'y', userId: 'z' }));
  assert.throws(() => idempotencyKey({}));
});

test('重试退避表：5 次指数退避（文档 A.5）', () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5].map(retryDelay),
    [1000, 2000, 4000, 8000, 16000]
  );
  assert.equal(retryDelay(0), null);
  assert.equal(retryDelay(6), null);
});

test('敏感操作审计口径：权限/密码/解密/开关必标记', () => {
  for (const a of ['auth.setDelegates', 'password.change', 'featureFlag.update', 'capsule.unlock']) {
    assert.equal(isSensitiveAction(a), true, `${a} 应为敏感操作`);
    assert.ok(SENSITIVE_ACTIONS.has(a));
  }
  assert.equal(isSensitiveAction('task.checkin'), false);
  assert.equal(isSensitiveAction('unknown.action'), false);
});
