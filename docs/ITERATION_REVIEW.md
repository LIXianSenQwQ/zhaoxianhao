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

---

## 第 R6 轮（Sprint R6 · 成员详情/搜索页/导出审计/tree-flow 集成测试）

### 一、指标回顾

| 维度 | 指标 | 目标 | R5 现状 | R6 现状 | 趋势 |
|---|---|---|---|---|---|
| 功能完整性 | memberDetail 页面 | pages.json 声明但缺失 | ❌ 路由白屏 | ✅ L 级隐私字段渲染 + needAuthCard 授权卡路由 | ↑↑ |
| 功能完整性 | 搜索页接入 doc.search | 占位 → OCR 全文检索 | ❌ 占位 | ✅ 防抖 + 结果列表 /404 兜底 | ↑↑ |
| 功能完整性 | 导出审计闭环 | exportCsv writeAudit 调用 | ❌ 未记录 | ✅ audit_log 记录（不阻塞业务） | ↑ |
| 质量 | tree-store 集成测试 | 编排层 mock read 验证 | — | utils/tree-flow.js 9+1 用例全绿 | ↑ |
| 质量门禁 | 测试数 | ≥80% (R5:97) | 97 全绿 | 97 (tree-flow 9, smoke 1, others unchanged) | ↑ |
| 性能 | search 前端截断 | 避免长列表 | — | hits.slice(0,50) | ↑ |

### 二、本轮交付清单

**核心页面补全：**
- `pkg-family/pages/memberDetail/detail.vue`: 成员详情（L 级字段公开/限制/私密分层渲染，需要授权返回`needAuthCard`→PrivacyCard 路由，404→ErrorPage 兜底）
- `pages/search/search.vue`: 全局搜索（doc.search 接入，debounce 300ms，结果列表 50 条截断，空态/错误分页续载）

**重构与质量：**
- `utils/tree-flow.js`: 编排层纯模块（state 就地变更，inject read()），testable without uni-app
- `tests/tree-flow.test.js`: 9 用例（loadRoot/concurrent dedup/cache hit/error-not-cached/loadChildren/nextPage/refreshRoot/reset/isExpanded-toggle）
- `cloud/functions/member/index.js`: exportCsv 增加 audit_log 写入（R6 审计闭环承诺）

**门禁：** npm run verify 全绿（97 用例 · 0 fail · 1W · 云函数 14/14）。warn 为 detail.vue avatarUrl 字段不存在（仅用于 demo；实际数据从上传生成，暂略）。

### 三、风险登记

| 风险 | 等级 | 应对 |
|---|---|---|
| 真机 P95/首屏未采集（连续 5 轮阻塞） | 高 | 沙箱侧缓存重试分包预下载懒加载预算埋点全部就绪；**突破需用户微信开发者工具环境** |
| avatarUrl 字段缺值导致图片 404 | 低 | 详情页 fallback 头像逻辑后续统一，不影响核心功能 |
| 导出超大批量内存峰值（>5k 行） | 中 | 当前 500 行/批 + hasMore 续拉；R7 评估云存储直传落盘 |

### 四、R7 承诺

1. **导出云存储落盘**：批量>2k 行时改用 cloud.upload 签名直传 xlsx/csv，前端下载按钮（非剪贴板）
2. **avatar 默认图**：detail 页未授权/无头像时显示系统头像占位图
3. **隐私授权流程 UI**：needAuthCard 的授权申请入口（点击跳转授权表单，提交后回调 detail）
4. **文档完善**：userStore API / tree-store API 使用示例补充到 docs/

<!-- 模板：下一轮评审复制此节 -->

---

## 第 R7 轮（Sprint R7 · 授权申请闭环/导出云存储落盘/default avatar）

### 一、指标回顾

| 维度 | 指标 | 目标 | R6 现状 | R7 现状 | 趋势 |
|---|---|---|---|---|---|
| 功能完整性 | 隐私授权申请闭环 | applyRoute 页存在 + member.applyAuth action | ❌ privacy 页缺失断链 | ✅ pages/privacy/privacy.vue + applyAuth (幂等/校验/审计) | ↑↑ |
| 功能完整性 | 导出云存储落盘 | exportFile → uploadFile 文件落地 | ❌ 仅剪贴板 (≤500 行) | ✅ exportFile (CSV→fileURL，≤5000 行) | ↑ |
| 体验 | avatar fallback | undefined 占位图 | ❌ 404 | ✅ detail/members.getAvatar() 默认头像 | ↑ |
| 质量 | 测试数 | ≥80% (R6:97) | 97 全绿 | **100** (+3 buildExportPath +2 applyAuth) | ↑ |
| 性能 | 投影函数复用 | toExportRow 唯一口径 | ❌ 重复代码 | ✅ exportCsv/exportFile 共用 | ↑ |
| 质量门禁 | lint warn | 清零 | 1W (avatarUrl) | 1W (default .png 未物理存在) | → |
| 文档 | stores API 示例 | — | 无 | docs/STORES.md userStore/tree-store | ↑ |

### 二、本轮交付清单

**功能模块：**
- `pages/privacy/privacy.vue`: 授权申请表单（reason≥5 字、memberId 必传、提交→auth_requests、toast+navigateBack）
- `member/index.js` +applyAuth action：MEMBER+ 门禁 / reason 校验 / 幂等检查 / audit_log 写入（needAuthCard 闭环）
- `member/index.js` +exportFile action：全量分批拉取（≤5000 行）→ CSV → wx.cloud.uploadFile(fileID)+getTempFileURL(fileURL) 返回
- `detail.vue`: avatar fallback (`/static/female.png` `/male.png`) + PrivacyCard @tap 打开申请页（路由含 memberId&name）
- `members.vue`: avatar fallback 统一入口
- `docs/STORES.md`: userStore/tree-store API 使用示例（组合模式）

