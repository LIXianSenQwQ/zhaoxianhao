/**
 * cloud/functions/homepage/index.js
 * 「宋村·根脉」文化专区聚合接口（V1.1，蓝图 0.4.4 / §七）
 *
 * 定案：
 *   - action=today：首页聚合接口——服务端并行聚合 atmosphere.today /
 *     notify.digest / member.stats 三分片（原客户端三连呼在云函数冷启动时
 *     各自逼近 3s 硬超时）；分片独立降级（null = 该片降级）
 *   - action=culturalRoot：一次聚合首页 C+ 专区五模块数据
 *     地标→documents(culturalType∈SITE/BRIDGE/TEMPLE/RIVER)
 *     迁居时间轴→events(eventType=MIGRATION, 按 timelineOrder)
 *     族史文章→events(eventType=HISTORY)
 *     武状元→已于 2026-09-16 移除（honor_wall 查询随之停用，wuzhuangyuan 恒为 null）
 *     惨案→hero(incidentType=MASSACRE, role=SUMMARY)
 *   - 各分片独立回落：集合为空/查询异常时回落内置种子（附录A史料，
 *     与 utils/cultural-data.ts 保持同步，零虚构）
 *   - 公开读接口（历史人文内容，访客可浏览），无门禁
 *   - 自包含摊平：不 require ./common/（--remote-npm-install 兼容）
 */
const wx = require('wx-server-sdk');
const { resolveOpenid } = require('./identity');

wx.init({ env: wx.DYNAMIC_CURRENT_ENV });

const OK = (data) => ({ success: true, data });
const ERR = (code, message) => ({ success: false, code, message });

