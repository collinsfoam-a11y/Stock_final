# L15 — Whole-Codebase Health Audit Loop

## Goal

Create and operate a repeatable AI-agent loop that finds, proves, prioritizes, and resolves cross-stack defects in Stock Verify.

## Business requirement

The team needs one evidence-based process for code faults, runtime/build failures, frontend/backend mismatches, missing service connections, duplication, complexity, security, performance, test gaps, and Stock Contract violations.

## Current behaviour

The repository has strong individual CI and governance checks plus historical audit reports, but no single runner continues across failures, preserves one evidence bundle, and hands results into a defined AI triage/fix/review loop.

## Expected behaviour

A safe command runs the selected audit profile, preserves every check result, and produces artifacts that an AI agent uses for graph analysis, root-cause triage, one-issue-at-a-time remediation, and independent verification.

## In scope

- Backend and frontend static analysis, type checks, tests, builds, duplicate-route checks, and governance checks.
- Dependency/security checks and exact duplicate inventory.
- AI graph review for architecture, route connections, semantic duplication, complexity, and critical data flows.
- Stock Contract V3.1 and the 15 non-negotiable invariants.
- A severity model, evidence schema, approval boundary, retry limit, and terminal states.

## Out of scope

- Automatic fixes across the whole repository in one change.
- Live database mutation, migrations, backfills, repairs, deployment, or SQL writes.
- Deleting files solely because a static tool reports them unused.

## Domain invariants

All 15 invariants in `AGENTS.md` apply when their corresponding path is inspected or changed. SQL Server remains read-only, `event_log` remains the long-term truth, count-line writes remain governed, and serial uniqueness remains item-scoped.

## Allowed modules

- `scripts/codebase_audit_loop.py`
- `backend/tests/test_codebase_audit_loop.py`
- `docs/runbooks/AI_CODEBASE_AUDIT_LOOP.md`
- this execution plan
- `Makefile` and `.gitignore` only for entry points and generated evidence

Remediation issues created by the loop must define their own narrower allowed modules.

## Database changes

No migration and no database access in the automated evidence runner.

## API changes

None.

## Tests that must be added

- Profile selection keeps network/deep checks out of the standard profile.
- Deep profile contains security, strict type, and unused-code checks.
- Inventory detects exact duplicate tracked source files.
- Failed commands are recorded with exit code and retained logs while the runner continues.
- Untracked, non-ignored source files are included in inventory and duplicate evidence.
- Missing tools/bootstrap failures produce `BLOCKED_DEPENDENCY`, while a clean evidence run produces `READY_FOR_REVIEW`, never `PASS`.

## Verification commands

```bash
./scripts/python.sh -m pytest -q backend/tests/test_codebase_audit_loop.py
./scripts/python.sh scripts/codebase_audit_loop.py --profile quick --list
./scripts/python.sh scripts/codebase_audit_loop.py --profile quick
```

After the current dirty working tree is reconciled, run `make audit-loop` and then `make audit-loop-deep` as needed.

## Migration/rollback

No migration. Roll back by removing the new runner, tests, docs, Make targets, and generated ignored evidence directory.

## Human approval required

No for the automated quick/standard/deep evidence profiles. Yes before any later live database, backfill, repair, migration, deployment, or persistent runtime test described by a finding.

## Stop conditions

- `PASS` only after the completion gate in the runbook is satisfied.
- `READY_FOR_REVIEW` when implementation and verification are complete but human review remains.
- `HUMAN_DECISION_REQUIRED` for governed operations or material architecture choices.
- `BLOCKED_DEPENDENCY` when required tools/services prevent evidence collection.
- `FAILED_TESTS` after three failed implementation cycles on one issue.

## Loop status

READY_FOR_REVIEW

Implementation verification:

- focused runner tests: 7 passed;
- independent checker: no remaining findings;
- quick evidence profile: 6 passed, 2 pre-existing working-tree failures;
- latest evidence: `.agent/reports/codebase-audit/20260729T055322Z/REPORT.md`.
