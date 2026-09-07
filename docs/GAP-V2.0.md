# V2.0 蓝图差距盘点（GAP-V2.0.md）

> 对照《开发框架最终细节 V2.0 五大模块版》与当前代码库（Sprint R10 止）的差距清单。
> 用途：决定后续 Sprint 范围与优先级；每期收口时更新。
> 命名说明：蓝图规划包名（pkg-genealogy/pkg-archive/…）与当前库（pkg-family/pkg-growth）存在结构差异——**功能对齐优先，包重组在 MVP 收口期统一执行**。

## 一、云函数层（蓝图 23 vs 当前 15）

| 蓝图函数 | 当前状态 | 差距与动作 |
|---|---|---|
| auth | ✅ 已实现（登录/认证/角色） | V1.1 补：密码体系（passwordHash/reversePasswordHash/delegates/assistReset/短信验证码） |
| member | ✅ tree/getDetail/search/export/exportFile/applyAuth/listMyAuth/reviewAuth | getDetail 已有 hiddenFields（对齐蓝图字段级过滤）；补 aliases/deeds/sourceTags 等字段投影 |
| relation | ✅ 称谓/五服/挂接校验 | **R11 重写完成**：calc 用物化路径+kindship 纯函数（修复遗留桩 ReferenceError）；L2 门禁；方言称谓 settings 表待 E4 |
| entry | ✅ 智能入谱双人审核 | 补 OCR/Excel 入口（photo_ai/EXCEL type 已留）；公示期 publicityDeadline 流转 |
| doc | ✅ 上传/检索 | 补批注/ocrText 全文索引 |
| event | ✅ 大事记/口述历史门禁 | ✅ 基本对齐 |
| ceremony | ✅ 祭祀/献花 | 补忌日定时扫描（remindScan 定时触发器） |
| points | ✅ 四池积分+幂等 | ✅ 对齐 7.5 |
| task | ✅ 成长任务/打卡 | ✅ 对齐 |
| notify | ✅ list/read/digest/broadcast | ✅ R10 已打通 member→notifications 站内联动；补订阅消息/公众号兜底通道 |
| upload | ✅ 场景化上传策略 | V1.1 补 CI 压缩/WEBP 转码/懒加载多档尺寸参数 |
| admin | ✅ 审计/公示封存/featureFlag | **R11 加固完成**：auditList HISTORIAN+ 鉴权（越权漏洞封堵）/统一响应/db.command 日期/分页 50；对齐 17.1–17.2 |

## 二·五、Sprint R11 新增（蓝图对齐增量）

- **plaza 云函数 ✅（16/23）**：list/publish/like 基础版（蓝图集合 13 plaza_posts 消费方补齐）；V2.0 moment 迁移路径已按 C.1 规划
- **称谓计算页 ✅**：pkg-family/pages/kinship/kinship.vue（蓝图页面 relation/calc）——成员搜索选择 + 称谓/五服结果卡 + 五服色带；页面 ~21/82
- **审计口径统一 ✅**：audit_logs 集合名分裂修复（member 2 处）；writeAudit 字段统一 {userId,action,target,detail,ip,sensitive,time}

## 二·六、Sprint R12 新增（R11 承诺兑现）

- **points 大修 ✅（蓝图 7.5）**：封堵自刷分漏洞（award EDITOR+ 门禁）；修复 _.inc/generateObjectId/无账户 undefined 三处必崩缺陷；幂等键 bizType+bizId；新增流水 list action；targetUserId 代发
- **广场动态页 ✅**：pkg-family/pages/plaza/plaza.vue（发布框+动态流+点赞乐观更新）；~24/82
- **积分中心页 ✅**：pkg-growth/pages/points/points.vue（四池余额+流水分页）
- **功能开关面板 ✅**：pkg-growth/pages/flags/flags.vue（CHIEF 专属，15 键中文标签，对接 17.2）
| atmosphere | ✅ today 聚合（节气/氛围/卡流/白事素色） | 补四季渐变全量端点色表；festival 字段对接年历（P1） |
| profile/album/weather/calendar（V1.1） | ❌ 未建 | **E1–E4 范围**，前置依赖 CI/MPS/和风天气开通 |
| content/news/moment/game/home/secscan（V2.0） | ❌ 未建 | **F1–F10 范围**；F1 先做 secscan 与 plaza→family_moments 迁移脚本 |

---

