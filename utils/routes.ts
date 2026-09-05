/**
 * utils/routes.ts
 * 统一路由表 - V2.0
 * navTo(key) 是唯一映射源
 */

export const routes = {
  // ═══════════ 主包 ═══════════
  index: '/pages/index/index',
  xuemap: '/pages/xuemap/xuemap',
  clanaffairs: '/pages/clanaffairs/clanaffairs',
  familypark: '/pages/familypark/familypark',
  mine: '/pages/mine/mine',
  login: '/pages/login/login',
  search: '/pages/search/search',
  privacy: '/pages/privacy/privacy',

  // ═══════════ 族谱包 pkg-genealogy ═══════════
  jiapu: '/pkg-genealogy/jiapu/index',
  jiapuDetail: '/pkg-genealogy/jiapu/detail',
  lifebook: '/pkg-genealogy/lifebook/index',
  relationeditor: '/pkg-genealogy/relationeditor/index',
  relationCalc: '/pkg-genealogy/relation/calc',

  // ═══════════ 谱库包 pkg-archive ═══════════
  genealogy: '/pkg-archive/genealogy/index',
  docdetail: '/pkg-archive/docdetail/index',
  docviewer: '/pkg-archive/docviewer/index',
  smartentry: '/pkg-archive/smartentry/index',
  auditDetail: '/pkg-archive/audit/detail',

  // ═══════════ 互动包 pkg-social ═══════════
  chat: '/pkg-social/chat/index',
  chatDetail: '/pkg-social/chat/detail',
  family: '/pkg-social/family/index',
  broadcast: '/pkg-social/broadcast/index',
  plaza: '/pkg-social/plaza/index',

  // ═══════════ 日历包 pkg-calendar ═══════════
  calendar: '/pkg-calendar/calendar/index',
  calendarDetail: '/pkg-calendar/calendar/detail',
  notification: '/pkg-calendar/notification/index',
  almanac: '/pkg-calendar/almanac/index',

  // ═══════════ 祭祀包 pkg-shrine ═══════════
  shrine: '/pkg-shrine/shrine/index',
  worship: '/pkg-shrine/worship/index',
  spiritdetail: '/pkg-shrine/spiritdetail/index',
  hero: '/pkg-shrine/hero/index',
  heroDetail: '/pkg-shrine/hero/detail',
  history: '/pkg-shrine/history/index',
  historyDetail: '/pkg-shrine/history/detail',

  // ═══════════ 积分包 pkg-points ═══════════
  points: '/pkg-points/points/index',
  growth: '/pkg-points/growth/index',
  task: '/pkg-points/task/index',
  taskDetail: '/pkg-points/task/detail',

  // ═══════════ 个人包 pkg-profile (V1.1) ═══════════
  profile: '/pkg-profile/profile/index',
  photomgr: '/pkg-profile/photomgr/index',
  greeting: '/pkg-profile/greeting/index',
  motto: '/pkg-profile/motto/index',
  generation: '/pkg-profile/generation/index',
  delegate: '/pkg-profile/delegate/index',
  security: '/pkg-profile/security/index',
  capsule: '/pkg-profile/capsule/index',

  // ═══════════ 内容包 pkg-content (V2.0) ═══════════
  content: '/pkg-content/index/index',
  contentUpload: '/pkg-content/upload/index',
  contentDetail: '/pkg-content/detail/index',
  contentCategory: '/pkg-content/category/index',
  contentSearch: '/pkg-content/search/index',
  contentBackup: '/pkg-content/backup/index',

  // ═══════════ 资讯包 pkg-news (V2.0) ═══════════
  news: '/pkg-news/index/index',
  newsCategory: '/pkg-news/category/index',
  newsDetail: '/pkg-news/detail/index',
  newsSearch: '/pkg-news/search/index',
  newsFavorites: '/pkg-news/favorites/index',
  newsOffline: '/pkg-news/offline/index',
  newsPush: '/pkg-news/push/index',

  // ═══════════ 动态包 pkg-moment (V2.0) ═══════════
  moment: '/pkg-moment/index/index',
  momentPublish: '/pkg-moment/publish/index',
  momentDetail: '/pkg-moment/detail/index',
  momentNotice: '/pkg-moment/notice/index',

  // ═══════════ 娱乐包 pkg-game (V2.0) ═══════════
  game: '/pkg-game/index/index',
  gameChess: '/pkg-game/chess/index',
  gameAsync: '/pkg-game/async/index',
  gameScore: '/pkg-game/score/index',
  gameRiddle: '/pkg-game/riddle/index',
  gameQuiz: '/pkg-game/quiz/index',
  gameSimulate: '/pkg-game/simulate/index',

  // ═══════════ 家园包 pkg-home (V2.0) ═══════════
  home: '/pkg-home/index/index',
  homeAvatar: '/pkg-home/avatar/index',
  homeGrowth: '/pkg-home/growth/index',
  homeTask: '/pkg-home/task/index',
  homeVisit: '/pkg-home/visit/index'
};

/**
 * 统一路由跳转
 */
export function navTo(key: keyof typeof routes, params?: Record<string, any>) {
  const base = routes[key];
  if (!base) {
    console.warn(`Route "${key}" not found`);
    return;
  }

  let url = base;
  if (params) {
    const qs = Object.entries(params)
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join('&');
    url = `${base}?${qs}`;
  }

  uni.navigateTo({ url });
}