/** 内置种子（附录A史料；集合为空时逐片回落；与 utils/cultural-data.ts 同步维护） */
const SEED = Object.freeze({
  landmarks: [
    { id: 'xilinsi-ta', name: '西林寺塔', alias: '白佛寺', era: '元至元十一年（1274年）', location: '宋村西700米商周遗址', status: 'REMAINS', stateLabel: '遗址', desc: '元至元十一年（1274年）建六角砖塔，俗称白佛寺，「古佛远近驰名」，坐落于宋村西700米的商周遗址之上。', quote: '宋村西，岗高耸而上平广阔二十余亩', quoteFrom: '《赵州志》', source: '《赵州志》', glyph: '塔' },
    { id: 'jimei-qiao', name: '济美桥', alias: '', era: '不晚于明嘉靖二十八年（1549年）', location: '宋村与南正村间洨河', status: 'DEMOLISHED', stateLabel: '1956年拆除', desc: '多孔敞肩石拱桥，横跨古洨河，建桥年代不晚于明嘉靖二十八年（1549年）。1933年梁思成先生实地考察，1956年拆除。', quote: '多孔敞肩石拱，与赵州大石桥一脉相承', quoteFrom: '梁思成《赵县大石桥及济美桥》', source: '梁思成《赵县大石桥及济美桥》', glyph: '桥' },
    { id: 'xiaohe-gudao', name: '洨河古道', alias: '', era: '宋村段', location: '宋村南', status: 'REMAINS', stateLabel: '古道变迁', desc: '古洨河南岸，济美桥横跨其上；宋村西林寺「汝水环其左」，河道千年间多有变迁。', quote: '汝水环其左', quoteFrom: '《赵州志》', source: '《赵州志》', glyph: '河' },
    { id: 'sanguan-miao', name: '三官庙', alias: '', era: '—', location: '赵县', status: 'EXTANT', stateLabel: '现存', desc: '赵县传统民俗信仰中心。', quote: '赵县传统民俗信仰中心', quoteFrom: '赵县民俗', source: '赵县民俗', glyph: '庙' }
  ],
  timeline: [
    { order: 1, time: '明嘉靖十六年（1537年）前', event: '赵县郝氏迁居宋村', source: '地契、石碑、功德碑佐证' },
    { order: 2, time: '明末清初至康熙间（存疑）', event: '宁晋东汪郝氏迁出宋村', source: '东汪郝氏家谱（谱文未系年；「1715年前后」系推算值，存疑待考）' },
    { order: 3, time: '清同治四年（1865年）', event: '东汪郝氏首修家谱', source: '东汪郝氏家谱' },
    { order: 4, time: '1949年', event: '东汪郝氏续修家谱', source: '东汪郝氏家谱' },
    { order: 5, time: '1981年', event: '东汪郝氏重修家谱（时共十四世）', source: '东汪郝氏家谱' }
  ],
  massacre: {
    date: '1937年10月12日', duration: '连续三日', casualties: '遇难近200人', injured: '重伤40余人',
    extinctFamilies: '5户绝户', orphanFamilies: '11户剩孤儿寡母', burnedHouses: '烧毁房屋70余间',
    keyEvent: '村民梁老罗家防空洞藏32名群众，日军投毒瓦斯致全员惨死。',
    sources: '石家庄日报《慷慨赴国难 热血铸丰碑》、赵县抗战史料',
    footnote: '据赵县抗战史料记载，遇难人数近200人，名录持续增补中。', nameListStatus: 'COLLECTING'
  },
  articles: [
    { id: 'xilinsi-shangzhou', title: '西林寺塔与宋村商周遗址', paragraphs: ['元至元十一年（1274年），西林寺塔建于宋村西700米的商周遗址之上，为六角砖塔，俗称白佛寺，「古佛远近驰名」。', '《赵州志》载：「宋村西，岗高耸而上平广阔二十余亩」，即指此岗。塔与岗相叠，构成宋村「岗上立塔、寺以塔名」的人文地貌，是郝氏族人世代记忆中的村落地标。'], source: '《赵州志》' },
    { id: 'jimeiqiao-liangsicheng', title: '济美桥：梁思成考察过的赵州遗珠', paragraphs: ['济美桥位于宋村与南正村之间的洨河之上，为多孔敞肩石拱桥，建桥年代不晚于明嘉靖二十八年（1549年）。', '1933年，梁思成先生在考察赵州大石桥之余，对济美桥进行了实地考察，使其成为建筑学界已知的赵县重要古桥遗存。可惜该桥已于1956年拆除，今仅存文献记载。'], source: '梁思成《赵县大石桥及济美桥》' },
    { id: 'songcun-haoshi-qianju', title: '宋村郝氏迁居考', paragraphs: ['据地契、石碑、功德碑佐证，明嘉靖十六年（1537年）前，赵县郝氏已迁居宋村。', '东汪郝氏家谱卷首载：「祖居直隶趙州城西七里宋村輪城社社二家二门由始祖讳屺瞻者遷于宁晋县东汪村」（原文照录，异体与叠字仍其旧）。据此，东汪支始迁祖为屺瞻公，自宋村迁入宁晋县东汪村。', '迁出年份谱文未系年：按1981年重修谱「时共十四世」逆推，约在明末清初；旧记「清康熙五十四年（1715年）前后」系推算值。两说并存，存疑待考。东汪郝氏于清同治四年（1865年）首修家谱，1949年续修，1981年重修时已传十四世。', '宋村与东汪两地郝氏同源分流，谱牒互证，是考订郝氏迁居脉络的核心依据。'], source: '地契、石碑、功德碑；东汪郝氏家谱（考订详见《宋村郝氏家族史资料》）' }
  ]
});

/** 容错读集合：集合不存在/权限异常一律返回空数组（分片回落种子） */
async function safeGet(db, name, where, orderField, limit) {
  try {
    let q = db.collection(name).where(where);
    if (orderField) q = q.orderBy(orderField, 'asc');
    const res = await q.limit(limit || 20).get();
    return res.data || [];
  } catch (e) {
    return [];
  }
}

function mapLandmark(d) {
  return {
    id: d.siteId || d._id, name: d.title || d.name || '', alias: d.alias || '',
    era: d.era || '', location: d.location || '',
    status: d.status || 'REMAINS', stateLabel: d.stateLabel || '',
    desc: d.desc || d.summary || '', quote: d.quote || '',
    quoteFrom: d.quoteFrom || d.source || '', source: d.source || '',
    glyph: d.glyph || '地'
  };
}

/** 跨函数容错调用：失败/非 success → null（分片独立降级，不拖垮整体） */
async function callFn(name, data) {
  try {
    // 注意：wx-server-sdk 顶层导出 callFunction（无 .cloud 命名空间，客户端 SDK 才有）
    const res = await wx.callFunction({ name, data });
    const body = res && res.result;
    if (body && body.success) return body.data ?? body;
    console.error('[homepage.today]', name, '[biz-fail] ' + JSON.stringify(body || {}).slice(0, 300));
    return null;
  } catch (e) {
    console.error('[homepage.today]', name, '[error] ' + ((e && e.message) || String(e)));
    return null;
  }
}

