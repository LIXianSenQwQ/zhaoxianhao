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
| **模块一 搜索倒排索引** | search_index 集合 + content.index.build/content.search.index + save/update/delete 同步 | ✅ F3a |
| **模块二 新闻数据源** | news 云函数（ensureSources 5 源登记 + fetchFromSource 指纹去重 + cronPull + searchItems + favoriteToggle）| ✅ F3d |
| **模块三 内容安全 secscan 加固** | detectText（词库+msgSecCheck 降级）+ detectImage + 审计 | ✅ E14 |
| **模块二 新闻推荐引擎** | news.recommend.get（三路召回：兴趣/热度/家族；牛顿冷却时效；冷启动包）+ interest.init/list/click/negative + hot.bump | ✅ F4 |
| **模块二 收藏分组+离线包** | favorite.group.create/list/rename/remove/move + offline.pack/list/remove/cleanup（合规仅快照）+ 10min 定时触发器 | ✅ F4 |
| **模块三 自动备份队列** | backup 云函数 backupStatus 状态机（PENDING/DONE/FAIL）+ 重试上限 3 + 配额 10GB + export/restore；album.uploadBatch 写 fileSize/attempts | ✅ F3b |
| **模块三 2GB 分片上传** | upload 云函数 chunk.init/put/progress/complete/status：断点续传会话 + video 转码骨架 + upload_sessions schema | ✅ F3c |
| **模块二 secscan 生产化** | secscan 原生 API（openSecurity msgSecCheck/imgSecCheck）+ callFunction 降级 + 敏感词库；连续违规人工复核标记结构 | ✅ F4+ |
| 模块三 家族动态 | plaza 既有；family_moments 迁移脚本既有 | ⏳ |
| 模块四 合规游戏 | 待 F6-F8 | ⏳ |
| 模块五 虚拟家园 | 待 F9-F10 | ⏳ |

### 测试覆盖（开发框架二十三 23.5：覆盖率≥90%）
| 指标 | 数值 | 状态 |
| --- | --- | --- |
| 测试总数 | 327（secscan 生产化 +3：fileId 降级/url 检测/人工复核结构）| ✅ F4+ |
| 失败 | 0 | ✅ |
| Lint error | 0 | ✅ |
| 云函数结构校验 | 25/25（新增 backup）| ✅ |
| **新增测试项** | secscan：detectImage fileId 降级 pass / url 检测 / detectText 连续违规标记结构；stub 补 getTempFileURL | ✅ F4+ |
| 本次修复 | stub 补 wx.cloud.getTempFileURL；escalated 显式字段（undefined→false）| ✅ F4+ |

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
- [x] search_index 倒排索引接入（save/update/delete 同步 + index.build + search.index）
- [x] 模块二：news_sources 5 源配置 + news_items 指纹去重入库 + cronPull + 搜索/收藏
- [x] 自动备份队列（album_photos backupStatus 复用）→ F3b
- [x] 2GB 视频分片上传（upload 云函数分片策略）→ F3c

### F4 模块二（新闻资讯 + secscan 生产化）
- [x] 推荐算法（B.3：三路召回 + 打分排序）→ F4
- [x] 定时触发器每 10 分钟拉取增量 → F4
- [x] 收藏/离线包（news_favorites）→ F4
- [x] secscan：接入真实 msgSecCheck SDK（openSecurity 原生 API + callFunction 降级 + 敏感词库；连续违规人工复核标记结构）→ secscan 生产化 e502bb4

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

---

## 四、P3 冲刺：核心算法增强收口（蓝图第三部分 §7.1–§7.11）

> 本轮为**开发框架第三部分「核心算法与隐私」的增强收口冲刺**，非 V2.0 五模块新功能。
> 审计底稿：`docs/planning/P3-audit-consolidated.md`；迁移预案：`docs/planning/MIGRATION-CLOUD-TO-SELF.md`。
> 基线：npm run verify 全绿（test=298 → 315、lint error=0、functions 25/25、lunar-javascript 已装）。

