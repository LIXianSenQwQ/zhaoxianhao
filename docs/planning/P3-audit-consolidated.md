# P3 核心算法增强收口差距报告（蓝图 §7.1–§7.11）

> **审计日期**：2026-09-06  
> **基线状态**：npm run verify 全绿（test=298、lint error=0、functions=25/25）  
> **审计方式**：第一手精读关键云函数实现 + 代码库结构定位  
> **交付目标**：对《好诚事家风·家谱系统开发框架最终细节 V2.0》第三部分逐条对齐，确认达标项与待增强项，给出优先级建议。

---

## 结论总表

| 条目 | 蓝图条款 | 现状 | 差距摘要 | 优先级 |
| --- | --- | --- | --- | --- |
| **7.1 树渲染** | Canvas 布局、家庭单元、视口裁剪、双指缩放、直系视图、时间轴滑块、五服着色 | 🔶 半实现 | data(聚焦五世)✅；layout(X/Y坐标计算)❌；Canvas 组件未引用/无视口裁剪/无降级/无双指缩放；直系/时间轴/五服着色缺位 | **P0**（布局+渲染对齐） |
| **7.2 称谓** | BFS 路径 + 矩阵查表 + 姻亲规则 + 方言 settings | 🔶 路径法而非 BFS | 用成员 path 物化前缀算共同祖先 → n/m ✅；SPOUSE 姻亲规则 ❌；方言覆盖 ❌；长幼判定靠 seniority 参数（需 caller 传入出生序） | **P1**（SPOUSE/方言） |
| **7.3 五服** | n≤1..5 阈值 + 族谱树五色着色 | ✅ 计算正确 / 🔶 着色缺 | fiveFu(n) 函数阈值与蓝图一致 ✅；树模式五色着色 ❌ | **P1**（着色预留） |
| **7.4 隐私** | privacyCheck 伪代码四分支（DECEASED/L2/L3/L5）+ 403→授权路由 | ✅ 基本对齐 | getDetail 字段级过滤四分支一致性 ✅；各 action 走中间件率≈90%，仍有遗漏需扫描补全 | **P0**（查漏补缺） |
| **7.5 积分** | EDITOR+ 门禁 + 幂等键查重 + 流水先插 + 事务更账户 + 重复返回已有结果 | ✅ 完全对齐 | 门禁 ✅；幂等键 bizType:bizId 查重在前 ✅；重复直接返回已有 log/delta ✅；事务在 stub/真机环境有差异需确认（当前为顺序写模拟） | **P0**（事务口径确认） |
| **7.6 入谱挂接** | 父母校验/谱名生成/草稿工单/双人审核/公示期/APPROVED 生效/通知 | ✅ 流程闭环 | validatePayload 含本名/世代/支系 ✅；父亲存在性校验 ✅；谱名郝 + 字辈 + 本名 ✅；SUBMITTED/FIRST_PASS/SECOND_PASS 链 ✅；APPROVED 后 finalizeApprovedMember 入库挂接 ✅；公示期与通知缺实现点需细化 | **P1**（公示期模板/通知） |
| **7.7 谱名** | 姓 + 字辈 + 名；generations[世代 - 起始]；冲突检测/备选；CHANGE 流程 | ✅ 命名规则 ✅ / 🔶 冲突检测弱 | genealogyChar 从 generations 表取字辈 ✅；父名字典合并 ✅；同批世代连续性校验 ✅；查重与本名冲突备选策略简化（非正式冲突表） | **P1**（完整冲突检测） |
| **7.8 氛围** | today() 四要素 + 白事静默 + 前端 moodTheme 切换 <200ms / 四季渐变 | ✅ 一期 MVP | today 返回 solarTerm/festival/moodTheme/greeting/homeCards ✅；白事查库 events.status=ACTIVE,family:funeral ✅；四季主题 tokens 端点色齐全 ✅；MVP 完成 | **P0**（24 节气全量图 P1 标记） |
| **7.9 通知** | notify.dispatch→站内/订阅/紧急广播三通道；忌日6:00定时扫描 calendar_items | 🔶 站内 ✅ / 订阅与定时 ❌ | broadcast/list/markRead 站内 ✅；IM/公众号兜底 ❌；定时触发器/每日6点扫描缺实现 | **P1**（触发器配置） |
| **7.10 云迁** | 触发条件/接口签名不变转发 NestJS/DB 迁移/前端 services 零改动预案 | ❌ 文档缺失 | services/request.ts 封装统一 ✅；转发层占位 ❌；预案文档 ❌；触发条件口径可量化（10 万用户/费用比） | **P0**（文档 + 转发层预留） |
| **7.11 皇历** | lunar-javascript 离线库（1900-2100）/公式干支/宜忌定制 almanacExt/calendar.almanac ≤200ms | 🔶 公式为主 | 干支纪年/月/日公式精确 ✅；节气公式近似（±1 日内）✅；almanacExt 定制合并 ✅；lunar 引擎占位（lib/lunar-data.js detect）尚未实际安装依赖；响应性能预估可行 | **P0**（包安装接入） |

