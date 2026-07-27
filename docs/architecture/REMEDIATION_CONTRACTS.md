# Stock Verify remediation contracts

Status: accepted baseline for the phased remediation program
Effective: 2026-07-27

This document resolves differences between the verification report, older architecture notes, and the running code. It defines the behavior that later phases must preserve or deliberately migrate. Where current behavior violates the target contract, the gap is named explicitly rather than treated as accepted behavior.

## 1. Ownership and sources of truth

| Concern | Authoritative owner | Contract |
|---|---|---|
| ERP item and stock reference | SQL Server bridge and session snapshot | SQL Server is read-only. A session compares physical counts with its frozen snapshot, never a later live ERP value. |
| Session lifecycle | `SessionLifecycleService` | API routes may validate and translate requests but may not mutate governed session collections directly. |
| Count-line writes | `CountLineWriteService` | Every insert, update, supersede, finalization write, or migration flows through this service and its audit/projection collaborators. |
| Offline queue | Device queue plus `/api/sync/batch` | The client owns pending delivery; the server owns acceptance, deduplication, conflict classification, and persisted truth. |
| Read models | Projection services | Projections are rebuildable and must never become an independent write authority. |
| Audit history | Governance audit/event records | Material actions are append-only and attributable to an actor or named system process. |

Direct database writes from API routes are forbidden for governed collections. Multi-document domain changes use the repository transaction boundary. Repair and migration scripts are domain clients, not alternate authorities.

## 2. Session lifecycle

The canonical runtime lifecycle is:

```text
OPEN/ACTIVE -> PAUSED or REVIEW -> FINALIZED
                         ^             |
                         |             +-- immutable
                         +-- recount/review work
```

Older labels may be accepted at compatibility boundaries, but services normalize them before decisions. Only the canonical `/api/sessions/{session_id}/finalize` path may finalize. The legacy `complete` and bulk-close paths remain disabled.

Finalization requires all of the following:

- the session exists, is not already finalized, and is in `REVIEW`;
- the caller has finalization authority;
- unknown items are resolved or dismissed;
- recount requests are completed, cancelled, or expired;
- active count lines are not `PENDING`, `NEEDS_REVIEW`, rejected, conflicted, or otherwise blocking;
- required offline uploads and conflicts are resolved (Phase 2 extends the existing gate to make this explicit and shared with the UI);
- the state transition and count-line locking occur through the lifecycle and count-line services;
- the final actor, time, totals, and audit event are persisted.

After `FINALIZED`, governed mutation is rejected. Reopening must create a versioned, audited continuation; it must not erase or silently unlock the finalized record.

## 3. Count-line lifecycle and immutability

The supported lifecycle is:

```text
draft -> submitted -> pending_approval -> approved -> locked
                         |                  |
                         +-> rejected ------+-> recount creates a new version

any replaceable non-final line -> superseded -> immutable historical record
```

Invariants:

- a locked or finalized line cannot be edited;
- a recount creates a new version linked by `previous_version_id`/`recount_of_id`;
- superseded lines remain queryable but are excluded from active totals;
- serial quantity equals the number of normalized serials;
- damaged quantity cannot exceed counted quantity;
- semantic identity includes session, item, location, quantity, version, and batch identity;
- every material transition records actor, reason where applicable, timestamp, and audit event.

Known Phase 1 gap: `COUNT_LINE_DELETE` and `SESSION_DELETE` are still present in permission definitions and documentation, and the write service can execute delete operations. The target contract forbids business deletion. Phase 1 must replace user-facing deletion with void/supersede semantics and restrict physical deletion to a separately authorized retention process.

## 4. Idempotency and offline conflict policy

Each offline count has a stable client-generated `client_record_id`; the server persists it as the idempotency key. Retrying the same logical operation must return the prior outcome or a successful no-op and must not create a second count line. A batch ID is tracking metadata and does not replace per-record idempotency.

Canonical decisions:

| Condition | Server outcome | Client outcome |
|---|---|---|
| Exact replay | success/no-op | remove the acknowledged queue entry |
| Transient network or 5xx failure | retryable failure | retain payload and retry with the same key |
| Authentication failure | blocked delivery | retain payload; refresh credentials before retry |
| Duplicate serial or incompatible concurrent write | conflict | quarantine as `blocked_conflict`; never auto-merge |
| Validation failure | non-retryable error | retain for manual correction/review |
| Finalized session | conflict/rejection | retain evidence; do not reopen or mutate the session automatically |

Legacy operations-based sync is disabled. Conflict resolution must produce a new audited decision or operation; it must not edit the original queued evidence invisibly.

## 5. Repair and migration safety

All repair and migration commands are dry-run by default. Execution requires an explicit flag, a bounded target, an identified actor, a reason/change reference, pre-change counts, backup or rollback evidence, post-change verification, and an audit artifact.

Known Phase 1 gap: the `repair` governance profile disables active-session and full-context checks, while `repair_skip` bypasses business validation. Phase 1 must add explicit authorization and evidence requirements at the service boundary. Existing scripts being dry-run by default is necessary but not sufficient.

## 6. Canonical API error envelope

New or migrated endpoints return errors in this shape:

```json
{
  "error": {
    "code": "STABLE_MACHINE_CODE",
    "message": "Safe user-facing summary",
    "details": {},
    "retryable": false,
    "request_id": "correlation-id"
  }
}
```

Rules:

- `code` is stable and drives client recovery; HTTP status alone is insufficient;
- `message` contains no secrets, stack traces, database text, or raw payloads;
- `details` is structured and contains only safe fields needed for recovery;
- `retryable` is decided by the server contract, not guessed from message text;
- `request_id` is accepted from or generated for the request and returned in response headers and the envelope;
- validation errors use the same outer envelope;
- compatibility adapters may read legacy `detail`, `error`, or `message` responses during migration, but new endpoints must not introduce another shape.

The current `StockVerifyException.to_dict()` shape is a legacy compatibility format. Phase 9 migrates server handlers and client parsing to the canonical envelope.

## 7. Change sequencing

Later phases must work in this order: governance hardening; finalization/offline safety; location identity; canonical inventory identity; physical batches; serial registry; damage/evidence; reconciliation; error-envelope migration; advanced features. A phase may add compatibility reads, but it may not make a newer model the sole write path until its migration, rollback, and characterization tests pass.

Any intentional contract change requires an architecture decision, updated tests, a migration/compatibility statement, and approval when it affects stored data or irreversible behavior.