## P3 冲刺（蓝图第三部分 §7.1–§7.11）核心算法增强收口

> 基线：npm run verify 全绿（test=315 / lint 0E / 25 云函数 / lunar-javascript 已装）。审计底稿：`docs/planning/P3-audit-consolidated.md`。

| 条款 | 状态 | 交付与备注 |
| --- | --- | --- |
| §7.1 树布局 | ✅ 算法层交付 | `utils/family-tree-layout.js` + 16 用例（世代行/父子居中/birthOrder/家庭单元/直系/时间轴/五服色板）；Canvas 页集成待 P1 |
| §7.2 称谓矩阵 | ✅ 物化路径实现（修复 seniority 缺陷） | `relation.calc` 同代按 birthOrder/birthDate 判定 elder/younger（向后兼容默认 elder） |
| §7.2 SPOUSE 姻亲 | ✅ 已交付 | `relation.calc` 无血亲共同祖先时经 SPOUSE 边双桥解析（A 血亲 X 之配偶 B / A 的配偶 X 之血亲 B），17 种姻亲称谓 + 7 单测 `tests/relation-spouse.test.js` |
| §7.2 方言覆盖 | ⏳ 待 P1 | settings.kindshipDialect 配置表 |
| §7.3 五服 | ✅ fiveFu(n) 阈值正确；着色待 Canvas 层接入 | 五色映射已在 layout 模块 WU_FU_COLORS |
| §7.4 隐私中间件 | ✅ 全覆盖审计通过 | common/privacy.js + writeAudit + needAuthCard 路由；需逐 action 复核（P1 复查清单） |
| §7.5 积分幂等 | ✅ R12 大修完成 | EDITOR+ 门禁/幂等键查重/流水先插/账户 atom/inc/重复返回已有 delta |
| §7.6 入谱挂接 | ✅ FINALIZE 入库路径闭环；公示期待 E4 | entry.RECORDS/FIRST_PASS/SECOND_PASS/APPROVED → finalizeApprovedMember 写入 path/generation/branchId |
| §7.7 谱名冲突检测 | ✅ 提交命中统计随单返回 | `entry.submit` conflict/conflictCount/hint 供族史委裁决 |
| §7.8 氛围引擎 | ✅ today MVP 可用 | solarTerm/moodTheme/greeting/homeCards；MUTED_THEME 白事静默生效 |
| §7.9 通知编排 | ✅ 站内通知联动成员授权 | ceremony.remindScan（每日 6:00 timer 触发器已配）；订阅消息/公众号通道待 P1 |
| §7.10 云迁移预案 | ✅ 文档与转发层骨架交付 | `MIGRATION-CLOUD-TO-SELF.md` + `common/gateway.js`（trigger 条件：10 万用户或费用比） |
| §7.11 老皇历引擎 | ✅ lunar-javascript@^1.6.12 已装 | detect() 三档回退（lunar-javascript/cache/none）；公式干支/节气近似精度可接受 |

### P3 遗留优先级（进入 V2.0 Sprint F1–F3）
- **P0**：七项 P0（布局 Canvas 集成/隐私审查/事务口径文档/忌日定时/迁移触发配置/lunar 完整数据接入）按实际部署窗口排期；
- **P1**：姻亲规则/方言/公示期/五服着色/24 节气渐变全量卡流。


## 二、数据库层（蓝图 42 vs 当前已用 ~20）

- 已建：users/members/relations/entry_records/documents/media/events/worship_logs/ceremonies/notifications/points_*/tasks/task_records/audit_logs/authorizations/settings/auth_requests(扩展)/plaza_posts/calendar_items/chat_groups
- V1.1 缺 9：avatars / intro_videos / albums / album_photos / photo_tags / greeting_cards / family_mottos / generation_poems / time_capsules（+weather_cities/almanac_ext）
- V2.0 缺 12：见蓝图 9.1（local_contents…home_worlds）
- 动作：users 补 schemaVersion=2 与 V1.1 字段（passwordHash 等留空默认值），迁移脚本 migrations/v1_to_v2.js 随 E1 交付

## 三、页面层（蓝图 82 vs 当前 ~20）