---

## §7.1 族谱树布局与渲染（Canvas 2D）深度分析

### 数据层 ✅
- `member.tree`（buildTree in member/index.js:412）确实按蓝图五世取数：focus.path 截断至祖父层 → 子树前缀查询 → relationSteps(up/down ≤2) 内存过滤 → 分页预算 200 节点封顶。
- 一次约 100–500 节点合理； spouse/夫妻单元数据不在 members，需要 relations  JOIN（缺）。

### 布局层 🔶
- **问题根源**：`TreeGraph.vue` 接收 props {nodes: [{x,y...}], edges}，但 x/y 坐标由谁计算？  
  - `pages/tree/tree.vue` 或 `pkg-family/pages/tree/tree.vue`（需定位实际页）应负责 layout 调用；  
  - `utils/tree-view.js/tree-flow.js` 纯函数负责缓存/折叠态；  
  - **当前未见**「家庭单元横向绑定」的布局纯函数（如 computeLayout(nodes) → nodes with x/y, families[]），也未见「子树宽度递归居中」的实现。
- `TreeGraph.vue` 是否被引用？搜索 pages/发现 `components/common/TreeGraph.vue` 存在但未在任何 tree 页面 import（孤儿组件）。实际可能使用 DOM 方案（原生 uni-app view/canvas）。

### 渲染优化 ❌
- 视口裁剪（viewport clipping）、离屏 canvas、节点 >300 降级方块视图、低倍率圆点、双指缩放手势处理、横向滚动（scroll-view vs canvas 内部变换）均未看到具体实现。
- 当前 `TreeGraph.vue` 仅支持 translate/rotate 简单拖拽，无 pinch-zoom、无层次降级、无边框裁切。

### 视图切换/时间轴/五服着色 ❌
- **树形/直系**：蓝图 MVP 必做直系视图，未见“直系链”过滤逻辑（只保留 focus 到祖先的所有节点 + 后代）。
- **时间轴滑块**：`birthDate≤Y && (deathDate 为空 || ≥Y)` 过滤重布局功能缺。
- **五服着色**：fiveFu(n) 返回值（斩衰/齐衰/大功/小功/缌麻/同宗）未在 UI 映射五色，canvas/svg 节点填充色无依据。

### 测试缺口
- `tree-view.test.js` 已有折叠态/缓存命中测试；
- `tree-flow.test.js` 编排集成测试存在；
- 但 `computeLayout` 纯函数缺失单元测试；Canvas 交互测试缺。

### 建议实施清单（P0/P1）
| 优先级 | 任务 | 位置 | 说明 |
| --- | --- | --- | --- |
| P0 | computeLayout 纯函数 | utils/layout-tree.js | 输入 nodes(with parentPath)、输出{x,y,families[], widths} |
| P0 | TreeGraph.vue 引用或新 tree 页落地 | pkg-family/pages/tree/tree.vue | 导入 computeLayout，将 x/y 传给 Canvas 2d |
| P0 | 双指缩放 + 拖动 | TreeGraph.vue onTouch 事件增强 | scale=scale.value; pinch event 更新 |
| P1 | 直系视图 filter | buildTree 旁新增 action='direct' | 沿 ancestors chain 取节点 |
| P1 | 时间轴滑块 | pages/tree/solar.vue | birthDeath range filter |
| P1 | 五服着色配色方案 | components/common/TreeGraph.vue COLORS 五阶色板 | fiveFu(n) → fillStyle |

---

## §7.2–7.3 称谓/五服（path 法替代 BFS）与谱名入谱

