/**
 * utils/cultural-data.ts — 「宋村·根脉」历史文化数据（V1.2）
 *
 * V1.2（2026-09-29）：依《宋村郝氏家族史资料（考证稿）》考订——东汪迁出节点改存疑
 * 口径（明末清初至康熙间），迁居考文章补录东汪谱原文。
 *
 * 唯一数据源（蓝图 0.6.1 数据唯一）：首页 RootsSection 与 pkg-shrine 全部文化详情页
 * 均从这里取数，禁止各页面自建副本。
 *
 * 红线（附录C）：历史文化内容零虚构——以下每条内容均出自开发框架附录A史料清单，
 * 未经核实的内容一律标注「待考证」；后续接入 homepage.culturalRoot() /
 * doc.getCulturalSites / event.getMigrationTimeline 等云端接口时，仅替换加载层，
 * 数据结构与本模块字段一一对应。
 */

/** 地标现状：EXTANT 现存 / DEMOLISHED 已毁 / REMAINS 遗址 */
export type SiteStatus = 'EXTANT' | 'DEMOLISHED' | 'REMAINS';

export interface CulturalLandmark {
  id: string;
  name: string;
  alias?: string;
  era: string;
  location: string;
  status: SiteStatus;
  stateLabel: string;
  desc: string;
  /** 古籍/文献引文（蓝图 0.4.3：每项配一句古籍引文） */
  quote: string;
  quoteFrom: string;
  source: string;
  /** 剪影占位字（切图后替换 SVG，蓝图 0.4.3 视觉规范） */
  glyph: string;
}

/** 千年宋村 · 四地标（附录A.1） */
export const culturalLandmarks: CulturalLandmark[] = [
  {
    id: 'xilinsi-ta',
    name: '西林寺塔',
    alias: '白佛寺',
    era: '元至元十一年（1274年）',
    location: '宋村西700米商周遗址',
    status: 'REMAINS',
    stateLabel: '遗址',
    desc: '元至元十一年（1274年）建六角砖塔，俗称白佛寺，「古佛远近驰名」，坐落于宋村西700米的商周遗址之上。',
    quote: '宋村西，岗高耸而上平广阔二十余亩',
    quoteFrom: '《赵州志》',
    source: '《赵州志》',
    glyph: '塔'
  },
  {
    id: 'jimei-qiao',
    name: '济美桥',
    era: '不晚于明嘉靖二十八年（1549年）',
    location: '宋村与南正村间洨河',
    status: 'DEMOLISHED',
    stateLabel: '1956年拆除',
    desc: '多孔敞肩石拱桥，横跨古洨河，建桥年代不晚于明嘉靖二十八年（1549年）。1933年梁思成先生实地考察，1956年拆除。',
    quote: '多孔敞肩石拱，与赵州大石桥一脉相承',
    quoteFrom: '梁思成《赵县大石桥及济美桥》',
    source: '梁思成《赵县大石桥及济美桥》',
    glyph: '桥'
  },
  {
    id: 'xiaohe-gudao',
    name: '洨河古道',
    era: '宋村段',
    location: '宋村南',
    status: 'REMAINS',
    stateLabel: '古道变迁',
    desc: '古洨河南岸，济美桥横跨其上；宋村西林寺「汝水环其左」，河道千年间多有变迁。',
    quote: '汝水环其左',
    quoteFrom: '《赵州志》',
    source: '《赵州志》',
    glyph: '河'
  },
  {
    id: 'sanguan-miao',
    name: '三官庙',
    era: '—',
    location: '赵县',
    status: 'EXTANT',
    stateLabel: '现存',
    desc: '赵县传统民俗信仰中心。',
    quote: '赵县传统民俗信仰中心',
    quoteFrom: '赵县民俗',
    source: '赵县民俗',
    glyph: '庙'
  }
];

export interface MigrationNode {
  order: number;
  time: string;
  event: string;
  source: string;
}

/** 郝氏迁居 · 时间轴5节点（附录A.2，顺序即展示序） */
export const migrationTimeline: MigrationNode[] = [
  { order: 1, time: '明嘉靖十六年（1537年）前', event: '赵县郝氏迁居宋村', source: '地契、石碑、功德碑佐证' },
  { order: 2, time: '明末清初至康熙间（存疑）', event: '宁晋东汪郝氏迁出宋村', source: '东汪郝氏家谱（谱文未系年；「1715年前后」系推算值，存疑待考）' },
  { order: 3, time: '清同治四年（1865年）', event: '东汪郝氏首修家谱', source: '东汪郝氏家谱' },
  { order: 4, time: '1949年', event: '东汪郝氏续修家谱', source: '东汪郝氏家谱' },
  { order: 5, time: '1981年', event: '东汪郝氏重修家谱（时共十四世）', source: '东汪郝氏家谱' }
];