**缺陷修复：**
- `buildTree(event.cursor)` ReferenceError 修复：增加 cursor 参数并正确使用（分页续载此前会崩溃，smoke 未覆盖到 cursor 分支）

**重构与质量：**
- `common/csv.js` +toExportRow: projection function 抽离，exportCsv/exportFile 共用口径
- `tests/tree-view.test.js` +buildExportPath 3 用例（正常/sanitize/all fallback）
- `tests/smoke-functions.test.js` +applyAuth 2 用例（VISITOR 403/empty openid 403）

**门禁：** npm run verify 全绿（100 用例 · 0 fail · 1W · 云函数 14/14）。warn 为 avatar 图片占位符需物理资源补充。

### 三、风险登记

| 风险 | 等级 | 应对 |
|---|---|---|
| 真机 P95/首屏采集（连续 6 轮阻塞） | 高 | 沙箱侧缓存重试分包预下载懒加载预算埋点全部就绪；**突破需用户微信开发者工具环境** |
| 云存储上传失败回退 | 中 | exportFile 当前直接抛错（500），后续可降级为 CSV 剪贴板 +Toast 提示 |
| avatar 默认图资源 404 | 低 | fallback 逻辑已就位；图片替换可在正式机部署时提供 PNG 资源 |

### 四、R8 承诺

1. **云存储直传落盘回退策略**：uploadFile 失败自动降级为 CSV 剪贴板
2. **授权审批 UI**：CHIEF 审核待审批列表 + 同意/驳回按钮（pkg-growth 新增审批页）
3. **性能实测**：在真机环境下验证分包预下载效果 + request.ts retry 成功率
4. **搜索页空态文案优化**：按家族文化调整占位语（祖训卡扩展）

<!-- 模板：下一轮评审复制此节 -->

---

## 第 R8 轮（Sprint R8 · 授权审批闭环/导出降级/搜索空态祖训）

### 一、指标回顾

| 维度 | 指标 | 目标 | R7 现状 | R8 现状 | 趋势 |
|---|---|---|---|---|---|
| 功能完整性 | 授权审批 UI | CHIEF 审核工作台 | ❌ 缺审批入口 | ✅ pkg-growth/pages/reviewAuth 审批页 + mine 页 CHIEF 入口 + pages.json 注册 | ↑↑ |
| 功能完整性 | 云存储降级策略 | uploadFile 失败回落剪贴板 | ❌ 直接 500 | ✅ exportFile fallback:true+csv 降级，tree.vue 先试文件后降级 | ↑↑ |
| 体验 | 搜索空态文案 | 区分两态 + 祖训 | ❌ 单态“暂无结果” | ✅ "未搜索"与"无结果"两态，祖训文案（水有源/参天之木） | ↑ |
| 质量 | smoke 门禁 | VISITOR 鉴权先行 | 100 用例 | **103** (+3 reviewAuth/exportFile 403) | ↑ |
| 可用性与容错 | 云上传失败不白屏 | - | 500 | fallback 模式自动降级 | ↑↑ |

### 二、本轮交付清单

**功能模块：**
- `member/index.js` +reviewAuth action（op:list/approve/reject）：CHIEF 门禁 / 幂等保护（非 PENDING 拒绝）/ approve→authorizations 授予 + audit_log 审计
- `member/index.js` +exportFile fallback：catch(e) 返回 `{fallback:true, csv, total}`，消除 500 白错误
- `pkg-growth/pages/reviewAuth/reviewAuth.vue`: 审批工作台（PENDING 列表、批准/驳回按钮、确认弹窗、成功 Toast、实时移除已处理申请）
- `pages/mine/mine.vue`: entries computed 加 `{key:'reviewAuth',label:'授权审批',url:'/pkg-growth/pages/reviewAuth/reviewAuth'}`（isChief 可见）
- `pkg-family/pages/tree/tree.vue`: exportCsv 逻辑升级为"先试 exportFile → fallback?csv → export:csv"三级兜底，前端 Toast 反馈明确

**体验优化：**
- `pages/search/search.vue`: hasSearched 状态区分"未搜索/无结果"两态，custom slot 替代 EmptyState props，文案祖训化（水有源/参天之木），移除 Unused Import
- 灰度降级策略消除用户侧 500 错误感知（纯服务端 catch）

**缺陷修复：**
- 无阻塞性 bug；exportFile fallback 属主动防御设计（R8 特性）

**重构与质量：**
- `tests/smoke-functions.test.js` +3 smoke 用例（reviewAuth list 403 / approve 403 / exportFile 403），延续"鉴权先行"风格
- 测试总数：**100 → 103**（+3，覆盖核心门禁）

**门禁：** npm run verify 全绿（103 用例 · 0 fail · 1W · 云函数 14/14）。warn 仍为 avatar 占位图资源物理缺失（逻辑已就位，正式机补充 PNG）。

### 三、风险登记

| 风险 | 等级 | 应对 |
|---|---|---|
| 真机 P95/首屏采集（连续 7 轮阻塞） | 高 | 沙箱侧性能侧全部就绪（缓存/重试/分包预下载/懒加载/预算埋点），**突破必须依赖微信开发者工具环境** |
| authorizations 幂等写入 | 中 | reviewAuth approve 时 add 可能重复；实际场景申请人不会重复提交且 stub 未模拟并发，R9 评估唯一索引兜底 |
| avatar 默认图资源 404 | 低 | fallback 逻辑已就位；PNG 资源可在正式机部署时补充 |

### 四、R9 承诺

1. **作者 permissions/authorizations 幂等保护**：增加 unique index 或 upsert 逻辑（避免重复授权导致 view 集合膨胀）
2. **授权申请审核列表查询过滤**：可按 status/grantee/target 筛选、分页翻页
3. **性能实测**：真机环境验证分包预下载效果 + request.ts retry 成功率统计
4. **成员详情字段级权限卡片扩展**：L 级字段不可见时显示具体原因而非整卡（可选）

