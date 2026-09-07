/**
 * tests/relation-spouse.test.js — §7.2 SPOUSE姻亲称谓规则（蓝图 P1）
 * 
 * 单测覆盖：
 * - Rule 1: A 的血亲 X 之配偶 B → 姐夫/妹夫/嫂子/弟媳
 * - Rule 2: A 的配偶 X 之血亲 B → 岳父/岳母/大舅子/小姨子
 * - Fallback: no blood kin & no spouse → related:false, title=同宗
 */
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const Module = require('module');

// Stub inject once for all tests
const stubPath = require.resolve('../scripts/wx-server-sdk-stub.js');
if (!Module._resolveFilename.__hcsPatched) {
  const orig = Module._resolveFilename;
  Module._resolveFilename = function (request, ...rest) {
    if (request === 'wx-server-sdk') return stubPath;
    return orig.call(this, request, ...rest);
  };
  Module._resolveFilename.__hcsPatched = true;
}

const FN = (name) => require(path.join('..', 'cloud', 'functions', name, 'index.js'));
const CTX = { OPENID: 'u-m', openid: 'u-m' };

function seed({ users = [], members = [], relations = [] }) {
  globalThis.__HCS_STUB_SEED__ = {
    collections: {
      users,
      members: members.map(m => ({ ...m })),
      relations: [...relations],
      audit_logs: [], auth_requests: [], authorizations: [], notifications: [], plaza_posts: [], settings: [],
      points_accounts: [], points_logs: [], worship_logs: [], tasks: [], task_records: [], calendar_items: [], events: [],
      ceremonies: [], entry_records: [], avatars: [], albums: [], album_photos: [], content_messages: [],
      time_capsules: [], greeting_cards: [], weather_cities: [], compliance_signs: [], local_contents: [],
      content_categories: [], search_index: [], news_items: [], news_sources: [], user_interests: [], news_favorites: []
    }
  };
}

test('§7.2 SPOUSE Rule 1: 姐姐嫁人 → 姐夫', async () => {
  // A 族成员：root/a (younger sister), root/x (older sister)
  // B 是外族姻亲，路径独立无前缀重叠
  seed({
    users: [{ _id: 'u-m', openid: 'u-m', role: 'MEMBER' }],
    members: [
      { _id: 'root', path: '/root/', gender: 'MALE' },
      { _id: 'a', path: '/root/a/', gender: 'FEMALE', birthOrder: 5 },  // younger sister
      { _id: 'x', path: '/root/x/', gender: 'FEMALE', birthOrder: 3 },  // elder sister
      { _id: 'b', path: '/ext-b/', gender: 'MALE' }                    // B: 外族，独立路径
    ],
    relations: [
      { fromId: 'x', toId: 'b', type: 'SPOUSE', status: 'ACTIVE' }
    ]
  });
  const res = await FN('relation').main({ action: 'calc', aId: 'a', bId: 'b' }, CTX);
  assert.equal(res.success, true);
  assert.equal(res.data.related, true);
  assert.equal(res.data.formalTitle, '姐夫', 'A 是妹妹，X 是姐姐，B 为姐夫');
  assert.equal(res.data.fiveFu, '姻亲');
});

test('§7.2 SPOUSE Rule 1: 妹妹嫁人 → 妹夫', async () => {
  seed({
    users: [{ _id: 'u-m', openid: 'u-m', role: 'MEMBER' }],
    members: [
      { _id: 'root', path: '/root/', gender: 'MALE' },
      { _id: 'a', path: '/root/a/', gender: 'FEMALE', birthOrder: 3 },   // elder sister
      { _id: 'x', path: '/root/x/', gender: 'FEMALE', birthOrder: 5 },   // younger sister
      { _id: 'b', path: '/ext-b/', gender: 'MALE' }
    ],
    relations: [
      { fromId: 'x', toId: 'b', type: 'SPOUSE', status: 'ACTIVE' }
    ]
  });
  const res = await FN('relation').main({ action: 'calc', aId: 'a', bId: 'b' }, CTX);
  assert.equal(res.success, true);
  assert.equal(res.data.formalTitle, '妹夫');
});

