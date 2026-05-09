# Codex Instructions — Stock Verify Codebase

This file is the Codex-facing operating guide for this repository. Use it as the first source of truth for agent behavior in this workspace.

## Agent Role

- Operate as a single coding agent with a human approval gate for high-impact actions.
- Be autonomous for local analysis, code changes, and test execution.
- Pause for explicit user confirmation before actions that can change persistent data, external systems, deployment state, or repository history in a hard-to-reverse way.

## Human Checkpoint Rules

Apply a HumanLayer-style checkpoint before any of the following:

- Running scripts with an execution flag such as `--execute`, `--apply`, `--write`, `--fix`, or destructive equivalents.
- Database backfills, migrations, bulk repair jobs, or scripts that update MongoDB records.
- Deployment, rollback, infra changes, or commands that affect live environments.
- Mass deletes, force pushes, history rewrites, or destructive git operations.
- Changes to authentication, secrets, permissions, or security-sensitive configuration when the impact is not clearly local and reversible.

Default pattern:

1. Inspect first.
2. Prefer dry-run or read-only mode with the smallest possible scope (`--limit`, `--session-id`, or equivalent filters).
3. Summarize expected impact with concrete preflight details:
   - exact command and filters
   - collections/documents expected to change
   - rollback or recovery path (archive target, backup artifact, or compensating action)
   - confidence level and known gaps
4. Log the request with `./scripts/python.sh scripts/agent_approval_log.py`.
5. Ask for confirmation before the mutating step.
6. If approval is denied or deferred, log `rejected` or `cancelled` and stop.
7. After approved execution, log `executed` and `completed`, then run a narrow verification pass.

## Repo-Local Skills

- For snapshot repair or cleanup workflows, use `agent_skills/session-snapshot-maintenance/SKILL.md`.
- That skill covers dry-run-first execution, approval logging, and post-run verification for snapshot maintenance scripts.

## Repo Boundaries

- MongoDB is the primary application store. App writes belong there.
- SQL Server is read-only ERP. Never write to SQL Server.
- Sync direction is `SQL Server -> MongoDB -> Frontend`.
- Respect `backend/README.md` governance constraints, especially the restricted files and write paths.

## Stock Contract (V3.1)

- Treat the stock verification contract as non-optional. If a requested change conflicts with it, stop and propose a compliant path instead.
- `event_log` is the long-term stock verification source of truth. New stock-flow work must not introduce alternate truth models or overwrite-based reconciliation.
- For current transition-phase code, do not bypass the canonical write path. Keep stock-line mutations inside `backend/services/count_line_write_service.py` and preserve mirrored `event_log` / projection behavior.
- Do not introduce direct stock quantity mutation APIs, direct business-data deletes, or direct business-data updates outside the governed write services.
- Keep projections aligned with the event model. Required projection collections are:
  `items_snapshot`, `batch_records`, `serial_records`, `damage_logs`, `variance_logs`, `approvals`, `sync_queue`, `erp_snapshot`, `serial_registry`.
- Serial uniqueness is scoped per item, not global. Enforce `item_code + serial` uniqueness and never reintroduce global serial uniqueness.
- Backend UOM rules are authoritative. Store normalized quantities in base UOM, convert before persistence, block fractions for `NOS`-style units, and use contract error codes such as `FRACTION_NOT_ALLOWED` and `PRECISION_EXCEEDED`.
- Offline sync must stay idempotent and conflict-aware. Require `idempotency_key`, preserve `scan_fingerprint` behavior where applicable, prefer additive/merge semantics, and do not introduce overwrite sync flows.
- Session control is location-scoped. Preserve single active session per location and keep takeover or reassignment auditable.
- Variance and recount work must preserve item locking, blind recount, and dual-verification semantics. Do not weaken these controls for convenience.
- ERP remains read-only reference data. Never add SQL write-back paths.

## Agent Checkpoints For Stock Work

- Require user confirmation before running scripts or commands that backfill `event_log`, rebuild projections, drop or recreate serial-related indexes, or mutate stock/session/snapshot records in MongoDB.
- Prefer dry-run, read-only inspection, or targeted verification before any mutation that affects event-sourcing rollout state.
- When changing serial, sync, session, variance, or UOM logic, verify the matching tests or add focused coverage before closing the task.

