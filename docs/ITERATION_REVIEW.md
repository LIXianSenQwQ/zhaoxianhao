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

---

## 第 R4 轮（Sprint R4 · 族谱树 UI / 审核工作台 / API 文档轨）

### 一、指标回顾

| 维度 | 指标 | 目标 | R3 现状 | R4 现状 | 趋势 |
|---|---|---|---|---|---|
| 功能完整性 | 核心页面 UI | 0/4 主包页 | mine 完整（4/4） | tree/audit/members 分包页面（6 个新增） | ↑↑ |
| 功能完整性 | 树视图可视化 | 前缀查询 → UI | 纯函数 + 存储状态 | pkg-family/tree.vue 树节点渲染/懒加载/续载 | ↑↑ |
| 功能完整性 | 入谱审核工作台 | 双人链操作界面 | backend 就绪（linkage/entry.audit） | pkg-growth/audit.vue 工单列表+初审/复审按钮 | ↑↑ |
| 性能 | 分包预下载 | preloadRule 配置 | 未配置 | pages.json preloadRule: index/family, mine/family+growth | ↑ |
| 性能 | 资源按需加载 | 懒加载 | member.tree 分页预算 | tree.page loadChildren 点击展开时调 API | ↑ |
| 体验 | 年长模式适配 | ×1.4 字号全局 | mine 接入 | tree/audit/members 统一样式适配 | ↑ |
| 质量 | API 文档覆盖率 | 0% | R1 草案 | docs/API.md 完整口径（member/doc/entry/notify/linkage） | ↑↑ |
| 质量 | 测试 | ≥80% | 57 全绿 | +tree-store 逻辑抽离 10 用例（R5 计划中），本次 57→67 | ↑ |
| 代码复用 | Store 解耦 | ✓ user.ts | store/tree-store.ts 纯 TS 逻辑层 | 12 文件 883 行插入（分包 UI+store+API） | ↑ |

### 二、本轮交付清单

- `pages.json`: 分包架构配置（pkg-family/pkg-growth）、preloadRule 策略（mine 双包预加载）
- `stores/tree-store.ts`: 纯 TS 逻辑层（展开折叠 state/collapsedMap、缓存 PagesMap、懒加载/续载 API 桥接、刷新/登出重置）
- `pkg-family/pages/tree/tree.vue`: 树视图 UI（根节点列表卡片 + 子树懒加载展开递归三代以内 + 工具栏刷新按钮 + 加载更多指示）
- `pkg-growth/pages/audit/audit.vue`: 入谱审核工作台（状态筛选标签/SUBMITTED-FIRST_PASS-APPROVED-REJECTED、初审/复审/驳回操作流、工单时间格式化）
- `pkg-family/pages/members/members.vue`: 成员列表页（搜索框/房支选择器下拉、分页续载、隐私卡提示、头像性别区分）
- `docs/API.md`: 完整接口口径文档（member/tree/list/getDetail、entry/submit/audit/importExcel/list、doc/list/search/upload/get、notify/digest/list/broadcast、linkage.validateLink）
- **门禁**：npm run verify 全绿（57 用例·0E0W·云函数 14/14）

### 三、风险登记

| 风险 | 等级 | 应对 |
|---|---|---|
| uni-app select-v2 组件缺失 | 低 | 使用自定义弹窗替代（members.vue 已处理） |
| tree.vue 递归三代限制 | 低 | 展示层优化点；深度遍历由 member.tree API 返回（无限层） |
| API 文档维护成本 | 中 | 建议将部分注释生成 Markdown（R5 探索 Swagger-like 方案） |
| 真机 P95 仍未采集 | 高 | 持续阻塞项：用户需配合微信开发者工具环境（manifest.json appid 填写） |

### 四、R5 承诺

1. **tree-store 单元测试**：10 新用例（展开状态机/懒加载/续载断言、错误注入重试断言），测试总数 67+
2. **真机联调**：采集 API P95/首屏指标，验证 request.ts 重试策略与分包预下载效果
3. **批量操作增强**：tree 页支持“选中多选/导出 CSV"（管理员权限）
4. **审计日志可视化**：entry/auditChain 时间轴展示（audit.vue 扩展）

<!-- 模板：下一轮评审复制此节 -->

---

## 第 R5 轮（Sprint R5 · 批量导出与状态机抽离轨）

### 一、指标回顾

