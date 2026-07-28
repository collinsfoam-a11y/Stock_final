# SQL-at-Submission and Variance Engine Execution Plan

## Goal
Establish clear ERP truth without mislabelling cached data. Compute audit and operational deltas.

## Loop Status
PENDING

## Dependencies
- L03 must be complete (master/location sessions)
- L05 must be complete (observation model)

## Execution Steps
1. Add sql_qty_at_submission and related fields to observation schema
2. Implement live SQL quantity fetch on submission
3. Store SQL snapshot with source metadata
4. Calculate provisional delta at submission time
5. Handle PENDING_SQL_VALIDATION when SQL unavailable
6. Implement enterprise-level variance aggregation
7. Implement shortage investigation workflow
8. Implement ERP movement model (inbound/outbound/adjustments)
9. Write unit and integration tests

## Verification
- sql_qty_at_submission is never Mongo cached stock
- Physical observation saved even when SQL unavailable
- Audit delta = total_physical - frozen_baseline
- Operational delta = total_physical - movement_adjusted_expected