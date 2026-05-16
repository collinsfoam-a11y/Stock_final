# DOMAIN — Enterprise Stock Verify (Frozen Baseline)

## Scope
Stock Verify governs warehouse physical verification workflows across sessions, mobile/offline capture, reconciliation, approval, and ERP-aligned auditability.

## Core Domain Invariants
- ERP is read-only reference data; operational write truth is in MongoDB event/projection model.
- Inventory truth is event-sourced (`event_log`) and never replaced by mutable-only stock snapshots.
- Session-start snapshot is immutable and is the sole comparison baseline for that session lifecycle.
- Serial uniqueness is item-scoped (`item_code + serial`) and must remain consistent across backend/frontend/offline sync.

## Primary Domain Aggregates
- Session
- Count Line
- Inventory Dimension Record
- Serial Registry Entry
- Approval Decision
- Reconciliation Report
- Audit Event

## Required Session Types
- Full Physical Inventory
- Rack Count
- Zone Count
- Spot Audit
- Cycle Count
- High-Risk Item Count
- Post-Receipt Verification
- Pre-Dispatch Verification
- Damage Inspection Count
- Expiry Verification Count
- Blind Count
- Recount Session
- Supervisor Validation Session

## Cross-Cutting Constraints
- Blind Count hides ERP quantity from counters.
- Closed sessions are immutable.
- Reopened sessions create a new audit version.
- Counters cannot finalize inventory.
- Serial deletion is forbidden.
