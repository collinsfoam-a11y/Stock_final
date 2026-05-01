# Projection Operations Runbook

## Readiness Gate

- `V3_PROJECTION_DASHBOARD_READS` and `V3_PROJECTION_REPORT_READS` route reads through projection services.
- When either flag is on, the projection readiness gate is authoritative.
- Not ready, missing status, failed parity, drift, lag breach, or stability-window failure returns HTTP 503.
- The gate is fail-closed. Runtime read paths must not query SQL or legacy Mongo as an alternate source while projection flags are on.

## Observability

- Metrics:
  - `projection_readiness_status`: 1 when ready, 0 when closed.
  - `projection_lag_seconds`: current projection lag.
  - `projection_drift_count`: incremented when drift/gaps are detected.
  - `sync_failure_rate`: increments by failed sync records.
  - `session_duplicate_attempts`: increments when a client session retry reuses an existing session.
- API logs include `request_id`, `user`, `endpoint`, and `status` on dashboard, report, sync, and session creation paths.
- Alert thresholds are config-only:
  - readiness false for more than 60 seconds.
  - drift detected at least once.
  - sync failures exceed `PROJECTION_ALERT_SYNC_FAILURE_RATE` (default 10%) in the operational window.
  - `projection_lag_seconds` exceeds `PROJECTION_MAX_LAG_SECONDS` (default 5 seconds).

## Sync And Session Idempotency

- Sync uses stable `record_id` as the idempotency key.
- Duplicate `record_id` for the same payload is replay-safe.
- Duplicate `record_id` for a different `client_record_id` or session is rejected.
- Session creation requires `client_session_id`.
- Repeating a session-create request inside the configured TTL returns the same session.
- Repeating after TTL expiry creates a new session.

## CI Gates

- `make agent-ci` runs Python lint, typecheck, tests, governance static checks, frontend checks, and projection CI gate when a parity report is available or `PROJECTION_CI_GATE_ENABLED=true`.
- Staging projection checks should publish `.agent/reports/projection-parity-validation.json`.
- Readiness checks can pass `PROJECTION_READINESS_REPORT=/path/to/readiness.json`.

## Rollback

Use `docs/migration/projection-rollback-protocol.md`.
Production rollback, config mutation, Mongo repair, or deployment actions require the human checkpoint in `AGENTS.md`.
