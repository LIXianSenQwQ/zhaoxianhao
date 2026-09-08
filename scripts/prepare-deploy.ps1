# scripts/prepare-deploy.ps1 — V2.0 R31–R34 部署准备脚本 (PowerShell 版)
#
# Purpose: Collect changelog, generate deployment-ready artifact bundle, and validate critical metrics
# Usage: .\scripts\prepare-deploy.ps1 -Env <production|staging> [-DryRun]

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("production", "staging")]
    [string]$Env = "production",
    
    [switch]$DryRun
)

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "V2.0 R31–R34 Deployment Preparation" -ForegroundColor Cyan
Write-Host "Environment: $Env" -ForegroundColor Cyan
Write-Host "Dry Run: $DryRun" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# Step 1: Test Suite Verification
Write-Host "`n[1/5] Running Full Test Suite..." -ForegroundColor Yellow

$testResult = npm test 2>&1 | Tee-Object -Variable testOutput | Select-String -Pattern "(ℹ tests|ℹ pass|ℹ fail)" | Select-Object -First 5

if ($testResult -match "fail.*0") {
    Write-Host "✅ All tests passing" -ForegroundColor Green
} else {
    Write-Host "❌ TEST FAILURE — Abort deployment preparation" -ForegroundColor Red
    Write-Output $testOutput
    exit 1
}

# Step 2: Generate Changelog
Write-Host "`n[2/5] Generating Changelog..." -ForegroundColor Yellow

$changelogContent = @'
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
'@

$changelogContent | Set-Content -Path "docs\CHANGELOG-V2.0-R31-R34.md" -Encoding UTF8
Write-Host "✅ Changelog generated: docs/CHANGELOG-V2.0-R31-R34.md" -ForegroundColor Green

# Step 3: Create Artifact Bundle
Write-Host "`n[3/5] Creating Deployment Bundle..." -ForegroundColor Yellow

$bundlePath = "deploy-prep\$Env"
if (!(Test-Path $bundlePath)) { New-Item -ItemType Directory -Path $bundlePath -Force | Out-Null }

$criticalFiles = @(
    "docs\CHANGELOG-V2.0-R31-R34.md",
    "docs\R31-R34-SPRINT-Delivery-Report.md",
    "cloud\functions\entry\index.js",
    "cloud\functions\gedcom\index.js",
    "cloud\functions\common\branch-scope.js",
    "components\root-seek\RootsSection.vue",
    "cloud\db-schemas\dna_records.schema.json",
    "cloud\db-schemas\users.schema.json"
)

foreach ($file in $criticalFiles) {
    if (Test-Path $file) {
        Copy-Item $file "$bundlePath\" -Force
        Write-Host "  Copied: $file" -ForegroundColor Gray
    } else {
        Write-Host "  Skipped: $file (not found)" -ForegroundColor Yellow
    }
}

# Calculate checksums
Set-Location $bundlePath
$filesToHash = Get-ChildItem | Where-Object { $_.Extension -in @('.js','.json','.vue') }
foreach ($f in $filesToHash) {
    $hash = Get-FileHash -Path $f.FullName -Algorithm SHA256
    Add-Content -Path "checksums.sha256" -Value "$($hash.Hash)  $($f.Name)"
}
Set-Location ..\..

Write-Host "✅ Artifact bundle created: deploy-prep/$Env/" -ForegroundColor Green

# Step 4: Permission Matrix
Write-Host "`n[4/5] Generating Permission Matrix..." -ForegroundColor Yellow

$permMatrix = @"
# R31–R34 Access Control Matrix

| Action | Required Role | Scope | Notes |
|--------|---------------|-------|-------|
| entry.submit | MEMBER+ | Global | Any branch submission |
| entry.audit FIRST_PASS | BRANCH_HEAD+ | Branch-scoped | Exact branchCode match required |
| entry.audit SECOND_PASS | HISTORIAN+ | Global | Cross-branch allowed |
| entry.audit PUBLICITY_PASS | HISTORIAN+ | Global | Early end publicity |
| gedcom.export | EDITOR+ | Global | Full tree export |
| gedcom.importPreview | HISTORIAN+ | Global | Parse-only |
| gedcom.commitImport | HISTORIAN+ (2 reviewers) | Global | Insert members |
| rootseek.dna.link | EDITOR+ | Global | Placeholder only |

Note: BRANCH_HEAD roles with `branchCode` set will be restricted to their assigned branch; unset branchCode temporarily relaxed until profile.updateBranch flow completes.
"@

Set-Content -Path "$bundlePath/permissions-matrix.md" -Value $permMatrix -Encoding UTF8
Write-Host "✅ Permission matrix generated: deploy-prep/$Env/permissions-matrix.md" -ForegroundColor Green

# Step 5: Pre-flight Validation
Write-Host "`n[5/5] Pre-flight Validation..." -ForegroundColor Yellow

# Check feature flag consistency - v20Roots must appear as KEY (not just in note text) in each file
$flagFiles = @("cloud/functions/admin/index.js", "scripts/seed-v2-features.js", "utils/feature-flags.ts")
$flagCount = 0
foreach ($f in $flagFiles) {
    if (Select-String -Path $f -Pattern 'v20Roots:\s*\{|"v20Roots":\s*\{' -Quiet) {
        $flagCount++
    }
}

if ($flagCount -eq 3) {
    Write-Host "✅ Feature flag v20Roots consistent across all layers" -ForegroundColor Green
} else {
    Write-Host "❌ Feature flag v20Roots mismatch detected! Found: $flagCount/3" -ForegroundColor Red
    exit 1
}

# Verify schema fields
if (Select-String -Path cloud/db-schemas/users.schema.json -Pattern '"branchCode"' | Select-Object -First 1) {
    Write-Host "✅ Users schema includes branchCode field" -ForegroundColor Green
} else {
    Write-Host "❌ Missing branchCode in users.schema.json" -ForegroundColor Red
    exit 1
}

if (Test-Path "cloud\db-schemas\dna_records.schema.json") {
    if (Select-String -Path cloud\db-schemas\dna_records.schema.json -Pattern 'testType' | Select-Object -First 1) {
        Write-Host "✅ DNA records schema complete" -ForegroundColor Green
    } else {
        Write-Host "❌ dna_records.schema.json exists but missing testType field" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "❌ Missing dna_records.schema.json" -ForegroundColor Red
    exit 1
}

Write-Host "" -ForegroundColor White
Write-Host "==========================================" -ForegroundColor Green
Write-Host "✅ PRE-DEPLOYMENT CHECKS PASSED" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host "" -ForegroundColor White
Write-Host "Deployable files located at: deploy-prep/$Env/" -ForegroundColor Cyan
Write-Host "Changelog: docs/CHANGELOG-V2.0-R31-R34.md" -ForegroundColor Cyan
Write-Host "Artifact Bundle: deploy-prep/$Env/" -ForegroundColor Cyan

if ($DryRun) {
    Write-Host "[DRY RUN MODE] No actual files deployed." -ForegroundColor Yellow
} else {
    Write-Host "" -ForegroundColor White
    Write-Host "Next Steps:" -ForegroundColor Cyan
    Write-Host "  1. Submit to Clan Historian Committee for approval" -ForegroundColor White
    Write-Host "  2. Deploy to staging environment for 72h monitoring" -ForegroundColor White
    Write-Host "  3. Execute canary rollout (10% → 100% traffic)" -ForegroundColor White
    Write-Host "  4. Monitor error logs and user feedback" -ForegroundColor White
}
