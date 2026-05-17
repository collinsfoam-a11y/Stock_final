---
name: stock-verification-test-runner
description: Use when selecting or running Stock Verify tests after backend, frontend, sync, barcode, serial, UOM, variance, session, snapshot, approval, or UI changes. Maps change types to the narrowest useful verification commands before broader CI.
---

# Stock Verification Test Runner

Use this skill to choose verification for Stock Verify changes. Prefer the narrowest meaningful command first, then expand when the touched contract or risk requires it.

## Sources

- `Makefile`
- `docs/TESTING_GUIDE.md`
- `AGENTS.md`

## Baseline Commands

- Compact repo check: `make agent-ci`
- Backend tests: `make python-test`
- Frontend tests: `make node-test`
- Frontend typecheck: `make node-typecheck`
- Frontend lint and UI governance: `make node-lint`
- UI governance only: `make node-ui-governance` or `make node-ui-governance-strict`
- Full CI: `make ci`

## Targeted Backend Tests

- Barcode normalization or ERP lookup: `./scripts/python.sh -m pytest backend/tests/test_barcode_validation.py`
- Count-line write path: `./scripts/python.sh -m pytest backend/tests/test_count_lines_api.py backend/tests/governance/test_count_line_write_service_authority.py`
- SQL / ERP read-only rules: `./scripts/python.sh -m pytest backend/tests/governance/test_sql_read_only.py backend/tests/governance/test_sql_verified_qty_authority.py`
- Session lifecycle: `./scripts/python.sh -m pytest backend/tests/test_sessions_api.py backend/tests/governance/test_session_transitions.py`
- Snapshot maintenance: `./scripts/python.sh -m pytest backend/tests/test_backfill_session_snapshots.py`
- Offline sync: `./scripts/python.sh -m pytest backend/tests/test_offline_sync.py backend/tests/test_sync.py backend/tests/api/test_sync_batch_canonical.py`
- Variance or approvals: `./scripts/python.sh -m pytest backend/tests/test_variance_service.py backend/tests/test_ai_variance.py`
- Governance-sensitive backend edits: `./scripts/python.sh -m pytest backend/tests/test_governance.py backend/tests/test_governance_contracts.py backend/tests/governance`

## Targeted Frontend Tests

- API mapping changes: `cd frontend && npm test -- src/services/__tests__/api.test.ts src/services/api/api.test.ts`
- Barcode workflow: `cd frontend && npm test -- src/services/api/__tests__/inventoryWorkflowApi.barcode.test.ts src/utils/__tests__/validation.test.ts`
- Offline queue or sync: `cd frontend && npm test -- src/services/offline/__tests__/offlineStorage.queue.test.ts src/services/__tests__/syncBatch.test.ts src/services/sync/conflictResolution.test.ts`
- Scan submission hooks: `cd frontend && npm test -- src/domains/inventory/hooks/scan/__tests__`
- Serial scanning: `cd frontend && npm test -- src/utils/__tests__/scanUtils.serialFormat.test.ts src/components/modals/__tests__/serialScannerState.test.ts`
- Session management API: `cd frontend && npm test -- src/services/__tests__/sessionManagementApi.test.ts`
- Recount UI smoke when backend is running on `127.0.0.1:8001`: `make node-e2e-recount-smoke`

## Selection Rules

1. If a command may mutate MongoDB, deploy, rebuild production state, or uses `--execute`, `--apply`, `--write`, `--fix`, use `approval-gated-maintenance` first.
2. If a change touches stock truth, event logs, projections, serial uniqueness, UOM, variance, or sync semantics, run the relevant focused backend tests plus governance tests.
3. If a change touches frontend API contracts, run frontend API tests and typecheck.
4. If a change touches screens, layout, styles, motion, or components, run UI governance and the nearest component or hook tests.
5. If backend and frontend contracts both changed, run both focused suites before `make agent-ci`.
6. Report commands that could not run and why; do not claim verification passed when the environment blocked it.

