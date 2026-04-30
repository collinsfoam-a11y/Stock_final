# Projection Rollback Protocol

## Trigger

Use this protocol when projection readiness fails after deployment, parity drift is detected, lag breaches threshold, or the drift monitor marks projection reads unhealthy.

## Steps

1. Disable projection flags through an approved config rollback.
2. Return runtime reads to legacy Mongo paths with projection flags off.
3. Preserve projection collections and parity reports for investigation.
4. Investigate with parity reports, drift logs, readiness status history, and `docs/migration/conflict-resolution-log.md`.
5. Re-enable projection flags only after readiness, parity, freshness, lag, stability window, and staging CI gates pass again.

## Human Checkpoint Required

Production flag disablement, deploy, rollback, config mutation, Mongo repair, backfill, or bulk data changes require explicit human approval before execution.

## Non-Goals

- No runtime SQL fallback.
- No partial projection reads.
- No silent data correction during reads.
- No automatic projection flag enablement.
- No mixed data-source reads.
- No MongoDB repair, backfill, deploy, or rollback without explicit human checkpoint.
