# AI Codebase Audit Loop

## Purpose

This loop gives an AI agent a repeatable way to find, prove, prioritize, and correct defects across Stock Verify. It covers static errors, runtime and build failures, frontend/backend mismatches, missing connections, duplication, dead code, complexity, security, performance, tests, documentation, and Stock Contract V3.1 violations.

No finite scan can prove that a non-trivial application has no defects. The completion condition is therefore evidence-based: all configured checks have run, every finding is triaged, no unresolved P0/P1 finding remains, and all unavailable or approval-gated checks are recorded explicitly.

## Safety boundary

The automated runner is read-only with respect to application data and external systems. It does not start the application, connect to MongoDB or SQL Server, deploy, backfill, migrate, repair, delete, or write business records.

Live service checks, database/index verification, migrations, backfills, deployment checks, and repair scripts remain human-gated under `AGENTS.md`. SQL Server is always read-only.

## Run profiles

From the repository root:

```bash
make audit-loop-quick
make audit-loop
make audit-loop-deep
```

- `quick`: repository hygiene and manifests, diff integrity, duplicate-route detection, backend lint, critical Stock Contract tests, frontend type checking, and runtime-governance tests.
- `standard` (`make audit-loop`): quick checks plus complete backend/frontend tests, frontend lint, UI/runtime governance, and dependency-baseline drift. This is the normal loop entry point. The backend pytest configuration excludes tests marked `manual` and the evaluation suite.
- `deep`: standard checks plus strict Python typing, unused-code analysis, Bandit/security evaluation, dependency vulnerability checks, secret scanning, and a web build. Dependency checks use the network; the web build writes only ignored build artifacts.

The runner continues after failures and writes machine-readable evidence under `.agent/reports/codebase-audit/<timestamp>/`:

- `REPORT.md`: compact status and next actions.
- `summary.json`: statuses, commands, durations, and terminal state.
- `inventory.json`: source counts, largest files, and exact duplicate groups.
- `logs/*.log`: full output for every check.

The runner can finish as `READY_FOR_REVIEW`, `FAILED_TESTS`, or `BLOCKED_DEPENDENCY`. It never reports `PASS`; only the AI/human completion gate can do that after graph analysis and finding triage.

Use `./scripts/python.sh scripts/codebase_audit_loop.py --profile standard --list` to inspect the plan, or `--only check-a,check-b` to reproduce selected checks.

## Loop lifecycle

### 0. Establish scope and baseline

1. Read `AGENTS.md`, `backend/README.md`, the relevant architecture docs, and this runbook.
2. Record the current branch and dirty files. Existing edits belong to the user and must not be reverted.
3. Use the codebase knowledge graph before text search for code discovery.
4. Run the standard evidence profile. Escalate to deep only when its extra cost is useful.

### 1. Automated evidence collection

Run all checks even when one fails. A failed check is evidence, not permission to skip later stages. Separate:

- product defects;
- test defects;
- tooling/configuration defects;
- missing dependencies or unavailable external services;
- pre-existing working-tree interference.

Never treat a linter count as a count of root causes. Read logs and group symptoms by cause.

### 2. Graph and contract analysis

The AI agent must add analysis that the command runner cannot perform:

1. Query architecture, entry points, route nodes, high fan-in modules, complexity, recursive paths, loop depth, and semantic similarity.
2. Trace critical flows end-to-end:
   - SQL Server reference read -> MongoDB projection -> backend response -> frontend mapper -> offline storage -> UI;
   - barcode normalization through `_normalize_barcode_input`;
   - count-line mutation through `count_line_write_service.py` and mirrored `event_log` projections;
   - offline command/idempotency/conflict paths;
   - session claim, takeover, reassignment, and finalisation;
   - serial uniqueness as `item_code + serial`;
   - UOM conversion, fractional blocking, and precision errors.
