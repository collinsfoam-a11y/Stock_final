# Session Snapshot Maintenance Workflow

## Script Selection

Use `backend/scripts/backfill_session_snapshots.py` when:

- `session_snapshots.item_count = 0`
- the goal is to restore snapshot items from ERP data
- the parent `sessions.snapshot_hash` metadata also needs alignment

Use `backend/scripts/cleanup_synthetic_session_data.py` when:

- smoke-test or synthetic sessions need removal
- archive-before-delete behavior is required
- the target records live across `session_snapshots`, `sessions`, `verification_sessions`, or `count_lines`

## Dry-Run Commands

Backfill:

```bash
./scripts/python.sh backend/scripts/backfill_session_snapshots.py --limit 20
./scripts/python.sh backend/scripts/backfill_session_snapshots.py --session-id <session_id>
```

Cleanup:

```bash
./scripts/python.sh backend/scripts/cleanup_synthetic_session_data.py --limit 20
```

## Approval Log Commands

Request:

```bash
./scripts/python.sh scripts/agent_approval_log.py log \
  --status requested \
  --action cleanup-synthetic-session-data \
  --command "./scripts/python.sh backend/scripts/cleanup_synthetic_session_data.py --execute --limit 20" \
  --impact "Archives synthetic smoke-test session documents into data_archive and deletes them from operational MongoDB collections." \
  --scope "session_snapshots,sessions,verification_sessions,count_lines"
```

Approve:

```bash
./scripts/python.sh scripts/agent_approval_log.py log \
  --status approved \
  --run-id <run_id> \
  --call-id <call_id> \
  --action cleanup-synthetic-session-data \
  --confirmed-by user
```

Executed:

```bash
./scripts/python.sh scripts/agent_approval_log.py log \
  --status executed \
  --run-id <run_id> \
  --call-id <call_id> \
  --action cleanup-synthetic-session-data
```

Completed:

```bash
./scripts/python.sh scripts/agent_approval_log.py log \
  --status completed \
  --run-id <run_id> \
  --call-id <call_id> \
  --action cleanup-synthetic-session-data \
  --notes "Post-run dry-run showed zero remaining synthetic matches in the narrowed scope."
```

## Post-Run Checks

- Re-run the same script without `--execute` to confirm the narrowed target is clean.
- For backfill work, verify `repaired` and `updated_sessions` counts are plausible.
- For cleanup work, verify `archived` and `deleted` counts match the expected collection scope.
- Run the targeted backend tests if the script or surrounding logic changed.
