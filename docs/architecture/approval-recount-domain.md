# Approval & Recount Domain Architecture

## Overview

The approval and recount domain manages supervisor review, auto-approval decisions, blind recounts, and finalisation with deterministic projections.

## Strict Auto-Approval

Auto-approve only when ALL conditions are satisfied simultaneously:

1. SQL validation complete
2. Quantity delta = 0
3. No batch-level mismatch
4. No serial conflict
5. No MRP/date/barcode mismatch
6. No damage or condition exception
7. No location exception
8. No provisional entity
9. Mandatory remark present
10. Evidence policy satisfied
11. No sync conflict
12. No stale item policy

A threshold must never auto-approve a non-zero variance merely because it is small.

## Supervisor Queues

Supervisors see the following queues:
- Quantity variance
- Batch/MRP mismatch
- Serial conflict
- Location investigation
- Damage and condition
- Return/repair
- Provisional batch
- Bundle/barcode proposal
- Unknown item
- Recount
- Sync conflict

## Blind Recount

1. Prefer a different employee (not the original counter).
2. Hide original physical count and variance from the recounting employee.
3. Keep original observation immutable.
4. Fetch a new SQL snapshot at recount submission.
5. Compare both observations and both SQL snapshots.
6. Supervisor decides the final accepted observation.

## Finalisation Preflight

Before a session can be marked FINALIZED, all of the following must pass:

- All location sessions submitted
- All commands acknowledged
- No blocked sync records
- No unresolved duplicate conflicts
- No pending SQL validation
- No unresolved recount
- All required evidence uploaded
- Serial reconciliation passes
- Projections match
- Rack locks can be released

## Finalisation Statuses

| Status | Description |
|---|---|
| REVIEW_READY | All counts submitted, awaiting finalisation check |
| FINALIZATION_CHECKING | Preflight validation in progress |
| FINALIZATION_BLOCKED | One or more blocking states detected |
| FINALIZATION_PENDING_SIDE_EFFECTS | Validation passed, waiting for side effects to complete |
| FINALIZED | Immutable, reconciled, and trustworthy |

## Finalisation Strategy

Finalisation should either be transactional or driven by an append-only finalisation event with deterministic projections.