### P3 交付清单（git：2656912 / 0d84333）
| 蓝图条款 | 交付物 | 状态 |
| --- | --- | --- |
| §7.1 族谱树布局 | `utils/family-tree-layout.js` 纯函数：世代行 Y/兄弟 birthOrder 排序/父节点居中/家庭单元/直系过滤/时间轴/五服色板 → 16 用例 `tests/family-tree-layout.test.js` | ✅ 算法层交付（Canvas 页接入为 P1） |
| §7.2 称谓长幼 | `relation.calc` 同代称谓 seniority 改按**实际出生信息**解析（birthOrder/birthDate），无数据保持 elder 默认向后兼容（修复兄呼弟恒得「哥哥」缺陷） | ✅ |
| §7.2 姻亲规则 | `relation.calc` 无共同祖先时经 SPOUSE 边解析姻亲称谓（规则一：A 血亲 X 之配偶 B→姐夫/妹夫/嫂子/弟媳/姑父/伯母婶婶/女婿儿媳；规则二：A 配偶 X 之血亲 B→岳父/岳母/公公/婆婆/大舅子/小舅子/大姨子/小姨子/大伯子/小叔子/大姑子/小姑子）；未命中回退同宗 fail-closed；7 用例 `tests/relation-spouse.test.js` | ✅（git ee7b397；方言 settings 覆盖仍为 P1） |
| §7.7 谱名冲突检测 | `entry.submit` 与在库 `members.genealogyName` 查重，命中不阻断、随单返回 `conflict/conflictCount/conflictHint`（F5 冒烟用例） | ✅ |
| §7.9 忌日提醒定时器 | `cloud/functions/ceremony/config.json`：每日 6:00 timer → `remindScan`（原函数已在，R13 补触发器） | ✅ |
| §7.10 云迁移预案 | `docs/planning/MIGRATION-CLOUD-TO-SELF.md`（触发条件/双写/灰度/回滚/验收）+ `cloud/functions/common/gateway.js` 转发层预留骨架（`npm run sync:common` 同步） | ✅ 预案与骨架交付（实际迁移待量级触发） |
| §7.11 老皇历引擎 | `lunar-javascript@^1.6.12` 加入 dependencies（1900–2100 离线历法）；`lib/lunar-data.js` detect 三档回退已有 | ✅ 依赖接入（npm 缓存 EPERM 绕行：`npm install --cache .npm-cache-lunar`） |

### P3 遗留 P1 项（后续冲刺）
| 蓝图条款 | 待办 | 优先级 |
| --- | --- | --- |
| §7.1 Canvas 图视图 | family-tree-layout 接入 tree.vue 图视图切换 + TreeGraph.vue 双指缩放/视口裁剪/直系/时间轴/五服着色 | P1 |
| §7.2 姻亲规则 | `relation.calc` 无共同祖先时经 SPOUSE 边走姻亲称谓表（姐夫/妹夫/嫂子/弟媳/姑父/岳父/大舅子/小姨子等） | ✅ `cloud/functions/relation/index.js` findSpouse + 规则一（A 血亲之配偶）/规则二（A 配偶之血亲）双桥，7 用例 `tests/relation-spouse.test.js` 通过 | 移除（已交付） |
| §7.2 方言覆盖 | settings.kindshipDialect 称谓覆盖表 | P1 |
| §7.6 公示期 | entry APPROVED 前 publicityDeadline 流转 + 通知 | P1 |
| §7.8 24 节气渐变 | 全量端点色板（含节日 festival 字段） | P1 |
| §7.9 订阅消息/公众号 | notify 站内外的订阅/IM 通道适配 | P1 |
| 隐私全覆盖扫描 | 敏感 action 逐一点检 privacyCheck/visibilityCheck 遗漏（§7.4 复查） | P1 |
4. 新闻正文只外链不缓存（时政）；游戏无联机/无内购/无虚拟货币；
5. 每期结束把增量回写本文档（基线收口），保证「文档即事实」。
