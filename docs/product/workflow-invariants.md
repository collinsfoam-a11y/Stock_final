# Stock Verify Workflow Invariants

## Purpose

These invariants define the non-negotiable business rules that every feature, API endpoint, and UI workflow must preserve. They are machine-testable and will be validated by CI checks.

## Session Invariants

1. **SI-01**: Staff cannot approve their own observations.
2. **SI-02**: One employee has no more than one active location session.
3. **SI-03**: One location has no more than one active claimant.
4. **SI-04**: Session creation does not revoke refresh tokens.
5. **SI-05**: PAUSED is a real state (not converted to ACTIVE).
6. **SI-06**: After 60 minutes without heartbeat, state becomes STALE.
7. **SI-07**: Every ownership change is append-only (no deletion of ownership history).

## Count Invariants

8. **CI-01**: Zero is a valid physical count.
9. **CI-02**: Negative quantities are rejected.
10. **CI-03**: Every submitted item requires a remark.
11. **CI-04**: Staff cannot select quantity/batch/serial tracking mode.
12. **CI-05**: UOM precision is enforced in the backend.
13. **CI-06**: Serial item quantity equals accepted serial count.
14. **CI-07**: Split count is structured (lines with type, count, units_per_group, total).

## SQL Variance Invariants

15. **VI-01**: Cached ERP quantity must never be labelled as live SQL quantity (field `sql_qty`).
16. **VI-02**: `quantity_delta = physical_qty - expected_qty`.
17. **VI-03**: Shortage and excess are calculated as `max(expected - physical, 0)` and `max(physical - expected, 0)`.
18. **VI-04**: Physical observation is saved even when SQL is unavailable.

## Offline Command Invariants

19. **OC-01**: Every offline command has a stable ID and content hash.
20. **OC-02**: A command ID cannot be reused with different content.
21. **OC-03**: Staff payloads cannot contain approval fields.
22. **OC-04**: Business write and idempotency acknowledgement occur in one transaction.
23. **OC-05**: Unsynchronised commands are never silently deleted.

## Approval and Recount Invariants

24. **AR-01**: Staff cannot approve their own observations.
25. **AR-02**: Auto-approval requires ALL conditions to be satisfied simultaneously.
26. **AR-03**: A threshold must never auto-approve a non-zero variance merely because it is small.
27. **AR-04**: Blind recount hides original physical count and variance from the recounting employee.
28. **AR-05**: Recount creates a new observation version; previous records are marked superseded but retained.
26. **AR-06**: Supervisor changes create decision records, not silent edits.

## Data Integrity Invariants

29. **DI-01**: No count observation is physically deleted.
30. **DI-02**: Duplicate serials cannot be silently merged.
31. **DI-03**: Evidence requirements are determined by policy, not staff discretion.
32. **DI-04**: Offline staff sync cannot create approved or locked data.

## Finalisation Invariants

33. **FI-01**: Finalisation requires zero unresolved blocking states.
34. **FI-02**: All location sessions must be submitted.
35. **FI-03**: All commands must be acknowledged.
36. **FI-04**: No pending SQL validation records.
37. **FI-05**: No unresolved duplicate conflicts.
38. **FI-06**: All required evidence uploaded.
39. **FI-07**: Serial reconciliation passes.
40. **FI-08**: Projections match.