# V2.0 冲刺执行状态总表（基线收口）

> **文档用途**：《好诚事家风开发框架最终细节 V2.0》的执行追踪总表。每完成一项在「状态」列打勾并记录 commit。本表是**已交付与待交付的单一事实源**，照此推进后续冲刺。
> 收口日期：2026-09-06 · 基线版本：V2.0（见开发框架附录 D）

---

## 一、已交付基线盘点（对应开发框架各章）

### 第〇部分 首页视觉设计
| 项 | 交付物 | 状态 |
| --- | --- | --- |
| 首页专用色板 --home-* | styles/home.scss（10 令牌） | ✅ |
| 晨光渐变 --home-header | styles/home.scss 0.2.2 三端渐变 | ✅ |
| 琉璃金渐变 --home-gold | styles/home.scss 0.2.3 | ✅ |
| 紧凑布局 8px 网格 | styles/home.scss --home-grid | ✅ |
| **节气/节日动态切换** | utils/home-atmosphere.ts（getHomeTheme/resolveTheme/MUTED_THEME）| ✅ E9 |
| **首页渐变 computed 绑定** | pages/index/index.vue（白事 muted → 素色自动切换）| ✅ E9 |

### 第一~七部分 核心架构（延续既有成果）
| 域 | 交付物 | 状态 |
| --- | --- | --- |
| 项目定案/技术栈 | 既有文档 + package.json | ✅ |
| 云函数 23 个 | cloud/functions/ | ✅（member 已增强 getDetail）|
| 数据库 42 集合 | cloud/db-schemas/ | ✅（本次补 content_categories）|
| 核心算法 | common/tree kindship privacy | ✅ |
| 隐私分级/审计 | common/privacy.js audit.js | ✅ |
| 底部导航 V3 / 登录 / 首页 | pages/* | ✅ |

### 第八部分 V1.1 增强包
| 项 | 交付物 | 状态 |
| --- | --- | --- |
| **头像上传服务** | services/avatar.ts（格式校验+CI 参数+裁剪接口）| ✅ E10 |
| **介绍视频服务** | services/profile.ts saveIntroVideo（60s 强校验）| ✅ E11 |
| 问候语/家训/字辈 | services/profile.ts 封装 | ✅ E11 |
| 三级可见性中间件 | privacy-guard 体系（既有）| ✅ 基线 |
| 老皇历 | lunar-data lib（既有）+ calendar.almanac | ✅ 基线 |

### 第九部分 V2.0 五大模块
| 模块 | 交付物 | 状态 |
| --- | --- | --- |
| **模块一 本地内容** | services/content.ts + content 云函数 content.save/content.search + content_categories schema | ✅ E12/E13 |
| **模块一 三级分类** | content 云函数 category.save/category.list（上限校验/层级校验）| ✅ E13 |
| **模块一 敏感分类强制 PRIVATE** | contentSave 服务端拒绝证件资料公开 | ✅ E13 |
| **模块一 内容库首页** | pages/content/content.vue（网格/列表/分类 chips/上传入口/骨架屏）| ✅ E12/F2 |
| **模块一 详情/编辑/删除/批量权限** | content.detail/update/delete/batch.setVisibility + detail.vue + upload.vue | ✅ F2 |
| **模块一 分类管理/搜索页** | category.vue（树形增删改）+ search.vue（组合筛选）+ category.update/delete | ✅ F2 |
| **模块三 内容安全 secscan 加固** | detectText（词库+msgSecCheck 降级）+ detectImage + 审计 | ✅ E14 |
| 模块二 新闻资讯 | 待 F3/F4（数据源对接/推荐）| ⏳ |
| 模块三 家族动态 | plaza 既有；family_moments 迁移脚本既有 | ⏳ |
| 模块四 合规游戏 | 待 F6-F8 | ⏳ |
| 模块五 虚拟家园 | 待 F9-F10 | ⏳ |

### 测试覆盖（开发框架二十三 23.5：覆盖率≥90%）
| 指标 | 数值 | 状态 |
| --- | --- | --- |
| 测试总数 | 268（F2 累计 +17）| ✅ F2 |
| 失败 | 0 | ✅ |
| Lint error | 0 | ✅ |
| 云函数结构校验 | 23/23 | ✅ |
| **新增测试项** | content.save 正常/敏感强制/非法 visibility、content.search 分类过滤、category.save/list、secscan block/降级/校验、content.detail 三态、content.update/delete 越权、敏感分类批量、组合筛选、分类上限 | ✅ F2 |

---

## 二、V2.0 剩余冲刺分解（10 周基准 · 参考开发框架 23.6）

> 标注已完成项，未完成项即下一步开发任务。人力假设：前端 3、后端 2、设计 1、测试 1、族务 1。

### F1 合规 + 架构（可立即收口）
- [x] 合规红线确认（开发框架 9.0 已逐项落文：棋牌不联机、新闻外链、零内购）
- [x] 五模块功能开关（settings featureFlag，既有 v20Content/v20News/... 命名）
- [ ] 集合/接口骨架完整性复查（news_items 等 12 个 V2.0 集合 schema 逐项核对）

### F2 模块一（本地内容核心）
- [x] 上传（content.save，含 HEIC/类型扩展位）
- [x] 三级分类（category.save/list）
- [x] 权限（PRIVATE/GROUP/PUBLIC + 敏感分类强制）
- [x] 内容详情/编辑/删除/批量权限（content.detail/update/delete/batch.setVisibility，软删除标记）
- [x] 前端上传编辑页 pages/content/upload（三类型选择/HEIC/分类/权限/草稿）→ 63a035a
- [x] 内容详情页 pages/content/detail（预览/编辑/删除/权限/分享）→ be02934
- [x] 内容库首页完善（备份入口/骨架屏/网格列表）→ be02934
- [x] services/content.ts 封装（saveContent/search/detail/update/delete/batch）→ be02934
- [x] 分类管理页 pages/content/category（树形增删改 + 标签展示）→ ede0bf9
- [x] 内容搜索页 pages/content/search（关键词/日期/分类/类型组合筛选）→ ede0bf9
- [x] 分类 rename/delete 云函数接口（category.update/delete，软删除）→ ede0bf9
- [x] stub 增强 $or/$and/$gte/$neq → 54cb3ec
- [x] content.search 软删除过滤 + 组合筛选测试 → 54cb3ec
- **F2 模块一全部交付 ✅**

### F3 模块一收尾 + 模块二启动
- [ ] search_index 倒排索引接入（当前为正则降级）
- [ ] 自动备份队列（album_photos backupStatus 复用）
- [ ] 2GB 视频分片上传（upload 云函数分片策略）
- [ ] 模块二：news_sources 数据源配置 + news_items 入库（5 家源登记）

### F4 模块二（新闻资讯 + secscan 生产化）
- [ ] 推荐算法（B.3：三路召回 + 打分排序）
- [ ] 定时触发器每 10 分钟拉取增量
- [ ] 收藏/离线包（news_favorites）
- [ ] secscan：接入真实 msgSecCheck SDK（当前为占位+降级）

### F5-F6 模块三（家族动态）
- [ ] family_moments 发布/时间线/互动（复用既有 plaza 基础设施）
- [ ] 公告置顶/已阅回执
- [ ] 动态@提及 + 称谓自动带出

### F7-F10 模块四/五（游戏合规版 + 家园）
- [ ] 棋谱研习室（象棋规则引擎 — 本地纯函数可先行 TDD）
- [ ] 牌局记分板 / 灯谜会 / 百业问学 / 梨园小筑
- [ ] 虚拟角色 + 成长体系 + 家园 Canvas
- [ ] 五模块集成/安全/性能/合规测试 + 灰度上线

---

## 三、执行纪律（延续开发框架 16/17/26）
1. 每项交付必过门禁：`npm run verify`（test + lint + functions）全绿方可 commit；
2. 新集合必配 db-schema + 进 seedDB；新云函数 action 必配冒烟测试；
3. 关键操作（权限/密码/解密/公告/奖励）必写 audit_logs（保留 ≥1 年）；
4. 新闻正文只外链不缓存（时政）；游戏无联机/无内购/无虚拟货币；
5. 每期结束把增量回写本文档（基线收口），保证「文档即事实」。
