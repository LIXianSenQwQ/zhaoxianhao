/**
 * utils/opera-engine.js
 * V2.0 F11: 梨园小筑 —— 戏曲票友模拟引擎（纯函数，可单测）
 *
 * 合规红线（蓝图 9.0.1 / D.2 / 合规清单 2.0）：
 *   · 纯娱乐单机模拟：零内购、无联机对战、无虚拟货币兑换
 *   · 演出结果为随机模拟（唱念做打四功），奖励仅家族积分
 *
 * 纯函数清单：
 *   · createTicket   生成票友卡片 { name, role: 生旦净末丑, skillLevel, mood, favorItems }
 *   · perform        登台表演：随机触发小型演出事件 → 评分/反馈/成长建议
 *   · applyGrowth    经验结算 + 自动升级 + 解锁更多剧目片段
 *   · checkinReward  每日签到积分规则（联动当日登台次数）
 *   · canStageToday / canCreateTicket  频控/名额规则
 *   · dayKey         日期键（与全库 UTC 口径一致）
 */

// ─── 行当 / 心情 / 四功 ───
const ROLE_KEYS = ['生', '旦', '净', '末', '丑'];
const ROLE_META = {
  生: { title: '生行', desc: '老生苍劲 · 小生俊朗 · 武生英武' },
  旦: { title: '旦行', desc: '青衣端庄 · 花旦俏丽 · 老旦沉稳' },
  净: { title: '净行', desc: '铜锤花脸，声若洪钟' },
  末: { title: '末行', desc: '配角老生，亦庄亦谐' },
  丑: { title: '丑行', desc: '文丑诙谐 · 武丑利落' }
};
const MOODS = ['跃跃欲试', '气定神闲', '兴高采烈', '忐忑不安', '心事重重', '意犹未尽'];
const MOOD_BOOST = { 跃跃欲试: 4, 气定神闲: 3, 兴高采烈: 6, 忐忑不安: -4, 心事重重: -6, 意犹未尽: 1 };
const SKILLS = ['唱', '念', '做', '打'];
const SKILL_ADVICE = {
  唱: '唱腔气口偏紧，宜多吊嗓，讲究吐字归韵、行腔圆润。',
  念: '念白节奏偏平，宜练抑扬顿挫，字字送到堂上。',
  做: '做功身段稍显拘谨，宜多走圆场，眼神与台步配合。',
  打: '把子开打欠利落，宜练基本功，注意出手稳、收式准。'
};
const SKILL_PRAISE = {
  唱: '嗓音清亮、字正腔圆',
  念: '念白利落、吐字清晰',
  做: '身段潇洒、表情入戏',
  打: '开打利落、身段稳当'
};
const SUGGESTED_NAMES = ['梨园小生', '兰花旦', '铁嗓花脸', '丑角阿喜', '须生守正', '武生小虎', '青衣玉娘', '彩旦小凤'];

