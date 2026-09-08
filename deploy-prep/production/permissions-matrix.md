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

Note: BRANCH_HEAD roles with ranchCode set will be restricted to their assigned branch; unset branchCode temporarily relaxed until profile.updateBranch flow completes.
