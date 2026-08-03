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

## Loop Engineering

The project uses loop engineering for AI-agent-driven development. Each loop follows a strict lifecycle.

### Standard Loop

1. Select one approved issue
2. Load repository instructions and domain documents
3. Confirm current behaviour with tests
4. Produce a small execution plan
5. Add failing acceptance tests
6. Implement the smallest complete change
7. Run focused tests
8. Run affected-domain tests
9. Run repository gates
10. Perform self-review
11. Independent checker-agent review
12. Correct findings
13. Open PR with evidence
14. Human review for governed changes
15. Merge only after required checks pass
16. Record lessons and update documentation

### Terminal States

Every agent loop must stop in one of these states: `PASS`, `READY_FOR_REVIEW`, `BLOCKED_REQUIREMENT`, `BLOCKED_DEPENDENCY`, `BLOCKED_MIGRATION`, `FAILED_TESTS`, `SECURITY_REVIEW_REQUIRED`, `HUMAN_DECISION_REQUIRED`, `SUPERSEDED`.

Agents must not continue indefinitely after three failed implementation cycles. At that point they must produce: failure summary, commands executed, failing tests, suspected root cause, decisions required.

## Worktree and Branch Strategy

The repository uses Git worktrees for parallel safe execution. Worktrees are located at `worktrees/` at the project root.

### Active Worktrees

| ID | Path | Branch | Purpose |
|---|---|---|---|
| L02 | `worktrees/L02-session-ownership` | `loop/L02-session-ownership` | Session ownership and lifecycle |
| L03 | `worktrees/L03-master-location` | `loop/L03-location-session-domain` | Master session and location model |
| L04 | `worktrees/L04-tracking-policy` | `loop/L04-tracking-policy` | Backend-controlled item tracking policy |
| L05 | `worktrees/L05-count-observations` | `loop/L05-batch-serial-observations` | Append-only physical observation model |
| L06 | `worktrees/L06-sql-variance` | `loop/L06-sql-variance` | SQL-at-submission and variance engine |
| L07 | `worktrees/L07-offline-journal` | `loop/L07-offline-journal` | Durable offline command protocol |

### Branch Convention

Branches follow `loop/L{NN}-{kebab-name}`. Parallel execution is allowed only when file ownership does not overlap.

### Non-Overlapping File Protection

The following files must never be edited concurrently across worktrees:

- `backend/api/session_management_api.py`
- `backend/api/schemas.py`
- `backend/services/count_line_write_service.py`
- `backend/services/session_lifecycle_service.py`
- `backend/db/indexes.py`
- `frontend/app/staff/item-detail.tsx`
- `frontend/src/services/syncService.ts`
- `frontend/src/services/offline/*`

## Non-Negotiable Invariants

These become machine-tested rules. Every PR must validate them:

1. Staff cannot approve their own observations.
2. Offline staff sync cannot create approved or locked data.
3. No count observation is physically deleted.
4. Staff cannot select quantity/batch/serial tracking mode.
5. Zero is a valid physical count.
6. Every submitted item requires a remark.
7. One employee has no more than one active location session.
8. One location has no more than one active claimant.
9. Recount creates a new observation version.
10. Finalisation requires zero unresolved blocking states.
11. Cached ERP quantity must never be labelled as live SQL quantity.
12. Serial conflicts cannot be silently merged.
13. Evidence requirements are determined by policy.
14. Every offline command has a stable ID and content hash.
15. A command ID cannot be reused with different content.

## AI-Agent Issue Template

All new development issues must use this template:

- **Goal**: One-sentence description of the work.
- **Business requirement**: What business rule or capability does this implement?
- **Current behaviour**: What happens now?
- **Expected behaviour**: What should happen after the fix?
- **In scope**: What is explicitly included.
- **Out of scope**: What is explicitly excluded.
- **Domain invariants**: Which of the 15 non-negotiable invariants apply.
- **Allowed modules**: Which files/packages may be modified.
- **Database changes**: Any schema or collection changes required.
- **API changes**: Any endpoint contract changes.
- **Tests that must be added**: Specific test cases (unit, integration, contract, E2E).
- **Verification commands**: Exact commands to run for verification.
- **Migration/rollback**: Migration strategy or explicit "no migration".
- **Human approval required**: Yes/No with justification.
- **Stop conditions**: Terminal states and maximum retry count.

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
