# Full Codebase Cross-Check Report
Date: 2026-05-03
Repository: `/Users/noufi1/stk_final/Stock_final`

## 1. Scope and Method
This report was generated from full repository static analysis artifacts and direct file-level cross-checking.

Data sources used:
- `.tmp/cleanup_static_analysis.json` (zero inbound + runtime-unreached signals)
- `.tmp/jscpd-split/backend-src-20/jscpd-report.json` (backend duplicate blocks)
- `.tmp/jscpd-split/frontend-src-all-20/jscpd-report.json` (frontend duplicate blocks)
- Full source file inventory (backend/frontend code files excluding `node_modules`, `.venv`, build outputs)

## 2. Per-File Cross-Check (Every Source File)
A cross-check matrix for every source code file is included here:
- [per_file_crosscheck.csv](/Users/noufi1/stk_final/Stock_final/docs/audits/2026-05-03-codebase-audit/per_file_crosscheck.csv)

CSV columns:
- `file`
- `category` (backend/frontend)
- `language`
- `zero_inbound_static` (1/0)
- `runtime_unreached_static` (1/0)
- `in_duplicate_clone_block` (1/0)

Cross-check totals:
- Total source files checked: 1068
- Backend source files: 410
- Frontend source files: 658

## 3. Unused Files (Static Signals)
Important: these are static-analysis signals, not guaranteed safe-to-delete without runtime validation.

- Python files with zero inbound references: 209
  - [unused_source_python_zero_inbound.txt](/Users/noufi1/stk_final/Stock_final/docs/audits/2026-05-03-codebase-audit/unused_source_python_zero_inbound.txt)
- JS/TS files with zero inbound references: 241
  - [unused_source_js_zero_inbound.txt](/Users/noufi1/stk_final/Stock_final/docs/audits/2026-05-03-codebase-audit/unused_source_js_zero_inbound.txt)

Runtime-unreached signals:
- Python runtime-unreached: 229
  - [runtime_unreached_source_python.txt](/Users/noufi1/stk_final/Stock_final/docs/audits/2026-05-03-codebase-audit/runtime_unreached_source_python.txt)
- JS/TS runtime-unreached: 311
  - [runtime_unreached_source_js.txt](/Users/noufi1/stk_final/Stock_final/docs/audits/2026-05-03-codebase-audit/runtime_unreached_source_js.txt)

## 4. Duplicate Code Blocks (In Code Files)
Detected clone blocks:
- Backend clone blocks: 6
- Frontend clone blocks: 17

Raw duplicate block data (file + line references):
- [duplicate_blocks_backend.tsv](/Users/noufi1/stk_final/Stock_final/docs/audits/2026-05-03-codebase-audit/duplicate_blocks_backend.tsv)
- [duplicate_blocks_frontend.tsv](/Users/noufi1/stk_final/Stock_final/docs/audits/2026-05-03-codebase-audit/duplicate_blocks_frontend.tsv)

Clone stats snapshots:
- [jscpd_backend_stats.txt](/Users/noufi1/stk_final/Stock_final/docs/audits/2026-05-03-codebase-audit/jscpd_backend_stats.txt)
- [jscpd_frontend_stats.txt](/Users/noufi1/stk_final/Stock_final/docs/audits/2026-05-03-codebase-audit/jscpd_frontend_stats.txt)

### Backend duplicate block map
| Area | File A | Lines | File B | Lines | Block lines |
|---|---|---|---|---|---|
| backend | backend/services/enhanced_connection_pool.py | 435-455 | backend/services/enhanced_connection_pool.py | 379-399 | 21 |
| backend | backend/scripts/check_sql_barcodes.py | 1-30 | backend/scripts/check_sql_barcodes_v2.py | 1-30 | 30 |
| backend | backend/api/user_management_api.py | 837-872 | backend/api/user_management_api.py | 777-812 | 36 |
| backend | backend/api/test_support_api.py | 644-688 | backend/api/test_support_api.py | 574-619 | 45 |
| backend | backend/api/test_support_api.py | 699-735 | backend/api/test_support_api.py | 575-612 | 37 |
| backend | backend/api/dashboard_analytics_api.py | 549-575 | backend/api/dashboard_analytics_api.py | 476-502 | 27 |

