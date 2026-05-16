# DATA_MODEL — Event-Sourced Enterprise Structure

## Canonical Truth
- `event_log`: immutable stock-flow and audit truth.
- Projections: `items_snapshot`, `batch_records`, `serial_records`, `damage_logs`, `variance_logs`, `approvals`, `sync_queue`, `erp_snapshot`, `serial_registry`.

## Count Entry Schema (Required)
- item_id
- barcode
- location_id
- batch_id
- serial_id[]
- good_qty
- damaged_qty
- blocked_qty
- expired_qty
- missing_qty
- extra_qty
- physical_mrp
- system_mrp
- manufacture_date
- expiry_date
- condition
- variance_reason
- photos[]
- remarks
- counted_by
- counted_at
- device_id
- gps (optional)

## Serial Lifecycle Status
- Active
- Damaged
- Expired
- Not Working
- Lost
- Transferred
- Returned
- Scrapped
- Pending Verification
- Duplicate Suspected

## Offline Sync Requirements
- local queue
- optimistic capture
- retry engine
- conflict resolution
- stale snapshot detection
- partial sync
- duplicate prevention
- offline attachment queue

Conflict rule: if server inventory changed after snapshot timestamp, mark conflict and require revalidation.

## Mandatory Audit Events
- session_created
- session_locked
- item_scanned
- qty_changed
- serial_added
- serial_removed
- approval_submitted
- approval_rejected
- recount_requested
- snapshot_generated
- sync_conflict
- override_performed

Each event must store actor, timestamp, device, before/after values, session, and optional IP/GPS.
