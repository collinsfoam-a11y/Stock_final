# Agent Approval Log

Use `scripts/agent_approval_log.py` to create a lightweight audit trail for risky agent actions.

## Default Log Path

- `.agent/approval-log.jsonl`

This file is local operational state and should not be committed.

## When To Log

Log before any action that:

- runs with `--execute`, `--apply`, `--write`, or similar mutating flags
- updates MongoDB records in bulk
- archives or deletes operational data
- changes deployment or infrastructure state
- performs destructive git operations

## Required Fields

- `status`
- `action`
- `run_id`
- `call_id`

For `requested` status, the script can generate `run_id` and `call_id` automatically.

## Suggested Event Sequence

1. `requested`
2. `approved` or `rejected`
3. `executed`
4. `completed`

## Example

Request:

```bash
./scripts/python.sh scripts/agent_approval_log.py log \
  --status requested \
  --action backfill-session-snapshots \
  --command "./scripts/python.sh backend/scripts/backfill_session_snapshots.py --execute --limit 20" \
  --impact "Updates empty session_snapshots and parent sessions.snapshot_hash metadata in MongoDB." \
  --scope "session_snapshots,sessions"
```

Show recent entries:

```bash
./scripts/python.sh scripts/agent_approval_log.py show --limit 10
```
