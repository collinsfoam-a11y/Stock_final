# Deletion and Mapping Recheck - 2026-08-01

## Current audit status

Latest deep audit evidence:

- Report: `.agent/reports/codebase-audit/20260731T221720Z/REPORT.md`
- Terminal state: `FAILED_TESTS`
- Source files inventoried: 1053
- Exact duplicate source groups: 0

Passed gates:

- repository hygiene
- git diff integrity
- basic repository health
- duplicate route registrations
- backend static analysis
- backend stock contracts
- frontend typecheck
- frontend runtime governance
- backend test suite
- frontend lint
- frontend test suite
- frontend UI governance
- frontend runtime health
- frontend dependency regression
- backend security evaluation
- frontend web build

Remaining failed gates:

- backend strict typecheck
- frontend unused-code check
- backend static security scan
- dependency vulnerability scan
- tracked secret scan

## Corrected deletion classification

Do not treat the current `_unwanted/` moves as a safe commit-ready deletion set.
They are staged renames, not proven removals, and committing them would remove the original
module paths from the product tree.

### Not safe to delete automatically

- `backend/api/location_session_api.py`
- `backend/api/master_session_api.py`
- `backend/api/schemas_variance.py`
- registered `worktrees/L02` through `worktrees/L14`
- tracked `.agent/backups`
- compatibility shims that still have importers, including backend service/config shims

Reason: these overlap migration, compatibility, or retention boundaries. They need ownership
and retention confirmation before removal.

### Delete candidates after explicit approval

These are likely cleanup candidates, but deletion is still a workspace mutation and should be
approved before execution:

- untracked root probes: `check_indexes.py`, `seed_items.py`, `test_mongo_query.py`,
  `test_search.py`, `test_search_auth.py`, `test_search_service.py`,
  `test_search_service2.py`
- generated/cache artifacts: `.DS_Store`, `.agent/reports/codebase-audit/.DS_Store`,
  `.venv/**/__pycache__`, duplicate local virtualenv/cache content
- backup config files: `.env.bak`, `.flake8.bak`
- stale frontend probe: `frontend/test-login.js`

### Frontend unused-code candidates

Current `pnpm run knip:check` reports these six unused files:

- `frontend/src/components/operational/ExceptionRouter.tsx`
- `frontend/src/components/ui/AuroraBackground.tsx`
- `frontend/src/components/ui/legacyVisualSystem.ts`
- `frontend/src/components/ui/ParticleField.tsx`
- `frontend/src/viewModels/exceptionAdapter.ts`
- `frontend/src/viewModels/finalizationAdapter.ts`

These should be reviewed for dynamic routing or planned UI migration before removal.

## Mapping and wiring status

Resolved or currently passing:

- frontend literal API route mapping: no confirmed unmatched literal backend route paths
- duplicate backend route registrations: currently passes with 383 unique signatures
- frontend scan dedup test now imports the canonical inventory service
- `CountLineGovernanceDecision` is exported through `backend.services.count_line_write_service`
- static frontend serving tolerates missing optional asset folders
- backend test suite passes: 1163 passed, 13 skipped, 1 deselected

Still not fully wired:

- count-line split mixins need protocols or base interfaces for shared attributes such as
  `db`, `_resolve_awaitable`, `_execute_authorized_write`, and validation/governance helpers
- SQL sync split mixins need a common protocol/base for `sql_connector`, `mongo_db`,
  `_sync_single_item`, `_sync_stats`, and sync metadata fields
- approval flow still has strict type failures around missing
  `ApprovalExceptionType.LOCATION_INVESTIGATION`, enum/string drift, and recount requester typing
- offline sync has remaining typing around unannotated keyword argument dictionaries
- secret scan now runs but reports many likely false positives and some entries requiring review
- dependency scan still reports vulnerable frontend and backend dependency chains

## Recommended next loop

Handle mapping/wiring before deletion:

1. Fix strict type roots for count-line and SQL-sync mixin contracts.
2. Fix approval enum/schema drift with focused acceptance tests.
3. Re-run deep audit.
4. Only after those pass, make a separate deletion PR for reviewed unused files and probes.

Do not delete migration-owned files, worktrees, backups, or compatibility shims until ownership
and retention decisions are explicit.
