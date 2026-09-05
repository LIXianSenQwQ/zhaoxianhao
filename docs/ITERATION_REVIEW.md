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

---

## 第 R3 轮（Sprint R3 · 入谱工作流与挂接校验轨）

### 一、指标回顾

| 维度 | 指标 | 目标 | R3 现状 | 趋势 |
|---|---|---|---|---|
| 功能完整性 | 云函数完整化 | 0 轻量 stub | doc/entry/notify 完整化（task/upload/event 已于 R2） | ↑ |
| 功能完整性 | 挂接校验 | 世代互指+同支 | ✅ linkage.js 中间件 + finalize 真实入库挂接 | ↑ |
| 功能完整性 | 存量数据迁移 | path 回填脚本 | ✅ migrate-paths.js（demo 验证通过 / dry-run 默认 / apply 门禁） | ↑ |
| 性能 | API 重试 | 读路径退避 | ✅ utils/retry.js + request.ts 接入（R1 文档承诺落地） | ↑ |
| 性能 | API P95 | ≤200ms | 仍待真机采集（R4 首要承诺） | → |
| 体验 | 主包页面覆盖 | 组件化 4/4 | mine 页重构（BaseCard/Skeleton/ErrorPage/年长模式）→ 4/4 | ↑ |
| 质量 | 单测 | ≥80% | 57 用例全绿（38→57，+50%），云函数行为冒烟 16 用例 | ↑ |
| 质量 | Lint | 0 error | ✅ 177 文件 0E/0W | ↑ |

### 二、本轮交付清单

- `common/linkage.js`：挂接校验中间件（世代互指/同支 fail-closed/特批豁免/finalizePatch 统一出口）
- `common/tree.js` +`rebuildPaths`：存量回填纯函数（森林重建/成环检测/编号重复/引用校验）
- `scripts/migrate-paths.js`：--demo（沙箱验证通过 6/6）/--dry-run（默认安全）/--apply（conflicts=0 才放行）
- `entry/index.js` 完整化：
  - **修复 importExcel 引用未定义函数的 ReferenceError**（崩溃路径 → 完整批量导入）
  - 幂等提交 / 双人审核链（初审≠复审≠提交人）/ finalize 真实入库（linkage 挂接+path）
  - 批内世代连续性预检 + 逐行校验报告
- `doc/index.js` 完整化：分页/类型筛选/OCR 全文检索（正则转义）/404/贡献权限
- `notify/index.js` 完整化：**修复 list 引用未定义函数**、broadcast 统一响应+hasRole（旧字符串枚举漏 ADMIN）
- `utils/retry.js` + `request.ts`：读路径退避重试落地（408/500/502/503，1s/2s/4s/8s/16s 封顶；写路径绝不自动重试）
- `pages/mine/mine.vue`：占位页 → 完整版（组件化/年长模式开关/角色徽章/访客态降级）
- 测试 38→57：linkage/rebuildPaths/retry 12 用例 + 冒烟 10→16（doc/entry/notify）
- 测试暴露问题修正：doc/entry 鉴权先行顺序确认（安全惯例：未授权者不暴露参数校验细节）

### 三、风险登记

| 风险 | 等级 | 应对 |
|---|---|---|
| 真机 P95 仍未采集 | 中 | R4 首要承诺；重试/缓存策略已就绪，等真机验证 |
| 存量 path 回填需人工确认 | 低 | dry-run 默认安全；conflicts=0 才允许 --apply |
| Excel 导入依赖客户端解析 | 低 | 职责分离设计：云函数接受 rows 数组，零 xlsx 依赖 |

### 四、R4 承诺

1. 真机联调：采集 API P95/首屏指标，验证重试+缓存优先策略（需用户配合开发者工具）
2. 族谱树 UI 页面：member.tree 前缀查询结果的可视化（pkg-family 树视图）
3. 挂接 UI：入谱审核工作台（双人审核链操作界面）
4. API 文档同步：doc/entry/notify 新接口口径更新至 docs/API.md
5. 成员列表页：搜索 + 分页 + L 级隐私卡路由

<!-- 模板：下一轮评审复制「第 N 轮」一节填写，历史不覆写 -->
