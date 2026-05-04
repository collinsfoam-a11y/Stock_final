---
name: "session-snapshot-maintenance"
description: "Use when inspecting, dry-running, or executing session snapshot repairs or synthetic session cleanup. Covers `backend/scripts/backfill_session_snapshots.py`, `backend/scripts/cleanup_synthetic_session_data.py`, approval-safe execute flows, blocked execute paths, and post-run verification."
---

# Session Snapshot Maintenance

Use this skill for repo-local maintenance flows that touch session snapshots or related MongoDB session records.

## When To Use

- Empty `session_snapshots` need repair or backfill
- Synthetic smoke-test session data needs cleanup
- A dry-run result needs to be summarized before approval
- An `--execute` maintenance step needs a safe approval trail

## Scripts Covered

- `backend/scripts/backfill_session_snapshots.py`
- `backend/scripts/cleanup_synthetic_session_data.py`
- `scripts/agent_approval_log.py`

Read [references/workflow.md](references/workflow.md) if you need script selection details, exact approval-log examples, or post-run checks.

## Default Workflow

1. Inspect the target script and the smallest relevant tests first.
2. Confirm whether execution is actually available for the selected script.
   - `backend/scripts/backfill_session_snapshots.py` currently blocks `--execute` by design; treat it as dry-run-only unless the script changes.
3. Start with a narrow dry-run:
   - `./scripts/python.sh backend/scripts/backfill_session_snapshots.py --limit 20`
   - `./scripts/python.sh backend/scripts/cleanup_synthetic_session_data.py --limit 20`
4. Summarize preflight evidence before any mutation:
   - command and filters
   - dry-run counts and expected write scope
   - rollback path (for cleanup, `data_archive` recovery scope)
   - confidence and known gaps
5. Before any `--execute` run, log a request entry:

```bash
./scripts/python.sh scripts/agent_approval_log.py log \
  --status requested \
  --action backfill-session-snapshots \
  --command "./scripts/python.sh backend/scripts/backfill_session_snapshots.py --execute --limit 20" \
  --impact "Updates empty session_snapshots and aligns parent sessions.snapshot_hash metadata in MongoDB." \
  --scope "session_snapshots,sessions"
```

6. Ask for confirmation before the mutating step.
7. If approved, append `approved`, then run the command, then append `executed` and `completed`.
8. If approval is denied or postponed, append `rejected` or `cancelled` and stop.
9. Re-run a narrow verification pass after execution.

## Non-Negotiable Rules

- Never skip the dry-run when an execute path exists.
- Never assume an execute path exists; verify script behavior in source first.
- Never run `--execute` without a logged request and explicit user confirmation.
- Keep scope narrow with `--limit` or `--session-id` whenever possible.
- Treat SQL Server as read-only even when repairing snapshot data.
- Prefer counts and IDs in summaries; avoid dumping full document bodies.

## Verification Targets

- `backend/tests/test_backfill_session_snapshots.py`
- `backend/tests/test_cleanup_synthetic_session_data.py`

## Output Standard

Report:

- chosen script
- execution availability (`dry-run-only` vs `execute-capable`)
- dry-run counts
- collections or documents expected to change
- rollback or recovery path
- approval log `run_id` and `call_id`
- post-run verification result