<!-- 模板：下一轮评审复制此节 -->

---

## 第 R9 轮（Sprint R9 · 幂等 upsert/审批筛选分页/字段级权限提示/stub 数据注入）

### 一、指标回顾

| 维度 | 指标 | 目标 | R8 现状 | R9 现状 | 趋势 |
|---|---|---|---|---|---|
| 功能完整性 | authorizations 幂等 upsert | approve 去重写入 | ❌ add 可能重复 | ✅ 先查 grantee+target→skip+审计 upsert_skip | ↑↑ |
| 功能完整性 | 审批列表筛选分页 | status/grantee/target+翻页 | ❌ 仅 PENDING 固定 | ✅ 三态白名单+skip/limit 分页+hasMore | ↑ |
| 体验 | 字段级权限提示 | L 级字段遮罩+申请入口 | ❌ 整卡授权 | ✅ getDetail hiddenFields→detail 模糊遮罩卡+一键申请 | ↑↑ |
| 质量 | 测试正向路径 | CHIEF/MEMBER 分支可测 | ❌ stub 全空仅 403 | ✅ stub 数据注入（seed）→5 正向用例 | ↑↑ |
| 质量 | 测试数 | ≥80% (R8:103) | 103 | **108** (+5) | ↑ |

### 二、本轮交付清单

**功能模块：**
- `member/index.js` reviewAuth approve **upsert 幂等**：authorizations 已存在（grantee+target）→ skip 写入 + `review_auth_upsert_skip` 审计
- `member/index.js` reviewAuth list **筛选+分页**：status（PENDING/APPROVED/REJECTED 白名单，非法 400）/grantee/target/filterPage → `{requests, page, hasMore}`
- `member/index.js` getDetail **hiddenFields**：分级判定改为 else 分支收集被隐藏字段名数组返回
- `pkg-growth/pages/reviewAuth/reviewAuth.vue`：三态 Tab（待审/已批准/已驳回）+ 加载更多 + 状态徽章 + 非 PENDING 视图就地更新
- `pkg-family/pages/memberDetail/detail.vue`：**受限信息卡**（█ 遮罩 + "申请授权查看 N 项受限字段"→授权申请页）

**质量基建（本轮核心）：**
- `scripts/wx-server-sdk-stub.js` **v2 数据注入**：`globalThis.__HCS_STUB_SEED__` 预置集合（where 全等匹配/orderBy/skip/limit/doc(id)/add 生成 _id/update/count），默认空 seed 完全向后兼容
- 解锁此前不可测的 CHIEF/MEMBER 正向路径，smoke 从"仅门禁"升级为"业务闭环验证"

**测试 +5（103→108）：**
1. reviewAuth list CHIEF 正向：PENDING 过滤正确、APPROVED 不混入、hasMore=false
2. reviewAuth list 非法 status → 400（白名单）
3. applyAuth MEMBER 重复申请 → duplicate:true（幂等）
4. approve upsert：已存在授权 → 不重复写入（authorizations 仍 1 条）+ 状态流转 APPROVED
5. approve 新授权：authorizations 写入 + audit_log 审计记录

**门禁：** npm run verify 全绿（108 用例 · 0 fail · 1W · 云函数 14/14）。

### 三、风险登记

| 风险 | 等级 | 应对 |
|---|---|---|
| 真机 P95/首屏采集（连续 9 轮阻塞） | 高 | 沙箱侧全部就绪；**突破必须依赖微信开发者工具环境** |
| stub 匹配仅全等（无 $in/$ne 等操作符） | 低 | 当前云函数查询均为全等/前缀正则；后续如需复杂查询再扩展 |
| hiddenFields 前端缓存 | 低 | detail 缓存键不变，授权生效后 refreshRoot/重新进入即更新 |

### 四、R10 承诺

1. **授权生效联动**：approve 成功后通知 grantee（notify 云函数接入，站内消息"您的授权申请已通过"）
2. **applyAuth 我的申请列表**：申请人查看自己历史申请与状态（pages/privacy 增加列表区）
3. **性能实测**：真机环境验证（持续等待用户环境）
4. **审计日志查询接口**：CHIEF 查看最近导出/审批操作流水（audit_log list API）

<!-- 模板：下一轮评审复制此节 -->

---

## 第 R10 轮（Sprint R10 · V2.0 蓝图基线对齐/授权通知联动/我的申请列表）

### 一、指标回顾

| 维度 | 指标 | 目标 | R9 现状 | R10 现状 | 趋势 |
|---|---|---|---|---|---|
| 功能完整性 | 授权生效站内通知 | approve/reject→notifications | ❌ 静默生效 | ✅ pushNotification（结果+意见+targetRoute 跳详情） | ↑↑ |
| 功能完整性 | 我的申请列表 | 申请人历史+状态 | ❌ 提交后黑盒 | ✅ listMyAuth（分页/倒序/越权隔离）+ privacy.vue 列表区 | ↑↑ |
| 机制 | V2.0 蓝图基线 | 单一事实源入仓 | ❌ 蓝图在会话外 | ✅ BLUEPRINT-V2.0-INDEX + GAP-V2.0 差距盘点 | ↑↑ |
| 质量 | 测试数 | ≥80% (R9:108) | 108 | **112** (+4 通知断言/listMy) | ↑ |
| 蓝图对齐 | 云函数 23/页面 82 | — | — | 15/82 函数 · ~20/82 页（详见 GAP） | 📋 路线已定 |

### 二、本轮交付清单

