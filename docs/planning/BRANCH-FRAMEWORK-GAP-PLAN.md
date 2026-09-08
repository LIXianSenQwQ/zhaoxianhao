# 通用分支开发框架 · 差距清单与实施排期（GAP & PLAN）

> 配套蓝图：`docs/planning/FRAMEWORK-GENERIC-BRANCH-V2.md`（V2.0 通用分支版，原样归档）
> 本文：**当前代码库 vs 蓝图** 的差距矩阵 + 贴合现有基线的工程化实施排期（规划文档，未改代码）
> 范围决策（2026-09 族务侧确认）：**数据模型兼容多分支，默认以宋村郝氏为实例**；不引入全国他支虚构数据。

---

## 0. 现状基线（已核实）

| 维度 | 基线 | 证据 |
|---|---|---|
| 全量测试 | 526/526 通过 | `npm run verify`（2026-09，2.0.1e） |
| lint | 0 error / 37 warn | `npm run lint` |
| 云函数 | 30/30 结构校验通过 | `npm run check:functions` |
| 接口不变性 | 35 文件 §7.10 通过 | `npm run check:gateway` |
| 性能预算 | 9 项引擎耗时回归（谱系 2000 同代 <800ms 等） | `tests/performance-budget.test.js` |
| 角色 | 6 级：VISITOR/MEMBER/BRANCH_HEAD/EDITOR/HISTORIAN/CHIEF | `cloud/functions/common/roles.js` |
| 核心集合 schema | members/relations/branches/generations/entry_records/documents/events/audit_logs/settings 均在库 | `cloud/db-schemas/*.json` |

---

## 1. 差距矩阵（蓝图章节 → 现状 → 缺口）

### 1.1 数据模型（§3）

| 蓝图项 | 现状 | 差距判定 |
|---|---|---|
| 三级谱（总谱/分谱/支谱） | 单族数据模型：members 以 `path` 世系编码为骨架 + `branchId` 房支归属；`branches` 仅作房支登记 | **半有**：无总/分/支三级、无父级引用、无房长级 |
| 分支编码 `HAO-{省}-{市县}-{名}-{序}` | `branches` 无 code 字段（仅 name/branchNo） | **缺失**：需扩展 code 唯一索引 + 生成器 |
| Branch 实体富字段（level/parentCode/founder/founderGeneration/region/population/generationPoem/headUserId/sourceTags） | 仅 name/ancestorId/branchNo/description/status | **缺失**：schema 全面扩展 |
| Member 富字段（branchCode/generationChar/aliases/lifespan/occupation/education/tomb/sourceTags/confidence/version） | members 有 path/genealogyName/name/generation/branchId/gender/status/deeds 等 | **部分**：需按成员 schema 现状增补对齐（sourceTags/confidence/generationChar/branchCode 等） |
| Relation 实体（type 四类 + subType + verifiedBy 双人审核 + sourceTags） | relations 已有（entry/member 写入配偶/父子边） | **半有**：验证 verifiedBy/双人字段覆盖后补 |
| 来源/证据/置信度（§3.2/3.3） | 无结构化 sourceTags/reliability/confidence 统一规范；research_sources/research_profiles 集合已存在（科研域） | **缺失**：谱系证据链需新建统一标注模型（可与 research_sources 复用规则） |

### 1.2 功能模块（§4，按 P0→P2）

