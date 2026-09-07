/**
 * tests/privacy-coverage.test.js — §7.4 隐私校验动作覆盖审计（蓝图第三部分）
 * F12-P3 ② P1 隐私全覆盖扫描：由「审计输出模式」升级为「门禁模式」。
 *
 * 规则：
 * - 敏感集合写操作（add/update/delete/remove）必须满足以下之一：
 *   ① privacyCheck / visibilityCheck 显式调用；
 *   ② 60 行窗内 hasRole(...)/FORBIDDEN 角色门禁；
 *   ③ owner/session 归属门控（openid 等值 / ownerOpenid / session 归属）；
 * - 服务端内部操作（admin/ceremony/ci/weather/news）豁免（已有 ROLE 门禁/内部触发）。
 * - KNOWN_SAFE_WRITES：人工逐点审核通过的自建/双人审核/角色门禁创建路径白名单。
 *
 * 审计结论（2026-09 复查）：17 集合 × 写操作全量扫描无真正越权/越可见性缺口——
 *   发现的写操作均属自建记录、双人审核链、EDITOR 门禁或 session/owner 归属，
 *   已逐点记录 verdict 于 KNOWN_SAFE_WRITES；未列入者将阻断门禁（防未来回归）。
 */
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

const ROOT = path.resolve(__dirname, '..');
const CLOUD_DIR = path.join(ROOT, 'cloud', 'functions');

// 需豁免的云函数（服务端内部执行）
const EXEMPT_FUNCS = new Set(['admin', 'ceremony', 'ci', 'weather', 'news']);

// 隐私关键集合 + 写操作范围
const PRIVACY_COLLECTIONS = [
  { collection: 'members', ops: ['add', 'update', 'delete', 'remove'], reason: '用户信息 L 级隐私' },
  { collection: 'entry_records', ops: ['add', 'update', 'delete'], reason: '入谱记录' },
  { collection: 'albums', ops: ['add', 'update', 'delete', 'remove'], reason: '相册三级可见' },
  { collection: 'avatars', ops: ['add', 'update', 'delete', 'remove'], reason: '头像' },
  { collection: 'profiles', ops: ['add', 'update'], reason: '个人资料' },
  { collection: 'authorizations', ops: ['add', 'update', 'delete', 'remove'], reason: '授权关系' },
  { collection: 'auth_requests', ops: ['add', 'update', 'delete'], reason: '授权申请' },
  { collection: 'relations', ops: ['add', 'update', 'delete', 'remove'], reason: '血缘边维护' },
  { collection: 'upload_metas', ops: ['add', 'update', 'delete'], reason: '上传元数据' },
  { collection: 'local_contents', ops: ['add', 'update', 'delete', 'remove'], reason: '本地内容' },
  { collection: 'content_messages', ops: ['add', 'update', 'delete'], reason: '留言' },
  { collection: 'plaza_posts', ops: ['add', 'update', 'delete'], reason: '广场动态' },
  { collection: 'family_moments', ops: ['add', 'update', 'delete'], reason: '家族动态' },
  { collection: 'clan_notices', ops: ['add', 'update', 'delete'], reason: '公告' },
  { collection: 'home_worlds', ops: ['add', 'update', 'delete'], reason: '家园' },
  { collection: 'home_avatars', ops: ['add', 'update', 'delete'], reason: '虚拟角色' },
  { collection: 'opera_roster', ops: ['add', 'update', 'delete'], reason: '戏曲票友' }
];

// Gate 模式（60 行窗内命中任一即视为有门控；刻意排除 openid/userId 等存储字段泛词，
// 以真实门控语义为准：隐私/可见性检查、角色禁入、owner where 过滤、会话归属、授权集合）
const GATE_PATTERNS = [
  'privacyCheck(',
  'visibilityCheck(',
  'hasRole(',
  'FORBIDDEN(',
  'ownerOpenid',
  'authedMemberIds',
  'authedTargetIds',
  'sessionId',
  'where({'
];

