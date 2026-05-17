---
name: stock-contract-guardian
description: Use when changing Stock Verify inventory, stock-flow, serial, UOM, variance, recount, projection, sync, or ERP-adjacent behavior. Enforces the current Stock Contract V3.1 from AGENTS.md and docs/architecture so new work stays event-sourced, auditable, item-scoped for serials, and ERP read-only.
---

# Stock Contract Guardian

Use this skill before editing code that can affect stock truth, stock movement, count lines, projections, serials, batches, damage, variance, approvals, session comparisons, offline sync, or ERP reads.

## Current Source Of Truth

Read these first when details matter:

- `AGENTS.md`
- `backend/README.md`
- `docs/architecture/DOMAIN.md`
- `docs/architecture/DATA_MODEL.md`
- `docs/architecture/INVENTORY_RULES.md`
- `docs/architecture/SESSION_LIFECYCLE.md`
- `docs/architecture/APPROVAL_WORKFLOW.md`
- `docs/architecture/VARIANCE_ENGINE.md`

## Non-Negotiable Rules

- ERP / SQL Server is read-only reference data. Never add SQL write-back paths.
- `event_log` is the long-term stock verification truth. Do not introduce overwrite reconciliation or mutable-only truth models.
- Keep projections aligned with events: `items_snapshot`, `batch_records`, `serial_records`, `damage_logs`, `variance_logs`, `approvals`, `sync_queue`, `erp_snapshot`, `serial_registry`.
- Serial uniqueness is item-scoped: `item_code + serial`. Never reintroduce global serial uniqueness.
- Persist normalized quantities in base UOM. Reject negative quantities. Reject fractions for NOS-style units with `FRACTION_NOT_ALLOWED`; use `PRECISION_EXCEEDED` for precision violations.
- Session-start snapshots are immutable and must be the comparison baseline for that session lifecycle.
- Blind recount and dual-verification controls must not be weakened.

## Workflow

1. Identify which stock contract surface the task touches.
2. Read the smallest relevant source files and the matching architecture doc.
3. If the requested change conflicts with the contract, stop and propose a compliant path.
4. Keep changes inside governed services and existing patterns.
5. Add or run focused tests for the touched contract area.

## Verification

Prefer narrow tests first:

- `./scripts/python.sh -m pytest backend/tests/test_governance_contracts.py`
- Relevant backend tests under `backend/tests/governance/`
- Relevant frontend tests for sync, barcode, serial, UOM, variance, or offline behavior
- `make agent-ci` when local tooling is available
