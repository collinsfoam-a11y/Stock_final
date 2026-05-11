# Unused File Decision Report
Date: 2026-05-03

This report classifies each unused-file static signal into `keep`, `review`, or `remove`.

## Decision Summary
- Total files assessed: **450**
- Keep: **295**
- Review: **154**
- Remove: **1**

Raw per-file matrix:
- [unused_file_decisions.csv](/Users/noufi1/stk_final/Stock_final/docs/audits/2026-05-03-codebase-audit/unused_file_decisions.csv)

Grouped lists:
- [unused_keep_list.txt](/Users/noufi1/stk_final/Stock_final/docs/audits/2026-05-03-codebase-audit/unused_keep_list.txt)
- [unused_review_list.txt](/Users/noufi1/stk_final/Stock_final/docs/audits/2026-05-03-codebase-audit/unused_review_list.txt)
- [unused_remove_list.txt](/Users/noufi1/stk_final/Stock_final/docs/audits/2026-05-03-codebase-audit/unused_remove_list.txt)

## Folder-Wise Breakdown
| Area | Keep | Review | Remove | Total |
|---|---:|---:|---:|---:|
| backend/api | 1 | 1 | 0 | 2 |
| backend/app | 1 | 0 | 0 | 1 |
| backend/config | 0 | 1 | 0 | 1 |
| backend/core | 2 | 0 | 0 | 2 |
| backend/db | 1 | 0 | 0 | 1 |
| backend/locustfile.py | 0 | 1 | 0 | 1 |
| backend/middleware | 1 | 7 | 0 | 8 |
| backend/models | 1 | 3 | 0 | 4 |
| backend/scripts | 0 | 33 | 0 | 33 |
| backend/services | 0 | 2 | 1 | 3 |
| backend/tests | 147 | 0 | 0 | 147 |
| backend/utils | 1 | 4 | 0 | 5 |
| frontend/.eslintrc.js | 1 | 0 | 0 | 1 |
| frontend/__tests__ | 4 | 0 | 0 | 4 |
| frontend/app | 59 | 0 | 0 | 59 |
| frontend/babel.config.js | 1 | 0 | 0 | 1 |
| frontend/e2e | 8 | 0 | 0 | 8 |
| frontend/expo-sqlite.d.ts | 1 | 0 | 0 | 1 |
| frontend/index.js | 1 | 0 | 0 | 1 |
| frontend/jest.config.js | 1 | 0 | 0 | 1 |
| frontend/jest.polyfills.js | 1 | 0 | 0 | 1 |
| frontend/jest.setup.js | 1 | 0 | 0 | 1 |
| frontend/metro.config.js | 1 | 0 | 0 | 1 |
| frontend/playwright.config.ts | 1 | 0 | 0 | 1 |
| frontend/plugins | 0 | 1 | 0 | 1 |
| frontend/react-native-text-override.d.ts | 1 | 0 | 0 | 1 |
| frontend/scripts | 0 | 2 | 0 | 2 |
| frontend/src | 58 | 97 | 0 | 155 |
| frontend/test_config.js | 0 | 1 | 0 | 1 |
| frontend/tests | 1 | 0 | 0 | 1 |
| frontend/typescript-plugin-filter-text-errors.js | 0 | 1 | 0 | 1 |

## Remove Candidates (Immediate)
| File | Reason |
|---|---|
| backend/services/advanced_erp_sync_DISABLED_DO_NOT_USE.py | Explicitly marked as disabled/dead in filename; safe cleanup candidate after final check. |

## Review Buckets
Most review decisions are due to manual/operational scripts, compatibility wrappers, and runtime-unreached signals that need owner confirmation.

| Review Reason | Count |
|---|---:|
| Runtime-unreached static signal; needs manual validation before removal. | 87 |
| Operational script/utility; likely invoked manually, not by imports. | 35 |
| Barrel export file; may be imported indirectly by path aliases. | 22 |
| Storybook/story asset; optional in production but may be used in design/dev workflow. | 4 |
| Type declaration file; consumed by TypeScript compiler/tooling. | 4 |
| Compatibility/deprecation bridge; remove only after confirming no legacy importers remain. | 1 |
| Unreached + in clone blocks; candidate for consolidation or removal after owner validation. | 1 |

## Notes
- `keep` does not mean high runtime usage; it means the file is expected to be externally discovered (test runner, framework routing, or toolchain).
- `review` means do not delete blindly; confirm with module owners and runtime smoke checks.
- `remove` means high-confidence cleanup candidate.