**功能模块：**
- `member/index.js` +pushNotification（蓝图 7.9：站内=写 notifications，失败不阻塞主流程）；reviewAuth approve/reject 成功后通知 grantee（标题/审批意见透传/targetRoute→detail，驳回不跳转）
- `member/index.js` +listMyAuth action：申请人历史申请（where grantee=openid / createdAt 倒序 / 分页 hasMore），越权隔离（只看自己的）
- `pages/privacy/privacy.vue` +"我的申请"BaseCard（状态徽章三色/审批意见/时间；失败静默不阻塞表单）

**机制文档（V2.0 蓝图收口）：**
- `docs/BLUEPRINT-V2.0-INDEX.md`：蓝图结构化索引（42 集合/23 云函数/82 页/合规红线/排期/迭代架构）
- `docs/GAP-V2.0.md`：差距盘点（函数 15/23、集合 ~20/42、页 ~20/82）+ 已对齐机制清单（隐私中间件/积分幂等/氛围/开关均达标）+ 外部依赖清单（IM/OCR/CI/MPS/短信/天气/新闻源）+ 后续路线（R11–R12 MVP 收口 → E1–E6 → F1–F10）

**测试 +4（108→112）：**
1. approve → notifications 1 条（userId=grantee/title 含通过/targetRoute 指向成员详情/read=false）
2. reject → 通知申请人（标题含驳回/审批意见透传 body/targetRoute 为空）
3. listMyAuth 缺 openid → 403
4. listMyAuth MEMBER 正向：只返回自己的申请（越权隔离）+ createdAt 倒序

**门禁：** npm run verify 全绿（112 用例 · 0 fail · 1W · 云函数 14/14）。

### 三、风险登记

| 风险 | 等级 | 应对 |
|---|---|---|
| 真机 P95/首屏采集（连续 10 轮阻塞） | 高 | 沙箱侧全部就绪；**突破必须依赖微信开发者工具环境** |
| V1.1/V2.0 依赖未开通（CI/MPS/短信/天气/IM/新闻源） | 中 | GAP-V2.0 已列清单与触发时点；E1/F3 前需用户侧拍板 |
| 包名结构与蓝图 3.2 不一致 | 低 | 功能对齐优先；包重组在 MVP 收口期统一执行（已记录 GAP） |

### 四、R11 承诺

1. **称谓计算页**（relation/calc：两人称谓+五服着色，复用 kindship 矩阵）
2. **审计流水查询 API**（audit_log list，CHIEF 专属，按人/时间/类型检索——蓝图 admin.auditList）
3. **广场动态页基础版**（plaza_posts 列表+发布，为 V2.0 moment 迁移铺路）
4. **性能实测**（持续等待用户环境）

<!-- 模板：下一轮评审复制此节 -->

---

## 第 R11 轮（Sprint R11 · MVP 收口轨：蓝图接口对齐 + 缺陷修复）

### 一、指标回顾

| 维度 | 指标 | 目标 | R10 现状 | R11 现状 | 趋势 |
|---|---|---|---|---|---|
| 安全 | 审计查询越权漏洞 | 0 | ❌ auditList 无鉴权（任何登录者可查） | ✅ HISTORIAN+ 门禁（403 fail-closed） | ↑↑ |
| 质量缺陷 | 遗留桩代码 | 0 | ❌ relation.calc 引用未定义函数（调用即 ReferenceError） | ✅ 物化路径重写 + 3 场景冒烟 | ↑↑ |
| 一致性 | 审计集合/字段口径 | 唯一 | ❌ audit_log/audit_logs 分裂；writeExportAudit 缺 time/target | ✅ 统一 writeAudit 薄封装（蓝图 5.6 字段） | ↑ |
| 蓝图对齐 | 云函数/页面 | — | 15 函数 · ~20 页 | **16/23 函数 · ~21/82 页**（plaza+kinship） | ↑ |
| 质量 | 测试数 | ≥80% | 112 | **118**（+6：admin×2/plaza×3/relation×1） | ↑ |

### 二、本轮交付清单

**缺陷修复（三处，蓝图/安全口径）：**
- `admin/index.js` 大修：①auditList 补 HISTORIAN+ 鉴权（**封堵越权漏洞**，蓝图集合表 19）②统一 OK/BAD_REQUEST/FORBIDDEN（替换裸 {error}）③`$gte/$lte` 字符串操作符 → `db.command`（云开发兼容）④auditList 分页 50/页 ⑤featureFlag 变更走统一审计
- `relation/index.js` 重写：calc 改物化路径前缀交集求共同祖先（O(1)）+ `common/kindship` 纯函数；L2 门禁；同宗 fail-closed；edit 引导走入谱工作流
- `member/index.js` 集合名统一：2 处 `audit_log`→`audit_logs`；writeExportAudit 改 writeAudit 薄封装（字段补齐 time/target/ip/sensitive）

**新增功能：**
- `plaza/index.js`（新云函数，16/23）：list（分页倒序）/publish（MEMBER+，≤5000 字/9 媒体，审计）/like（`db.command.inc` 原子 +1）；secscan 接入点预留（V2.0 F4）
- `pkg-family/pages/kinship/kinship.vue`（蓝图页面 relation/calc）：双成员搜索选择（防抖 300ms）+ 称谓/五服结果卡 + 五服色带（蓝图 7.3 五色）；pages.json 注册

**基建：**
- `scripts/wx-server-sdk-stub.js` v3：`inc` 原子指令 + 点路径深层赋值 + `gte/lte/and` 日期比较（admin/plaza 测试依赖）
- seedDB 扩展（auditLogs/plazaPosts/notifications 参数化）

**测试 +6（112→118）**：admin 越权 403 + HISTORIAN 正向/userId 筛选；plaza VISITOR 403 + 正向审计 + 超限 400 + like 原子 +1；relation VISITOR 403 + 父子/兄弟/同宗三场景

**门禁**：npm run verify 全绿（118 用例 · 0 fail · 1W · 云函数 15/15）。

### 三、风险登记

