/**
 * utils/feature-flags.ts
 * V2.0: 功能开关初始化与加载（通过 services/admin.ts 统一层，满足§7.10 接口不变性）
 */
import { getFeatureFlags } from '../services/admin';

// 默认功能开关表（settings 集合）
export const defaultFeatureFlags = {
  // MVP (always on)
  "homeFamilyCard": { enabled: true, scope: "global" },
  
  // V1.1 功能增强包
  "v11Profile": { enabled: true, scope: "global", note: "头像/视频/相册" },
  "v11Weather": { enabled: true, scope: "global" },
  "v11Motto": { enabled: true, scope: "global" },
  "v11Generation": { enabled: true, scope: "global" },
  "v11Security": { enabled: true, scope: "global", note: "委托/改密/反向密码/百年设置" },
  "v11Almanac": { enabled: true, scope: "global" },
  
  // V2.0 五大模块
  "v20Content": { enabled: true, scope: "global", note: "本地内容管理" },
  "v20News": { enabled: true, scope: "global", note: "新闻资讯（时政仅外链）" },
  "v20Moment": { enabled: true, scope: "global", note: "家族动态与公告" },
  "v20Games": { enabled: true, scope: "global", note: "合规版游戏" },
  "v20Home": { enabled: true, scope: "global", note: "虚拟成长家园（零内购）" },

  // V2.0 分支域
  "v20Branch": { enabled: true, scope: "global", note: "分支管理（总谱/分谱/支谱三级）" },
  "v20Roots": { enabled: true, scope: "global", note: "宋村·根脉专区（地标/时间轴/英烈/追思）" },
  
  // P1/P2 未来扩展
  "live": { enabled: false, scope: "global" },
  "healthArchive": { enabled: false, scope: "global" },
  "treeFanView": { enabled: false, scope: "global" }
};

/** 加载功能开关（通过 services/admin.ts 统一层，接口不变性） */
export async function loadFeatureFlags() {
  try {
    const res = await getFeatureFlags();
    if (res && res.data?.flags) {
      return res.data.flags;
    }
  } catch (err) {
    console.warn('Failed to load feature flags via admin service, using defaults:', err);
  }
  
  return defaultFeatureFlags;
}

/** 运行时开关缓存（H5 用 window；小程序无 window → 模块级变量） */
let runtimeFlags: Record<string, { enabled: boolean }> | null = null;

export function isFeatureEnabled(key: string): boolean {
  const source = runtimeFlags || defaultFeatureFlags;
  return !!source[key]?.enabled;
}

/** 全量开关快照（跨端安全；供 dailyLimitFromFlags 等需要整表读取的场景） */
export function getFlagsSnapshot(): Record<string, any> {
  return runtimeFlags || defaultFeatureFlags;
}

// 初始化：拉取远端开关覆盖默认表；失败静默用默认（所有端通用，不依赖 window）
(async () => {
  runtimeFlags = await loadFeatureFlags();
})();