// ─── 剧目片段（拿手剧目池 / 成长解锁池） ───
const REPERTOIRE = [
  { id: 'f1', playName: '《女起解》·苏三离了洪洞县', style: '唱', genre: '旦', difficulty: 2, snippet: '苏三离了洪洞县，将身来在大街前。' },
  { id: 'f2', playName: '《空城计》·我正在城楼观山景', style: '唱', genre: '老生', difficulty: 1, snippet: '我正在城楼观山景，耳听得城外乱纷纷。' },
  { id: 'f3', playName: '《铡美案》·包龙图打坐在开封府', style: '唱', genre: '净', difficulty: 2, snippet: '包龙图打坐在开封府，尊一声驸马爷细听端的。' },
  { id: 'f4', playName: '《贵妃醉酒》·海岛冰轮初转腾', style: '做', genre: '旦', difficulty: 2, snippet: '海岛冰轮初转腾，见玉兔又转东升。' },
  { id: 'f5', playName: '《霸王别姬》·看大王在帐中和衣睡稳', style: '做', genre: '旦', difficulty: 2, snippet: '看大王在帐中和衣睡稳，我这里出帐外且散愁情。' },
  { id: 'f6', playName: '《三岔口》·摸黑开打', style: '打', genre: '武生', difficulty: 1, snippet: '店中摸黑，你来我往，妙在无声。' },
  { id: 'f7', playName: '《大登殿》·金牌调来银牌宣', style: '唱', genre: '老生', difficulty: 3, snippet: '金牌调来银牌宣，王相府来了我王氏宝钏。' },
  { id: 'f8', playName: '《徐策跑城》·三步并作两步走', style: '做', genre: '老生', difficulty: 1, snippet: '三步并作两步走，两步并作一步行。' },
  { id: 'f9', playName: '《武家坡》·指着西凉高声骂', style: '唱', genre: '生', difficulty: 2, snippet: '指着西凉高声骂，无义的强盗骂几声。' },
  { id: 'f10', playName: '《挡马》·焦光普酒楼拦马', style: '打', genre: '武丑', difficulty: 3, snippet: '杨八姐乔装入番，焦光普拦马相认。' },
  { id: 'f11', playName: '《审头刺汤》·莫成念白', style: '念', genre: '末', difficulty: 2, snippet: '主人有难仆代死，为主分忧理当然。' },
  { id: 'f12', playName: '《游园惊梦》·原来姹紫嫣红开遍', style: '唱', genre: '旦', difficulty: 2, snippet: '原来姹紫嫣红开遍，似这般都付与断井颓垣。' },
  { id: 'f13', playName: '《连升店》·店家念白', style: '念', genre: '丑', difficulty: 1, snippet: '小店连升三级店，客人请进、请进！' },
  { id: 'f14', playName: '《拾玉镯》·做针线', style: '做', genre: '旦', difficulty: 1, snippet: '孙玉姣门前做针线，巧遇傅朋遗玉镯。' }
];

// ─── 数值常量 ───
const FAVORITE_COUNT = 3;
const DAILY_STAGE_LIMIT = 20;
const MAX_TICKETS = 12;
const DAILY_POINTS = 5;
const EXP_BASE = 60;
const EXP_STEP = 30;

// ─── 合规声明 ───
const COMPLIANCE = {
  module: '梨园小筑',
  kind: '单机戏曲票友娱乐模拟（Opera Garden Simulation）',
  noInAppPurchase: true,
  noOnlineMatch: true,
  noVirtualCurrency: true,
  pointsOnly: '仅家族积分（成长记录），不可兑换现金',
  disclaimerText: '梨园小筑为纯娱乐单机戏曲票友模拟：零内购、无联机对战、无虚拟货币；演出结果为随机模拟，仅作休闲娱乐与家族积分互动。'
};
const COMPLIANCE_TEXT = COMPLIANCE.disclaimerText;

// ─── 基础工具 ───
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function pick(list, rng) {
  const idx = Math.floor((rng() || Math.random()) * list.length);
  return list[clamp(idx, 0, list.length - 1)];
}

function pickDistinct(list, count, rng) {
  const copy = list.slice();
  const out = [];
  while (out.length < count && copy.length > 0) {
    out.push(copy.splice(Math.floor((rng() || Math.random()) * copy.length), 1)[0]);
  }
  return out;
}

function fragmentById(id) {
  return REPERTOIRE.find((f) => f.id === id);
}

/** 已会片段 id 集合（拿手 + 已解锁） */
function ticketIds(ticket) {
  const set = new Set();
  (ticket.favorItems || []).forEach((f) => set.add(f.id));
  (ticket.unlockedFragments || []).forEach((f) => set.add(f.id));
  return set;
}

