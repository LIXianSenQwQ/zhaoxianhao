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
| **模块三 家族动态** | plaza 云函数升级 V2.0（listMoments/publishMoment/likeMoment/commentMoment + publishAnnounce/stickAnnouncement/recordReadReceipt/getNotices）+ family_moments 迁移脚本 + clan_notices 集合 | ✅ F5-F6 |
| **模块四 合规游戏** | 象棋规则引擎 `utils/chess-engine.js`（走法合法性/将军/将杀/困毙）+ 牌局记分板 `utils/scoreboard-engine.js`（记分单/排名/合规声明）| ✅ F7-F8 |
| **模块五 虚拟家园** | 基础框架纯函数引擎 `utils/home-engine.js`（庭院布局校验/建筑目录/经验升级/互访频控）+ schema `home_avatars/schema.json + home_worlds/schema.json`| ✅ F9 |
| **模块五 虚拟家园** | 家园布局页 + 好友互访页 + home 云函数接口层（world init/place/grow/visit/like/setPrivacy + avatar）+ 服务封装 services/home.ts | ✅ F10 |

### 测试覆盖（开发框架二十三 23.5：覆盖率≥90%）
| 指标 | 数值 | 状态 |
| --- | --- | --- |
| **测试总数** | 437（F12 opera-engine +20 / A1-A5 + module-integration + collections-audit 新增；基线 403）| ✅ |
| 失败 | 0 | ✅ |
| Lint error | 0 | ✅ |
| 云函数结构校验 | 29/29（F11 新增 opera）| ✅ |
| **新增测试项** | `tests/opera-engine.test.js` 20 用例 / `tests/module-integration.test.js` 3 用例 (IJ1 四角完整性/IJ2 跨模块旅程/IJ3 隔离) / `tests/collections-audit.test.js` 4 用例 (K1~K4 12 集合审计) | ✅ F12/F11/F1 |
| F12 门禁修复 | A1 误报正则收紧（`/bet/i`→`[\s\W]bet[\s\W]`防函数名误报；A3 合规声明 marker `/`笔误；A5 secscan 检测 pattern 扩展兼容 `callFunction({name:'secscan', data:{action:'detectText'}})` 模式）+ `plaza`/`content` secscan.detectText 实际接入 | ✅ F12 |

---

## 二、V2.0 剩余冲刺分解（10 周基准 · 参考开发框架 23.6）

> 标注已完成项，未完成项即下一步开发任务。人力假设：前端 3、后端 2、设计 1、测试 1、族务 1。

### F1 合规 + 架构（可立即收口）
- [x] 合规红线确认（开发框架 9.0 已逐项落文：棋牌不联机、新闻外链、零内购）
- [x] 五模块功能开关（settings featureFlag，既有 v20Content/v20News/... 命名）
- [x] 集合/接口骨架完整性复查（news_items 等 12 个 V2.0 集合：schema 齐备 JSON 合法 K1 ✅；云函数引用 ⊆ schema K2✅；接线状态判定 + game_records 预留声明 K3✅；stub 动态 seed K4✅ → 审计底稿 `tests/collections-audit.test.js` (4 用例)；结果：search_index/content, news_sources/items/favorites/users/news, family_moments/moment_interactions/clan_notices/plaza, home_worlds/home_avatars/home, game_records(本地零联机不启用), content_categories/content — 437 tests 全绿）

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
- [x] family_moments 发布/时间线/互动（plaza 云函数升级：listMoments/publishMoment/likeMoment/commentMoment → family_moments 集合 + moment_interactions 互动记录）→ `8b8b9ba`
- [x] 公告置顶/已阅回执（publishAnnounce / stickAnnouncement / recordReadReceipt / getNotices → clan_notices 集合 + priority/stickingCountdown/readBy）
- [x] 动态@提及 + tags（publishMoment 支持 topicTags + mentions 数组）
- [x] 种子库扩展 familyMoments/momentInteractions/clanNotices → seedDB 参数
- [x] plaza 测试 339（原有 327 + 新增 12：comment/tags/mentions/announce/stick/readReceipt/getNotices）

