# Branch Update Inventory And Consolidation Plan

Generated on 2026-05-22 from local refs after `git fetch --all --prune`.

## Scope

This report compares `origin` branch tips against the current working branch:

- Current branch: `codex/standardize-remote-repo-fixes`
- Current head: `36b41d13`
- Current branch contains `origin/main`: yes
- Current branch contains `upstream/main`: no
- Origin repository checked: `collinsfoam-a11y/Stock_final`
- Open origin PRs checked: 38
- Open PR heads already contained in current branch: 1
- Open PR heads not contained in current branch: 37
- Other origin branches checked outside open PRs: 26

`upstream/main` is not treated as the merge base for this plan. The active push target for this workspace is `origin`, and the current branch already contains `origin/main`.

## Current Branch Baseline

The current branch is the best base for a curated consolidation branch because it is already synced to `origin/main`, has the local cleanup work, and has passed split verification. It includes:

- CI and repository cleanup work from `c7146d02 Stabilize stock verification cleanup`.
- Benchmark and bundle verification fixes from `d88ebad7 Fix benchmark verification checks`.
- Count-line location-context preservation from `36b41d13 Preserve count line location context`.

Do not reset this branch to another remote branch. If a consolidated branch is created, branch from this head and port selected changes into it.

## What Happens If We Choose The Best Of Each Branch

The correct path is not to merge every branch. Many branches are competing attempts at the same component or workflow. If all branches are merged wholesale, the likely outcome is:

- Repeated conflicts in `frontend/package.json`, `frontend/pnpm-lock.yaml`, workflow YAML files, and report baselines.
- Duplicate UI behavior for ModernInput, header components, list virtualization, haptics, and accessibility labels.
- Bundle baseline churn that hides real performance regressions.
- CI instability because several open PRs are already `DIRTY` or `UNSTABLE`.

The better path is to create one curated branch from `codex/standardize-remote-repo-fixes`, then port only the strongest patch from each duplicate group:

1. Keep the current branch as the base.
2. Pick one implementation per duplicate UI/performance area.
3. Avoid carrying generated report and baseline files unless the final build proves they need to change.
4. Re-run focused tests after each group, then the full agent CI checks at the end.
5. Close or supersede the losing duplicate PRs after the curated branch is proven.

Expected result: one smaller, cleaner branch with the best security, test, accessibility, and performance changes, without importing every unstable branch history.

## Recommended Consolidation Groups

| Area | Branches / PRs | Recommended action | Expected effect |
|---|---|---|---|
| Current repo stabilization | #53, current branch | Keep as base. | Preserves known passing cleanup, benchmark, and count-line fixes. |
| ModernInput clear button and haptics | #68, #64, #58, #54, #31, plus overlap in #39, #38, #30 | Compare #68, #64, and #58 first. Port only the final `ModernInput.tsx` behavior and its test, not every package/report change. | Adds clear-button and tactile input UX with less lockfile and baseline churn. |
| Header accessibility and haptics | #67, #63, #57, #52, #46, plus non-PR header branches | Prefer #67 for `PremiumHeader` and #46 for `Header`. Treat `ScreenHeader` and `ModernHeader` changes as separate follow-ups if still relevant. | Improves icon-button accessibility and haptics without mixing all header variants. |
| List virtualization/performance | #45, #59, #62, #56, #51, #42, #40, #66 | Start with #45 because it is clean and touches both dashboard and users table. Compare #59 for dashboard-only improvements. Treat #40 unknown-items separately. | Improves large-list rendering while avoiding several unstable workflow/baseline changes. |
| Chip, modal, card, and shared haptics | #61, #60, #50, #44, #43, #38, #30, #28, #27, #26 | Prefer #61 for `Chip`. Port #44, #60, and ModernCard changes only after checking for shared haptic helper duplication. | Adds tactile/a11y polish across reusable UI components, but needs consistency review. |
| Security fixes | #49, #36, #35, plus non-PR `remove-mock-erp-initialization-*` and `codex/phase-1-contract-sync` | High priority, but port carefully. #49 has backend test coverage. #36 changes SQL password behavior and workflow assumptions. #35 adds frontend crypto dependency. | Reduces security risk, but can affect CI, env validation, and frontend bundle/dependencies. |
| Tests and documentation | #48, #37, #33, #55, #65 | Include #48, #37, and #33 if they still pass. Keep #65 separate because it is draft and changes workflows/scripts/baselines. | Adds useful coverage and docs with low risk when clean. |
| Legacy divergent branches | old copilot/codex rebase branches | Do not merge as a unit. Mine only specific commits if still relevant. | Avoids bringing back old fork state or stale CI behavior. |

