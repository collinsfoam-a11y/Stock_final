# Agent Approval Pipeline

Use `scripts/agent_approval_log.py` and `scripts/run_with_approval.sh` to enforce approval,
execution validation, and append-only audit logging for risky repository actions.

## Default Log Path

- `.agent/approval-log.jsonl`

This file is local operational state and should not be committed. Each entry carries `prev_hash`
and `hash`, so any historical edit breaks the chain and fails validation.

## When Approval Is Required

Approval is enforced for high-risk commands such as:

- runs with `--execute`, `--apply`, `--write`, or similar mutating flags
- MongoDB bulk writes, repairs, restores, deletes, or deduplication
- deployment, rollback, or infrastructure-changing scripts
- security-sensitive local configuration writes such as secret generation

Risk policy:

- `L0` / `L1`: no approval required
- `L2`: approved request required before execution
- `L3` / `L4`: approved request plus explicit `--confirm` execution flag

## Required Fields

Every entry includes:

- `status`
- `action`
- `run_id`
- `call_id`
- `risk_level`
- `command`
- `execution_hash`
- `approved_by`
- `expected_records`
- `query_filter`
- `timestamp`
- `prev_hash`
- `hash`

## Event Sequence

1. `requested`
2. `approved` or `rejected`
3. `executed`
4. `completed` or `failed`

## Example Workflow

Request approval:

```bash
./scripts/python.sh scripts/agent_approval_log.py log \
  --status requested \
  --action backfill-session-snapshots \
  --command "./scripts/python.sh backend/scripts/backfill_session_snapshots.py --execute --limit 20" \
  --impact "Updates empty session_snapshots and parent sessions.snapshot_hash metadata in MongoDB." \
  --scope "session_snapshots,sessions" \
  --expected-records 20 \
  --query-filter '{"item_count": 0}'
```

Approve the request:

```bash
./scripts/python.sh scripts/agent_approval_log.py approve \
  --run-id run_abc123 \
  --approved-by supervisor.user
```

Execute through the enforced wrapper:

```bash
./scripts/run_with_approval.sh --run-id run_abc123 --confirm \
  "./scripts/python.sh backend/scripts/backfill_session_snapshots.py --execute --limit 20"
```

Inspect recent entries:

```bash
./scripts/python.sh scripts/agent_approval_log.py show --limit 10
```

Verify the entire hash chain:

```bash
./scripts/python.sh scripts/agent_approval_log.py verify-chain
```

## Failure Modes

Execution is blocked when:

- no matching `requested` entry exists
- the request is not in `approved` state
- the runtime command does not match the approved command
- the stored `execution_hash` does not match runtime validation
- the log hash chain is invalid
- an `L3` or `L4` command is executed without `--confirm`

If execution starts but post-run verification fails, the wrapper records `failed` and exits
non-zero.