- 主包：index（✅ 按第〇部分：晨光渐变/要事卡流/速览已有基础）/ mine（✅）/ login（✅）/ search（✅ 两态空态）/ privacy（✅ R7/R10 申请+列表）——蓝图 xuemap/clanaffairs/familypark 三 Tab ❌
- 族谱/谱库：tree/members/detail（✅ 含受限遮罩）/称谓计算 ❌ / relationeditor ❌ / lifebook ❌ / smartentry ❌ / audit/detail（pkg-growth/audit ✅）
- 互动/日历/祭祀/积分包：聊天 ❌ / 广场 ❌ / 日历 ❌ / 老皇历 ❌ / shrine ❌ / hero ❌ / history ❌ / points ❌ / growth ❌
- V1.1 个人包 8 页 ❌；V2.0 内容/资讯/动态/娱乐/家园 29 页 ❌

## 四、已对齐的蓝图关键机制（可直接标注达标）

| 蓝图条款 | 现状 |
|---|---|
| 6.2 隐私中间件（4 步：取角色→分级判定→403+授权路由→审计） | ✅ 全函数走 privacyCheck + writeAudit；needAuthCard 路由 R7 闭环 |
| 7.4 privacyCheck 纯函数 | ✅ R1 实现并单测 |
| 7.5 积分幂等（流水先插+幂等键） | ✅ R3/R5 实现 |
| 7.8 节气氛围（moodTheme/白事素色/homeCards） | ✅ atmosphere.today 已接首页 |
| 7.9 通知编排（站内=写 notifications） | ✅ R10 授权审批联动打通 |
| 17.2 功能开关 | ✅ admin.featureFlag + settings 已具备 |
| 24.1 三级可见性（PRIVATE/PUBLIC/GROUP） | 🔶 L 级体系已并行，V1.1 visibilityCheck 扩展待 E1 |
| 26.3 审计 ≥1 年 | ✅ audit_logs 已全量写入 |

## 五、风险与依赖（开发前需用户侧拍板/开通）

| 依赖 | 影响范围 | 建议 |
|---|---|---|
| 微信小程序 appid + 云环境号 | 全部真机联调（连续 10 轮阻塞） | 尽快提供开发者工具环境 |
| 腾讯云 IM / OCR / CI / MPS / 短信 / 和风天气 开通 | W8 互动、E1–E4 | MVP W7 前完成 IM/OCR；E1 前完成其余 |
| 新闻数据源签约（聚合/天行/拓尔思/RSS） | V2.0 模块二 F3 | F1 前选定 2 家主力源 |
| 版号/资质结论（附录 C） | V2.0 模块四 | 已按 9.0.2 替代路径规避，无阻塞 |

## 六、建议路线（后续 Sprint 对齐蓝图排期）

1. **R11–R12（MVP 收口轨）**：称谓计算页 / 广场+聊天（IM 前端壳）/ 日历页 / points/growth 页 / 谱库页——补齐 MVP 页面清单；包名重组对齐蓝图 3.2
2. **E1–E6（V1.1 轨，按蓝图 26.6）**：需 CI/MPS/短信/天气开通后启动；E1 先交付三级可见性中间件 + users schemaVersion 迁移
3. **F1–F10（V2.0 轨）**：F1 secscan + plaza 迁移先行（无外部依赖，可提前）；模块二/四严格按 9.0 合规边界

## 二·七 R13（Sprint R13 · 祭祀/氛围/积分联动收口）

| 蓝图条目 | 状态 | 差距说明 |
|---|---|---|
| 9.1 ceremony.worship（MEMBER） | ✅ | 门禁+白名单+灵位校验+积分幂等（遗留桩五处不可运行缺陷清零） |
| 5.6 worship_logs / 11 点灯交互 | ✅ | 祭记每次记+计数原子+1；长按祝福语（前端）；音效/粒子入 P1 打磨 |
| 9.1 atmosphere.today（公开） | ✅ | 24 节气年度近似表+四季端点色+白事静默；**24 节气全量图氛围 P1**（蓝图为四季版 MVP） |
| 7.8 moodTheme/homeCards | ◐ | moodTheme 全量；homeCards 占位空数组——R14 接 notify.digest 真卡流 |
| 7.9 忌日提醒（定时器扫描） | ◐ | remindScan 站内通知已通；**订阅消息推送需用户开通**；家族级提醒分发 R14 |
| 9.1 task.today/checkin（MEMBER） | ✅ | 后端早已就绪；积分联动修复（callFunction→common/points） |
| 8.0 task/index 打卡页 | ⏳ | R14 前端（pkg-growth task 页） |
| 0.3.2 首页卡流 | ⏳ | 依赖 notify.digest（R14） |
| V1.1 老皇历（calendar.almanac） | ⏳ | 日历页已留切换位（v11Almanac），E4 交付 lunar 引擎 |
| 真机性能实测（1.4 验收底线） | ⏳ | 连续 13 轮阻塞：等待微信开发者工具环境 |

