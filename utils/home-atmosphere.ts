/**
 * utils/home-atmosphere.ts — 首页晨雾渐变切换引擎（小程序安全）
 * 
 * V2.0 第〇部分定案：按节气/节日自动切换渐变端点色，白事期间素色降级
 * 
 * 纯函数设计：本模块不触碰 DOM（小程序无 document），
 * 页面通过 computed 绑定 `:style` 消费主题配置。
 */

// ═══════════ 默认晨光系（基础渐变） ═══════════
export interface ThemeConfig {
  top: string;
  mid: string;
  bottom: string;
}

export const DEFAULT_THEME: ThemeConfig = {
  top: '#FDFCF8',      // 近白的暖光
  mid: '#F5F1E6',      // 缃黄过渡
  bottom: '#EDF2EC'    // 青瓷淡收尾
};

/** 白事素色降级主题 */
export const MUTED_THEME: ThemeConfig = {
  top: '#F7F5F0',
  mid: '#F0EEE8',
  bottom: '#E8E6DF'
};

// ═══════════ 特殊节气/节日主题 ═══════════
const THEMES: Record<string, ThemeConfig> = {
  // 清明/春季（梨花白系）
  'QINGMING': {
    top: '#FAF7F0',    // 梨花白
    mid: '#F3EFEB',
    bottom: '#E8F0EB'  // 青瓷淡
  },

  // 秋分/秋季（梨果金系）
  'QIUFEN': {
    top: '#FFF8E8',    // 缃黄暖光
    mid: '#FFEDD0',    // 梨果金过渡
    bottom: '#E5C073'  // 暖金收尾
  },

  // 除夕/春节（暖金系）
  'CHUNJIE': {
    top: '#FFF9F0',    // 蜜糖白
    mid: '#FFE0B2',    // 橙金黄
    bottom: '#FFCC80'  // 暖金深
  }
};

// ═══════════ 节气/节日日期映射（MM-DD） ═══════════
const HOLIDAYS: Record<string, string[]> = {
  'QINGMING': ['03-20', '03-21', '03-22', '03-23', '03-24', '04-03', '04-04', '04-05'],
  'QIUFEN': ['09-20', '09-21', '09-22', '09-23'],
  'CHUNJIE': ['02-08', '02-09', '02-10', '02-11', '02-12', '02-13', '02-14', '02-15', '02-16', '02-17']
};

/**
 * 获取首页主题配置（纯函数）
 * @param date 当前日期
 * @param isWhiteEvent 是否白事静默期（素色降级优先）
 * @param customThemeName 手动指定主题（调试/预览用）
 */
export function getHomeTheme(
  date: Date,
  isWhiteEvent = false,
  customThemeName?: string
): ThemeConfig {
  // ① 白事静默优先：任何节日主题全部素色降级
  if (isWhiteEvent) return MUTED_THEME;

  // ② 自定义主题覆盖（如手动选择节日模式）
  if (customThemeName && THEMES[customThemeName]) return THEMES[customThemeName];

  // ③ 检测当前日期是否匹配节日/节气区间
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const key = `${month}-${day}`;

  for (const name of Object.keys(HOLIDAYS)) {
    if (HOLIDAYS[name].includes(key)) return THEMES[name];
  }

  // ④ 默认晨光系
  return DEFAULT_THEME;
}

/**
 * 便捷封装：由「白事状态」决定主题（数据未到前默认晨光）
 * 供页面 computed 使用——服务端 muted 到达后自动切素色
 */
export function resolveTheme(isWhiteEvent: boolean): ThemeConfig {
  return getHomeTheme(new Date(), isWhiteEvent);
}