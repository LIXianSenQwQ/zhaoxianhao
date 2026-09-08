# R28 冲刺技术规划（分支域收口）

> **Sprint 周期**: R28（~5 工作日）  
> **前置**: R26/R27 已交付（555/555 tests 全绿，HAO- 编码规则锁定 A 方案）  
> **负责人**: Qoder AI Dev Agent  
> **日期**: 2025-01-XX  

---

## 一、R28 任务总览

| # | 任务 | 优先级 | 依赖 | 预估工期 | 状态 |
|---|------|--------|------|----------|------|
| **T1** | stats 分页精确聚合（成员>1000 时） | P0 | stub.skip()/limit() 已实现 | 1.5d | ⏳ 待启动 |
| **T2** | 分支合并流转（MERGED→mergedInto） | P0 | branch.update 白名单 + archive 状态机 | 1.5d | ⏳ 待启动 |
| **T3** | Excel/OCR 批量导入分支 | P1 | entry.EXCEL + photo_ai 占位 | 2d | ⏳ 待启动 |

**总计**: 3 任务 / 5 工作日 / ~400 行增量代码

---

## 二、Task 1: stats 分页精确聚合（P0）

### 1.1 现状问题

R27 的 stats 实现（`cloud/functions/branch/index.js`）：

```js
// 本地拉取 members 前 1000 条后聚合
let memQuery = db.collection('members').limit(1000);
if (typeof memQuery.field === 'function') memQuery = memQuery.field({ branchId: true });
const memRes = await memQuery.get();
```

**局限**: 
- 成员数 >1000 时返回 `truncated: true`，人口统计为近似值
- 真实云开发环境 `get()` 单次最多返回 100 条（服务端硬限制）

### 1.2 目标方案

引入**游标分页聚合**（cursor pagination），循环拉取直到取完：

```js
// 伪代码
const PAGE_SIZE = 100; // 云开发单次上限
let skip = 0;
let allMembers = [];
while (true) {
  let q = db.collection('members').skip(skip).limit(PAGE_SIZE);
  if (typeof q.field === 'function') q = q.field({ branchId: true });
  const { data } = await q.get();
  if (!data || data.length === 0) break;
  allMembers = allMembers.concat(data);
  if (data.length < PAGE_SIZE) break; // 最后一页
  skip += PAGE_SIZE;
}
// 本地聚合 allMembers → perBranch/byLevel.population
```

### 1.3 影响范围

| 文件 | 修改点 | 类型 |
|------|--------|------|
| `cloud/functions/branch/index.js` | stats action 重写分页循环 | 核心逻辑 |
| `scripts/wx-server-sdk-stub.js` | skip(n) 已有，无需修改 | 复用 |
| `tests/branch.test.js` | 新增 3 用例（分页截断/多页聚合/空集合） | 测试 |

### 1.4 验收标准

- [ ] members 数量 ≤100 / >100 / 恰好 100 三档场景测试通过
- [ ] truncated 字段移除（不再有近似值）
- [ ] perBranch/byLevel.population 与全量 members 精确一致
- [ ] 性能：1000 成员 / 10 分支场景 <500ms（本地 stub）

---

## 三、Task 2: 分支合并流转（P0）

### 3.1 现状问题

- `branches.schema.json` 已定义 `status: MERGED` 和 `mergedInto: string|null` 字段，但**云函数无 merge action**
- `branch.update` 白名单不含 `mergedInto`（防止绕过门禁）
- 前端 branches.vue 无"合并"按钮

### 3.2 目标方案

#### 3.2.1 新增 `merge` action（EDITOR+）