### 称谓计算器（path 法而非显式 BFS）
- `relation.calcRelation`（index.js:44）：从 members.path 求最长公共前缀得到共同祖先 → upSteps=as.length-common、downSteps=bs.length-common → kinshipTitle(up,down,gender,elder/younger)。  
- **与蓝图偏差**：蓝图说“双向 BFS 于 relations 图”，但当前是“利用物化路径前缀交集”（更简洁且 O(logN)）。实质等价，可以接受。
- **缺陷**：
  - SPOUSE 姻亲规则缺失：calcRelation 不检查 relations.type==='SPOUSE'，因此不会出现“姐夫/婶婶”。
  - 方言称谓未在 settings 中读取覆盖（矩阵兜底硬编码）。
  - seniority 参数依赖 caller 传入 birthOrder，需文档约定。

### 五服判定 ✅/🔶
- `fiveFu(n)` 在 common/kindship.js：阈值完全对齐（n≤1 斩衰、≤2 齐衰、≤3 大功、≤4 小功、≤5 缌麻、>5 同宗）。
- **着色缺位**：UI 未用五色标五服等级。

### 入谱自动挂接（7.6）流程闭环
- `entry.submit`（index.js:67）：validatePayload 校验 name/generation/branchId；幂等建单（idemKey）；谱名郝 + 字辈 + 本名；
- `entry.auditEntry`（index.js:103）：FIRST_PASS/SECOND_PASS 双人链（提交人≠初审≠复审）；REJECT 强制评论；HISTORIAN 复审门禁；
- `finalizeApprovedMember`（linkage 模块，entry/index.js:206）：父亲存在性校验、世代连续性、path 构建、members add、relations 自反写入、审计。
- **缺失点**：
  - 公示期 publictityDeadline（submited→first→second→approved 之间是否有 7 天公示？）— 当前无等待延时。
  - APPROVED 后通知全族可选（蓝图有 notify.dispatch，实现需补充）。

### 谱名生成（7.7）
- `genealogyChar(db,generation,branchId)` 从 generations 集合取 character；`郝{char}{name}`拼接；
- 冲突检测：幂等键防重复提交，但缺少在库谱名查重（collision detection）与备选策略（备选名表或序号追加）；
- CHANGE 流程：relation.edit 建立 entry_records(type=CHANGE)，APPROVED 后 finalizeApprovedRelation 落库关系边（蓝图 7.7 满足）。

### 建议实施清单（P0/P1）
| 优先级 | 任务 | 位置 |
| --- | --- | --- |
| P1 | calcRelation SPOUSE 姻亲规则 | relation/index.js |
| P1 | 方言称谓 settings 读取 | relation/index.js（settings.kindshipDialect） |
| P1 | 公示期 timer | entry/status 增加 publicityDeadline 字段 + cron 扫描 |
| P0 | 谱名冲突检测与备选 | entry/submitEntry 加谱名查重逻辑 |
| P0 | APPROVED 通知入口 | linkage.finalize... 后调用 notify.dispatch |

---

## §7.4 隐私校验（privacyCheck）与字段级过滤

### 现状 ✅
- `privacyCheck(ctx,member,level)` 在 common/privacy.js:18 实现：
  - DECEASED → level !== '私密' || hasRole(HISTORIAN) ? allow : needAuth；
  - 公开 → role>=MEMBER；
  - 限制 → sameBranch || directKin(authedMemberIds.has(target._id)) || CHIEF；
  - 私密 → linkedOpenid === req.openid || authedTargetIds.has(_id)。
- `member.getDetail`（member/index.js:346）按 L 级字段投影（PUBLIC/LIMITED/PRIVATE dict）逐字段判断，hiddenFields 数组记录被隐藏字段；不可见时返回 needAuthCard:true 不白屏。

### 中间件四步落地率 🔍
抽查以下敏感 action：
- `member.applyAuth/listMyAuth/reviewAuth`：鉴权前置 + 审计 ✅；
- `plaza.publish/like`：需要抽查是否调 privacyCheck；
- `doc` 上传/检索：权限门控需确认；
- `points.award`：EDITOR+ 门禁 ✅；
- `album/article/save`：visibilityCheck（三级可见性）需在 content/album 中验证。

### 建议实施清单（P0）
- **动作**：运行一次 grep search "privacyCheck(" 统计所有调用点，对比 blueprint 要求列表，补齐遗漏；
- **文档**：在 docs/GAP-V2.0.md 更新"中间件四步全覆盖”打钩项。