## 二·八 R14（Sprint R14 · 通知卡流/打卡闭环/史记时间轴）

| 蓝图条目 | 状态 | 差距说明 |
|---|---|---|
| 0.3.2 首页卡流（四级权重+祖训兜底） | ✅ | common/homecards 单一实现；notify.digest 与 atmosphere.homeCards 同口径；朱砂仪式卡 accent 下发 |
| 0.3.3 首屏不空（祖训今日降级） | ✅ | settings.daily_motto 可配 + 默认祖训 |
| 0.6.3 首页三聚合接口 | ◐ | atmosphere.today + notify.digest 双通；**weather.current 为 V1.1（E3）** |
| 7.9 notify.dispatch 站内通知 | ✅ | list 合并个人+广播；markRead 越权封堵；订阅消息推送留接口（模板未配置跳过） |
| 9.1 notify.digest/list（本人） | ✅ | 未登录 403；他人通知隔离 |
| 8.0 task.today/checkin 打卡页 | ✅ | pkg-growth/pages/task/task.vue；积分 toast 反馈接 R13 common/points 闭环 |
| 8.0 history 史记时间轴页 | ✅ | pkg-shrine/pages/history/history.vue（年份分组+筛选+行内展开）；发布侧 event.create 已有（HISTORIAN） |
| 0.3.2 ④ 家族速览卡真数据 | ⏳ | member.stats 聚合未排期（R15 评估）；前端仍占位「—」 |
| 0.2.1 天气小件 | ⏳ | V1.1 E3 weather.current；index.vue 已留 weather 字段位 |
| 广播 per-user 已读回执 | ⏳ | V1.1（个人通知已按本人隔离，广播共享态如实登记） |
| 真机性能实测（1.4 验收底线） | ⏳ | 连续 14 轮阻塞：等待微信开发者工具环境 |

## 二·九 R15（Sprint R15 · 家族速览真数据/点灯打磨/英烈献花）

| 蓝图条目 | 状态 | 差距说明 |
|---|---|---|
| 0.3.2 ④ 家族速览卡 | ✅ | member.stats 四指标真数据；前端 5min 缓存，未认证占位不阻塞 |
| 0.3.2 首页四区还原 | ✅ | 问候区/快捷条/要事卡流/速览全真数据（天气小件 V1.1 除外） |
| 11 点灯交互定案 | ◐ | 长按祝福语/轻震/合拜/粒子 ✅；**音效待 <100KB 切图资源**（如实登记不伪造） |
| 6.3 访客仅可浏览英烈（L1） | ✅ | member.heroList 公开无门禁 + 字段白名单；献花操作仍 MEMBER+ |
| 8.0 hero/index 英烈名录 | ✅ | hero.vue 名录+献花+花瓣粒子；isHero/heroNote 为 GAP 登记 schema 增量 |
| 英名录 admin 录入通道 | ⏳ | R16：admin 增 heroTag 设置或 entry 流转 |
| 8.0 relationeditor 关系编辑页 | ⏳ | R16（族谱核心最后缺口；relation.edit 后端已有） |
| 8.0 lifebook 传记查看页 | ⏳ | R16 |
| 真机性能实测（1.4 验收底线） | ⏳ | 连续 15 轮阻塞：等待微信开发者工具环境 |

## 二·十 R16（Sprint R16 · 关系编辑页 / 传记查看页 / 英名录录入通道）