## Open PR Branch Inventory

| PR | Branch | State | Missing | Area | Update summary | Consolidation action |
|---:|---|---|---:|---|---|---|
| #68 | `palette-modern-input-enhancements-10833965617870099989` | UNSTABLE | 2 | ModernInput UX | `frontend/app/login.tsx`, `frontend/package.json`, `frontend/pnpm-lock.yaml`, plus 3 more | Inspect/cherry-pick only; checks or merge state not clean. |
| #67 | `ux-premium-header-a11y-2907449143805049538` | CLEAN | 2 | PremiumHeader a11y | `.Jules/palette.md`, `.safety-policy.yml`, `frontend/package.json`, plus 3 more | Good candidate; cherry-pick or merge after local tests. |
| #66 | `bolt/users-table-virtual-list-4130533955414794228` | UNSTABLE | 5 | List performance | `.safety-policy.yml`, `reports/web-bundle-baseline.json` | Inspect/cherry-pick only; checks or merge state not clean. |
| #65 | `claude/analyze-repository-SCxwC` | DRAFT/UNSTABLE | 6 | Mixed/needs inspection | `.github/workflows/main.yml`, `.github/workflows/pr-checks.yml`, `backend/requirements.production.txt`, plus 4 more | Do not merge as-is; draft/needs review. |
| #64 | `palette-modern-input-ux-9867561633891996991` | UNSTABLE | 4 | ModernInput UX | `.jules/palette.md`, `.safety-policy.yml`, `frontend/app/login.tsx`, plus 5 more | Inspect/cherry-pick only; checks or merge state not clean. |
| #63 | `palette-a11y-animated-button-12438130000551614070` | UNSTABLE | 4 | ScreenHeader a11y | `.Jules/palette.md`, `backend/.safety-policy.yml`, `frontend/package.json`, plus 3 more | Inspect/cherry-pick only; checks or merge state not clean. |
| #62 | `bolt-virtual-list-dashboard-6526714893832121870` | UNSTABLE | 4 | List performance | `.github/workflows/main.yml`, `.github/workflows/scheduled.yml`, `.jules/bolt.md`, plus 2 more | Inspect/cherry-pick only; checks or merge state not clean. |
| #61 | `palette-chip-ux-enhancement-14756758399835516602` | CLEAN | 2 | Chip UX/a11y | `.jules/palette.md`, `.safety-policy.yml`, `frontend/package.json`, plus 4 more | Good candidate; cherry-pick or merge after local tests. |
| #60 | `palette-image-viewer-a11y-4915147261160217321` | UNSTABLE | 2 | Modal a11y | `.Jules/palette.md`, `.safety-policy.yml`, `frontend/package.json`, plus 1 more | Inspect/cherry-pick only; checks or merge state not clean. |
| #59 | `bolt-virtual-list-optimization-9231089028797816607` | CLEAN | 2 | List performance | `.github/workflows/main.yml`, `.github/workflows/scheduled.yml`, `frontend/package.json`, plus 3 more | Good candidate; cherry-pick or merge after local tests. |
| #58 | `palette-modern-input-clear-button-2760082991655889362` | UNSTABLE | 2 | ModernInput UX | `.safety-policy.yml`, `frontend/app/login.tsx`, `frontend/src/components/ui/ModernInput.tsx`, plus 3 more | Inspect/cherry-pick only; checks or merge state not clean. |
| #57 | `palette/header-a11y-haptics-351146849720932613` | UNSTABLE | 2 | Header a11y/haptics | `.Jules/palette.md`, `.github/workflows/main.yml`, `.github/workflows/scheduled.yml`, plus 2 more | Inspect/cherry-pick only; checks or merge state not clean. |
| #56 | `jules-bolt-perf-users-table-virtual-list-4671264512968321663` | UNSTABLE | 1 | List performance | `frontend/src/components/admin/users/UsersTable.tsx` | Inspect/cherry-pick only; checks or merge state not clean. |
| #55 | `jules/codebase-analysis-report-2761127263183678366` | UNSTABLE | 1 | Docs/CI/reporting | No PR file list returned; inspect branch diff before use. | Inspect/cherry-pick only; checks or merge state not clean. |
| #54 | `palette-modern-input-clear-haptics-3222728079291897231` | UNSTABLE | 2 | ModernInput UX | `.github/workflows/main.yml`, `.github/workflows/scheduled.yml`, `.jules/palette.md`, plus 6 more | Inspect/cherry-pick only; checks or merge state not clean. |
| #53 | `codex/standardize-remote-repo-fixes` | DRAFT/UNSTABLE | 0 | Current branch | `.github/dependabot.yml`, `.github/workflows/main.yml`, `.github/workflows/pr-checks.yml`, plus 97 more | Already current. |
| #52 | `palette-haptic-header-4182423658598264668` | UNSTABLE | 1 | ModernHeader haptics | `frontend/src/components/ui/ModernHeader.tsx` | Inspect/cherry-pick only; checks or merge state not clean. |
| #51 | `bolt-optimize-users-table-348292091316635` | UNSTABLE | 4 | List performance | `.github/workflows/main.yml`, `.github/workflows/pr-checks.yml`, `.github/workflows/scheduled.yml`, plus 2 more | Inspect/cherry-pick only; checks or merge state not clean. |
| #50 | `palette-tactile-standardization-17472974502968391778` | UNSTABLE | 3 | Shared feedback/haptics | `.jules/palette.md`, `.safety-policy.yml`, `frontend/src/components/feedback/ToastProvider.tsx`, plus 3 more | Inspect/cherry-pick only; checks or merge state not clean. |
| #49 | `fix-projection-guard-vuln-5088899953174841219` | UNSTABLE | 3 | Security | `.safety-policy.yml`, `backend/middleware/projection_consistency_guard.py`, `backend/tests/test_projection_consistency_guard_fix.py` | High value; port carefully and run focused tests. |
| #48 | `feature/audit-health-report-687513630008862609` | CLEAN | 1 | Docs/CI/reporting | `docs/audits/APP_HEALTH_AND_BUG_REPORT.md` | Good candidate; cherry-pick or merge after local tests. |
| #46 | `palette/header-a11y-haptics-413552932355758151` | CLEAN | 1 | Header a11y/haptics | `frontend/src/components/layout/Header.tsx` | Good candidate; cherry-pick or merge after local tests. |
| #45 | `bolt-replace-flatlist-with-virtuallist-11103426051471079829` | CLEAN | 1 | List performance | `frontend/src/components/admin/realtime-dashboard/RealtimeDashboardTable.tsx`, `frontend/src/components/admin/users/UsersTable.tsx` | Good candidate; cherry-pick or merge after local tests. |
| #44 | `palette/haptic-confirm-modal-18341979782806438459` | UNSTABLE | 2 | ConfirmModal haptics | `frontend/src/components/ui/ConfirmModal.tsx`, `frontend/src/components/ui/__tests__/ConfirmModal.test.tsx`, `reports/web-bundle-baseline.json` | Inspect/cherry-pick only; checks or merge state not clean. |
| #43 | `ux/palette-accessibility-labels-13808219641783105961` | DIRTY | 2 | Modal/create-session a11y | `.Jules/palette.md`, `frontend/src/components/modals/ImageViewerModal.tsx`, `frontend/src/components/modals/PhotoCaptureModal.tsx`, plus 2 more | Inspect/cherry-pick only; checks or merge state not clean. |
| #42 | `bolt/optimize-userstable-virtuallist-1508398238278668606` | UNSTABLE | 1 | List performance | `frontend/src/components/admin/users/UsersTable.tsx` | Inspect/cherry-pick only; checks or merge state not clean. |
| #40 | `bolt-optimize-unknown-items-list-5717674389194370621` | DIRTY | 4 | List performance | `frontend/app/admin/unknown-items.tsx`, `reports/web-bundle-baseline.json` | Inspect/cherry-pick only; checks or merge state not clean. |
| #39 | `palette-ux-a11y-icon-buttons-8619504172268401199` | DIRTY | 2 | Mixed UI a11y | `.Jules/palette.md`, `frontend/src/components/ui/ModernInput.tsx`, `frontend/src/components/ui/PremiumHeader.tsx`, plus 2 more | Inspect/cherry-pick only; checks or merge state not clean. |
| #38 | `palette/ux-polish-haptics-a11y-4438787971460209827` | DIRTY | 2 | Mixed UI haptics | `.jules/palette.md`, `frontend/package.json`, `frontend/pnpm-lock.yaml`, plus 4 more | Inspect/cherry-pick only; checks or merge state not clean. |
| #37 | `jules-testing-auth-permissions-17770690205130855672` | CLEAN | 2 | Tests | `backend/tests/test_auth_permissions.py`, `frontend/package.json`, `frontend/pnpm-lock.yaml` | Good candidate; cherry-pick or merge after local tests. |
| #36 | `jules-security-fix-empty-password-discover-tables-13721946045195891838` | UNSTABLE | 4 | Security | `.github/workflows/pr-checks.yml`, `.github/workflows/release.yml`, `.github/workflows/scheduled.yml`, plus 1 more | High value; port carefully and run focused tests. |
| #35 | `jules-fix-insecure-random-useSerialEntryManager-17123046553543981999` | DIRTY | 3 | Security | `frontend/package.json`, `frontend/pnpm-lock.yaml`, `frontend/src/domains/inventory/hooks/scan/useSerialEntryManager.ts`, plus 1 more | High value; port carefully and run focused tests. |
| #33 | `test/network-status-8120704396695663867` | CLEAN | 2 | Tests | `frontend/package.json`, `frontend/pnpm-lock.yaml`, `frontend/src/utils/__tests__/network.test.ts` | Good candidate; cherry-pick or merge after local tests. |
| #31 | `palette-clear-button-modern-input-11929483168317367394` | DIRTY | 2 | ModernInput UX | `.jules/palette.md`, `frontend/app/login.tsx`, `frontend/src/components/ui/ModernInput.tsx`, plus 2 more | Inspect/cherry-pick only; checks or merge state not clean. |
| #30 | `palette/standardize-haptics-input-a11y-916447801015190096` | DIRTY | 1 | Shared feedback/haptics | `.jules/palette.md`, `frontend/src/components/ui/AnimatedPressable.tsx`, `frontend/src/components/ui/FloatingScanButton.tsx`, plus 2 more | Inspect/cherry-pick only; checks or merge state not clean. |
| #28 | `palette/chip-ux-enhancement-17434958833823383358` | UNSTABLE | 1 | Chip UX/a11y | `.jules/palette.md`, `frontend/src/components/ui/Chip.tsx`, `frontend/src/components/ui/__tests__/Chip.test.tsx` | Inspect/cherry-pick only; checks or merge state not clean. |
| #27 | `palette-modern-card-ux-improvement-2087497541635550193` | DIRTY | 1 | ModernCard UX | `.jules/palette.md`, `frontend/src/components/ui/ModernCard.tsx`, `frontend/src/components/ui/__tests__/ModernCard.test.tsx` | Inspect/cherry-pick only; checks or merge state not clean. |
| #26 | `palette-modern-card-ux-enhancement-14379027169264614414` | DIRTY | 1 | ModernCard UX | `.jules/palette.md`, `frontend/src/components/ui/ModernCard.tsx`, `frontend/src/components/ui/__tests__/ModernCard.test.tsx`, plus 4 more | Inspect/cherry-pick only; checks or merge state not clean. |

