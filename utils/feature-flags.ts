/**
 * utils/feature-flags.ts
 * V2.0: 功能开关初始化与加载
 */

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
  
  // P1/P2 未来扩展
  "live": { enabled: false, scope: "global" },
  "healthArchive": { enabled: false, scope: "global" },
  "treeFanView": { enabled: false, scope: "global" }
};

export async function loadFeatureFlags() {
  try {
    // 从 settings 集合读取
    const res = await wx.cloud.callFunction({
      name: 'admin',
      data: { action: 'getFeatureFlags' }
    });
    
    if (res.result && res.result.flags) {
      return res.result.flags;
    }
    
  } catch (err) {
    console.warn('Failed to load feature flags, using defaults:', err);
  }
  
  return defaultFeatureFlags;
}

export function isFeatureEnabled(key: string): boolean {
  return !!window._featureFlags?.[key]?.enabled;
}

// 初始化时加载到 window
(async () => {
  window._featureFlags = await loadFeatureFlags();
})();
