---
name: backend-governance-write-paths
description: Use when changing Stock Verify backend writes, count_lines, sessions, recounts, session_snapshots, unknown_items, SQL verification, or governance-sensitive backend files. Enforces backend/README.md write-path invariants and restricted-file rules.
---

# Backend Governance Write Paths

Use this skill before backend edits that can create, update, delete, approve, reconcile, repair, or migrate application data.

## Authoritative Docs

- `backend/README.md`
- `AGENTS.md`
- `docs/architecture/SESSION_LIFECYCLE.md`
- `docs/architecture/APPROVAL_WORKFLOW.md`

## Restricted Files

Do not propose edits to these unless the task explicitly says remediation or governance:

- `backend/services/sql_verification_service.py`
- `backend/services/sql_sync_service.py`
- `backend/api/item_verification_api.py`
- `backend/config/governance.py`
- `backend/sql_server_connector.py`

## Required Write Services

- All `count_lines` mutations go through `backend/services/count_line_write_service.py` using `CountLineWriteService.process_write(...)`.
- All `sessions`, `verification_sessions`, `recount_requests`, and `session_snapshots` mutations go through `backend/services/session_lifecycle_service.py`.
- All `unknown_items` mutations go through `backend/services/unknown_item_service.py`.

Do not add direct `insert_one`, `update_one`, `update_many`, `delete_one`, `delete_many`, or `bulk_write` calls for these collections outside the governed service.

## Forbidden Backend Moves

- No SQL `INSERT`, `UPDATE`, or `DELETE`.
- No direct stock quantity mutation APIs.
- No direct business-data deletes or updates outside governed write services.
- No manual `stock_qty` reconciliation without optimistic locking.
- Do not enable `advanced_erp_sync.py`.

## Verification

Run the most relevant checks:

- `./scripts/python.sh -m pytest backend/tests/test_governance_contracts.py`
- `./scripts/python.sh -m pytest backend/tests/governance/`
- Focused tests for any touched service or route

If Python is unavailable, report that backend verification is blocked rather than presenting the task as fully verified.
