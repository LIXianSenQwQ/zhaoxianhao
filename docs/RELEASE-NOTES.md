# 好诚事家风 · 发布说明（RELEASE-NOTES）

> 通用分支版 Sprint R26/R27 发布说明。灰度发布包详细版本见 `docs/deployment/V2.0-RELEASE-NOTES.md`。

## R27 · B1 分支管理 MVP + B0 五服口径统一（2026）

**门禁**：`npm run verify` 全绿 —— 555/555 tests、lint 0E、cloud functions 31/31、§7.10 接口不变性 36 文件、check:env 0 errors。

### 新功能（B1 分支管理 MVP）
| 项 | 说明 |
|---|---|
| branches schema | `cloud/db-schemas/branches.schema.json` 三级谱系：level(1 总谱/2 分谱/3 支谱)、code(HAO- 层级序列码)、parentCode、founderGeneration、region、population、generationVerses、headUserId、sourceTags、confidence、status(ACTIVE/MERGED/ARCHIVED)、mergedInto；索引 code 唯一 + parentCode/level/status |
| branch 云函数 | `cloud/functions/branch/index.js` 7 actions：seed(CHIEF+ 幂等总谱)/list·tree(MEMBER+)/detail/stats(EDITOR+)/create(BRANCH_HEAD+ 编码递增+同父重名校验)/update(EDITOR+ 白名单)/archive(EDITOR+，总谱与含活跃子支不可归档)；鉴权先行 + writeAudit 审计 |
| 编码纯函数 | `utils/branch-code.js`（parse/format/validate/label） + 6 单测 |
| 前端链路 | `services/branch.ts` 统一封装；`pkg-family/pages/branches/branches.vue` 分支管理页（三级树/详情/创建/归档）；广场导航入口（BRANCH_HEAD+ 且 v20Branch） |
| 功能开关 | **v20Branch**：admin defaultFlags / seed-v2-features INITIAL_FLAGS / feature-flags.ts 三处对齐，默认启用可灰度关闭 |
| 宋村种子 | `scripts/seed-branch-demo.js` 幂等演示数据（总谱 → 宋村分谱 → 长房/二房） |
| 文档 | GAP-V2.0.md、V2-SPRINT-TRACKER.md、族史委评审简报 `docs/REVIEW-BRANCH-族史委简报.md` |

### 修复与增强（B0 五服口径 + 快赢）
- **五服语义修正（框架 §7.3）**：≥6 代 → `出五服`（≠同宗）；本人五服 = `本人`（本人无服）；无共同祖先 related:false → fiveFu:null，与「出五服的血亲」区分（fail-closed 不再混叠）；`kindship.fiveFuOf(up,down)` 关系级口径
- **member.tree 五服回填**：修正原「传对象非传字符串」缺陷，节点回填 `fiveFuOf(up,down)`；本人节点标记本人无服
- **seniorityDiff 辈分差**：`relation.calc` 输出 seniorityDiff（高出 X 代/低出 Y 代/同代），称谓四要素补齐；kinship.vue 结果卡新增辈分差展示
- **五服着色全链路统一**：WU_FU_COLORS 中文键统一（family/fan/TreeGraph/kinship.vue）；TreeGraph `fiveFabric`→`fiveFu` 字段名修正；fan 布局环标签 同宗→出五服
- **测试**：branch.test.js 20 用例（含 archive、stats 人口聚合）、branch-code 6 用例、schema 字辈诗字段自由文本白名单修正；全量 555 tests

### 已知决策点（待族史委）
1. 编码别名（决策点⑤）：开发侧采纳纯 HAO- 序列码，可读性由 name+region 承担；如需可加 `alias` additive 迁移
2. 字辈诗 generationVerses：待宋村支长提供原文后由 EDITOR 通过 branch.update 录入
3. stats 真实人口聚合：成员 branchId 挂接后升级（R28 候选）

---
*上一基线：V2.0 灰度部署就绪包（`docs/deployment/V2.0-RELEASE-NOTES.md` v2.0.0）*