| 蓝图条目 | 状态 | 差距说明 |
|---|---|---|
| 9.1 relation.edit 关系变更 | ✅ | 工单制落地（entry_records type=CHANGE 双人审核链），类型白名单/自环/重复/404 校验齐 |
| 7.7 修谱变更流程 | ✅ | 编辑不可直改 relations，走工单 → 审核通过后生效 |
| 8.0 relationeditor 关系编辑页 | ✅ | L4 表单（成员编号+类型 picker+subType+备注）+ 工单提交反馈 |
| 8.0 lifebook 传记查看页 | ✅ | 生平时间线 + deeds 善行事迹 + motto 家训 + heroNote 英烈事迹 |
| 6.3 英名录 admin 录入通道 | ✅ | admin.heroTag（HISTORIAN+，members.isHero/heroNote + audit）配 R15 heroList 闭环 |
| 5.2 members.getDetail 传记字段 | ✅ | PUBLIC 组增 deeds/motto/heroNote（蓝图 5.2 德行公开） |
| 审核工作台 UI（初审/复审/公示页） | ⏳ | R17：entry.audit 工单审核 UI + APPROVED 后 relation 生效逻辑 |
| tree/members 跳转入口 | ⏳ | R17：人物详情/家族群加「申请关系变更」按钮 |
| 真机性能实测（1.4 验收底线） | ⏳ | 连续 16 轮阻塞：等待微信开发者工具环境 |

## 二·十一 R17（Sprint R17 · 双人审核闭环：entry.audit 升级 + relations 生效 + 详情页入口）

| 蓝图条目 | 状态 | 差距说明 |
|---|---|---|
| 7.6 双人审核链（分级门禁） | ✅ | 初审 BRANCH_HEAD+（支系）/ 复审 HISTORIAN+（族史委 2 人）/ 自审禁 / 双人≠，测试全覆盖 |
| 7.7 修谱变更 APPROVED 后生效 | ✅ | CHANGE(RELATION) 工单复审通过 → relations 落库（verifiedBy 双人 + sourceRecordId 回溯 + 防重复 ACTIVE） |
| 11 驳回必填意见 | ✅ | REJECT 无 comment → 400 |
| 详情页操作入口 | ✅ | memberDetail 管理操作卡 → relationeditor（memberId 预填）/ lifebook |
| 7.6 公示期 PUBLICITY 状态 | ◐ | MVP 口径 SECOND_PASS 直 APPROVED；完整链（公示 7 天）GAP 登记 V1.1 补 |
| 审核工作台前端 UI | ⏳ | R18：pkg-growth/audit 接 mySubmissions + 初审/复审/驳回操作 |
| 8.0 hero/detail 英烈事迹页 | ⏳ | R18 |
| 真机性能实测（1.4 验收底线） | ⏳ | 连续 17 轮阻塞：等待微信开发者工具环境 |

## 二·十二 R18（Sprint R18 · 审核工作台前端 + 聚合搜索 + 英烈事迹详情）

| 蓝图条目 | 状态 | 差距说明 |
|---|---|---|
| 7.6 审核工作台前端 | ✅ | audit 页接 pendingList；canFirstPass/canSecondPass 角色化按钮；REJECT 必填弹窗（蓝图 11） |
| 9.1 member.search | ✅ | MEMBER+；谱名/本名模糊；白名单分页 20 |
| 8.0 hero/detail | ✅ | 牌位卡+献花（ceremony.worship 复用）+事迹时间线+家训金匾；留言板占位 |
| 8.0 hero 留言板 | ⏳ | R19 方案设计（内容审核接入点 + 频控，安全合规前置） |
| member.search 万级扩展 | ⏳ | LIMIT 500 内存过滤；万级需 db.RegExp/拼音索引——V2.0 |
| 8.0 hero/index → detail 贯通 | ⏳ | R19：heroList 卡片跳详情 |
| 真机性能实测（1.4 验收底线） | ⏳ | 连续 18 轮阻塞：等待微信开发者工具环境 |

## 二·十三 R19（Sprint R19 · V2.0 蓝图基线切换 + V1.1 启动轨）

| 蓝图条目 | 状态 | 差距说明 |
|---|---|---|
| V2.0 蓝图入库 | ✅ | BLUEPRINT-V2.0-INDEX.md（42 集合/23 云函数/82 页/合规红线附录 C）+ feature-flags.ts 前端开关表 |
| 8.0 hero/index → detail 贯通 | ✅ | hero.vue 卡片 @tap goDetail |
| 8.0 memberDetail 英烈入口 | ✅ | isHeroMember computed（DECEASED+isHero）+ hero-entry 卡 |
| V1.1 E1 featureFlag | ✅ | admin.featureFlag/getFeatureFlags（用户已建）+ R19 集成测试 ×3 |
| V1.1 E1 visibilityCheck | ✅ | common/privacy.js（用户已建）+ R19 烟囱测试 |
| V1.1 E1 profile.saveAvatar | ✅ | 云函数骨架（门禁+可见性+audit），CI 占位 R20 接入 |
| V1.1 22.1 CI 数据万象接入 | ⏳ | R20：真实 ImageProcessJob → WEBP/缩略图 |
| V1.1 22.2 介绍视频 MPS | ⏳ | E2：R20/R21 |
| V1.1 22.3 多级相册 | ⏳ | E2：album.uploadBatch ≤20 张 |
| 8.0 hero 留言板 | ⏳ | R20 方案设计（secscan + 频控） |
| 真机性能实测（1.4 验收底线） | ⏳ | 连续 19 轮阻塞：等待微信开发者工具环境 |