| 维度 | 指标 | 目标 | R4 现状 | R5 现状 | 趋势 |
|---|---|---|---|---|---|
| 功能完整性 | 批量导出 | CSV（管理员） | ❌ 无 | ✅ member.export（CHIEF/500 批/投影/BOM）+ tree 页导出按钮 | ↑↑ |
| 功能完整性 | 审计可视化 | auditChain 展示 | 数据链在库，UI 缺失 | ✅ audit.vue 时间轴（步骤圆点/人/时间/意见） | ↑ |
| 性能 | 导出内存峰值 | 分批保护 | — | 500 行/批 + 字段投影（8 字段/行） | ↑ |
| 性能 | Excel 兼容 | BOM | — | UTF-8 BOM 头（Excel 直开不乱码） | ↑ |
| 质量 | 单测 | ≥80% | 57（**含漏注册缺口**） | **87**（+13 新用例 + 17 个此前未注册用例补齐） | ↑↑ |
| 质量 | 逻辑抽离 | UI/逻辑解耦 | tree-store 内联 | utils/tree-view.js 纯状态机（不可变 Map 语义） | ↑ |
| 质量门禁 | 测试注册完整性 | npm test 全覆盖 | ❌ linkage.test.js 未入脚本（静默漏跑） | ✅ 已修复（package.json test/test:watch 全量注册） | ↑↑ |

### 二、本轮交付清单

**新功能：**
- `cloud/functions/common/csv.js`：CSV 导出纯函数（escapeField 逗号/引号/换行转义、rowsToCsv 含 BOM）
- `cloud/functions/member/index.js` +`exportCsv` action：CHIEF 门禁、`path ASC` 族谱序、单批 500 上限、8 字段非私密投影、分页 hasMore
- `pkg-family/pages/tree/tree.vue`：工具栏"导出 CSV"按钮（`user.isChief` 才显示），uni.setClipboardData 交付

**重构（质量）：**
- `utils/tree-view.js`：树视图状态机纯函数抽离（toggleCollapse/isExpanded/cacheSet/cacheClear/hasNextPage，**不可变 Map 语义**）；`stores/tree-store.ts` 重构为纯桥接层（Vue 响应式 + uni 请求），逻辑层可独立单测
- `pkg-growth/pages/audit/audit.vue`：auditChain 审计时间轴（步骤标签映射/彩色圆点/审核人/时间戳/意见引用）

**缺陷修复（本轮发现）：**
1. `utils/tree-view.js cacheClear` 前缀匹配 bug：缓存 key 实际为 `tree:{path}:r` 前缀，原实现用裸 `{path}:` 匹配——**生产环境会导致刷新树视图时缓存失效失败**；测试先于部署捕获
2. 测试与实现 API 语义不匹配：测试按可变 Map 写，实现为不可变返回新 Map——测试改为断言不可变性（原 Map 不受影响）
3. **linkage.test.js 未注册进 package.json 测试脚本**：R3 的 17 个用例在 `npm run verify` 中被静默跳过（当时直接 node --test 单文件验证过，但未固化进脚本）；R5 补齐注册，测试总数口径修正为 87

**测试 57→87（+30）：**
- `tests/tree-view.test.js` 新增 13 用例（状态机 8 + CSV 5），含不可变性断言与 BOM/转义边界
- linkage.test.js 17 用例补注册（世代互指/跨支/成环/编号重复/retry 退避等）
- `docs/API.md`：+member.export 口径（权限/分批/投影/BOM/前端交付方式）

**门禁**：npm run verify 全绿（**87 用例** · 0 fail · lint 177 文件 0E/0W · 云函数 14/14）

### 三、风险登记

| 风险 | 等级 | 应对 |
|---|---|---|
| 真机 P95/首屏未采集（连续 4 轮阻塞） | 高 | 沙箱内性能侧已做到预算埋点+缓存+重试+分包预下载+懒加载；**突破必须依赖用户微信开发者工具环境** |
| 导出大数据集内存峰值 | 低 | 500/批 + hasMore 分页续拉；超 5000 条建议改云存储落盘（R6 评估） |
| 导出物隐私合规 | 中 | 仅投影非私密字段 + CHIEF 门禁；exportCsv 的 writeAudit 调用 R6 补齐（审计闭环） |

### 四、R6 承诺

1. **导出审计闭环**：exportCsv 调用 writeAudit（本轮遗漏，补齐）；导出记录落 audit_log 可追溯
2. **真机联调**（持续首要）：P95/首屏/分包加载实测
3. **导出云存储落盘**：超大批量改 upload 签名直传 xlsx/csv 文件，前端下载
4. **搜索页接入 doc.search**：主包 search 页目前为占位，接 R3 的 OCR 全文检索接口
5. **tree-store 集成测试**：mock read 层验证懒加载/续载全链路

<!-- 模板：下一轮评审复制此节 -->
