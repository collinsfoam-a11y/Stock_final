# Tracking Policy Execution Plan

## Goal
Make the system—not staff—control item complexity with backend-controlled tracking policy snapshots.

## Loop Status
PENDING

## Dependencies
- L03 must be complete (master/location sessions need item-level policy)

## Execution Steps
1. Add tracking_policy_snapshot collection
2. Define tracking modes: QUANTITY, BATCH, SERIAL, BUNDLE
3. Remove staff-facing toggle controls (Is Serialized Item, Has expiry date)
4. Add policy versioning
5. Enforce zero-count acceptance
6. Enforce mandatory remark
7. Enforce UOM precision in backend
8. Implement structured split count format
9. Write unit and integration tests

## Verification
- Staff cannot bypass item tracking or UOM policy through frontend manipulation
- Offline payload editing cannot change policy
- Physical 0 is accepted
- Negative quantities are rejected
- Remark is required on submission