function seededRng(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 成长曲线：level → 升下一级所需经验 */
function expNext(level) {
  const lv = Math.max(1, Math.floor(Number(level) || 1));
  return Math.floor(EXP_BASE + (lv - 1) * EXP_STEP);
}

/** 评分 → 等第 */
function gradeOf(score) {
  if (score >= 90) return { grade: '出彩', tag: '满堂喝彩' };
  if (score >= 78) return { grade: '上佳', tag: '有板有眼' };
  if (score >= 62) return { grade: '稳当', tag: '渐入佳境' };
  if (score >= 45) return { grade: '青涩', tag: '还需打磨' };
  return { grade: '生涩', tag: '多听多看多练' };
}

// ─── 票友卡片生成（角色卡池） ───
function createTicket(params) {
  const rng = (params && params.rng) || Math.random;
  const role = ROLE_KEYS.includes(params && params.role) ? params.role : pick(ROLE_KEYS, rng);
  const rawName = String((params && params.name) || '').trim();
  const name = rawName.slice(0, 12) || pick(SUGGESTED_NAMES, rng);
  const favorites = pickDistinct(REPERTOIRE, FAVORITE_COUNT, rng).map((f) => ({ id: f.id, playName: f.playName }));
  const meta = ROLE_META[role];
  return {
    name,
    role,
    roleTitle: meta.title,
    roleDesc: meta.desc,
    skillLevel: 1,
    experience: 0,
    mood: pick(MOODS, rng),
    favorItems: favorites,
    unlockedFragments: favorites.map((f) => ({ ...f })),
    stageCount: 0,
    totalScore: 0
  };
}

// ─── 登台表演（小型演出事件：唱念做打） ───
function perform(ticket, opts) {
  const rng = (opts && opts.rng) || Math.random;
  if (!ticket || !ticket.name) throw new Error('票友卡片无效');
  const level = clamp(Math.floor(Number(ticket.skillLevel) || 1), 1, 99);
  const known = ticketIds(ticket);
  const frag = pickPlay(ticket, known, rng);
  const familiar = known.has(frag.id);
  const boost = Number(MOOD_BOOST[ticket.mood] || 0);

  // 唱念做打四功评分（随机事件 + 功底 + 本功加成 + 拿手加成 + 心情）
  const acts = {};
  for (const skill of SKILLS) {
    let v = 34 + level * 2 + (rng() * 18 - 9);
    if (skill === frag.style) v += 12;
    if (familiar) v += 5;
    v += boost;
    acts[skill] = clamp(Math.round(v), 0, 100);
  }

  // 综合分：本功权重高
  let sum = 0;
  for (const skill of SKILLS) sum += acts[skill] * (skill === frag.style ? 0.4 : 0.2);
  const score = clamp(Math.round(sum), 0, 100);
  const grade = gradeOf(score);
  const weak = weakestSkill(acts);

  const performance = {
    fragmentId: frag.id,
    playName: frag.playName,
    snippet: frag.snippet,
    primarySkill: frag.style,
    actDetail: acts,
    score,
    grade: grade.grade,
    feedback: buildFeedback(frag, familiar, acts, grade),
    suggestions: buildSuggestions(weak, level),
    expGain: Math.round(5 + score / 4)
  };
  const growth = applyGrowth(ticket, performance.expGain, score, rng);
  return { performance, growth };
}

/** 选戏：六成拿手戏、三成已学新戏、一成随机尝鲜 */
function pickPlay(ticket, known, rng) {
  const roll = rng();
  const favPool = (ticket.favorItems || []).map((f) => fragmentById(f.id)).filter(Boolean);
  const learnPool = (ticket.unlockedFragments || [])
    .filter((f) => !(ticket.favorItems || []).some((x) => x.id === f.id))
    .map((f) => fragmentById(f.id))
    .filter(Boolean);
  if (roll < 0.6 && favPool.length) return pick(favPool, rng);
  if (roll < 0.9 && learnPool.length) return pick(learnPool, rng);
  return pick(REPERTOIRE, rng);
}

function strongestSkill(acts) {
  let best = SKILLS[0];
  for (const s of SKILLS) if (acts[s] > acts[best]) best = s;
  return best;
}

function weakestSkill(acts) {
  let worst = SKILLS[0];
  for (const s of SKILLS) if (acts[s] < acts[worst]) worst = s;
  return worst;
}

function buildFeedback(frag, familiar, acts, grade) {
  const head = familiar ? '这折正是拿手戏，开口便见功力' : '初试此折，敢于登台已属不易';
  const strong = strongestSkill(acts);
  return `献演「${frag.playName}」——${head}；${frag.style}功为主，${SKILL_PRAISE[strong]}，${grade.tag}。`;
}

function buildSuggestions(weak, level) {
  const list = [SKILL_ADVICE[weak]];
  if (level < 5) list.push('先以拿手剧目打磨四功，再挑战更高难度的曲目片段。');
  else list.push('可尝试更高难度的曲目片段，拓宽戏路。');
  return list;
}

// ─── 成长：经验结算 + 升级 + 解锁更多剧目片段 ───
function applyGrowth(ticket, gainedExp, score, rng) {
  const r = rng || Math.random;
  let lv = clamp(Math.floor(Number(ticket.skillLevel) || 1), 1, 99);
  let exp = Math.max(0, Math.floor(Number(ticket.experience) || 0)) + Math.max(0, Math.floor(Number(gainedExp) || 0));
  let leveledUp = false;
  let need = expNext(lv);
  while (exp >= need && lv < 99) {
    exp -= need;
    lv += 1;
    leveledUp = true;
    need = expNext(lv);
  }
  const next = {
    ...ticket,
    skillLevel: lv,
    experience: exp,
    stageCount: (ticket.stageCount || 0) + 1,
    totalScore: (ticket.totalScore || 0) + Math.max(0, Math.round(Number(score) || 0))
  };

  // 每升 2 级解锁一段新剧目片段（拿手之外的剧目）
  let newlyUnlocked = null;
  if (leveledUp) {
    const budget = Math.min(REPERTOIRE.length, 3 + Math.floor(lv / 2));
    const have = ticketIds(next);
    if (next.unlockedFragments.length < budget) {
      const pool = REPERTOIRE.filter((f) => !have.has(f.id));
      if (pool.length) {
        const nf = pick(pool, r);
        newlyUnlocked = { id: nf.id, playName: nf.playName };
        next.unlockedFragments = next.unlockedFragments.concat(newlyUnlocked);
      }
    }
  }
  return {
    next,
    leveledUp,
    gainedExp: Math.max(0, Math.floor(Number(gainedExp) || 0)),
    newlyUnlocked,
    expNext: need,
    progressPct: Math.min(100, Math.round((exp / need) * 100))
  };
}

// ─── 每日签到 / 频控 / 校验 ───
function checkinReward(state) {
  const cfg = state || {};
  if (cfg.alreadyDone) return { points: 0, alreadyDone: true, message: '今日已签到，明日再来' };
  const stageCount = Math.max(0, Math.floor(Number(cfg.todayStageCount) || 0));
  const points = DAILY_POINTS + (stageCount >= 1 ? 1 : 0);
  const message = stageCount >= 1
    ? `签到成功，今日登台勤勉 +${points} 积分`
    : `签到成功 +${points} 积分`;
  return { points, alreadyDone: false, message };
}

function canStageToday(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (n >= DAILY_STAGE_LIMIT) return { ok: false, error: `今日登台已达 ${DAILY_STAGE_LIMIT} 次上限`, remaining: 0 };
  return { ok: true, remaining: DAILY_STAGE_LIMIT - n };
}

function canCreateTicket(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));
  if (n >= MAX_TICKETS) return { ok: false, error: `票友卡已达 ${MAX_TICKETS} 张上限`, remaining: 0 };
  return { ok: true, remaining: MAX_TICKETS - n };
}

function validateRosterParams(params) {
  const cfg = params || {};
  const raw = String(cfg.name || '').trim();
  if (!raw) return { ok: false, error: '请填写票友名字' };
  if (raw.length > 12) return { ok: false, error: '票友名字请控制在 12 字以内' };
  if (cfg.role && !ROLE_KEYS.includes(cfg.role)) return { ok: false, error: '行当须为 生/旦/净/末/丑' };
  return { ok: true, name: raw };
}

/** 日期键（与全库每日频控的 UTC 口径一致） */
function dayKey(date) {
  const d = date || new Date();
  return d.toISOString().slice(0, 10);
}

module.exports = {
  ROLE_KEYS,
  ROLE_META,
  MOODS,
  MOOD_BOOST,
  SKILLS,
  REPERTOIRE,
  COMPLIANCE,
  COMPLIANCE_TEXT,
  FAVORITE_COUNT,
  DAILY_STAGE_LIMIT,
  MAX_TICKETS,
  DAILY_POINTS,
  createTicket,
  perform,
  applyGrowth,
  checkinReward,
  canStageToday,
  canCreateTicket,
  validateRosterParams,
  expNext,
  gradeOf,
  dayKey,
  seededRng
};