3. Compare backend route schemas with frontend API methods and snake_case/camelCase mappings.
4. Find untested high-risk functions, unreachable files, semantic duplicates, long/high-complexity functions, database calls inside loops, unbounded reads, unsafe external calls, and missing timeouts.
5. Cross-check every relevant finding against the 15 non-negotiable invariants in `AGENTS.md`.

At minimum, refresh and investigate these architecture seams each time:

- dual session persistence (`sessions`, `verification_sessions`, and projections);
- dual sync control surfaces (`sync_status_api` and `sync_management_api`);
- ERP SQL connector injection versus Mongo-only `/refresh-stock` behavior;
- local frontend event IDs reconciled to backend count-line IDs;
- settings and API snake_case/camelCase mapping drift.

Text search remains appropriate for error strings, configuration values, secret patterns, TODO/FIXME markers, debug statements, and non-code files.

### 3. Triage into root-cause issues

Every issue must contain:

- severity and confidence;
- exact file/symbol or connection boundary;
- observed evidence and reproduction command;
- expected behavior and violated invariant;
- impact and affected users/data;
- allowed modules;
- acceptance test to add;
- migration/rollback statement;
- whether human approval is required.

Severity:

- `P0`: security compromise, data loss/corruption, SQL write path, auth bypass, or system-wide outage.
- `P1`: stock-contract violation, incorrect quantities/serials/approvals, broken critical workflow, or repeatable runtime crash.
- `P2`: degraded workflow, contract mismatch with workaround, serious maintainability/performance risk, or important missing coverage.
- `P3`: localized quality, duplication, documentation, or low-risk cleanup.

Do not file separate issues for many symptoms caused by one root defect. Do not delete files based only on static zero-inbound results; confirm dynamic routing, framework discovery, compatibility exports, and runtime reachability first.

### 4. Fix loop: one approved issue at a time

1. Select one approved issue, highest severity first.
2. Confirm current behavior with a minimal reproduction.
3. Add a failing acceptance test.
4. Implement the smallest complete compliant fix.
5. Run the focused test, affected-domain tests, then `make agent-ci` when proportionate.
6. Self-review for regression, security, data flow, offline behavior, and contract alignment.
7. Request an independent checker-agent review.
8. Correct findings and rerun evidence.
9. Record the terminal state and repeat with the next issue.

Stop after three failed implementation cycles on the same issue and report `FAILED_TESTS` with commands, failures, suspected cause, and the decision needed.

### 5. Completion gate

The audit loop ends only when one of these is true:

- `PASS`: all selected checks pass, all findings are triaged, no P0/P1 remains, and P2/P3 items have an explicit disposition.
- `READY_FOR_REVIEW`: automated evidence is complete; graph analysis, triage, remediation, or independent review may still remain.
- `HUMAN_DECISION_REQUIRED`: a governed mutation, architecture choice, or scope decision is required.
- `BLOCKED_DEPENDENCY`: a required service/tool is unavailable and the exact missing evidence is listed.
- `FAILED_TESTS`: three implementation cycles failed.
- another terminal state defined by `AGENTS.md` accurately describes the result.

Never report `PASS` from only a quick profile, only static analysis, or with unreviewed failed/warning logs.

## Runtime and connection verification

Runtime checks require an isolated test environment with test MongoDB data and read-only ERP credentials. Before running them, document the exact environment, endpoints, collections, expected writes, cleanup, and approval requirement. The minimum runtime matrix is:

- backend startup and health/readiness;
- MongoDB connectivity and required indexes/projections;
- SQL Server read-only connectivity and query timeout behavior;
- frontend web bundle and application boot;
- authentication and role authorization;
- barcode lookup;
- quantity, batch, and item-scoped serial counting;
- offline capture, replay, duplicate replay, conflict quarantine, and token expiry;
- session claim/takeover/finalisation;
- supervisor recount and dual verification;
- network loss and recovery;
- error logging without secret or sensitive payload exposure.

Any check that may create or modify persistent records must pass the human checkpoint before execution.