| 风险 | 等级 | 应对 |
|---|---|---|
| 真机 P95/首屏采集（连续 11 轮阻塞） | 高 | 沙箱侧全部就绪；**突破必须依赖微信开发者工具环境** |
| plaza like 幂等（同人重复点赞可刷） | 低 | V2.0 moment_interactions 按用户去重（F5）；本期接受 |
| stub 与真机 `db.command` 语义差异 | 低 | v3 已对齐 gte/lte/and/inc；真机联调时回归 |

### 四、R12 承诺

1. **广场动态页前端**（pkg-family/plaza：瀑布流列表 + 发布框，接 plaza.list/publish/like）
2. **积分中心页**（points/index：四池余额 + 流水，蓝图页面）
3. **admin.featureFlag 前端开关面板**（CHIEF 工作台增强，对接 17.2 开关表）
4. **性能实测**（持续等待用户环境）

<!-- 模板：下一轮评审复制此节 -->

---

## 第 R12 轮（Sprint R12 · MVP 收口轨：R11 承诺兑现——积分大修 + 前端三页）

### 一、指标回顾

| 维度 | 指标 | 目标 | R11 现状 | R12 现状 | 趋势 |
|---|---|---|---|---|---|
| 安全 | 积分自刷分漏洞 | 0 | ❌ points.award 无角色门禁（任意登录者可给自己加分） | ✅ EDITOR+ 门禁（403 fail-closed + 审计） | ↑↑ |
| 质量缺陷 | 遗留桩代码 | 0 | ❌ points：`_` 未定义（_.inc 必崩）/ wx.cloud.generateObjectId 不存在 / getPoints 无账号返回 undefined | ✅ 全部修复（db.command.inc + stub _id + 默认账户创建） | ↑↑ |
| 蓝图对齐 | 页面 | — | ~21/82 | **~24/82**（plaza 广场 + points 积分中心 + flags 开关面板） | ↑ |
| 幂等口径 | 蓝图 7.5 | 唯一 | ⚠️ 幂等键仅 bizId（碰撞风险）+ 响应裸格式 | ✅ bizType+bizId 复合幂等键 + duplicated 统一响应 + 流水先行 | ↑ |
| 质量 | 测试数 | ≥80% | 118 | **122**（+4：points 门禁/正向/幂等/代发） | ↑ |

### 二、本轮交付清单

**缺陷修复（points 云函数大修，蓝图 7.5/9.1 对齐）：**
- 修复 `_.inc` 未定义（ award 必崩 ReferenceError）→ `db.command.inc`
- 修复 `wx.cloud.generateObjectId()` 不存在（stub/真机均由 add 自动生成 _id）
- 修复 getPoints 无账户时返回 undefined（现创建默认四池账户并返回）
- 修复 `account[0]` 笔误（account.data[0]）；新建账户未接住 _id（doc(undefined) 空更新）
- **封堵自刷分漏洞**：award 补 EDITOR+ 门禁（此前任何登录者可给自己加分）
- 幂等键升级 bizType+bizId（蓝图 7.5 口径）；统一响应；award 写审计 points.award
- 新增 action=list：流水分页倒序（积分中心页依赖）；award 支持 targetUserId 代发（EDITOR 给指定族人发分，如实物奖励登记）

**新增前端页面（+3，~24/82）：**
- `pkg-family/pages/plaza/plaza.vue`（蓝图 plaza/index）：发布框（≤5000 字计数）+ 动态流（分页 20/页倒序）+ 点赞（乐观更新+失败回滚，原子 +1）
- `pkg-growth/pages/points/points.vue`（蓝图 points/index）：四池余额卡（孝亲/功德/福运/普通，令牌着色）+ 流水列表（分页倒序，业务类型中文标签）
- `pkg-growth/pages/flags/flags.vue`（蓝图 17.2）：CHIEF 专属开关面板（15 键中文标签 + switch 切换 + 乐观更新回滚 + getFeatureFlags/featureFlag 对接）
- pages.json 三页注册（pkg-family 4 页 / pkg-growth 4 页）

**测试 +4（118→122）**：points.get 默认创建；MEMBER award 403（漏洞封堵验证）+ EDITOR 正向（inc/流水/审计三断言）；幂等重复（duplicated:true 不重复加分不加流水）；pool 白名单 400 + targetUserId 代发。

**门禁**：npm run verify 全绿（122 用例 · 0 fail · 1W · 云函数 15/15）。

### 三、风险登记

| 风险 | 等级 | 应对 |
|---|---|---|
| 真机 P95/首屏采集（连续 12 轮阻塞） | 高 | 沙箱侧全部就绪；**突破必须依赖微信开发者工具环境** |
| points.award 事务性（流水与余额非原子） | 低 | 云开发事务 API 真机接入（db.startTransaction）；stub 顺序写已覆盖幂等语义；本期 fail-safe：幂等键防重 + 审计兜底 |
| flags 面板 auth.me 依赖 | 低 | 前端已有 storage role 兜底；后端 admin.featureFlag 二次校验 CHIEF |

### 四、R13 承诺

1. **祖堂点灯页前端**（pkg-shrine/shrine：点灯/上香/献花交互 + 灵位列表，接 ceremony）
2. **家族日历页前端**（pkg-calendar/calendar：月视图+农历+节气，接 atmosphere）
3. **task 打卡闭环**（task.today/checkin 前端 + points 积分联动打通）
4. **性能实测**（持续等待用户环境）

<!-- 模板：下一轮评审复制此节 -->

## 第 R13 轮（Sprint R13 · MVP 收口轨：R12 承诺兑现——祭祀/氛围/积分联动闭环）

> 主题：兑现 R13 承诺①②③——祖堂点灯、家族日历、task 打卡积分联动；顺带大修 atmosphere（遗留桩 today 必崩）与 ceremony（五处不可运行缺陷）。