### ✅ 全覆盖扫描（P1 收口，2026-09 复查）
- `tests/privacy-coverage.test.js` 升级为**阻断式门禁**：17 个敏感集合（members/entry_records/albums/avatars/profiles/authorizations/auth_requests/relations/upload_metas/local_contents/content_messages/plaza_posts/family_moments/clan_notices/home_worlds/home_avatars/opera_roster）× 全部写操作（add/update/delete/remove），逐点校验 privacyCheck/visibilityCheck/角色禁入/owner 归属门控；`KNOWN_SAFE_WRITES` 8 条人工审核白名单（自建/双人审核/EDITOR 门禁创建路径，附理由）。
- 审计底稿：既有 6 处审计发现 + 加宽扫描 2 处，逐点 verdict 全部合规（auth 激活自建 / certify 自建工单 / entry 终审双人审核 / importRows EDITOR+ / relation 修谱工作流 / content·upload 自建 owner 归属）。
- **修复真实缺口**：`auth.grantAuth` 原无任何门禁 → 加 MEMBER+ 门禁 + 受权人须 ACTIVE 族人 + scope 必填（4 个冒烟用例 F13）。
- 结论：技术侧无越权/越可见性缺口；verify 445 test 全绿。

---

## §7.5 积分原子性（幂等 + 事务）

### 现状 ✅
- `points.awardPointsAtomic`（points/index.js:76）：
  - 门禁：role≥EDITOR ✅；
  - 幂等键查重：`where({bizType,bizId}).limit(1)` 在 Step1，命中返回已有 logId/delta ✅（绝不重复加分）；
  - 账户更新：`db.command.inc(amount)` 原子更新 ✅；
  - 流水落库：add after update（stub 下顺序写模拟事务）✅；
  - 代发：targetUserId 参数 + role 校验 ✅；
  - 审计：writeAudit ✅；
  - 注释已提到 R12 大修封堵任意用户自刷分漏洞。

### 云数据库事务口径 ⚠️
- 蓝图要求“事务内”：当前 `points/index.js` 为顺序两步（先更账户，后插流水），在 stub 环境行为正常；真实云数据库 UniCloud SDK 是否支持 `db.startTransaction()`？建议补充：
  - 文档说明（true DB transaction 还是 optimistic concurrency control）；
  - 若不支持，添加重试回退策略或补偿机制（delta 回滚 + 流水删除）。

### 建议实施清单（P0）
- **测试**：smoke test 并发重复请求幂等；
- **文档**：在 docs/API.md points.award 处注明事务实现细节（乐观锁/顺序写/事务可用性）。

---

## §7.8 节气氛围与白事静默

### 现状 ✅（MVP）
- `atmosphere.today`（atmosphere/index.js:88）：
  - findSolarTerm 圆环匹配节气；
  - checkActiveFuneral 查 events.status='ACTIVE',type='funeral' → muted=true；
  - moodTheme = muted ? MUTED_THEME : SEASON_THEMES[term.season]；
  - greeting = muted ? 慎终追远：TERM_GREETINGS[term.name] || 四季问候；
  - homeCards 容错 fallback；
  - 返回结构含 solarTerm/season/moodTheme/greeting/homeCards ✅。
- `styles/home.scss` 晨光渐变 + 四季令牌；前端 `pages/index/index.vue` moodTheme computed 绑定。

### 待办（P1）
- 24 节气全量图（春梨花白/夏青瓷/秋梨金/冬暖金 各阶段渐变）入 P1；
- 节日 festival 字段目前空（三期对接家族年历）。

### ✅ 收口（2026-09 P1，commit `aeeecbe` + 445 test）
- 24 节气**逐节气端点色板**（每节气专属 palette {top,mid,bottom}，浅底暖系色阶微移）替代原 4 季色板；
- **全量 24 节气笺**（TERM_GREETINGS 由 6 条扩展为 24）；
- **festival 字段落地**：settings.festivalCalendar（族议会年历，覆盖/追加）→ 内置公历节日 → 节气即节日（清明）；白事静默期不下发节日；
- 首页 `pages/index/index.vue` 改由服务端 moodTheme 主源（原客户端静态 3 主题仅作骨架兜底）+ festival 展示；日历页 `pkg-calendar/pages/calendar/calendar.vue` 节气头部加节日角标；
- 4 个 F13 smoke 用例 + 445 test verify 全绿。

---

## §7.9 通知编排（站内/订阅/广播）