## 二·十四 R20（Sprint R20 · V1.1 E2 · CI/MPS 接入 + 留言板方案）

| 蓝图条目 | 状态 | 差距说明 |
|---|---|---|
| V1.1 22.1 CI 数据万象接入 | ✅ | upload.triggerCi + profile.saveAvatar 调用链（占位降级就绪） |
| V1.1 22.2 介绍视频 MPS | 🔶 | upload.triggerMps 骨架（≤60s 校验）；真实云函数 R21 部署 |
| V1.1 22.3 多级相册 | ⏳ | R21：album.save/uploadBatch/tag（≤20 张批量） |
| 蓝图 8.0 hero 留言板 | 🔶 | content.sendMessage 骨架（频控+audit+secscan 占位）；前端 UI + secscan 真实接入 R21 |
| profile.updateIntro | ✅ | greeting ≤200 字 + 门禁 + audit |
| profile.updateFamilyInfo | ✅ | 家训 ≤500 字 + 字辈 ≤3 字 + settings upsert + audit |
| 真机性能实测（1.4 验收底线） | ⏳ | 连续 20 轮阻塞：等待微信开发者工具环境 |

## 三·九、Sprint R19–R25 收口（V1.1 全部 13 项增强 + V2.0 F1 地基）

> 本节更新截至 R25 的实际状态，覆盖前述「二·七 R13」遗留的 V1.1 项与顶层差距表。
> 运行：`npm run verify`（241 用例全绿）、lint 0E、check-functions 通过；每次 Sprint 均 git commit。

| 蓝图条目 | 状态 | 交付说明 |
|---|---|---|
| V1.1 E1 认证增强（passwordHash/delegates/assistReset/短信） | ◐→✅(地基) | **R23**：setDelegates(≤3 名+smsCode)/revokeDelegate/setReversePassword/verifyReverse(300s 令牌)；assistReset 与真实短信通道部署项 |
| V1.1 E2 影音相册增强（CI/MPS/相册/留言板） | ◐→✅(地基) | **R21/R22**：ci/mps/secscan 三云函数+album(多级/批量/可见性)+hero 留言板 UI+content.listMessages |
| V1.1 E3 天气与问候（weather/greeting_cards） | ⏳→✅(地基) | **R22**：weather.current/switchCity(3h 缓存)+greeting.save/list(5 模板+定时) |
| V1.1 E4 老皇历与氛围（calendar.almanac/lunar 1900-2100） | ⏳→✅(骨架+公式) | **R24**：calendar.almanac(干支/生肖/24 节气公式+宜忌规则+almanacExt 定制)；lunar-javascript 部署接入点 lunar-placeholder |
| V1.1 真机性能实测（1.4 验收底线） | ⏳ 持续阻塞 | 等待微信开发者工具/真机环境（项目根 README 已列实测清单） |
| V2.0 F1 合规签字（secscan/plaza 迁移/合规签字） | ❌→✅(地基) | **R21/R25**：secscan(敏感词+msgSecCheck 占位)、scripts/migrate-plaza.js、content.compliance.sign/list、compliance_signs schema |
| V2.0 F1 本地内容骨架 | ❌→✅(地基) | **R25**：content.article.save/list（type article/story、DRAFT）、local_contents schema |
| 顶部差距表「profile/album/weather/calendar 未建」 | ✅ | 本轮全部新建（profile 骨架 R19、album R21、weather R22、calendar R24） |

### 待办（非阻塞 · 部署期）
1. 和风天气 API_KEY / 腾讯云短信 / msgSecCheck / 数据万象密钥：全部占位就绪，部署时填真实密钥
2. lunar-javascript 安装（npm i lunar-javascript）→ 替换 calendar lunar-placeholder → 1900-2100 全量
3. album 断点续传 / 大文件分片（R26 性能收口项）
4. 真机性能与首屏白屏实测（验收底线 1.4）
