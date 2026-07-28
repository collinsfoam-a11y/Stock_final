# Location Session Domain Execution Plan

## Goal
Separate enterprise count control from employee location work with master/location session hierarchy.

## Loop Status
PENDING

## Dependencies
- L02 must be complete (session ownership is prerequisite)

## Execution Steps
1. Add master_sessions collection
2. Add locations collection with hierarchy
3. Add location_sessions collection
4. Add location_session_events collection
5. Implement location hierarchy CRUD
6. Implement master session creation and management
7. Implement location session creation and claiming
8. Add location session status machine
9. Write unit and integration tests

## Verification
- Same SKU in different locations: allowed and aggregated
- Same master_session + location: one location session
- Same location_session + item: one active count bucket
- Location change is observed correction, not automatic ERP update