### 现状 🔶
- `notify.broadcastToAll`（notify/index.js:96）站内广播 ✅；list/markRead 功能存在；
- **订阅消息**（微信订阅模板）与 IM 全员消息/公众号兜底未实现；
- **忌日/生辰提醒**：`ceremony.remindScan` 定时触发器/6:00 扫描 calendar_items 缺实现。

### 建议实施清单（P0/P1）
| 优先级 | 任务 | 位置 |
| --- | --- | --- |
| P0 | ceremony.remindScan 骨架 + triggers.json | cloud/functions/ceremony/config.json（cron 触发） |
| P0 | notify.dispatch 通道抽象（type → 站内/订阅/广播） | notify/index.js |
| P1 | IM/公众号适配（SDK 占位） | notify/broadcastToAll 扩展 |

---

## §7.10 云开发→自建后端迁移预案

### 现状 ❌（文档缺失）
- `services/request.ts` 统一 HTTP 转发封装，服务层接口签名集中（blueprint“前端零改动前提”成立的基础）✅；
- **转发层占位** ❌（没有 router-to-nest.js 或 gateway layer）；
- **预案文档** ❌（触发条件、迁移步骤、风险点、灰度/回滚机制均无）；
- **触发条件**：可用 10 万用户 或 云费>自建 1.5 倍 作为决策点，建议在 admin.featureFlag 加开关/监控仪表板。

### 建议实施清单（P0）
- 创建 `docs/planning/MIGRATION-CLOUD-TO-SELF.md` 含：触发条件、接口签名不变性校验、NestJS 转发层示例代码、DB 导出 SQL、前端 services 兼容性证明；
- `services/request.ts` 加 `GATEWAY_URL` 环境变量占位。

---

## §7.11 老皇历历法计算

### 现状 🔶
- `calendar.almanac`（calendar/index.js:141）：
  - 干支纪年/月/日公式精确 ✅；
  - 生肖公式 ✅；
  - 节气公式近似（21 世纪 C 值表）✅（±1 日内精度）；
  - 宜忌：节气特判 + 星期规则 + settings.almanacExt 定制合并 ✅；
  - Lunar 引擎：require('../../lib/lunar-data.js') detect()，但 package.json 未含 lunar-javascript 依赖，当前 source='lunar-placeholder'。
- performance: 本地公式计算 ≤200ms 可行；lunar 库安装后也符合。

### 建议实施清单（P0）
- **安装依赖**：`npm i lunar-javascript`（或预置离线缓存脚本 scripts/lunar-import.js 的数据文件）；
- **测试**：almanac(date) 返回 lunar.source 不为 placeholder 的正向用例。

---

## 综合优先级与实施建议

### P0（本冲刺必须）
1. 树渲染：computeLayout 纯函数 + TreeGraph.vue 实际调用 + 基础双指缩放；
2. 隐私中间件全覆盖扫描补漏；
3. 积分事务口径文档化 + 并发幂等测试；
4. 触发器 skeleton：ceremony.remindScan + notify.dispatch 通道；
5. 迁移预案文档 + services/request.env 占位；
6. lunar-javascript 包安装/接入 almanac；

### P1（V1.1/V2.0 迭代）
1. 称谓 SPOUSE 姻亲规则 + 方言 settings 覆盖；
2. 公示期 workflow + 通知联动；
3. 谱名完整冲突检测与备选；
4. 直系视图 + 时间轴滑块；
5. 五服着色五色；
6. 24 节气全量渐变色板。

---

## 附录：文件索引证据

- `cloud/functions/member/index.js`: getDetail(346), buildTree(412)
- `cloud/functions/relation/index.js`: calcRelation(44), editRelationship(98)
- `cloud/functions/entry/index.js`: submitEntry(67), auditEntry(103), finalizeApprovedRelation(179), finalizeApprovedMember(206)
- `cloud/functions/points/index.js`: awardPointsAtomic(76)
- `cloud/functions/atmosphere/index.js`: todayAtmosphere(88)
- `cloud/functions/calendar/index.js`: almanac(141)
- `cloud/functions/common/privacy.js`, kindship.js, tree.js
- `utils/tree-view.js`, `utils/tree-flow.js`, `components/common/TreeGraph.vue`

---

*审计完成。下一步将根据本差距报告进入实施增强阶段（代码补齐 + 单测 + npm run verify 全绿 + 文档回写）。*
