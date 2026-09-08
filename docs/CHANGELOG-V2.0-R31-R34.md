# Change Log — V2.0 Sprint R31–R34

**Release Date**: 2026-09-XX  
**Status**: ✅ Testing Complete → Ready for Production  

## Sprint R31: Entry Audit Workflow Enhancement (B3)

### Added
- `cloud/functions/entry/index.js::finalizeApproved()` — PUBLICITY_PASS step in auditChain
- `notifySubmitter()`, `notifyAuditors()` — dual-channel notification on audit events
- `entry.pendingList` — returns `canFirstPass/canSecondPass` flags for frontend task list

### Changed
- **双人审核门禁**: userA ≠ userB ≠ submitter (three-way check before SECOND_PASS)
- Publicity period UI: displays `publicityDays` and auto-effective deadline in audit page

### Tests
- +18 smoke tests covering edge cases (VISITOR 403, self-audit 400, cross-step rejection)

---

## Sprint R32: GEDCOM Export/Import Engine (B4)

### Added
- `utils/gedcom-parser.js` — GedcomParser class (parse/serialize/validate pure functions)
- `cloud/functions/gedcom/index.js` — export/importPreview/commitImport actions
- `services/gedcom.ts` — service layer wrapper for Vue pages
- `pkg-family/pages/gedcom-import/gedcom-import.vue` — paste textarea + preview table + commit button

### Standards
- GEDCOM 5.5.1 & 7.0 compatibility
- Family tree structure: FAMS/FAMC edges, birth/death dates/places

### Tests
- `tests/gedcom.test.js`: SAMPLE_GEDCOM_5_5_1 full parse coverage

---

## Sprint R33: Songcun Roots Section (B5)

### Added
- `components/root-seek/RootsSection.vue` — landmarks carousel, timeline, hero card, memorial card
- `v20Roots` feature flag (enabled globally) across utils/cloud/script/admin layers

### Content Sources (Strict Framework §8.4 Compliance)
- Landmarks: Xilin Pagoda/Jimei Bridge/Xiaohe Ancient Road/Shangzhou Site — 《清光绪赵州志》
- Timeline Events: 1537 migration / 1740 pagoda construction / 1865 split / 1949 PRC / 1981 revision — 《清史稿》《赵县志》《石家庄日报》
- Hao Guangjia Hero Card (1799–1871): late Qing jurist, compiled genealogy — 《清史稿·卷四二八》
- Massacre Memorial (1937-10-12): ~200 deaths in Songcun — 《石家庄日报》

### Integration
- Homepage (`pages/index/index.vue`) embedded RootsSection below family stats

---

## Sprint R34: BranchScope RBAC Enforcement (B6)

### Added
- `cloud/functions/common/branch-scope.js` — `scopeOf(userContext, targetBranchId)` pure function
- `cloud/db-schemas/users.schema.json::branchCode` field (optional; recommended for BRANCH_HEAD)
- `entry.auditEntry` scope validation (skip if payload.branchId missing for legacy compatibility)

### Rules
- GLOBAL_ROLES: EDITOR+/HISTORIAN+/CHIEF = cross-branch access
- SCOPE_ROLES: BRANCH_HEAD = exact match users.branchCode === targetBranchId
- Transition Period: unset branchCode allowed temporarily (await profile.updateBranch flow)

### Tests
- R34 entry.audit branchScope smoke: cross-branch rejection verified

---

## Schema Updates

- `dna_records.schema.json` — DNA test records schema (Y-DNA/MT-DNA/AUTOSOMAL placeholder; sensitive log level)

## Metrics

| Metric | Status | Count |
|--------|--------|-------|
| Total Tests | ✅ 100% pass | 682/682 |
| Cloud Functions Syntax Check | ✅ No errors | 38/38 |
| Gateway Route Matching | ✅ Compliant | §7.10 |
| Feature Flag Consistency | ✅ v20Roots synced | admin/cloud/script/utils |

---

## Deployment Checklist

- [ ] Review approval from Clan Historian Committee (预计审批日期：2026-09-XX)
- [ ] Backup current production database (`backup.exportJSON`)
- [ ] Deploy to staging environment first (72-hour monitoring)
- [ ] Rollout strategy: canary release (10% traffic → full rollout)
- [ ] Post-deployment smoke tests on live environment

---

## Rollback Plan

If critical issues detected within 24 hours:
1. Revert cloud functions via admin console or CLI
2. Restore previous settings from backup
3. Notify all users via system announcement