### F7-F10 模块四/五（游戏合规版 + 家园）
- [x] 棋谱研习室（象棋规则引擎 — 纯函数 TDD：`utils/chess-engine.js` 中国象棋完整规则：车马炮相士帅兵走法合法性 + 蹩腿/塞象眼/隔山打 + 将军/将帅对面 + 合法走法/将杀/困毙判定 → 13 用例 `tests/chess-engine.test.js`）→ `65ecc08`
- [x] 牌局记分板（合规版纯函数：`utils/scoreboard-engine.js` 记分单/轮次/排名/玩家统计，零发牌零随机性 + 合规声明）→ 8 用例 `tests/scoreboard-engine.test.js` → `3f4dd12`
- [x] 虚拟成长家园基础框架（`utils/home-engine.js` 等距庭院落位校验/建筑目录/经验升级曲线/每日互访频控；10 用例 `tests/home-engine.test.js`）→ `d06cfd8`
- [x] 模块页面绑定三大引擎（A→B→C 用户确认顺序）：**记分板页** `pkg-game/pages/game/score.vue`（建房 2-8 人/逐局记账/排名榜/玩家统计/撤销重置/战报/合规声明底部明示）→ **棋谱页** `pkg-game/pages/game/chess.vue`（10×9 双人对弈：选子/提示走法/将杀判胜/困毙和棋/悔棋复盘，全本地零联机）→ **家园页** `pkg-home/pages/home/index.vue`（Lv/经验条/建筑目录解锁/10×10 网格落位 engine 校验/成长结算/可见性切换，云端 worldInit/worldPlace/worldGrow/setPrivacy 持久化）→ 页面分包注册 pages.json（pkg-game/pages/game/*、pkg-home/pages/home/*）
- [x] 好友互访页 `pkg-home/pages/home/visit.vue`（族人搜索 → 访问/点赞，world.visit 每日 20 次频控）
- [x] **第一批子模块**：灯谜会 `pkg-game/pages/game/riddle.vue` + 百业问学 `pkg-game/pages/game/quiz.vue`（含行业切换），配 schema `riddles/riddle_votes/questions/quiz_records` + 云函数 `riddle`(create/list/answer) + `quiz`(create/list/answer)
- [x] **第二批子模块**：梨园小筑 opera（`utils/opera-engine.js` 戏曲票友模拟引擎纯函数：生旦净末丑行当卡/登台唱念做打评分/成长升级/剧目片段解锁 + 云函数 `opera`(roster.create/list/stage.perform/daily.checkin/records.list) + schema `opera_roster/opera_performances` + 页面 `pkg-game/pages/game/opera.vue` + 服务封装 `services/opera.ts`）+ **引擎单测 `tests/opera-engine.test.js`** 20 用例（行当生成/登台评分/心情加成/成长升级/签到频控/参数校验/合规声明）✅ F12 补全 | commit: F12 当前
- [x] **任务系统 task**：页面已有 `pkg-growth/pages/task/task.vue`（今日任务+打卡+积分反馈），复用既有 task 云函数与 schema，走 request 服务层 ✅ 无需新增
- [x] 虚拟角色（`pkg-home/pages/home/avatar.vue`：创建/查看/称号与形象编辑，接 home.avatar.create/get/update）+ 家园 Canvas（home 页「网格/鸟瞰」视图切换，Canvas 2D 重绘建筑落位）+ 成长体系（world.grow 经验曲线/等级解锁）✅
- [x] 五模块集成/安全/性能/合规测试 + 灰度上线（`tests/module-audit.test.js` 6 用例：禁止代码 A1/开关默认 A2/合规声明 A3/services 封装 A4/secscan 接入 A5/门禁引用 A6；`tests/module-integration.test.js` 3 用例：IJ1 四角完整性 / IJ2 MEMBER 跨模块旅程 home→opera→avatar→tree / IJ3 用户隔离；home+opera 写操作角色门禁加固（非 MEMBER→403）；**灰度发布包** `docs/deployment/V2.0-RELEASE-NOTES.md` (v2.0.0 基线) + `GRY-DEPLOYMENT-PLAN.md`(前置条件/G1-G5)/`ROLLBACK-CLONE.md`(回滚预案) + `LAUNCH_CHECKLIST.md` V2.0 增补 → 437 tests ✅ verify 全绿 → `032a18e` (含此前 181a60e 安全收口/49641ca 审计修复) **→ 当前状态：灰度部署就绪包交付完成**

### F10 家园云接口层 + member 全树接口
- [x] **家园云函数 `cloud/functions/home/index.js`**（新增，云函数 25→28）：world.init/get/place/grow/visit/like/setPrivacy + avatar.create/get/update（place 走引擎落位校验 + 建筑解锁，visit 每日 20 次频控，grow 经验曲线自动升级，含 DB schema home_worlds/home_avatars 已有对接）→ 服务封装 `services/home.ts`
- [x] **member 全树接口 `member.tree.all`**（新增 action）：`buildTreeAll` 按 focusId 房支前缀 + ACTIVE 一次拉取 ≤2000 条（供全树 Canvas），generation/path 排序返回 `{nodes,total,hasMore}` → `services/member.ts treeAll()` 封装
- [x] riddle/quiz 服务封装 `services/riddle.ts` + `services/quiz.ts`（§7.10 服务层通路：全部页面经 services/* 调用，无直连 wx.cloud.callFunction）

### F1 合规收口补强（少年模式整改 + 引擎回归修复）
- [x] **三引擎 ESM 双导出回归修复**：chess/home/scoreboard-engine 删除 module.exports 保留 export（Node24 require(esm) 与前端 import 双通）；chess 13 + home 10 + scoreboard 8 = 31/31 → `6f696ff`（全量 473 test）
- [x] **少年模式合规整改闭环**：`utils/minor-mode.js` 纯函数守卫（normalizeUsage 跨日重置/remainingMs/canPlay/consume 封顶/isExhausted/filterCategories 剔除娱乐体育/dailyLimitFromFlags 族议会可调）+ 20 单测 + `stores/user.ts` childMode 持久化与 toggleChildMode（与 elderMode 互斥）+ mine.vue「少年模式」开关 + 游戏中心接入（预扣 1 分钟/倒计时锁定/watch 实时启停/修复子页 URL）+ pkg-news 分类 chips 过滤 → `a0e2f66`（全量 493 test；v20-compliance-checklist 未成年人 1/3→3/3，总计 20/20 待加强清零）
- [x] **lint 遗留清理**：`utils/tree-perf.js` truncateName `==` → `??`（eqeqeq 归零）

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
| §7.2 姻亲规则 | `relation.calc` 无共同祖先时经 SPOUSE 边双桥解析（规则一：A 血亲 X 之配偶 B→姐夫/妹夫/嫂子/弟媳/姑父/伯母婶婶/女婿儿媳；规则二：A 配偶 X 之血亲 B→岳父/岳母/公公/婆婆/大舅子/小舅子/大姨子/小姨子/大伯子/小叔子/大姑子/小姑子）；未命中回退同宗 fail-closed；7 用例 `tests/relation-spouse.test.js` | ✅（git ee7b397；方言 settings 覆盖已交付为下方条目） |
| §7.2 方言覆盖 | `kindship.kinshipTitle(n,m,gender,seniority,dialect)` 返回 `{formal, dialect?}`，`relation.calc` 读取 `settings.kindshipDialect` 并附加 `dialectTitle`（additive 字段，backward compatible）+ 8 单测 | ✅（当前提交） |
| §7.7 谱名冲突检测 | `entry.submit` 与在库 `members.genealogyName` 查重，命中不阻断、随单返回 `conflict/conflictCount/conflictHint`（F5 冒烟用例） | ✅ |
| §7.9 忌日提醒定时器 | `cloud/functions/ceremony/config.json`：每日 6:00 timer → `remindScan`（原函数已在，R13 补触发器） | ✅ |
| §7.10 云迁移预案 | `docs/planning/MIGRATION-CLOUD-TO-SELF.md`（触发条件/双写/灰度/回滚/验收）+ `cloud/functions/common/gateway.js` 转发层预留骨架（`npm run sync:common` 同步） | ✅ 预案与骨架交付（实际迁移待量级触发） |
| §7.11 老皇历引擎 | `lunar-javascript@^1.6.12` 加入 dependencies（1900–2100 离线历法）；`lib/lunar-data.js` detect 三档回退已有 | ✅ 依赖接入（npm 缓存 EPERM 绕行：`npm install --cache .npm-cache-lunar`） |

### P3 遗留 P1 项（后续冲刺）
| 蓝图条款 | 待办 | 优先级 |
| --- | --- | --- |
| §7.1 Canvas 图视图 | TreeGraph.vue 已增强双指缩放/直系过滤/五服着色；tree.vue 集成图谱视图切换（Computed layout + 列表/图谱 Toggle）→ `181fdc0`| ✅ |
| §7.2 方言覆盖 | settings.kindshipDialect 称谓覆盖表（已交付；方言表 UI 配置管理待后续优化） | 移除（已交付） |
| §7.6 公示期 | entry APPROVED 前 publicityDeadline 流转 + 通知 → entry audit SECOND_PASS→PUBLICITY(publicityDays 可配, 0=直 APPROVED 兼容) + PUBLICITY_PASS 提前结束(≠复审人) + publicityScan timer(每日7点到期自动 APPROVED) + pendingList 公示视图 + schema status/publicityDays/publicityDeadline + 7 smoke 用例 | ✅（445 test verify 全绿） |
| §7.8 24 节气渐变 | 24 节气全量端点色板 palette + 全量节气笺 + festival 节日字段（族议会年历>内置公历>清明即节日，静默期不下发）→ atmosphere/index.js + 首页/日历页接入 + 4 smoke 用例 → `aeeecbe` | ✅（441 test 基线 → 445 test verify 全绿） |
| §7.9 订阅消息/公众号 | notify 站内外的订阅/IM 通道适配 → dispatch 编排 + subscribeMsg.send(settings.subscribeTemplates) + officialAccount.send(settings.officialAccount) + notify/common/channel.js SDK 占位 + 6 smoke 用例(fail-closed/simulated/审计) | ✅（451 test verify 全绿） |
| 隐私全覆盖扫描 | 敏感 action 逐一点检 privacyCheck/visibilityCheck 遗漏（§7.4 复查）：17 敏感集合×写操作全量门禁扫描 0 真缺口；6 处审计发现逐点 verdict 全部合规（自建/双人审核/EDITOR 门禁）；修复 auth.grantAuth 真实缺口（MEMBER 门禁 + 受权人 ACTIVE 校验 + scope 必填，4 用例）；privacy-coverage.test.js 升级为阻断式门禁（KNOWN_SAFE_WRITES 8 条已审核白名单）；445 test verify 全绿 | ✅（445 test verify 全绿） |
4. 新闻正文只外链不缓存（时政）；游戏无联机/无内购/无虚拟货币；
5. 每期结束把增量回写本文档（基线收口），保证「文档即事实」。