test('§7.2 SPOUSE Rule 1: 哥哥的妻子 → 嫂子', async () => {
  seed({
    users: [{ _id: 'u-m', openid: 'u-m', role: 'MEMBER' }],
    members: [
      { _id: 'root', path: '/root/', gender: 'MALE' },
      { _id: 'a', path: '/root/a/', gender: 'MALE', birthOrder: 5 },     // younger brother
      { _id: 'x', path: '/root/x/', gender: 'MALE', birthOrder: 3 },     // elder brother
      { _id: 'b', path: '/ext-b/', gender: 'FEMALE' }                  // wife of X (外族)
    ],
    relations: [
      { fromId: 'x', toId: 'b', type: 'SPOUSE', status: 'ACTIVE' }
    ]
  });
  const res = await FN('relation').main({ action: 'calc', aId: 'a', bId: 'b' }, CTX);
  assert.equal(res.success, true);
  assert.equal(res.data.formalTitle, '嫂子', '哥哥的妻子 → 嫂子');
});

test('§7.2 SPOUSE Rule 1: 无血缘关系时回退到同宗', async () => {
  seed({
    users: [{ _id: 'u-m', openid: 'u-m', role: 'MEMBER' }],
    members: [
      { _id: 'g1', path: '/001/', gender: 'MALE' },
      { _id: 'other', path: '/002/005/', gender: 'MALE' }
    ],
    relations: []
  });
  const res = await FN('relation').main({ action: 'calc', aId: 'g1', bId: 'other' }, CTX);
  assert.equal(res.success, true);
  assert.equal(res.data.related, false);
  assert.equal(res.data.formalTitle, '同宗');
});

test('§7.2 SPOUSE Rule 2: 妻子之父 → 岳父', async () => {
  // a: male marrying x; x child of b (father)
  seed({
    users: [{ _id: 'u-m', openid: 'u-m', role: 'MEMBER' }],
    members: [
      { _id: 'b', path: '/b/', gender: 'MALE' },          // father (岳父)
      { _id: 'x', path: '/b/x/', gender: 'FEMALE' },      // daughter, wife of a
      { _id: 'a', path: '/a/', gender: 'MALE' }           // son-in-law
    ],
    relations: [
      { fromId: 'a', toId: 'x', type: 'SPOUSE', status: 'ACTIVE' }
    ]
  });
  const res = await FN('relation').main({ action: 'calc', aId: 'a', bId: 'b' }, CTX);
  assert.equal(res.success, true);
  assert.equal(res.data.formalTitle, '岳父', 'A male + wife X father B → 岳父');
  assert.equal(res.data.fiveFu, '姻亲');
});

test('§7.2 SPOUSE Rule 2: 妻子的弟弟 → 小舅子', async () => {
  seed({
    users: [{ _id: 'u-m', openid: 'u-m', role: 'MEMBER' }],
    members: [
      { _id: 'p', path: '/p/', gender: 'MALE' },
      { _id: 'x', path: '/p/x/', gender: 'FEMALE', birthOrder: 2 },  // older sister (wife)
      { _id: 'b', path: '/p/b/', gender: 'MALE', birthOrder: 5 },    // younger brother
      { _id: 'a', path: '/a/', gender: 'MALE' }                      // husband
    ],
    relations: [
      { fromId: 'a', toId: 'x', type: 'SPOUSE', status: 'ACTIVE' }
    ]
  });
  const res = await FN('relation').main({ action: 'calc', aId: 'a', bId: 'b' }, CTX);
  assert.equal(res.success, true);
  assert.equal(res.data.formalTitle, '小舅子', 'wife younger brother → 小舅子');
});

test('§7.2 SPOUSE Rule 2: 丈夫的姐妹 (younger) → 小姑子', async () => {
  seed({
    users: [{ _id: 'u-m', openid: 'u-m', role: 'MEMBER' }],
    members: [
      { _id: 'pf', path: '/pf/', gender: 'MALE' },
      { _id: 'husband', path: '/pf/h/', gender: 'MALE', birthOrder: 4 },   // elder brother (husband)
      { _id: 'sib', path: '/pf/sib/', gender: 'FEMALE', birthOrder: 6 },   // younger sister
      { _id: 'af', path: '/af/', gender: 'FEMALE' }                        // female marrying husband
    ],
    relations: [
      { fromId: 'af', toId: 'husband', type: 'SPOUSE', status: 'ACTIVE' }
    ]
  });
  const res = await FN('relation').main({ action: 'calc', aId: 'af', bId: 'sib' }, CTX);
  assert.equal(res.success, true);
  assert.equal(res.data.formalTitle, '小姑子', `husband's younger sister → 小姑子`);
});