| 模块 | 优先级 | 现状 | 差距判定 |
|---|---|---|---|
| 世系管理（成员增删改/世代计算/谱名） | P0 | 已有：member 云函数 + 谱系树 + entry.importExcel 双人核对 | **基本有**，缺自动谱名/冲突检测增强 |
| 分支管理（创建/合并/迁移/编码/统计） | P0 | 无 branch 云函数、无页面 | **缺失（首攻）** |
| 字辈管理（generations 已 2 处使用） | P0 | generations 集合被 member/entry 引用；无字辈诗录入/世代匹配 UI | **半有** |
| 入谱审核（提交→初审→复审→公示→生效） | P0 | entry_records 集合 + 导入核对工具 | **半有**：缺公示期/双人复审状态机 |
| 谱系可视化 | P0 | 树形/直系/扇形/时间轴已实现（直角布局+扇形引擎+性能预算） | **已有** |
| 称谓计算（正式/方言/五服/辈分） | P0 | relation-spouse/relation-dialect/五服判定已有纯函数 | **已有** |
| 搜索 | P0 | member.search + search_index | **已有**（分支/事件检索可扩展） |
| 迁徙管理（时间线/地理迁徙图） | P1 | events 集合 schema 在库；迁徙图无 | **缺失** |
| 谱库管理（PDF/碑刻/方志） | P1 | documents 集合 schema 在库 | **缺失**（存储+展示） |
| 审核流程（公示期/版本管理） | P1 | 审计+双人核对部分存在 | **半有** |
| 数据交换（GEDCOM 5.5.1/7.0 + JSON/XML/CSV/PDF） | P1 | 无 GEDCOM；Excel 导入核对已有 | **缺失（GEDCOM 首攻）** |
| 统计分析（人口/世代/分支对比） | P2 | 无 | **缺失** |
| 寻根问祖（同宗/溯源/DNA 对接） | P2 | 无 | **缺失**（远期） |

### 1.3 权限体系（§6）

| 蓝图角色 | 现有对应 | 现状 | 缺口 |
|---|---|---|---|
| 游客/族人 | VISITOR/MEMBER | ✅ 完整门禁 | — |
| 支长 | BRANCH_HEAD | ✅ 有角色（canAudit 审核起点） | **分支范围绑定**：BRANCH_HEAD 应限「本支」，现多为全局语义 |
| 房长 | —（无独立角色） | ❌ | 蓝图矩阵含「浏览他支限制/创建分支」需房长级 |
| 族史委/族长 | HISTORIAN/CHIEF | ✅ 有角色 | 分支范围断言（scope 校验）需在云函数中间件落地 |
| 分支级权限矩阵（浏览/编辑/审核按本支 vs 他支） | 无 scope 概念 | ❌ | 需 `branch.scopeOf(user)` 判断（用户 branchCode/headUserId） |

### 1.4 首页「宋村·根脉」文化分区（§8.4）

| 子块 | 现状 | 差距 |
|---|---|---|
| 地标轮播/迁居时间轴/郝光甲/惨案追思 | 无 | **缺失**：内容需族史委定稿史料（勿由开发杜撰）；设计上属家族史记（events）+ 纪念（庄重/素色）展示 |

### 1.5 技术架构（§9）

| 蓝图 | 现状 | 判定 |
|---|---|---|
| uni-app + 云开发 + Canvas 自研 | ✅ 完全一致 | 已符合 |
| 图数据库混合 | 云数据库 + 内存图遍历（path+relations） | **偏离蓝图但可用**：当前规模图遍历纯函数已足够，无需引入图库 |
| GEDCOM/AI-OCR | 无 | 差距见排期 B4/远期 |

---

## 2. 实施排期（工程化增量，每 Sprint 交付「代码 + 测试 + 功能开关 + 审计 + 文档」）

> 排序依据：依赖关系（先 schema/权限底座，后业务/交换/内容）；每项标注云函数名、集合、页面、测试文件与开关。

### Sprint B1 · 分支管理（P0 首攻）
- **集合**：`branches` schema 扩展——`code`(unique)/`level`(TOTAL|BRANCH|SUB_BRANCH)/`parentCode`/`founderId`/`founderGeneration`/`region`/`population`/`generationPoem`/`headUserId`/`sourceTags`/`status`(ACTIVE|ARCHIVED)
- **云函数 `branch`**（新增）：`list/tree/create/update/archive`；自动编码生成 `HAO-{省}-{市县}-{名}-{序}`（总谱 `HAO-0000`）+ 唯一性冲突检测；创建需房长级（HISTORIAN/CHIEF 或蓝图房长语义），支长可管本支
- **纯函数**：`utils/branch-code.js` 编码生成/校验 + 世代对齐规则（含单测）
- **服务封装** `services/branch.ts`（§7.10 通路）
- **页面**：分支管理（列表/三级树/详情/成员归属迁移统计）
- **开关**：feature flag `v20Branch.enabled`（默认与既有 v20Games 同策略）
- **审计**：branch.create/update/archive；**测试**：smoke 用例（权限矩阵 403/编码唯一/归档不可写）
- **种子**：宋村 `HAO-冀-赵县-宋村-001`（始迁年代 1537 前、迁居依据等族务提供文案）