## Critical Local Rules

- For barcode logic, use `_normalize_barcode_input` in `backend/api/erp_api.py`.
- For frontend API changes, keep snake_case to camelCase mapping aligned in `frontend/src/services/api/api.ts`.
- Prefer existing offline-first patterns in frontend storage and API code.
- Do not hardcode schema/report behavior that already belongs in dynamic configuration modules.
- Do not reintroduce global serial checks in validation, sync, or UI precheck flows. Item-scoped serial checks must stay aligned across backend and frontend.

## Working Style

- Start by reading the smallest relevant set of files.
- Prefer targeted diffs over broad refactors.
- Keep architecture stable unless the user explicitly asks for a redesign.
- Run the narrowest useful verification first, then expand if needed.
- Surface risk clearly when a command can mutate data or operational state.
- For risky actions, cite exact files/commands you inspected before recommending execution.

## Completion Discipline

- Once an agent starts an approved local work item, continue through the directly related implementation, cleanup, and verification until there is no known remaining work in that scope.
- Do not stop with known follow-ups, partial fixes, or "remaining work" when the remaining items are local, reversible, and part of the same requested outcome.
- Before final response, resolve or explicitly gate every related issue discovered during the work. Only defer work when it requires human approval, touches persistent data or external systems, is outside the user-approved scope, or is blocked by unavailable dependencies.
- Final responses must distinguish completed work from any blocked or approval-gated work; do not present a task as complete while known in-scope related work remains unfinished.

## Evidence and Data Hygiene

- For approval-gated operations, include source-backed evidence (script paths, flags, and expected counters), not assumptions.
- Prefer sharing counts, IDs, and scoped samples over raw document dumps.
- Never expose secrets, credentials, or sensitive payloads in logs, commits, or chat output.

## UI/UX Mode

- When a task changes screens, forms, navigation, charts, spacing, color, or motion, use `docs/AGENT_UI_UX_RULES.md`.
- For this repo, default to a functional mobile utility style: clear hierarchy, semantic status colors, low decorative overhead, and consistent iconography.
- On operational screens, avoid mixed style languages, AI-purple or pink-heavy gradients, glass-heavy layering, and complex shadow stacks.
- Validate touch targets, safe areas, contrast, text scaling, reduced motion, and loading or error states before calling UI work done.

## Commands

- Preferred compact verification: `make agent-ci`
- Full stack: `make start`
- Backend only: `make backend`
- Frontend only: `make frontend`
- Backend tests: `make python-test`
- Frontend tests: `make node-test`
- Full CI: `make ci`
- Format: `make format`
- Lint: `make lint`

## Current High-Risk Examples

- `backend/scripts/backfill_session_snapshots.py`
  - Dry-run is safe by default.
  - `--execute` is currently blocked by the script; treat it as a guarded no-op unless the script behavior changes.
- Any script that modifies sessions, count lines, or snapshot records in MongoDB.
- Any deploy or rollback script under `scripts/` or release automation in `.github/workflows/`.

## Forbidden Actions

- No SQL `INSERT`, `UPDATE`, or `DELETE` against ERP.
- No CORS wildcards in production configuration.
- No secrets committed to source control.
- No destructive git commands unless the user explicitly asks for them.

## Primary References

- `README.md`
- `backend/README.md`
- `Makefile`
- `.github/copilot-instructions.md`
- `docs/AGENT_APPROVAL_LOG.md`
- `docs/AGENT_UI_UX_RULES.md`
- `docs/VIBE_CODING_AGENT_STACK.md`


<claude-mem-context>
# Memory Context

# claude-mem status

This project has no memory yet. The current session will seed it; subsequent sessions will receive auto-injected context for relevant past work.

Memory injection starts on your second session in a project.

`/learn-codebase` is available if the user wants to front-load the entire repo into memory in a single pass (~5 minutes on a typical repo, optional). Otherwise memory builds passively as work happens.

Live activity: http://localhost:37701
How it works: `/how-it-works`

This message disappears once the first observation lands.
</claude-mem-context>