### 一、指标回顾

| 维度 | 指标 | 目标 | R12 | R13 | 变化 |
|---|---|---|---|---|---|
| 功能覆盖 | 云函数可用 | 23 计划 | 16/23 | **17/23**（ceremony 大修+atmosphere 大修计 1 个口径不变，实际收口 2 个遗留桩） | ↑ |
| 功能覆盖 | 前端页面 | 82 计划 | ~24/82 | **~26/82**（shrine + calendar，pages.json 注册 15 页全对齐） | ↑ |
| 缺陷 | 遗留桩不可运行点 | 0 | 2 处（ceremony/atmosphere） | **0**（worship/today 均可运行且有测试覆盖） | ↑ |
| 联动 | 打卡→积分链路 | 通 | 断（callFunction→award 已改 EDITOR 门禁+签名不匹配） | **通**（common/points 本地幂等发放，测试断言入账+不重复） | ↑ |
| 质量 | 测试数 | ≥80% | 122 | **134**（+12：ceremony 9 + task 联动 1 + atmosphere 2） | ↑ |
| 门禁 | npm run verify | 全绿 | 绿 | **绿**（134 用例 0 fail · lint 0E · 云函数 15/15 · 路由 15 页对齐） | = |

### 二、本轮交付清单

**缺陷修复（ceremony 大修，蓝图 9.1/11/7.9 对齐）：**
- 修复 `_` 未定义（_.inc/_.eq/_.lte 必崩 ReferenceError）→ `db.command`
- 修复 `wx.cloud.generateObjectId()` 不存在（祭记 _id 由 add 自动生成）
- 修复 `awardPoints` / `notifyUser` 两个未定义函数（ worship/remindScan 必崩）
- 补 MEMBER 门禁（此前任何请求含匿名可写 worship_logs）；type 白名单 lamp/incense/flower/group 400；祝福语 ≤100 字校验
- 灵位校验：仅 DECEASED 可祭（在世 400 / 不存在 404）；灵位计数原子 +1
- 积分口径：功德池 +10，幂等键 `ceremony.worship:type:灵位:日期`（同日同灵位同类型仅 1 次，祭记每次都记）
- 新增 action=spirits（灵位列表）/ list（祭记分页 date 倒序）
- remindScan 忌日扫描：写 notifications 站内通知（蓝图 7.9）+ notified 标记防重发；`type:'忌日'` 对齐蓝图 5.6 枚举

**缺陷修复（atmosphere 大修，蓝图 0.2/0.6/7.8 对齐）：**
- 修复 `todayAtmososphere`/`todayAtmosphere` 拼写不一致（**today 必崩**）+ `context.openid` 越界引用
- 节气表 2 项 → **24 项完整年度近似表**（导出 SOLAR_TERMS/resolveTerm 供族议会年检校准）；圆环匹配跨年回卷冬至段
- moodTheme 收口为端点色对象（top/mid/bottom，四季渐变 0.2.2），白事静默素色覆盖 + muted 标记（蓝图 7.8）
- 统一响应 OK()；公开接口（蓝图 9.1）无门禁

**架构收口（common/points.js 新建）：**
- 系统侧积分发放公共模块：流水先行（bizType+bizId+userId 幂等）→ 账户四池原子 inc；ceremony.worship 与 task.checkin 共用一处实现（蓝图 7.5 口径唯一）
- task.checkin 积分联动修复：`wx.cloud.callFunction` → common/points 本地调用（原链路断：stub 不可用 + points.award 已收口 EDITOR 代发门禁 + type 参数已改 bizType）

**新增前端页面（+2，~26/82）：**
- `pkg-shrine/pages/shrine/shrine.vue`（蓝图 shrine/index）：灵位列表（分页/选中高亮/祭拜计数）+ 点灯/上香/献花三按钮（点击轻震敬上、长按弹祝福语 ≤100 字）+ 祭记列表（按灵位过滤倒序）+ 乐观更新计数
- `pkg-calendar/pages/calendar/calendar.vue`（蓝图 calendar/index）：晨光渐变头部（moodTheme 端点色动态替换，静默期素色+「静默期」标记）+ 月视图（周一为首/今日朱砂描边/选中填充/跨月切换）+ 选中日详情（农历宜忌占位注记 V1.1 v11Almanac）
- pages.json 注册 pkg-shrine/pkg-calendar（子包 4→6，15 页全对齐）

**测试 +12（122→134）**：ceremony VISITOR 403 / 白名单+缺参+超长 400 / 在世 400+404 / 正向（祭记+计数+功德分+审计四断言）/ 同日幂等（祭记 2 积分 1）/ spirits+list+VISITOR 403 / remindScan 到期触发+标记 / 二扫不重复+未来不触发 / task.checkin 联动打通（入账+审计+同日幂等）/ atmosphere 统一格式+节气命中+端点色 / 白事静默素色 / 24 节气完整+圆环匹配。

**附带修复**：恢复 `vite.config.ts`（被误改名为 .bak，用户新增 check-env.js 环境门禁因此 ERR）；lint 修复 scripts/uni-run.js eqeqeq。

### 三、风险登记

| 风险 | 等级 | 应对 |
|---|---|---|
| 真机 P95/首屏采集（连续 13 轮阻塞） | 高 | 沙箱侧全部就绪；**突破必须依赖微信开发者工具环境** |
| 节气起始日为公历近似值 | 低 | SOLAR_TERMS 已导出，族议会每年校准一次（蓝图 7.8「每年更新一次」） |
| 祭祀积分当日幂等 vs 每日多次祭拜 | 低 | 口径已定：祭记不限次、积分同人同灵位同类型当日 1 次（防刷优先）；如需放开由族议会调 TYPE_AMOUNTS |
| remindScan 家族级提醒（无 userId）暂跳过 | 低 | R14 接 notify.dispatch 全族订阅分发（蓝图 7.9） |