/**
 * 首页聚合（action=today）：一次返回 氛围 / 要事卡流 / 家族速览 三分片。
 * 原客户端三连呼 atmosphere.today + notify.digest + member.stats，
 * 云函数冷启动时各分片独立逼近客户端 3s 硬超时；聚合后单次往返，
 * 服务端三路并行总耗时 ≈ 最慢一路。
 * 注意：跨函数调用**不透传** openid（2026-09-16 实测，子函数 getWXContext 无 OPENID，
 * 需登录分片 403；被调方 SOURCE 实测为 "wx_devtools,scf"，真机链路为 "wx_client,scf"）——
 * 故从本函数可信上下文取 openid 后经 event._srcOpenid 显式转发，
 * 子函数仅在 SOURCE 含 scf（云函数间调用，平台注入、客户端不可伪造）时采信。
 * 各分片失败互不影响（null = 该分片降级，客户端走既有空态/占位）。
 */
async function todayAggregate() {
  const wxCtx = wx.getWXContext() || {};
  const openid = String(wxCtx.OPENID || '');
  const [atmosphere, digest, stats] = await Promise.all([
    callFn('atmosphere', { action: 'today' }),
    callFn('notify', { action: 'digest', _srcOpenid: openid }),
    callFn('member', { action: 'stats', _srcOpenid: openid })
  ]);
  return OK({ atmosphere, digest, stats });
}

exports.main = async (event) => {
  const action = event && event.action;
  if (action === 'today') return await todayAggregate();
  if (action !== 'culturalRoot') {
    return ERR(400, `未知 action: ${action}`);
  }

  const db = wx.database();
  const cmd = db.command; // wx-server-sdk 的 command 挂在 db 上（wx.command 不存在）

  const [docs, migrations, histories, massacres] = await Promise.all([
    safeGet(db, 'documents', { culturalType: cmd.in(['SITE', 'BRIDGE', 'TEMPLE', 'RIVER']), status: 'PUBLISHED' }, 'timelineOrder', 10),
    safeGet(db, 'events', { eventType: 'MIGRATION', status: 'PUBLISHED' }, 'timelineOrder', 10),
    safeGet(db, 'events', { eventType: 'HISTORY', status: 'PUBLISHED' }, 'publishedAt', 10),
    safeGet(db, 'hero', { incidentType: 'MASSACRE', role: 'SUMMARY', status: 'PUBLISHED' }, null, 1)
  ]);

  const landmarks = docs.length ? docs.map(mapLandmark) : SEED.landmarks;
  const timeline = migrations.length
    ? migrations.map((d) => ({ order: d.timelineOrder || 0, time: d.time || '', event: d.event || d.title || '', source: d.source || '' }))
    : SEED.timeline;
  const articles = histories.length
    ? histories.map((d) => ({ id: d._id, title: d.title || '', paragraphs: Array.isArray(d.paragraphs) ? d.paragraphs : (d.content ? [d.content] : []), source: d.source || '' }))
    : SEED.articles;
  // 武状元条目已于 2026-09-16 移除（与宋村史实不符，见 docs/history/2026-09-16-hao-guangjia-entry-removal.md）；字段保留返回 null 以兼容旧客户端
  const wuzhuangyuan = null;
  const massacre = massacres.length
    ? {
        date: massacres[0].date || '', duration: massacres[0].duration || '',
        casualties: massacres[0].casualties || '', injured: massacres[0].injured || '',
        extinctFamilies: massacres[0].extinctFamilies || '', orphanFamilies: massacres[0].orphanFamilies || '',
        burnedHouses: massacres[0].burnedHouses || '', keyEvent: massacres[0].keyEvent || '',
        sources: massacres[0].sources || '', footnote: massacres[0].footnote || '',
        nameListStatus: massacres[0].nameListStatus || 'COLLECTING'
      }
    : SEED.massacre;

  const source = (docs.length || migrations.length || histories.length || massacres.length) ? 'cloud' : 'seed';
  return OK({ source, landmarks, timeline, wuzhuangyuan, massacre, articles });
};