### Frontend duplicate block map
| Area | File A | Lines | File B | Lines | Block lines |
|---|---|---|---|---|---|
| frontend | frontend/src/store/__tests__/settingsStore.userScope.test.ts | 186-210 | frontend/src/store/__tests__/settingsStore.userScope.test.ts | 62-86 | 25 |
| frontend | frontend/src/store/__tests__/settingsStore.userScope.test.ts | 224-254 | frontend/src/store/__tests__/settingsStore.userScope.test.ts | 100-130 | 31 |
| frontend | frontend/src/store/__tests__/settingsStore.userScope.test.ts | 296-336 | frontend/src/store/__tests__/settingsStore.userScope.test.ts | 214-130 | 41 |
| frontend | frontend/src/store/__tests__/authStore.loadStoredAuthRace.test.ts | 44-68 | frontend/src/store/__tests__/authStore.logout.test.ts | 52-76 | 25 |
| frontend | frontend/src/store/__tests__/authStore.establishSession.test.ts | 24-64 | frontend/src/store/__tests__/authStore.logout.test.ts | 36-76 | 41 |
| frontend | frontend/src/services/__tests__/httpClient.unauthorized.test.ts | 138-166 | frontend/src/services/__tests__/httpClient.unauthorized.test.ts | 20-48 | 29 |
| frontend | frontend/src/services/__tests__/httpClient.unauthorized.test.ts | 166-224 | frontend/src/services/__tests__/httpClient.unauthorized.test.ts | 48-106 | 59 |
| frontend | frontend/src/domains/reports/types.ts | 5-45 | frontend/src/services/api/reportApi.ts | 8-48 | 41 |
| frontend | frontend/src/domains/auth/types.ts | 16-52 | frontend/src/services/api/authApi.ts | 31-69 | 37 |
| frontend | frontend/src/components/settings/FontSizeSlider.tsx | 109-140 | frontend/src/components/settings/FontStylePicker.tsx | 87-118 | 32 |
| frontend | frontend/src/components/settings/ChangePasswordModal.tsx | 265-309 | frontend/src/components/settings/ChangePinModal.tsx | 205-249 | 45 |
| frontend | frontend/src/components/navigation/AdminSidebar.tsx | 68-91 | frontend/src/components/navigation/SupervisorSidebar.tsx | 154-177 | 24 |
| frontend | frontend/src/components/navigation/AdminSidebar.tsx | 368-402 | frontend/src/components/navigation/SupervisorSidebar.tsx | 451-485 | 35 |
| frontend | frontend/src/components/feedback/ToastProvider.tsx | 18-42 | frontend/src/components/feedback/ToastProvider.web.tsx | 18-42 | 25 |
| frontend | frontend/src/components/feedback/AdminCrashScreen.tsx | 42-82 | frontend/src/components/feedback/StaffCrashScreen.tsx | 43-83 | 41 |
| frontend | frontend/src/components/feedback/AdminCrashScreen.tsx | 54-85 | frontend/src/components/feedback/StaffCrashScreen.tsx | 55-86 | 32 |
| frontend | frontend/src/components/feedback/AdminCrashScreen.tsx | 191-228 | frontend/src/components/feedback/StaffCrashScreen.tsx | 188-225 | 38 |

## 5. Exact Duplicate Source Files by Hash
Checked source files for exact byte-level duplicates (excluding `node_modules`, `.venv`, build/coverage artifacts).

Result: **No exact duplicate source files found**.

## 6. Immediate Recommendations
1. Review and classify zero-inbound files into: active-compatibility, test-only, removable.
2. Refactor high-value duplicate blocks first (shared utilities, repeated request/response mapping).
3. Keep compatibility wrappers only where migration is still active; remove stale wrappers after route/client migration closes.
4. Re-run this report after cleanup to verify reduction in unused and duplicate counts.