### Sprint B2 · 字辈与谱名（P0）
- 纯函数 `utils/lineage-naming.js`：按出生年代/世代匹配字辈 → 自动谱名 `郝+字辈+名`、同世代谱名唯一冲突检测（含单测）
- 云函数 `generation`（新增或并入现有使用方）：poem 录入（EDITOR+）/世代查询；续拟用尽 → 族议会审批占位（走既有审批/公告机制）
- 页面：字辈管理卡（家谱中心或族务区）
- 审计 generation.poem.set；smoke 用例

### Sprint B3 · 入谱工单流（P0）
- `entry_records` 状态机：`SUBMIT → FIRST_REVIEW → SECOND_REVIEW → PUBLIC(公示7天) → EFFECTIVE`；过继/迁入/归宗分型字段
- 双人审核：两次审核人不同（canAudit 判定），记录 verifiedBy 双签名；公示期结束自动生效（云函数定时 or 惰性结算——沿用 child-guard settleSession 惰性结算模式）
- 现有 `entry.importExcel` 导入核对工具保留，导出数据导入工单流
- 审计全步骤；smoke 用例（状态机非法跳转/同人双审拒绝/公示期生效）

### Sprint B4 · GEDCOM 数据交换（P1）
- 纯函数 `utils/gedcom.js`：**导出** 5.5.1（members+relations → INDI/FAM 记录，HEAD/SUBM/个体/家庭/来源 SOUR），7.0 头版本标记；**导入** 解析器（INDI/FAM/NAME/BIRT/DEAT/FAMC/FAMS）+ 冲突报告（姓名+世代+父名四维匹配去重）
- 云函数 `gedcom`（export 只读给族史委下载 / import 双人审核后落库——落库走 entry/B3 或直接导入审核）
- 服务封装 + 页面（谱库/数据交换区）
- 测试：`tests/gedcom.test.js`（标准样例对拍：导出→导入→同构；含 §11.1 兼容断言）；性能预算加 GEDCOM 1 万人级导出 < 阈值
- 审计 gedcom.export/import

### Sprint B5 · 宋村·根脉 文化首页分区（P1，内容侧需族务配合）
- `events` 集合落库史料条目（地标/迁居/人物/事件，含 source/sourceType/reliability 元数据）——**文案与来源由族史委/族务定稿后交付，开发不杜撰**
- home 页「宋村·根脉」分区（蓝图 §8.4 结构）：地标轮播 / 郝氏迁居时间轴 / 家族荣光·郝光甲 / 烽火记忆·宋村惨案（素色庄重 + 追思献花防刷频控，参考 home.visit 每日频控模式）
- **合规评审点**：惨案为真实历史事件（遇难人数等），需族务确认表述授权；少年模式下该分区策略需专项确认（历史纪念 vs 游戏娱乐的过滤差异）
- 开关 v20Roots.enabled；审计献花；smoke 用例（频控/只读展示）

### Sprint B6 · 分支权限细化 + 统计寻根起点 + 收口（P1/P2）
- 云函数中间件 `branchScope`：`scopeOf(user)` 判定本支/他支/全局 → §6.2 矩阵落库为可测断言（roles.test.js 扩展）
- 统计分析纯函数（人口/世代分布/男女比，`utils/branch-stats.js`）+ 页面卡片；寻根问祖 = 同宗重名检索 + 分支溯源展示（远期 DNA 对接仅预留）
- 收口：全量 verify、RELEASE-NOTES、tracker、LAUNCH_CHECKLIST 更新

