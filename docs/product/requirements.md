# Stock Verify Requirements

## Overview

Stock Verify is a mobile-first stock counting application for retail environments. It supports supervised counting sessions, batch/serial/bundle item tracking, offline command persistence, and auditable approval workflows.

## Session Ownership Requirements (R1)

- **R1.1**: One employee has at most one active counting session at any time.
- **R1.2**: One physical rack/location has at most one active location session within a master session.
- **R1.3**: Another employee may claim a session only after explicit pause/release, completion, cancellation, supervisor transfer, or inactivity exceeding 60 minutes.
- **R1.4**: Session creation does not revoke the creator's refresh tokens.
- **R1.5**: PAUSED is a real state distinct from ACTIVE.

## Counting Requirements (R2)

- **R2.1**: Zero is a valid physical count quantity.
- **R2.2**: Negative quantities are rejected.
- **R2.3**: Every submitted item requires a remark (mandatory field).
- **R2.4**: Staff cannot select quantity/batch/serial tracking mode; the system controls this via item policy snapshot.
- **R2.5**: UOM precision is enforced in the backend, not the frontend.

## SQL-at-Submission Requirements (R3)

- **R3.1**: On submission, the backend must fetch the live SQL quantity and store it as `sql_qty_at_submission`.
- **R3.2**: Cached ERP quantity must never be stored under the field `sql_qty`.
- **R3.3**: If SQL is unavailable, the observation status becomes `PENDING_SQL_VALIDATION`.
- **R3.4**: The physical observation is saved even when SQL is unavailable.

## Variance Requirements (R4)

- **R4.1**: `quantity_delta = physical_qty - expected_qty` (negative = shortage, positive = excess, zero = matched).
- **R4.2**: `shortage_qty = max(expected - physical, 0)`
- **R4.3**: `excess_qty = max(physical - expected, 0)`
- **R4.4**: Enterprise-level final variance aggregates accepted counts across all location sessions.

## Offline Command Requirements (R5)

- **R5.1**: Every offline command has a stable `command_id` and content hash.
- **R5.2**: A command ID cannot be reused with different content (security conflict).
- **R5.3**: Staff payloads cannot contain approval fields.
- **R5.4**: Business write and idempotency acknowledgement occur in one transaction.
- **R5.5**: Unsynchronised commands are never silently deleted.

## Approval and Recount Requirements (R6)

- **R6.1**: Staff cannot approve their own observations.
- **R6.2**: Auto-approval requires ALL conditions to be satisfied simultaneously (delta=0, no mismatches, mandatory remark present, evidence policy satisfied).
- **R6.3**: A threshold must never auto-approve a non-zero variance merely because it is small.
- **R6.4**: Blind recount prefers a different employee; original physical count remains immutable.
- **R6.5**: Recount creates a new observation version; previous records are marked superseded but retained.

## Duplicate Governance Requirements (R7)

- **R7.1**: Same item in different locations is allowed and aggregated.
- **R7.2**: Same item twice in the same location session is blocked unless split-count continuation.
- **R7.3**: Duplicate serials must be blocked or quarantined—never merged.
- **R7.4**: Same physical batch in different locations is allowed.
- **R7.5**: Same physical batch twice in the same location requires explicit add-quantity command.

## Evidence and Audit Requirements (R8)

- **R8.1**: Evidence requirements are determined by policy, not by staff discretion.
- **R8.2**: Evidence is stored separately from observations with storage key, original filename, capture time, uploader, file hash, and upload status.
- **R8.3**: No count observation is physically deleted.
- **R8.4**: Finalisation requires zero unresolved blocking states.

## Finalisation Requirements (R9)

- **R9.1**: All location sessions must be submitted before finalisation.
- **R9.2**: All commands must be acknowledged before finalisation.
- **R9.3**: No blocked sync records are permitted.
- **R9.4**: No unresolved duplicate conflicts are permitted.
- **R9.5**: No pending SQL validation is permitted.
- **R9.6**: All required evidence must be uploaded before finalisation.
- **R9.7**: Serial reconciliation must pass before finalisation.
- **R9.8**: Projections must match before finalisation.
- **R9.9**: Rack locks can be released only after finalisation.