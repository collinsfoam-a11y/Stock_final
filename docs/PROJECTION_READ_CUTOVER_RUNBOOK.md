# Projection Read Cutover Runbook (V4.1)

## Objective

Safely transition all business reads to projection-authoritative mode with zero drift, zero gaps, and full audit consistency.

## Global Rule

```text
When projection flags are ON:
-> NO fallback to legacy reads
-> Projection OR controlled failure only
```

## Pre-Conditions (Mandatory)

Before starting, confirm all of the following:

- `projection_drift_count = 0`
- `projection_gap_count = 0`
- Replay consistency `difference_count = 0`
- Session seed completed
- `session_dashboard_projection` populated
- `last_projection_update_timestamp` within the acceptable freshness window
- `event_log` latest timestamp and projection latest timestamp within the acceptable lag window, target under 2 to 5 seconds

## Phase 1 - Staging Dashboard Enablement

### Step 1 - Enable Flag

```env
V3_PROJECTION_DASHBOARD_READS=true
V3_PROJECTION_REPORT_READS=false
```

### Step 2 - Immediate Smoke Check (0-15 min)

Validate:

- Supervisor dashboard loads
- Verified items list loads
- No 5xx spike
- Session totals visible
- Dashboard load time under 2 seconds for the standard staging sample

### Step 3 - Canary User and Session Test

Before broad staging exposure, limit the rollout window to:

- 1 supervisor
- 1 active session

If the flags are environment-wide, keep the staging window operationally restricted to that single operator and session pair.

Validate:

- real usage flow works end-to-end
- real-time updates are visible
- offline to sync to dashboard flow stays correct
- sync behavior remains idempotent

### Step 4 - Targeted Soak Sample (Critical)

Test real sessions covering edge cases, including abnormal legacy session states:

| Scenario | Required |
| --- | --- |
| Closed session | Yes |
| Active/Open session | Yes |
| Finalized session | Yes |
| Session with recount/approval | Yes |

### Step 5 - Functional Validation

For each sample:

- Open dashboard
- Cross-check totals
- Perform `scan`
- Perform `recount`
- Perform `approval`

Verify:

```text
No duplicate increments
No missing counts
Correct status transitions
```

### Step 6 - Concurrent User Check

Run 2 to 3 users simultaneously against the staging sample:

- scan the same item
- run recount flows
- run approval flows

Verify:

```text
No race condition artifacts
No duplicate aggregation
No broken status transitions
```

### Step 7 - Data Sampling Validation

Pick 3 sessions and compare projection reads against expected business state:

- Compare individual item rows
- Compare batch values
- Compare approval states

### Step 8 - Metrics Monitoring (1-2 cycles)

Track continuously:

| Metric | Expected |
| --- | --- |
| `projection_gap_count` | `0` |
| `projection_drift_count` | `0` |
| `projection_hit_count` | stable |
| API error rate | no spike |
| Event lag between `event_log` and projection updates | under 2 to 5 seconds |

### Step 9 - Projection Gap and Drift Inspection

If `projection_gap_count > 0`:

- Inspect logs immediately
- Identify the missing projection type
- Verify upstream event coverage
- Stop rollout until resolved

If `projection_drift_count > 0`:

- Inspect drift details immediately
- Identify the projection or replay mismatch
- Stop rollout until resolved

### Step 10 - UI Parity Check

```text
Dashboard = Verified Items = Session Totals
```

### Step 11 - Automated Parity Validation

Run the read-only parity validator:

```bash
./scripts/python.sh -m backend.scripts.validate_projection_parity
```

Audit report:

```text
.agent/reports/projection-parity-validation.json
```

Required result:

```text
is_consistent = true
```

Any mismatch or non-zero exit code means stop rollout immediately.

### Step 12 - Cutover Gate (Hard Block)

Apply this gate before moving to the next phase:

```text
Proceed ONLY IF:
projection_gap_count = 0
projection_drift_count = 0
error rate stable
dashboard parity confirmed

ELSE:
STOP rollout immediately
```

## Phase 2 - Report Enablement

### Step 13 - Enable Flag

```env
V3_PROJECTION_REPORT_READS=true
```

### Step 14 - Report Validation

For multiple sessions:

```text
Dashboard = Report Preview = Export
```

Validate:

- totals
- item counts
- financial values

### Step 15 - Load and Stress Check

- Generate large reports
- Run multiple exports
- Report preview generation under 5 seconds for standard sessions
- Report generation under 5 to 10 seconds for larger sessions
- Export time within the approved SLA under load

### Step 16 - Edge Failure Simulation (Optional, Run Once in Staging)

Run a controlled failure simulation:

- interrupt API during sync
- restart the service
- verify sync resumes correctly
- verify projection consistency remains intact

Confirm:

```text
No lost updates
No duplicate aggregation
No projection drift introduced by restart or retry
```

### Step 17 - Phase Gate

Do not move to production rollout unless all of the following remain true:

```text
projection_gap_count = 0
projection_drift_count = 0
dashboard = report = export
latency within threshold
```

## Phase 3 - Production Rollout

### Step 18 - Gradual Enablement Order

```text
1. Supervisor dashboard
2. Verified items view
3. Report preview
4. Report export
5. Admin KPI panels
```

### Step 19 - Live Monitoring (First 24-48 hrs)

Set alerts:

```text
Critical: projection_drift_count > 0
High: projection_gap_count > 0
Medium: latency spike or error rate spike
```

## Rollback Plan (Immediate)

Disable flags:

```env
V3_PROJECTION_DASHBOARD_READS=false
V3_PROJECTION_REPORT_READS=false
```

Trigger rollback if:

- projection drift > 0
- projection gap > 0
- UI mismatch
- error spike

## Post-Rollback Validation

After rollback, confirm:

- system returns to legacy consistency
- no partial projection reads remain
- dashboard and reports match the legacy path again
- error rate returns to baseline

## Phase 4 - Legacy Decommission

Only after stable validation, remove:

- session aggregation logic
- count_lines-based reads
- report recompute paths

### Enforce Hard Lock

```text
If projection flag ON -> block legacy path completely
```

## Post-Cutover Validation

Confirm:

```text
projection_drift_count = 0
projection_gap_count = 0
replay consistency maintained
dashboard = report = export
```

## Execution Sequence

```text
Pre-check -> Canary -> Enable -> Soak -> Validate -> Gate -> Expand -> Lock -> Cleanup
```

## Special Attention Area

Because of the session seed and projection fix, focus on:

- lifecycle timestamps
- status transitions (`OPEN -> CLOSED -> FINALIZED`)
- recount/approval flows
- partial or edge sessions

## Final State

```text
EVENT LOG -> PROJECTIONS -> API -> UI
```

Single source of truth achieved.

## Execution Note

Treat the first staging window as:

```text
A REAL SYSTEM VALIDATION
NOT a checklist exercise
```