```js
case 'merge': {
  // EDITOR+ 门禁
  if (!hasRole(role, 'EDITOR')) return FORBIDDEN('仅编辑及以上可合并分支');
  
  const { fromCode, toCode } = event || {};
  if (!fromCode || !toCode) return BAD_REQUEST('fromCode and toCode required');
  if (fromCode === toCode) return BAD_REQUEST('不能合并到自身');
  
  // 1. 源分支必须 ACTIVE 且无活跃子支
  const fromBranch = await findBranchByCode(db, fromCode);
  if (!fromBranch) return NOT_FOUND('源分支不存在');
  if (fromBranch.status !== 'ACTIVE') return BAD_REQUEST(`源分支非 ACTIVE（当前 ${fromBranch.status}）`);
  // 检查活跃子支（同 archive 逻辑）
  
  // 2. 目标分支必须 ACTIVE 且层级相同或更高
  const toBranch = await findBranchByCode(db, toCode);
  if (!toBranch) return NOT_FOUND('目标分支不存在');
  if (toBranch.status !== 'ACTIVE') return BAD_REQUEST('目标分支非 ACTIVE');
  if (toBranch.level > fromBranch.level) return BAD_REQUEST('不能合并到更低层级');
  
  // 3. 更新源分支状态 MERGED + mergedInto
  await db.collection('branches').doc(fromBranch._id).update({
    data: {
      status: 'MERGED',
      mergedInto: toCode,
      updatedAt: new Date(),
      updatedBy: openid
    }
  });
  
  // 4. 迁移 members.branchId: fromCode → toCode
  await db.collection('members').where({ branchId: fromCode }).update({
    data: { branchId: toCode }
  });
  
  // 5. 审计
  await writeAudit(db, { 
    userId: openid, 
    action: 'branch.merge', 
    target: `${fromCode} → ${toCode}`, 
    detail: 'merged' 
  });
  
  return OK({ fromCode, toCode, status: 'MERGED' });
}
```

#### 3.2.2 前端 branches.vue 增加合并按钮

- 详情面板（`canEdit && node.level > 1 && node.status === 'ACTIVE'`）新增"合并"按钮
- 弹窗选择目标分支（`toCode`）→ 确认 → 调用 `services/branch.ts merge()`
- UI 提示：源分支将变为 MERGED 状态，其成员自动迁移至目标分支

#### 3.2.3 services/branch.ts 新增

```ts
/** 合并分支（EDITOR+；源→目标，成员自动迁移） */
export function merge(fromCode: string, toCode: string) {
  return write('branch', { action: 'merge', fromCode, toCode }, 'branch', `merge_${fromCode}_to_${toCode}`);
}
```

### 3.3 影响范围

| 文件 | 修改点 | 类型 |
|------|--------|------|
| `cloud/functions/branch/index.js` | +merge action（~50 行） | 核心逻辑 |
| `services/branch.ts` | +merge() 封装（~5 行） | 接口 |
| `pkg-family/pages/branches/branches.vue` | +合并按钮+弹窗（~60 行） | UI |
| `tests/branch.test.js` | +merge 用例（成功/自合并/层级校验/子支拦截/成员迁移/审计） | 测试 |

### 3.4 验收标准

- [ ] EDITOR 可合并同级/上级分支
- [ ] MEMBER 调用 → 403
- [ ] 自合并 → 400
- [ ] 源分支有活跃子支 → 400 提示先归档子支
- [ ] 目标层级低于源 → 400
- [ ] 合并后源分支 status=MERGED、mergedInto=目标 code
- [ ] members.branchId 从源迁移到目标（数量一致）
- [ ] 审计 branch.merge 有痕
- [ ] npm test 全绿

---

## 四、Task 3: Excel/OCR 批量导入分支（P1）

### 4.1 现状问题

- 现有 `entry` 云函数已有 `photo_ai` / `EXCEL` 类型占位（photo_ai/EXCEL type 已留）
- 无 admin 侧分支批量导入页面
- Excel 模板格式未定义

### 4.2 目标方案（骨架 + OCR 占位）

#### 4.2.1 Excel 模板格式

| 列名 | 类型 | 必填 | 示例 |
|------|------|------|------|
| name | string | ✅ | 宋村二支 |
| level | int (2\|3) | ✅ | 2 |
| parentCode | string | ✅ (level=3) | HAO-0000-01 |
| region | string | ⬜ | 河北省石家庄市赵县 |
| description | string | ⬜ | 迁自… |
| generationVerses | string | ⬜ | 国正天心顺… |

> 注：`code` **不允许**在 Excel 中指定——由 `branch.create` 的 HAO- 编码生成器自动分配，避免冲突。

#### 4.2.2 云函数接口：`branch.import`

