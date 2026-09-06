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
| atmosphere | ✅ today 聚合（节气/氛围/卡流/白事素色） | 补四季渐变全量端点色表 |
| profile/album/weather/calendar（V1.1） | ❌ 未建 | **E1–E4 范围**，前置依赖 CI/MPS/和风天气开通 |
| content/news/moment/game/home/secscan（V2.0） | ❌ 未建 | **F1–F10 范围**；F1 先做 secscan 与 plaza→family_moments 迁移脚本 |

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
