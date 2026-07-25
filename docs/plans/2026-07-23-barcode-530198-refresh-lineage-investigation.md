# Barcode 530198 Refresh Lineage Investigation Plan

**Objective:** Identify why refreshed quantity data for barcode `530198` differs from the expected value, using SQL as the first verified source before tracing data through sync, MongoDB, backend APIs, frontend cache, and React state.

**Scope:** Read-only investigation unless a later root-cause fix requires a separate reviewed code change. Do not mutate SQL Server, MongoDB stock records, sessions, snapshots, or sync projections as part of evidence collection.

---

## Phase 0 — SQL Connection & Environment Verification (Mandatory)

**Objective:** Confirm that the refresh process is querying the intended SQL Server instance and database before investigating the quantity discrepancy.

### Verify Connection

Capture and log:

- SQL Server name / instance
- Database name
- Authentication method (Windows / SQL Login)
- Connection string with credentials masked
- ODBC Driver version
- Application name (`APP` in the connection string, if configured)
- Connection encryption settings
- Read/write mode
- Server version
- Current database
- Current login
- Current server time
- Connection latency

Use a descriptive `APP` value in the SQL connection string where possible, so application connections are identifiable during troubleshooting.

### Verify Correct Server

Execute diagnostic queries for:

- Server name
- Database name
- SQL Server version
- Current login
- Server time

Confirm the returned values match the expected production or test environment before running business-data queries.

### Verify SQL Connectivity

Before running any business queries:

- Open the SQL connection
- Execute a simple health query
- Measure execution time
- Close the connection cleanly

If the connection cannot be established, stop the investigation and resolve the connectivity issue first. Verify the server instance, service availability, and connection configuration before deeper troubleshooting.

### Verify Connection Consistency

Ensure the following components all connect to the same SQL Server and database:

- Backend API
- SQL Refresh Service
- Sync Bridge
- Background Sync Worker
- Manual SQL scripts
- Admin tools

Verify there is no accidental mix of:

- Production vs test
- Primary vs replica
- Different database names
- Different SQL instances

### Verify Query Execution

For barcode `530198`, capture:

- Executed SQL
- Query parameters
- Execution time
- Returned row count
- Raw returned rows before mapping

This provides the baseline for the remaining investigation.

## Phase 0.5 — SQL Query & Data Model Validation

**Objective:** Verify that the SQL query itself matches ERP business rules before investigating application-layer transformations.

For barcode `530198`:

- Capture the exact SQL executed by `get_item_by_barcode`.
- Execute the SQL directly in SSMS with the same parameters.
- Record total rows returned.
- Record batch IDs.
- Record warehouse IDs.
- Record branch IDs.
- Record stock quantity per row.
- Determine whether multiple rows are expected, such as one row per batch or warehouse.
- Determine whether multiple rows are unexpected, such as join multiplication.
- If the ERP expected quantity is `24`, document exactly how that total is derived, such as `33 + (-9) = 24`.

## Updated Investigation Order

1. Phase 0 — SQL Connection & Environment Verification
2. Phase 0.5 — SQL Query & Data Model Validation
3. SQL Data Verification
4. Sync Bridge Verification
5. MongoDB Verification
6. Backend API Verification
7. Phase 4.5 — Backend Cache Verification
8. Frontend Store & Offline Cache Verification
9. React State Verification
10. Concurrency & Race Condition Analysis
11. Regression Tests
12. Root Cause Fix & Validation

## Phase 1 — SQL Data Verification

Confirm the raw ERP quantity and item identity for barcode `530198` directly in SQL after Phase 0 proves the connection target is correct.

## Phase 2 — Sync Bridge Verification

Trace whether the SQL row for barcode `530198` is selected, transformed, batched, and posted by the sync bridge without quantity or identity loss.

Capture:

- Sync start timestamp
- SQL value received
- MongoDB value before update
- MongoDB value after update
- UPSERT operation type
- Document ID
- `syncVersion`
- `updatedAt`

Verify the update logic replaces quantity with the incoming SQL quantity and does not add the incoming quantity to the existing MongoDB quantity.

## Phase 3 — MongoDB Verification

Verify the mirrored MongoDB documents and projection records reflect the SQL refresh result without stale or conflicting records.

## Phase 4 — Backend API Verification

Confirm API responses for barcode `530198` match MongoDB state and do not remap, coerce, cache, or fallback to stale values incorrectly.

## Phase 4.5 — Backend Cache Verification

If the backend uses any caching layer, including Redis, in-memory cache, or response cache, verify:

- Cache key
- Cache TTL
- Cache invalidation after refresh
- Whether `/refresh-sql-qty` bypasses cached item data

A stale backend cache can make the UI appear incorrect even when MongoDB is correct.

## Phase 5 — Frontend Store & Offline Cache Verification

Inspect frontend persistence and offline-first cache behavior to confirm barcode `530198` is not served from stale local state after refresh.

## Phase 6 — React State Verification

Trace screen-level state updates to ensure refreshed quantities replace previous values consistently during scan/search/item-detail flows.

## Phase 7 — Concurrency & Race Condition Analysis

Review refresh, background sync, offline replay, and UI fetch timing for races that could briefly or persistently reintroduce stale quantity data.

## Phase 8 — Regression Tests

Add or update focused tests around the confirmed failure path, prioritizing SQL-mapping, sync, API, and frontend cache boundaries as applicable.

## Phase 9 — Root Cause Fix & Validation

Apply the minimal root-cause fix, then re-run the narrowest useful verification before expanding to broader regression coverage.

## Final Deliverable

The investigation is not complete until every row in this evidence matrix has a confirmed quantity, `✅` verification status, and concrete evidence reference.

| Layer | Qty | Verified | Evidence |
| --- | --- | --- | --- |
| SQL Server | `24` | `✅` required | SSMS query |
| SQL Connector | `24` | `✅` required | Raw rows |
| Sync Bridge | `24` | `✅` required | Sync logs |
| MongoDB | `24` | `✅` required | Document |
| Backend API | `24` | `✅` required | JSON response |
| Backend Cache | `24` | `✅` required | Cache key / TTL / invalidation proof |
| Frontend Store | `24` | `✅` required | Store inspection |
| Offline Cache | `24` | `✅` required | MMKV / SQLite |
| React State | `24` | `✅` required | State snapshot |
| UI | `24` | `✅` required | Screenshot / log |

## Acceptance Criteria

- SQL connection verified against the intended server and database.
- SQL query behavior documented and validated.
- Every transformation layer traced with logs.
- Root cause isolated to a single layer.
- Minimal fix applied only to the isolated layer.
- Regression tests added for the identified failure mode.
- Repeated refreshes always produce the ERP quantity.
- No regressions for multi-batch items.
- No regressions for multi-warehouse items.
- No regressions for concurrent refreshes.
- No regressions for offline-to-online transitions.
- No regressions for cache invalidation.