```js
case 'import': {
  // EDITOR+ 门禁
  if (!hasRole(role, 'EDITOR')) return FORBIDDEN('仅编辑及以上可导入');
  
  const { rows } = event || {}; // Excel 解析后的行数组
  if (!Array.isArray(rows) || rows.length === 0) return BAD_REQUEST('rows required');
  if (rows.length > 100) return BAD_REQUEST('单次导入上限 100 行');
  
  const results = { success: [], failed: [] };
  for (const [idx, row] of rows.entries()) {
    try {
      // 复用 create 的编码生成/同父重名校验/层级校验
      const res = await createInternal(db, openid, {
        name: row.name,
        level: Number(row.level),
        parentCode: row.parentCode || undefined,
        region: row.region || undefined,
        description: row.description || undefined,
        generationVerses: row.generationVerses || undefined
      });
      results.success.push({ row: idx + 1, code: res.code });
    } catch (e) {
      results.failed.push({ row: idx + 1, name: row.name, reason: e.message });
    }
  }
  
  await writeAudit(db, { 
    userId: openid, 
    action: 'branch.import', 
    target: `${results.success.length}/${rows.length}`, 
    detail: 'excel-import' 
  });
  
  return OK(results);
}
```

#### 4.2.3 前端页面：`pkg-family/pages/branches-import/branches-import.vue`

- 上传 Excel（`.xlsx` / `.csv`）
- 模板下载链接（静态文件）
- 预览表格（前 10 行 + 校验结果）
- 提交 → 显示成功/失败明细

> 本 Sprint **只做骨架 + mock 解析**（file→rows 由前端 xlsx 库解析），photo_ai OCR 扫描谱书接入延至 R29。

### 4.3 影响范围

| 文件 | 修改点 | 类型 |
|------|--------|------|
| `cloud/functions/branch/index.js` | +import action（~40 行，复用 createInternal） | 核心逻辑 |
| `services/branch.ts` | +importBranches(rows) 封装 | 接口 |
| `pkg-family/pages/branches-import/branches-import.vue` | 新建（~150 行骨架，页面归入 pkg-family 分包与 pages.json 注册一致） | UI |
| `pages.json` | +路由注册 | 配置 |
| `tests/branch.test.js` | +import 用例（成功/部分失败/行数上限/权限） | 测试 |
| `docs/templates/branch-import-template.csv` | Excel 模板样例 | 文档 |

### 4.4 验收标准

- [ ] 正常导入 3 行 → 3 分支创建成功，HAO- 编码自动分配
- [ ] 含重名行 → 该行失败，其余成功（部分提交语义）
- [ ] 超过 100 行 → 400
- [ ] MEMBER 调用 → 403
- [ ] 审计 branch.import 有痕
- [ ] 前端页面可上传 CSV 并预览

---

## 五、时间排期（Gantt 概览）

```text
Day 1    ████████░░░░░░░░  T1 stats 分页聚合（实现+测试）
Day 2    ░░░░████████░░░░  T2 merge action + 测试
Day 3    ░░░░░░░░████████  T2 前端合并 UI + 联调
Day 4    ░░░░░░░░░░░░████  T3 branch.import action + 测试
Day 5    ░░░░░░░░░░░░░░░█  T3 导入页面骨架 + 文档收口 + 全量验证
```

---

## 六、风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| stub.skip() 与真实 SDK 行为差异 | 分页结果不一致 | 测试同时覆盖 stub 与逻辑单测；真实环境联调在 R28 验收走查 |
| merge 时 members 大量迁移 | 云函数超时 | 单分支成员上限 1000（配额约束）；>1000 提示先拆分 |
| Excel 解析依赖前端 xlsx 库 | 包体积增加 | 使用轻量 `xlsx/dist/xlsx.mini.min.js`（~300KB）；或改为 CSV 解析（零依赖） |
| photo_ai OCR 接口未开通 | OCR 导入无法联调 | R28 仅留 action 占位 + 前端入口隐藏，R29 密钥开通后启用 |

---

## 七、验收里程碑

| 里程碑 | 判定标准 | 负责人 |
|--------|----------|--------|
| **M1（Day 2）** | T1 完成 + 全量测试 ≥560 全绿 | Qoder AI Dev Agent |
| **M2（Day 3）** | T2 完成（含 UI）+ 合并流程演示通过 | Qoder AI Dev Agent |
| **M3（Day 5）** | T3 完成 + R28 收口文档更新 + 族史委走查准备就绪 | Qoder AI Dev Agent + 族史委 |

---

**规划编制**: Qoder AI Dev Agent  
**审核确认**: [待族史委/开发团队评审]
