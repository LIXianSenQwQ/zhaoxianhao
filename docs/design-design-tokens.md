# 首页视觉设计稿标注 · tokens.scss + home.scss 对照表

> 蓝图定位：第〇部分「首页专用色板」+ 「晨光渐变」+ 「琉璃金点睛」+ 「8px 网格」
> 本文档为前端开发直接参照的视觉规范：令牌 → 值、使用位置、复用组件、年长模式适配。

---

## 一、全局设计令牌（tokens.scss）

| 类别 | 令牌 | 色值/值 | 用途 | 示例代码引用 |
|---|---|---|---|---|
| **色彩** | `--ink` | `#26221E` | 深色底/祠堂场景 | .shrine 背景 |
| | `--paper` | `#F4F1E8` | 全局底色 | body bg |
| | `--river` | `#3A4A56` | 次级底/冷色 | calendar bg |
| | `--cinnabar` | `#B03A2E` | 朱砂强调/红事 | ceremony border-left |
| | `--gold` | `#C9A063` | 琉璃金点灯/荣誉 | gild icon bg |
| | `--pear-blossom` | `#FAF7F0` | 梨花白清明/春季 | spring theme overlay |
| **文本** | `--text-main` | `#333333` | 主文本 | .title color |
| | `--text-sub` | `#666666` | 次文本 | .desc color |
| | `--text-aux` | `#999999` | 辅助文本 | .muted color |
| **字号** | `--font-xs` | `12px` | 小字标签 | .label font-size |
| | `--font-sm` | `14px` | 描述文字 | .desc font-size |
| | `--font-base` | `16px` | 正文 | .card-title font-size |
| | `--font-lg` | `20px` | 大标题 | .page-title |
| | `--font-xl` | `24px` | 问候区大字 | .greeting font-size |
| **间距** | `--space-1` | `4px` | 微小间距 | gap: 4px |
| | `--space-2` | `8px` | 标准间距 | padding gap |
| | `--space-3` | `16px` | 页面边距 | margin |
| | `--space-4` | `24px` | 卡片内边距 | padding |
| **圆角** | `--radius-card` | `12px` | 卡片圆角 | border-radius |
| | `--radius-btn` | `8px` | 按钮圆角 | btn radius |
| **阴影** | `--shadow-card` | `0 2px 12px rgba(38,34,30,0.06)` | 卡片投影 | box-shadow |
| **最小热区** | `--min-touch` | `44px` | 触摸目标最小尺寸 | min-width/min-height |

> 年长模式：`.elder-mode` 下所有字号 ×1.4；少年模式略缩 10%。

---

## 二、首页专用令牌（home.scss）

| 令牌 | 值/渐变 | 用途 | 切换规则 |
|---|---|---|---|
| `--home-bg` | `#FAF8F2` | 首页底色 | 始终适用 |
| `--home-header` | `linear-gradient(165deg,#FDFCF8 0%,#F5F1E6 45%,#EDF2EC 100%)` | 问候区晨光渐变 | 白事时→ `.muted` 素色渐变；节气联动换端点色 |
| `--home-gold` | `linear-gradient(135deg,#D4B06A 0%,#C9A063 50%,#B8924F 100%)` | 琉璃金入口 | 点灯键/荣誉卡数字 |
| `--home-accent` | `#B03A2E` | 仪式卡朱砂边条 | ceremony.card.border-left |
| `--home-fresh` | `#7FA8A0` | 青瓷点缀色 | 天气小件/节气图标 |
| `--home-card` | `#FFFFFF` | 卡片主底 | .home-today-card.bg |
| `--home-card-2` | `#F7F4EC` | 次级底/家风家训卡底 | motto.card.bg |
| `--home-line` | `#EAE4D6` | 分隔线 | .overview separator |

### 布局参数（单页定值，无需 CSS 变量）

- 基础网格：`8px`
- 左右边距：`16px`
- 卡片间距：`12px`
- 卡片内边距：`12px` / `16px`（重点卡）
- 快捷栏高度：`72px`
- 速览卡高度：`72px`

---

## 三、首页结构映射（每个区块对应 class/样式块）