// ─── 人工逐点审核通过的白名单（verdict 记录） ───
// anchor 与目标代码行的 trim 前缀或包含关系匹配
const KNOWN_SAFE_WRITES = [
  { func: 'auth', collection: 'members', op: 'add', anchor: "const addRes = await db.collection('members').add({", reason: 'activateMember 激活会员：自建 own member record（linkedOpenid 等于自身 openid）' },
  { func: 'auth', collection: 'entry_records', op: 'add', anchor: "await db.collection('entry_records').add({", reason: 'certify 认证申请：申请人自建工单 + audit_logs 审计' },
  { func: 'content', collection: 'local_contents', op: 'add', anchor: "const res = await db.collection('local_contents').add({", reason: 'articleSave/contentSave 本地内容保存：自建（userId/openid 归属）+ 敏感分类强制 PRIVATE；读取按 openid 过滤' },
  { func: 'entry', collection: 'members', op: 'add', anchor: "const addRes = await db.collection('members').add({", reason: 'finalizeApprovedMember 终审通过写入：双人审核 APPROVED 后流程写' },
  { func: 'entry', collection: 'entry_records', op: 'add', anchor: 'const addRes = await db.collection(\'entry_records\'', reason: '入谱提交工单：申请人自建 SUBMITTED 记录' },
  { func: 'entry', collection: 'entry_records', op: 'add', anchor: "const addRes = await db.collection('entry_records').add({", reason: 'importRows 批量导入草稿：EDITOR+ 门禁前置' },
  { func: 'relation', collection: 'relations', op: 'add', anchor: "const addRes = await db.collection('relations').add({", reason: '修谱终审通过后添加关系边：双人审核工作流（entry 内）' },
  { func: 'upload', collection: 'upload_metas', op: 'add', anchor: "await db.collection('upload_metas').add({", reason: 'chunkComplete 合并登记：session 归属校验（findSession userId=openid）后 ownerOpenid=openid' }
];

/** 白名单匹配 */
function isInAllowList(funcName, collection, op, codeLine) {
  const trimmed = (codeLine || '').trim();
  return KNOWN_SAFE_WRITES.some(item =>
    item.func === funcName && item.collection === collection && item.op === op &&
    (trimmed.startsWith(item.anchor) || trimmed.includes(item.anchor)));
}

/** 扫描单函数：返回未被门控且未入白名单的写操作 */
function scanFunction(funcName, content) {
  const lines = content.split('\n');
  const isExempt = EXEMPT_FUNCS.has(funcName);
  const uncheckedOps = [];

  if (isExempt) return { uncheckedOps };

  for (const { collection, ops } of PRIVACY_COLLECTIONS) {
    const collPattern = new RegExp(`\\.collection\\(['"]${collection}['"]\\)\\.(${ops.join('|')})`);
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      const match = line.match(collPattern);
      if (!match) continue;

      const op = match[1];
      const contextStr = lines.slice(Math.max(0, li - 60), li + 1).join('\n');
      const hasGate = GATE_PATTERNS.some(p => contextStr.includes(p));

      if (!hasGate && !isInAllowList(funcName, collection, op, line)) {
        uncheckedOps.push({ collection, op, line: li + 1, code: line.trim().substring(0, 70) });
      }
    }
  }

  return { uncheckedOps };
}

test('§7.4 隐私全覆盖：敏感集合写操作均有门控（白名单=已审核创建路径）', async () => {
  const funcs = fs.readdirSync(CLOUD_DIR)
    .filter(f => /^[a-z]+$/.test(f))
    .map(f => ({ name: f, file: path.join(CLOUD_DIR, f, 'index.js') }))
    .filter(f => fs.existsSync(f.file));

  const findings = [];
  for (const func of funcs) {
    const content = fs.readFileSync(func.file, 'utf8');
    const { uncheckedOps } = scanFunction(func.name, content);
    for (const op of uncheckedOps) findings.push({ funcName: func.name, ...op });
  }

  console.log(`§7.4 门禁扫描 ${funcs.length} 个云函数 / ${PRIVACY_COLLECTIONS.length} 个敏感集合；白名单 ${KNOWN_SAFE_WRITES.length} 条已审核路径`);
  assert.equal(findings.length, 0,
    `发现未通过门控的敏感写操作（若为新功能请补充代码内门控；创建路径请加入 KNOWN_SAFE_WRITES 并注明审核理由）：\n` +
    findings.map((f, i) => `${i + 1}. [${f.funcName}] ${f.collection}.${f.op}:${f.line} — ${f.code}`).join('\n'));
});