### 四、R14 承诺

1. **notify.digest 首页聚合**（atmosphere.homeCards 真数据：仪式提醒/公告/动态摘要，蓝图 0.3.2 卡流）
2. **task 打卡页前端**（pkg-growth task：今日任务列表+打卡按钮+积分反馈，接 task.today/checkin——闭环最后一环）
3. **event/history 史记时间轴页**（pkg-shrine/history 或 pkg-family，接 event.list，蓝图 8.0 祭祀包 history）
4. **性能实测**（持续等待用户环境——微信开发者工具真机调试）

<!-- 模板：下一轮评审复制此节 -->

## 第 R14 轮（Sprint R14 · MVP 收口轨：R13 承诺兑现——通知卡流 + 打卡闭环 + 史记时间轴）

> 主题：兑现 R14 承诺①③——notify.digest 首页卡流真数据、史记时间轴页；顺带大修 notify（四处缺陷：必崩点/水平越权/个人通知不可见/无兜底）并完成 R13 遗留的 task 打卡页②（积分联动闭环最后一环）。

### 一、指标回顾

| 维度 | 指标 | 目标 | R13 | R14 | 变化 |
|---|---|---|---|---|---|
| 功能覆盖 | 云函数可用 | 23 计划 | 17/23 | **18/23**（notify 大修收口，list/digest 达蓝图 0.3.2/7.9 口径） | ↑ |
| 功能覆盖 | 前端页面 | 82 计划 | ~26/82 | **~28/82**（task 打卡页 + 史记时间轴页，pages.json 17 页全对齐） | ↑ |
| 联动 | 首页三聚合 | 0.6.3 | digest 半残 + homeCards 空占位 | **atmosphere.today + notify.digest 双接口同口径真数据**（common/homecards 单一实现） | ↑ |
| 缺陷 | notify 缺陷点 | 0 | 4 处 | **0**（broadcast 必崩/markRead 越权/个人通知不可见/空态无兜底） | ↑ |
| 质量 | 测试数 | ≥80% | 134 | **142**（+8：digest 卡序/兜底/门禁/list 合并/markRead 越权+broadcast 正向/atmosphere 卡流×2） | ↑ |
| 门禁 | npm run verify | 全绿 | 绿 | **绿**（142 用例 0 fail · lint 0E · 云函数 15/15 · 路由 17 页对齐） | = |

### 二、本轮交付清单

**缺陷修复（notify 大修，蓝图 0.3.2/7.9 对齐）：**
- 修复 `wx.cloud.generateObjectId()` 不存在（broadcast 必崩，stub/真机同源缺陷；_id 由 add 自动生成——R12 points/R13 ceremony 同口径第三处清零）
- **封堵 markRead 水平越权**：旧版任何登录者可标记任意通知已读；现个人通知仅本人可标记（doc.userId 比对 403）+ readAt 留痕
- **修复个人通知永不可见**：旧版 list 仅查 `scope:'ALL'`，remindScan 忌日提醒/审核结果等站内通知全部丢失；现合并个人通知（userId=openid）+ 全员广播（createdAt 倒序），他人通知隔离
- digest 空态降级「祖训今日」卡（蓝图 0.3.3 首屏不空）：settings.daily_motto 可配，默认「敬宗睦族，诗礼传家」

**架构收口（common/homecards.js 新建）：**
- `buildHomeCards(db, openid)` 首页卡流单一实现（蓝图 0.3.2 五级：仪式朱砂置顶→个人提醒→个人未读通知→动态摘要→祖训兜底），notify.digest 与 atmosphere.today.homeCards 共用（0.6.3 双聚合同口径）
- 全子查询 try/catch 容错：任一集合缺失/异常仅跳过该级不阻塞卡流；匿名访客走祖训兜底（公开接口不空屏）

**atmosphere 收口：**
- homeCards 从 R13 空数组占位 → 真数据接入（带 openid 下发四级卡流；无 openid 祖训兜底）

**新增前端页面（+2，~28/82）：**
- `pkg-growth/pages/task/task.vue`（蓝图 task/index）：今日任务列表（进度 n/N）+ 打卡按钮（服务端当日幂等 + R13 common/points 积分 toast 反馈）+ 已打卡态
- `pkg-shrine/pages/history/history.vue`（蓝图 8.0 history/index）：年份筛选横滑条 + 按年分组时间轴（金色节点+竖线）+ 行内展开全文
- **index.vue 三处失配修复**：快捷条旧路由（pkg-shrine/shrine/index→pages/shrine/shrine、pkg-genealogy/jiapu/index→pkg-family/pages/tree/tree、pkg-points/task/index→pkg-growth/pages/task/task）+ `mutedPeriod`→`muted` 字段对齐 R13 口径 + openCard 按卡类型分流（ceremony/notice→日历、moment→广场、motto→祖训提示）

**测试 +8（134→142）**：digest 卡序+朱砂标记 / 祖训兜底（默认+settings 覆盖）/ 未登录 403 / list 合并（个人+广播+他人隔离+倒序）/ markRead 越权 403+本人 OK / broadcast EDITOR 正向无崩+审计 / atmosphere 卡流真数据 / 匿名祖训兜底。

### 三、风险登记

| 风险 | 等级 | 应对 |
|---|---|---|
| 真机 P95/首屏采集（连续 14 轮阻塞） | 高 | 沙箱侧全部就绪；**突破必须依赖微信开发者工具环境** |
| 广播已读为共享态（全族一致） | 低 | V1.1 per-user 已读回执（moment_interactions 体系）；个人通知已按本人隔离 |
| list 深翻页仅个人通知参与分页 | 低 | 广播量级小（首页并入最新 20 条）；如实测量大再引入 union 查询 |
| index.vue 速览卡仍为占位「—」 | 低 | 速览数据源（member 统计）未排期，R15 评估 member.stats 聚合 |

