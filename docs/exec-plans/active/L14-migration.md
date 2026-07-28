# Loop 14 — Migration, Shadow Run and Cutover

## Goal
Complete the transitional migration from the legacy count-line-only model to the governed approval + observation model with projections, without data loss or service interruption.

## Scope
- Run L02–L13 in shadow mode against production-like data.
- Validate projections (`items_snapshot`, `batch_records`, `serial_records`, `damage_logs`, `variance_logs`, `approvals`, `sync_queue`, `erp_snapshot`, `serial_registry`).
- Pilot on a single location.
- Cut over once shadow divergence is zero and preflight passes.

## Shadow Mode
1. Replay existing `count_lines` into `count_observations` via `count_line_write_service.write_count_observation`.
2. Run approval engine on shadow observations.
3. Compare `count_lines` aggregates vs `count_observations` aggregates.
4. Record divergence in `reports/migration-shadow-{timestamp}.json`.

## Pilot Criteria
- Zero critical divergence for 48 hours.
- Supervisor queue latency < 500ms.
- Offline sync idempotency holds under pilot load.
- No `event_log` replay gaps.

## Cutover Checklist
- [ ] Run shadow migration and confirm `reports/migration-shadow-*.json` divergence = 0.
- [ ] Run pilot on one location and confirm zero blocking preflight states.
- [ ] Set `config.GOVERNANCE_MODE = "enforce"` (if config-gated).
- [ ] Enable `approval_api`, `damage_api`, `finalisation_preflight` routes in production.
- [ ] Archive legacy `count_lines` read path; keep append-only `count_observations`.
- [ ] Confirm CI gate `make agent-ci` passes with new routes.
- [ ] Record post-cutover baseline metrics.

## Rollback
- Revert route enable flags in `app_factory.py`.
- Keep `count_lines` available as fallback read path for 7 days.
- Re-point frontend to legacy session finalisation flow if preflight success rate drops below 99%.
