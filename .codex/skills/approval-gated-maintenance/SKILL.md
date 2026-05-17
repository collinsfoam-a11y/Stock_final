---
name: approval-gated-maintenance
description: Use before running or editing Stock Verify maintenance scripts, migrations, backfills, MongoDB repair jobs, projection rebuilds, deploy/rollback commands, destructive git operations, or commands with --execute/--apply/--write/--fix. Enforces dry-run-first approval logging.
---

# Approval Gated Maintenance

Use this skill for risky local or operational actions. It does not replace the narrower `agent_skills/session-snapshot-maintenance/SKILL.md` skill for session snapshot repair or cleanup.

## Authoritative Docs

- `AGENTS.md`
- `docs/AGENT_APPROVAL_LOG.md`
- `agent_skills/session-snapshot-maintenance/SKILL.md` for snapshot-specific maintenance

## Approval Required Before

- Commands with mutating flags such as `--execute`, `--apply`, `--write`, `--fix`, or destructive equivalents.
- Database backfills, migrations, bulk repair jobs, or scripts that update MongoDB records.
- Event-log backfills, projection rebuilds, serial index changes, or stock/session/snapshot mutations.
- Deployment, rollback, infrastructure, or live-environment changes.
- Mass deletes, force pushes, history rewrites, or destructive git operations.
- Auth, secret, permission, or security-sensitive config changes when impact is not clearly local and reversible.

## Required Flow

1. Inspect the script or command first.
2. Prefer dry-run/read-only mode with small scope such as `--limit` or `--session-id`.
3. Summarize preflight evidence:
   - exact command and filters
   - expected collections/documents changed
   - rollback or recovery path
   - confidence and known gaps
4. Log a `requested` entry:

```bash
./scripts/python.sh scripts/agent_approval_log.py log \
  --status requested \
  --action "<action-name>" \
  --command "<exact command>" \
  --impact "<expected impact>" \
  --scope "<collections/files/systems>"
```

5. Ask the user for explicit confirmation.
6. If denied or deferred, log `rejected` or `cancelled` and stop.
7. If approved, log `approved`, run the command, log `executed` and `completed`, then run narrow verification.

## Never

- Do not run approval-gated mutation before logging and confirmation.
- Do not assume `--execute` exists; verify source behavior.
- Do not expose secrets or raw sensitive payloads in chat or logs.
- Do not write to SQL Server.
