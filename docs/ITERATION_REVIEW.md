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

<!-- 模板：下一轮评审复制此节 -->
## 第 R_ 轮（日期）

### 一、指标回顾
| 维度 | 指标 | 目标 | 本轮 | 趋势 |
|---|---|---|---|---|

### 二、交付清单

### 三、风险登记

### 四、下迭代承诺
