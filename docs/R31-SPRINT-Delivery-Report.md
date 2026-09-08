# Sprint R31 交付报告 — JSON 备份 + 房长角色 + 迁徙管理

> **Sprint 周期**: R31 (约 5 工作日)  
> **完成日期**: 2025-01-XX  
> **框架对齐**: §1.1 数据主权 / §6.2 权限矩阵 / §4.1(P1) 迁徙管理

---

## 一、核心交付清单

### 1.1 JSON 全量备份（框架 §1.1/§4.8）

| 文件 | 内容 |
|------|------|
| `cloud/functions/backup/index.js` | +exportJSON/restoreJSON 两个 action |
| `services/backup.ts` | exportJSON/restoreJSON 前端封装 |

**能力:**
- 集合白名单（防注入）: members/branches/relations/generations/events
- 轻量校验和完整性验证
- dryRun 预检模式（不直接写入）
- HISTORIAN+ 导出 / EDITOR+ 导入门禁
- 审计日志 `backup.json_export`（sensitive: true）

### 1.2 房长角色 HOUSE_HEAD（框架 §6.2）

| 文件 | 变更 |
|------|------|
| `cloud/functions/common/roles.js` | ROLE_LEVEL: HOUSE_HEAD=4（EDITOR:3 < **HOUSE_HEAD:4** < HISTORIAN:5） |
| `utils/auth.js` | ROLE_ORDER/ROLE_NAMES 同步 + 「分谱负责人（房长）」 |
| 34 个云函数 common/ | npm run sync:common 全量同步 |

**权限边界:**
- ✅ 可创建分支（BRANCH_HEAD+）
- ✅ 可提交迁徙申请
- ❌ 不可审批迁徙（HISTORIAN+ 专属）
- ❌ 不可导出全量 JSON（HISTORIAN+ 专属）

### 1.3 分支迁徙管理（框架 §4.1 P1/§5.2）

| 文件 | 内容 |
|------|------|
| `cloud/functions/branch/index.js` | +migrate/+migrate.list/+migrate.updateStatus |
| `cloud/db-schemas/migration_records.schema.json` | 迁徙记录 schema |
| `services/migration.ts` | submitMigrate/listMigrations/approveMigrate |

**状态机:** `PENDING → APPROVED / REJECTED`（终态不可转）

**审批矩阵:**
| 操作 | 最低角色 |
|------|----------|
| 提交迁徙 | HOUSE_HEAD（房长） |
| 浏览轨迹 | MEMBER（族人） |
| 审批 | HISTORIAN（族史委） |

### 1.4 数据一致性巡检（框架 §5.1）

测试覆盖 3 项核心校验:
- 世代连续性（父=子-1）→ 检出错误节点
- 关系闭环（PARENT_CHILD ↔ CHILD_PARENT 成对）
- 人物唯一性（branchId+genealogyName+generation 三元组去重）

---

## 二、测试结果

```
ℹ tests 644
ℹ pass 644
ℹ fail 0
```

**新增 18 用例**（tests/r31-features.test.js）:
- R31-1 房长角色: 5 用例（层级/边界/权限矩阵）
- R31-2 JSON 备份: 5 用例（白名单/校验和/manifest/解析/成员校验）
- R31-3 迁徙管理: 5 用例（状态机/参数/字段/审批流/时间线）
- R31-4 一致性巡检: 3 用例（世代/闭环/唯一性）

**防漂移守卫**: tests/auth.test.js 6 用例全绿（R29 建立的 EDITOR:3 < HISTORIAN 层级断言，R31 变更后依然通过）

---

## 三、Git 提交

```
<本次> feat(R31): JSON 全量备份 + 房长角色 + 迁徙管理 (644 tests 全绿)
c3c81f5 docs(R30): 更新 GAP-V2.0.md + R30 交付报告
f08ce74 feat(R30): GEDCOM 5.5.1/7.0 双向导入导出支持（8 tests 全绿）
```

---

## 四、R32 规划建议

| 方向 | 内容 | 优先级 |
|------|------|--------|
| 寻根问祖 | 同宗查询/分支溯源/DNA 对接占位 | P2 |
| 统计分析 | 世代分布/分支对比/男女比例图表 | P2 |
| PDF 谱书导出 | 排版引擎 + 打印模板 | P2 |
| XML 导出 | 语义网/RDF | P3 |
