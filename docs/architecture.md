# Architecture

## Data Direction

SQL Server remains the read-only ERP source. MongoDB is the application store. The sync direction is:

`SQL Server -> MongoDB -> Frontend`

Runtime writes belong to MongoDB service-layer paths. ERP SQL writes are forbidden.

## Projection Reads

Dashboard and report cutover is controlled by:

- `V3_PROJECTION_DASHBOARD_READS`
- `V3_PROJECTION_REPORT_READS`

When projection flags are enabled, `ProjectionReadinessGate` is the single readiness source. Projection reads fail closed with HTTP 503 when readiness is false, missing, unstable, drifted, stale, or over the lag threshold.

Projection-enabled reads must not fall back to SQL or legacy Mongo paths. Rollback is an explicit config action: turn the flags off, preserve projection data and reports, then investigate.

## Idempotency

Sync batches use `record_id` as the stable idempotency key. Replays of the same record are accepted; reuse against a different client record or session is rejected.

Session creation uses `client_session_id` with an application TTL window. Retries inside the window return the existing session. Requests after TTL expiry create a new session.

## Operational Controls

Metrics and logs expose readiness, lag, drift, sync failures, session duplicate attempts, and request correlation IDs. `make agent-ci` includes static governance checks and runs the projection CI gate when a parity report is available or the gate is explicitly enabled.
