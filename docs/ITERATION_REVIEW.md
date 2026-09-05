# 双周迭代评审记录（ITERATION_REVIEW.md）

> 机制：每两周（偶数周五）评审会，30 分钟固定议程：
> ① 指标回顾（15min）→ ② 风险与阻塞（10min）→ ③ 下迭代承诺（5min）
> 模板：每次评审复制「第 N 轮」一节填写，历史不覆写。

---

## 第 R1 轮（Sprint R1 · 系统性完善基线）

### 一、四维度指标基线

| 维度 | 指标 | 目标 | R1 现状 | 差距说明 |
|---|---|---|---|---|
| 功能完整性 | MVP 云函数接口覆盖 | 100% 核心场景 | 14 函数 / 统一响应格式落地 | doc/task/upload/event 仍为轻量实现，W3 补齐 |
| 性能 | API P95 | ≤200ms | 预算埋点已接入（services/request.ts），真机数据待采 | 无真机环境，W3 云函数联调后采集 |
| 性能 | 首屏可交互 | ≤1.5s | 缓存优先+骨架屏+静默刷新接入 | 同上 |
| 体验 | 空态/错误兜底 | 0 白屏 | EmptyState 祖训降级 + ErrorPage 重试 + PrivacyCard 授权卡 | 需走查全部 8 个主包页面 |
| 质量 | 单元测试覆盖率 | ≥80% | 23 用例全绿（纯逻辑层：roles/privacy/kindship/idempotency/audit） | 覆盖统计工具未引入（沙箱无 npm），用例数口径代替 |
| 质量 | 圈复杂度 | ≤15 | ESLint 规则就位（沙箱内未执行） | 正式开发机跑 npx eslint . |

### 二、本轮交付清单（已 git 提交）

- `cloud/functions/common/`：roles/privacy/kindship/idempotency/response/audit 六模块，14 云函数同步
- `tests/`：node:test 23 用例全绿（零依赖，绕开沙箱 npm 限制）
- `services/request.ts`：200ms 预算埋点 + 缓存优先 + 静默刷新 + 幂等键注入
- 公共组件 ×5：BaseCard/Skeleton/EmptyState/ErrorPage/PrivacyCard
- 首页重构：骨架屏/错误兜底/空态祖训卡/年长模式/缓存优先全部接入
- 机制：.eslintrc.cjs + CODE_REVIEW.md（6 大类 33 项门禁）+ 本评审模板

### 三、风险登记

| 风险 | 等级 | 应对 |
|---|---|---|
| 沙箱无法 npm install / eslint / 真机预览 | 高 | 全部代码先行+文档记录（INSTALL.md），正式机一次验证；用 node:test 保住质量底线 |
| 真实微信环境未联调（appid/云环境号未配置） | 高 | manifest.json 待用户填 appid；云函数部署按 INSTALL.md |
| 版本号真实性（@dcloudio 包 registry 404） | 中 | 官方 degit 模板初始化规避（INSTALL.md 路径 A） |

### 四、下迭代（R2）承诺

1. doc/task/upload/event 四函数补齐全接口 + 对应单测
2. member.tree 真实树结构（物化路径方案）+ 关系校验脚本（两份世系 CSV diff）
3. 性能真机采集：API P95 / 首屏数据（需用户配合提供微信开发者工具环境）
4. ESLint 全量执行 + warn 清零计划

---

## 第 R2 轮（Sprint R2 · 族谱树与数据核对轨）

### 一、指标回顾

| 维度 | 指标 | 目标 | R2 现状 | 趋势 |
|---|---|---|---|---|
| 功能完整性 | 族谱树方案落地 | 物化路径 | ✅ tree.js 纯函数 + member.tree 前缀查询接入 | ↑ |
| 功能完整性 | 试点数据核对 | 双人 diff 脚本 | ✅ verify-lineage.js（结构/冲突/世代三类校验） | ↑ |
| 功能完整性 | task/upload/event | 完整接口 | ✅ 打卡幂等+积分联动 / 场景化上传策略 / 大事记族史委门禁 | ↑ |
| 性能 | 树查询 | 前缀索引+分页 | ✅ members.path 索引 + 200 节点/页预算封顶 | ↑ |
| 性能 | API P95 | ≤200ms | 仍待真机采集（依赖微信开发者工具环境） | → |
| 质量 | 单测 | ≥80% | 38 用例全绿（23→38，+65%） | ↑ |
| 质量 | Lint | 0 error | ✅ 自制检查器全库 140 文件 0E/0W | ↑ |

### 二、本轮交付清单

- `cloud/functions/common/tree.js`：物化路径方案（buildPath/LCA/relationSteps/paginateTree/subtreeRegex），单页 200 节点预算
- `cloud/functions/member/index.js`：重构——修复 W1 角色比较漏洞（`'EDITOR'>='CHIEF'` 字典序越权）、doc().get() 返回值处理、隐私判定统一走 privacyCheck、tree 前缀查询
- `scripts/verify-lineage.js`：世系双人核对（CSV diff + 结构校验 + 世代连续性），退出码门禁
- `scripts/lint-check.js`：自制 lint（console.log/var/==/eval/debugger/超长函数），全库 0E0W
- `cloud/functions/task|upload|event`：完整接口化（幂等键打卡+积分联动补偿 / 场景化大小类型策略 / HISTORIAN 发布门禁+审计）
- `database-init.js`：+members.path / task_records.idemKey 索引、+upload_metas 集合
- 测试 23→38：tree 11 用例（含 relationSteps×kinshipTitle 端到端）+ lineage/lint 6 用例
- **W1 缺陷修复**：称谓矩阵 (n,m) 几何口径纠正（兄弟=(1,1) 经父，非 (0,0)），测试驱动发现

### 三、风险登记

| 风险 | 等级 | 应对 |
|---|---|---|
| 真机 P95 未采集 | 中 | R2 持续阻塞项：需用户提供微信开发者工具+云环境 |
| 称谓方言覆盖 | 低 | 矩阵兜底版已定，方言表由族史委评审后入 settings |
| 世系挂接（path 回填）迁移脚本 | 中 | R3 承诺：现有 members 数据批量构建 path 的一次性脚本 |

### 四、R3 承诺

1. doc 云函数完整接口化（最后一个轻量 stub）+ path 回填迁移脚本
2. 真机性能采集（依赖用户环境，持续跟踪）
3. 挂接校验中间件：entry.importExcel 入库时自动 buildPath + 世代互指校验

<!-- 模板：下一轮评审复制「第 N 轮」一节填写，历史不覆写 -->
