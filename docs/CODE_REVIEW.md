# 代码审查清单（CODE_REVIEW.md）

> 质量门禁：以下每一项在合入 dev 前逐条勾选。任何 error 项未过 = 拒绝合并。
> 审查方式：PR 到 dev 分支，至少 1 人审查；云函数改动需 2 人（对齐双人审核文化）。

## A. 功能正确性（error 级）

- [ ] 接口行为与文档第九章接口清单一致（方法名/入参/出参）
- [ ] 新增字段同步更新 `database-init.js` 集合定义与索引
- [ ] 功能开关：新模块接入 `settings.featureFlag`，关闭态返回 `FLAG_DISABLED`（403+文案），前端不白屏
- [ ] 边界情况：空列表/空字符串/null/超长输入有处理
- [ ] 红白事静默期：涉及氛围/互动的改动验证 muted 模式降级

## B. 隐私与安全（error 级，家谱项目生命线）

- [ ] 新接口经过 `common/roles.js hasRole` 权限检查，禁止裸查数据库
- [ ] L 级字段经 `common/privacy.js privacyCheck` 判定；V1.1 内容经 `visibilityCheck`，双重取更严格
- [ ] 未认证（VISITOR）访问范围仅限英烈名录 L1
- [ ] 敏感操作（权限/密码/解密/开关）已写入 `audit_logs`（`common/audit.js SENSITIVE_ACTIONS`）
- [ ] 客户端不持有明文隐私数据（身份证/联系方式不落前端 storage）
- [ ] 无 SQL/注入风险（云数据库 API 天然参数化；自定义拼接需审查）

## C. 性能预算（error 级超预算需说明理由）

- [ ] API P95 ≤ 200ms：查询走索引；禁止 `db.collection().get()` 无 where 全表扫
- [ ] 列表接口必须 `limit`（默认 ≤50）+ 分页参数
- [ ] 首屏可交互 ≤1.5s：新页面接入 `services/request.ts` 缓存优先 + `Skeleton` 骨架屏
- [ ] 图片走云存储 CDN + 缩略图（thumbUrl），无原图直出列表
- [ ] 分包体积：新页面放入对应 pkg-*，主包不新增业务页面

## D. 代码质量（error 级）

- [ ] `npm test`（node --test）全绿；新增纯逻辑配套单测（目标覆盖率 ≥80%）
- [ ] 权限/审计/幂等/称谓逻辑复用 `common/`，禁止在业务函数内重新实现
- [ ] 写操作（积分/打卡/祭祀）有幂等键 `bizType:bizId:userId`
- [ ] 圈复杂度 ≤15、函数 ≤120 行、嵌套 ≤4 层（ESLint warn 项需在评审会说明）
- [ ] 命名与文档第〇部分术语一致（族人/房支/字派/请安…，禁造新词）
- [ ] `cloud/**` 改动后已运行 `npm run sync:common` 并确认 common 同步

## E. 提交纪律（error 级）

- [ ] 提交信息：`type(scope): 描述`（feat/fix/refactor/perf/test/docs/chore）
- [ ] 一个提交一个主题，禁止混合无关改动
- [ ] 不提交：node_modules/unpackage/.env/真实个人信息测试数据
- [ ] 改动 `package.json` 依赖时说明理由与版本来源

## F. 审查结论

- [ ] Approve（可合入）
- [ ] Request Changes（列出必须修复项）
- [ ] 备注/跟进项（记入 ITERATION_REVIEW.md）