### 远期（蓝图 V1.0+/V3.0，不排期）
迁徙地理图、谱库 PDF/碑刻管理、XML 导出、PDF 谱书印刷、OCR/AI 古谱识别（需云 OCR 开通与族务样张）。

---

## 3. 数据模型演进原则（避免伤筋动骨）

1. **保留 `path` 世系编码为骨架**：现有树/称谓/五服/视图/性能全部依赖 path；蓝图显式 fatherId/motherId/childrenIds 作为**补充边**写入 relations，不推翻 path。
2. `branches.code` 与 `members.branchId/branchCode` 冗余对齐：写入时由云函数统一维护，查询免 join。
3. 证据链（sourceTags/reliability/confidence）采用**渐进必填**：新录入必填、存量迁移标记 `confidence:0=未标`，避免上线即卡历史数据；「来源标注率 100%」按新数据口径先达成再回填。
4. 多分支实例化：宋村为默认 ACTIVE 分支；宁晋东汪如需作第二样例，**等族务提供真实数据**，不做虚构。

## 4. 权限映射备注

- 蓝图「房长」在现有 6 级中**无对应**：两个选项——(a) 复用 HISTORIAN 语义承接房级（推荐起步）；(b) 新增 BRANCH_MANAGER 角色（需全链 role 白名单/界面/审计同步改造）。建议 B6 前族务裁决。
- BRANCH_HEAD「本支」scope：以 users.branchCode 对齐 members.branchId 实现，云函数写操作统一 `assertScope(openid, branchId, 'WRITE')`。

## 5. 合规与内容注记

- **宋村惨案 / 郝光甲**：真实史料，展示须：来源可考（文档 §8.3 所列方志/史稿/日报）、措辞庄重、遇难者名单类内容经族务授权；纳入 `settings` 内容白名单可控开关。
- 追思献花：防刷（同人每日上限）+ 无现金无排行（沿用家族娱乐合规口径）。
- 少年模式：新增内容分区需过 `filterCategories` 分类审查（历史纪念类与娱乐类的处理需族议会定口径）。

## 6. 验收锚点（蓝图 §11 ↔ 现有体系）

| 蓝图验收 | 落点 |
|---|---|
| 谱系树 500 节点 <800ms | **已有更强预算**：family 2000 同代 <800ms / 500 深链 <600ms（performance-budget） |
| 称谓 <500ms | 已有纯函数瞬时（<ms 级），可补预算断言 |
| GEDCOM 5.5.1/7.0 兼容 | B4 `tests/gedcom.test.js` 标准夹具对拍（新增） |
| 分支创建 3 步/成员录入 3 步 | B1/B2 页面验收用例（smoke UI 断言或人工走查项） |
| 数据质量 6 项 100% | 各指标建 `schema.test.js` 校验扩展（渐进必填口径见 §3.3） |

## 7. 待族务/族史委输入（阻塞项，不杜撰）

| 输入 | 用途 | 影响 |
|---|---|---|
| 字辈诗全文与渊源 | generations/B2 | 自动谱名与校验的基准 |
| 宋村分支长/房长任命与用户绑定 | B1 权限 seed | 分支管理演示与授权 |
| 宋村·根脉史料文案定稿（地标/迁居/郝光甲/惨案） | events + B5 | 首页分区内容（含惨案表述授权） |
| 房长语义裁决（复用 HISTORIAN vs 新角色） | B6 权限 | 权限矩阵落地方式 |
| 宁晋东汪分支数据（如需第二实例） | 多分支演示 | 数据模型多分支验证样例 |

---

## 8. 建议执行次序与节奏

`B1 分支底座 → B2 字辈谱名 → B3 入谱工单 → B4 GEDCOM → B5 根脉分区（等文案）→ B6 权限收口`
其中 B1 依赖最少的族务输入（仅分支长绑定），可先行开工；B5 内容待文案；建议按现有节奏每 1–2 周一个 Sprint、每 Sprint 过 `npm run verify` 全绿后提交。