/** 惨案数据（附录A.4；庄重展示、克制、不渲染血腥） */
export const massacreFacts = {
  date: '1937年10月12日',
  duration: '连续三日',
  casualties: '遇难近200人',
  injured: '重伤40余人',
  extinctFamilies: '5户绝户',
  orphanFamilies: '11户剩孤儿寡母',
  burnedHouses: '烧毁房屋70余间',
  keyEvent: '村民梁老罗家防空洞藏32名群众，日军投毒瓦斯致全员惨死。',
  sources: '石家庄日报《慷慨赴国难 热血铸丰碑》、赵县抗战史料',
  footnote: '据赵县抗战史料记载，遇难人数近200人，名录持续增补中。',
  /** 名录状态（COLLECTING/PARTIAL/COMPLETE） */
  nameListStatus: 'COLLECTING' as const
};

export interface HistoryArticle {
  id: string;
  title: string;
  paragraphs: string[];
  source: string;
}

/** 族史长廊 · 文章（正文仅由附录A史料事实组成，零虚构） */
export const clanHistoryArticles: HistoryArticle[] = [
  {
    id: 'xilinsi-shangzhou',
    title: '西林寺塔与宋村商周遗址',
    paragraphs: [
      '元至元十一年（1274年），西林寺塔建于宋村西700米的商周遗址之上，为六角砖塔，俗称白佛寺，「古佛远近驰名」。',
      '《赵州志》载：「宋村西，岗高耸而上平广阔二十余亩」，即指此岗。塔与岗相叠，构成宋村「岗上立塔、寺以塔名」的人文地貌，是郝氏族人世代记忆中的村落地标。'
    ],
    source: '《赵州志》'
  },
  {
    id: 'jimeiqiao-liangsicheng',
    title: '济美桥：梁思成考察过的赵州遗珠',
    paragraphs: [
      '济美桥位于宋村与南正村之间的洨河之上，为多孔敞肩石拱桥，建桥年代不晚于明嘉靖二十八年（1549年）。',
      '1933年，梁思成先生在考察赵州大石桥之余，对济美桥进行了实地考察，使其成为建筑学界已知的赵县重要古桥遗存。可惜该桥已于1956年拆除，今仅存文献记载。'
    ],
    source: '梁思成《赵县大石桥及济美桥》'
  },
  {
    id: 'songcun-haoshi-qianju',
    title: '宋村郝氏迁居考',
    paragraphs: [
      '据地契、石碑、功德碑佐证，明嘉靖十六年（1537年）前，赵县郝氏已迁居宋村。',
      '东汪郝氏家谱卷首载：「祖居直隶趙州城西七里宋村輪城社社二家二门由始祖讳屺瞻者遷于宁晋县东汪村」（原文照录，异体与叠字仍其旧）。据此，东汪支始迁祖为屺瞻公，自宋村迁入宁晋县东汪村。',
      '迁出年份谱文未系年：按1981年重修谱「时共十四世」逆推，约在明末清初；旧记「清康熙五十四年（1715年）前后」系推算值。两说并存，存疑待考。东汪郝氏于清同治四年（1865年）首修家谱，1949年续修，1981年重修时已传十四世。',
      '宋村与东汪两地郝氏同源分流，谱牒互证，是考订郝氏迁居脉络的核心依据。'
    ],
    source: '地契、石碑、功德碑；东汪郝氏家谱（考订详见《宋村郝氏家族史资料》）'
  }
];

/** 详情页路由（蓝图 §七 页面清单映射到 pkg-shrine 分包） */
export const culturalRoutes = {
  landmarkDetail: '/pkg-shrine/pages/cultural/detail',
  migration: '/pkg-shrine/pages/history/migration',
  articles: '/pkg-shrine/pages/history/articles',
  articleDetail: '/pkg-shrine/pages/history/article-detail',
  massacre: '/pkg-shrine/pages/hero/massacre',
  victims: '/pkg-shrine/pages/hero/victims',
  heroFlower: '/pkg-shrine/pages/hero/hero'
};