## Other Origin Branches

| Branch | In current | Missing commits | Last commit | Latest subject | Consolidation note |
|---|---:|---:|---|---|---|
| `codex/rebase-collinsfoam-fork-20260415` | false | 189 | 2026-04-15 | fix(ci): resolve CI failures across backend, frontend, and smoke tests | Large legacy divergence; do not merge as a unit. |
| `copilot/check-ci-cd-fail` | false | 177 | 2026-03-20 | Merge pull request #2 from collinsfoam-a11y/copilot/fix-ci-cd | Large legacy divergence; do not merge as a unit. |
| `copilot/test-entire-app` | false | 177 | 2026-03-20 | Add comprehensive test coverage across backend and frontend | Large legacy divergence; do not merge as a unit. |
| `codex/migration-stabilization` | false | 13 | 2026-05-03 | chore: refresh deployment decision log | Inspect for backend/contract relevance before cherry-pick. |
| `claude/mystifying-proskuriakova-c71b1d` | false | 8 | 2026-05-19 | feat: add Claude design theme with warm cream and coral palette | Small branch; inspect diff before cherry-pick. |
| `palette/modern-button-ux-enhancement-12027436304081638978` | false | 5 | 2026-05-06 | Palette: Enhance ModernButton with haptics and accessibility improvements | UI candidate; compare against newer open PRs first. |
| `codex/phase-1-contract-sync` | false | 2 | 2026-05-06 | fix: use pin hash in default pin repair script | Inspect for backend/contract relevance before cherry-pick. |
| `palette/modern-button-ux-14583524030104048521` | false | 2 | 2026-05-05 | Palette: Fix CI and add tactile feedback/loading accessibility to ModernButton | UI candidate; compare against newer open PRs first. |
| `cleanup-port-detector-pass-block-5224495168467594761` | false | 1 | 2026-05-14 | chore: remove redundant pass block in PortDetector.generate_frontend_config | Small branch; inspect diff before cherry-pick. |
| `codex/pending-worktree-cleanup` | false | 1 | 2026-04-27 | Checkpoint pending workspace and upgrade CI actions | Inspect for backend/contract relevance before cherry-pick. |
| `palette/enhance-header-ux-10307195798395015974` | false | 1 | 2026-05-02 | Palette: Enhance ModernHeader accessibility and haptics | UI candidate; compare against newer open PRs first. |
| `palette/switch-haptic-feedback-9702768483232730759` | false | 1 | 2026-05-02 | Palette: Add tactile feedback to Switch component | UI candidate; compare against newer open PRs first. |
| `remove-mock-erp-initialization-17500031089325794613` | false | 1 | 2026-05-14 | Remove mock ERP data initialization | Small branch; inspect diff before cherry-pick. |
| `ui-redesign-stitch-vibe-3373246473526407434` | false | 1 | 2026-04-28 | style: standardize theme usage and use semantic background token | UI candidate; compare against newer open PRs first. |
| `add-db-permissions-tests-10536488988565935002` | true | 0 | 2026-05-14 | fix(frontend): Update expo dependencies to match SDK requirements | Already contained in current branch. |
| `codex/check-app-condition` | true | 0 | 2026-04-29 | chore: sync PR checks workflow with main | Already contained in current branch. |
| `codex/check-condition` | true | 0 | 2026-05-06 | Address new PR #23 projection date/time review notes | Already contained in current branch. |
| `codex/check-for-vulnerabilities` | true | 0 | 2026-05-06 | Refine PR #22 security recipe flow and messaging | Already contained in current branch. |
| `codex/structural-security-main-stabilization` | true | 0 | 2026-05-06 | fix: address PR21 review findings and reset endpoint hardening | Already contained in current branch. |
| `ecc-tools/Stock_final-1777877853539` | true | 0 | 2026-05-04 | feat: add Stock_final ECC bundle (.claude/homunculus/instincts/inherited/Stock_final-instincts.yaml) | Already contained in current branch. |
| `main` | true | 0 | 2026-05-17 | Merge pull request #47 from collinsfoam-a11y/codex/finalize-enterprise-stock-verify-model | Already contained in current branch. |
| `origin` | true | 0 | 2026-05-17 | Merge pull request #47 from collinsfoam-a11y/codex/finalize-enterprise-stock-verify-model | Already contained in current branch. |
| `palette-button-micro-ux-3911512620473789566` | true | 0 | 2026-05-13 | Palette: Optimize ModernButton UX and fix CI regression | Already contained in current branch. |
| `palette-modern-button-ux-enhancement-12986662841658022622` | true | 0 | 2026-05-06 | Address PR #25 ModernButton and journal review notes | Already contained in current branch. |
| `palette-standardize-haptics-18168042092705996844` | true | 0 | 2026-05-06 | Palette: Standardize tactile feedback for interactive components | Already contained in current branch. |
| `palette/enhance-switch-ux-3153880681082425921` | true | 0 | 2026-05-15 | feat(ui): add haptics and accessibility to Switch component | Already contained in current branch. |

## Suggested Branch Creation Sequence

Use this sequence if the next task is to build the consolidated branch:

1. Create `codex/consolidate-best-branch-updates` from `codex/standardize-remote-repo-fixes`.
2. Port low-risk clean changes first: #48, #37, #33.
3. Port high-value security changes next: #49, then evaluate #36 and #35 separately.
4. Port UI/performance groups one at a time: list virtualization, ModernInput, headers, then smaller component haptics/a11y.
5. After each group run targeted tests for touched files.
6. At the end run `make agent-ci`, `make eval-performance`, `npm --prefix frontend run build:web`, and `npm --prefix frontend run bundle:web:guard`.

Do not include generated screenshots, smoke reports, or stale benchmark baselines unless produced by the final verified build.