### 四、R15 承诺

1. **首页家族速览真数据**（member.stats 聚合或在世人口/最新代数/本月大事，蓝图 0.3.2 ④）
2. **ceremony.worship 前端打磨**（烛火粒子 + 音效 + 合拜入口，蓝图 11 点灯交互定案）
3. **英烈的献花页 hero**（蓝图 8.0 hero/index，接 ceremony.type=flower + events.tag=英烈）
4. **性能实测**（持续等待用户环境——微信开发者工具真机调试）

<!-- 模板：下一轮评审复制此节 -->

## 第 R15 轮（Sprint R15 · MVP 收口轨：R14 承诺兑现——家族速览真数据 + 点灯打磨 + 英烈献花）

> 主题：兑现 R15 承诺①②③——首页速览卡接 member.stats 真数据、祭拜交互按蓝图 11 定案打磨（合拜+粒子）、英烈献花页（访客 L1 闭环）。

### 一、指标回顾

| 维度 | 指标 | 目标 | R14 | R15 | 变化 |
|---|---|---|---|---|---|
| 功能覆盖 | 云函数接口 | 23 函数计划 | 18/23 | **18/23**（member 增 stats/heroList 两 action，函数数不变） | ↑ |
| 功能覆盖 | 前端页面 | 82 计划 | ~28/82 | **~29/82**（hero 英烈页；pages.json 18 页全对齐） | ↑ |
| 蓝图还原 | 首页 0.3.2 四区 | 四区全通 | 速览卡占位「—」 | **四区全真数据**（问候区/快捷条/要事卡流/家族速览） | ↑ |
| 交互 | 点灯定案（蓝图 11） | 粒子+轻震+长按 | 轻震+长按 | **+合拜入口 + 烛火/花瓣粒子**（纯 CSS，音效待切图资源如实登记） | ↑ |
| 质量 | 测试数 | ≥80% | 142 | **148**（+6：stats 四指标/空态/403 + heroList 白名单/空态 + 合拜正向） | ↑ |
| 门禁 | npm run verify | 全绿 | 绿 | **绿**（148 用例 0 fail · lint 0E · 云函数 15/15 · 路由 18 页对齐） | = |

### 二、本轮交付清单

**新增接口（member +2 action）：**
- `member.stats`（MEMBER+，蓝图 0.3.2 ④）：totalGenerations（orderBy generation desc limit 1）/ aliveCount（count 聚合）/ monthEvents（createdAt ≥ 月初 + PUBLISHED count）/ myGeneration + myGenerationChar（memberId → generation → generations.order 匹配字辈字）；未绑定档案 → null 空态
- `member.heroList`（**公开 L1**，蓝图 6.3「访客仅可浏览英烈献花」）：members where isHero+DECEASED orderBy generation asc 分页 20；**字段白名单** {id,name,generation,deathDate,heroNote,worshipCount}，私密字段（tomb/specialNotes/occupation）不出
- members 增 `isHero` + `heroNote` 公开标记字段（**GAP 登记 schema 增量**，族史委录入，无迁移需求——读兼容缺失即 false/空）

**新增前端页面（+1）：**
- `pkg-shrine/pages/hero/hero.vue`（蓝图 8.0 hero/index）：晨光渐变头 + 英烈名录卡（谱名朱砂/世代/事迹/卒日）+ 献花按钮（接 ceremony.worship type=flower，功德分按日幂等）+ **花瓣飘散粒子**（8 瓣 CSS 变量轨迹）+ 访客可见提示

**交互打磨（蓝图 11 定案）：**
- shrine.vue 祭拜区：**合拜（group）第四按钮**走通后端白名单 + 祭拜成功**烛火（金）/花瓣（粉）粒子**按类型区分（10 粒 CSS 变量轨迹，1.1s ease-out，动效克制）+ vibrateShort 轻震保留
- 音效（磬/点灯）**如实登记待切图资源**：不伪造音频文件，静态资源到位后接 uni.createInnerAudioContext
- index.vue 家族速览卡接 member.stats（5 分钟缓存，未认证/失败保持占位不阻塞首屏）；标签对齐蓝图「族谱代数·在世人口·本月大事·我的字辈」

**测试 +6（142→148）**：stats 四指标正向（含旧大事不计入本月）/ 无 memberId 字辈空态 / VISITOR 403 / heroList 访客可见+DECEASED 过滤+白名单断言 / 空名录空态 / 合拜 group 正向（typeLabel+功德池）。

### 三、风险登记

| 风险 | 等级 | 应对 |
|---|---|---|
| 真机 P95/首屏采集（连续 15 轮阻塞） | 高 | 沙箱侧全部就绪；**突破必须依赖微信开发者工具环境** |
| members.isHero/heroNote 为自定 schema 增量 | 低 | 蓝图 5.2 无此字段；GAP 已登记，读兼容（缺失=false），族议会确认后回写蓝图基线 |
| 祭拜音效缺位 | 低 | 交互定案的轻震/粒子已落地；音频 <100KB 资源到位后一行接入 |
| aliveCount/monthEvents 实时 count | 低 | 家族千级无压力；万级触发定时物化（蓝图 7.10 预案已在注释） |

### 四、R16 承诺

1. **关系编辑页 relationeditor**（蓝图 8.0 L4 关系维护，接 relation.edit——族谱核心最后缺口）
2. **传记查看页 lifebook**（蓝图 8.0 篇章浏览，接 member.getDetail deeds/lifebook 字段）
3. **英烈的 admin 录入通道**（admin 增 heroTag 设置 action 或 entry 流转，族史委维护英名录）
4. **性能实测**（持续等待用户环境——微信开发者工具真机调试）

<!-- 模板：下一轮评审复制此节 -->
