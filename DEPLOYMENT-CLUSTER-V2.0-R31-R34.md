# V2.0 R31–R34 完整交付清单

**提交日期**: 2026-09-XX  
**负责人**: AI Agent (Qoder)  
**审批状态**: ⏳ 待族史委委员会批准  

---

## 📦 核心变更清单

### 1. Cloud Functions（函数层）

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `cloud/functions/entry/index.js` | Modified | 新增公示期 UI、双通道通知、双人复核门禁 |
| `cloud/functions/gedcom/index.js` | New | export/importPreview/commitImport actions |
| `cloud/functions/common/branch-scope.js` | New | RBAC 权限门禁函数 (`scopeOf`) |
| `cloud/functions/admin/index.js` | Modified | v20Roots 功能开关加入 DEFAULT_FLAGS |

### 2. Database Schema（数据层）

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `cloud/db-schemas/users.schema.json` | Modified | 新增 `branchCode` 字段（支谱级 RBAC 支撑） |
| `cloud/db-schemas/dna_records.schema.json` | New | DNA 测试记录占位 schema（敏感等级 L1） |

### 3. Vue Components（前端组件层）

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `components/root-seek/RootsSection.vue` | New | 宋村·根脉专区组件（地标轮播/时间轴/英烈/追思） |
| `pages/index/index.vue` | Modified | 嵌入 RootsSection 组件于首页速览下方 |

### 4. Utilities & Services（工具与服务层）

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `utils/feature-flags.ts` | Modified | v20Roots flag 加入 defaultFeatureFlags |
| `services/gedcom.ts` | New | GEDCOM 服务封装（export/import/commit） |

### 5. Scripts（自动化脚本层）

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `scripts/seed-v2-features.js` | Modified | v20Roots 种子数据初始化 |
| `scripts/prepare-deploy.ps1` | New | 部署预检脚本（测试套件 / 变更日志 / Artifact Bundle） |
| `deploy-prep/production/*` | Generated | 部署包（8 个关键文件 + checksums + permission matrix） |

### 6. Documentation（文档层）

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `docs/R31-R34-SPRINT-Delivery-Report.md` | New | 总收口文档（四大 Sprint 详情） |
| `docs/CHANGELOG-V2.0-R31-R34.md` | New | 标准化变更日志 |
| `deploy-prep/production/permissions-matrix.md` | New | 权限矩阵速查表 |

---

## ✅ 验证结果

| 项目 | 状态 | 数值 |
|------|------|------|
| **全量测试通过率** | ✅ | 682/682 (100%) |
| **云函数语法检查** | ✅ | 无错误 |
| **网关路由匹配** | ✅ | §7.10 compliant |
| **Feature Flag 一致性** | ✅ | v20Roots in admin/cloud/script/utils |
| **Schema 完整性** | ✅ | branchCode 在 users.schema；dna_records 存在 |
| **Artifact 打包** | ✅ | deploy-prep/production/ 含所有关键文件 |

---

## 🔐 安全与权限

- **双人审核门禁**: `userA ≠ userB ≠ submitter`（复审前强制校验）
- **公示期倒计时**: PUBLICITY_PASS step in auditChain 防止提前生效漏洞
- **BranchScope RBAC**: BRANCH_HEAD exact match 跨支操作拦截（HISTORIAN+ 全域豁免）
- **敏感字段脱敏**: DNA testType 仅 EDITOR+ 可见（schema 标注 `note: sensitive level L1`）

---

## 🚀 部署计划

### Phase 1: Staging Environment (72h)
1. 执行 `npm run deploy -- -Env staging` 生成 staging bundle
2. Deploy cloud functions to staging environment
3. Run smoke tests on staging: entry.audit, gedcom.import, roots-section visibility
4. Collect feedback from Clan Historian Committee representatives

### Phase 2: Canary Rollout (10% traffic)
1. Enable v20Roots globally but restrict importPreview to HISTORIAN+ only
2. Monitor error logs for 24h; watch for:
   - Publicity deadline calculation errors
   - Cross-branch access attempts logged as 403
   - Gedcom parser timeout (> 5s per 1k entries)

### Phase 3: Full Production
1. Full rollout to all users
2. System announcement: "V2.0 入谱流程优化 + GEDCOM 标准支持"
3. Post-deployment monitoring window: 7 days

---

## 🔄 回滚方案

若 24h 内发现 critical issues:
1. Revert cloud functions via admin console (`cloud.deploy.restoreVersion`)
2. Restore settings from `backup.exportJSON` (last known good state)
3. Disable v20Roots feature flag temporarily
4. Notify all users via system announcement page

---

## 📋 族史委审批事项

| 项目 | 要求 | 责任人 | 预计日期 |
|------|------|--------|---------|
| Feature Scope Approval | B3/B4/B5/B6 范围确认 | 族长/CHIEF | 2026-09-XX |
| Content Review | 根脉区史料来源核验 | 族史委/HISTORIAN | 2026-09-XX |
| Permission Matrix Sign-off | RBAC 权限规则确认 | 房长代表 | 2026-09-XX |
| Deployment Window | 选择低峰时段（周六凌晨） | DevOps | TBD |

---

## 📚 相关文档

- [GAP-V2.0.md] — Framework alignment tracking (updated status: B3/B4/B5/B6 → ✅)
- [v20-delivery-report.md] — Previous milestones summary
- [docs/R31-R34-SPRINT-Delivery-Report.md] — Current sprint details
- [deploy-prep/production/CHANGELOG-V2.0-R31-R34.md] — Full changelog

---

## 🎯 亮点功能展示（演示用）

1. **R33 宋村·根脉专区**: 
   - 交互式地标轮播 + 迁居时间轴可视化
   - 英烈卡片 (郝光甲) + 素色追思卡（点击跳转祭祀页面）

2. **R31 入谱必审工作流**:
   - 公示期倒计时动态显示
   - 提交人 + 审核人双通道通知文案预览

3. **R32 GEDCOM 导入**:
   - Paste .ged file → Preview table (first 100 rows) → Commit button
   - Conflict hints (同谱名提示)

4. **R34 BranchScope RBAC**:
   - Demonstration: Long-fang head tries to audit Chang-fang task → 403 Forbidden
   - Admin console: Edit users.branchCode field live

---

## ✍️ 签署栏

| 角色 | 姓名 | 签字 | 日期 | 备注 |
|------|------|------|------|------|
| Dev Lead | Qoder AI | _auto-generated_ | 2026-09-XX | — |
| Clan Historian | _pending_ | ________________ | ___________ | Content review |
| Clan Chief | _pending_ | ________________ | ___________ | Final approval |
| Operations | _pending_ | ________________ | ___________ | Deployment window |

---

**提交备注**: 
- All smoke tests passing (682/682)
- No breaking changes to existing APIs (§7.10 interface invariance preserved)
- Backward compatible with legacy entries lacking `payload.branchId` (skip scope check)
- Legacy BRANCH_HEAD users without `branchCode` continue working during transition period