```css
/* ① 问候区（晨光渐变） */
.home-header {
  min-height: 120px;          /* 首屏不折叠 */
  background: linear-gradient(...);
  border-radius: var(--radius-card); /* 底部圆角 */
  
  &.muted {                   /* 白事期间素色覆盖 */
    background: var(--home-header-muted);
  }
}

/* ② 快捷工具条（横向 5 键） */
.home-quickbar {              /* 浮白卡片 + 柔和投影 */
  padding: var(--home-grid) 0;
  box-shadow: var(--shadow-card);
  
  &-item {                    /* 触摸目标≥44px×44px */
    min-width: var(--min-touch);
    min-height: var(--min-touch);
    
    .qb-icon.gild {           /* 点灯琉璃金底座 */
      background: var(--home-gold);
    }
    
    &:active .qb-icon {       /* 按压缩放≤200ms */
      transform: scale(0.92);
    }
  }
}

/* ③ 今日要事卡流（多卡片） */
.home-today-card {            /* 标准卡片样式 */
  background: var(--home-card);
  border-radius: var(--radius-card);
  padding: var(--home-card-pad);
  box-shadow: var(--shadow-card);
  
  &.ceremony {                /* 仪式卡朱砂左条纹（优先级最高） */
    border-left: 4px solid var(--home-accent);
  }
  
  &.motto {                   /* 家风家训卡缃黄底 */
    background: var(--home-card-2);
  }
}

/* ④ 家族速览横滑卡 */
.home-overview {              /* 隐藏滚动条 + 72px 高度固定 */
  height: var(--home-overview-height);
  overflow-x: auto;
  scrollbar-width: none;
}

.home-overview-num {          /* 琉璃金渐变色数字 */
  background: var(--home-gold);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

/* ⑤ 入场动画（淡入 ≤200ms） */
.fade-in {
  animation: fadeIn 200ms ease-out; /* 全局关闭 option */
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

---

## 四、卡片体系组件化（共用 BaseCard）

| 卡片类型 | CSS 类 | 样式特点 | 数据源 |
|---|---|---|---|
| **仪式/红白事卡** | `.home-today-card.ceremony` | 朱砂左边条（4px） | atmosphere.today() ritual event |
| **提醒卡** | `.home-today-card` | 普通卡片 | notify.digest reminder |
| **动态摘要卡** | `.home-today-card` | 普通卡片 | family_moments summary |
| **家风家训推荐卡** | `.home-today-card.motto` | 缃黄底 + 轮播 | family_mottos recommended:true |
| **天气问候卡** | `.home-header.sub` | 在问候区小件 | weather.current AQI + 图标 |
| **家族速览卡** | `.home-overview-item` | 横滑固定高度 | member.stats generations |

> 卡片组件统一走 `components/common/BaseCard.vue`，配色/投影通过 props 传入，禁止在页面内手写颜色。

---

## 五、交互纪律与性能指标

| 项 | 要求 | 实现 |
|---|---|---|
| **彩色点缀数** | 单屏 ≤3 处（朱砂×1 + 琉璃金×2） | 遵循 token 用量纪律 |
| **动画时长** | 入场淡入 ≤200ms；可全局关闭 | `.fade-in` + featureFlag 控制 |
| **按压反馈** | scale(0.92)，≤200ms | `.home-quickbar-item:active` |
| **骨架屏时间** | ≤300ms 出现 | pages/index/skeleton.vue |
| **首屏可交互** | ≤1.5s（中端机 4G） | atmosphere/today 缓存优先渲染 |

---

## 六、年长模式适配

```scss
.elder-mode {
  // 所有字号×1.4
  .home-greeting { font-size: calc(var(--font-xl) * 1.4); }
  .home-card-title { font-size: calc(var(--font-base) * 1.4); }
  .home-card-desc { font-size: calc(var(--font-sm) * 1.4); }
}
```

> 大字体自动生效；保持所有间距不变（避免过疏）。

---

## 七、节气质感联动（实现要点）

| 节气 | 渐变端点色替换方案 | 触发时机 |
|---|---|---|
| 清明 | `--header-top/mid/bottom → #FAF7F0 / #F5EFE0 / #EBE8E0` | atmosphere.today.solarTerm==清明 |
| 秋分 | `→ #FFF9E8 / #FFEBC0 / #FDEAC0` | 秋季金色系 |
| 除夕 | `→ #FFF5E5 / #FFEFB8 / #FFEB96` | 节日暖金系 |
| 白事 | 直接应用 `.muted` 素色渐变 | events.status===ACTIVE 讣告 |

> **原则：只换端点色，不重绘结构** —— 直接在 `.home-header` classList 上 toggle 或修改 --header-* 变量即可。
