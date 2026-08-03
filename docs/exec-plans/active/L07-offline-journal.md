# Durable Offline Command Journal Execution Plan

## Goal
Replace mutable offline queue replay with deterministic commands using SQLite journal, stable command IDs, sequence numbers, acknowledgements, and conflict quarantine.

## Loop Status
PENDING

## Dependencies
- L02 must be complete (session ownership needed for command actor tracking)

## Execution Steps
1. Design device-side SQLite command journal schema
2. Implement command creation with command_id, payload_hash, sequence number
3. Implement command state machine (PENDING → IN_FLIGHT → ACKNOWLEDGED/CONFLICT/REJECTED)
4. Implement server-side deduplication (command ID + hash)
5. Implement security conflict detection (command ID + different hash)
6. Implement stale sequence rejection
7. Implement staff payload validation (no approval fields)
8. Implement single transaction for business write + idempotency acknowledgement
9. Implement backend reachability check (not public internet)
10. Implement conflict quarantine for duplicate resolution
11. Write unit and integration tests for all scenarios

## Verification
- Duplicate command ID + same hash → idempotent success
- Duplicate command ID + different hash → security conflict
- LAN disconnect mid-sync → commands preserved
- Application killed mid-sync → commands preserved
- Device restarts → commands preserved
- Token expires → commands preserved
- Backend commits but response lost → commands preserved