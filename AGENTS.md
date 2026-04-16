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
2. Prefer dry-run or read-only mode.
3. Summarize expected impact.
4. Log the request with `./scripts/python.sh scripts/agent_approval_log.py`.
5. Ask for confirmation before the mutating step.

## Repo-Local Skills

- For snapshot repair or cleanup workflows, use `agent_skills/session-snapshot-maintenance/SKILL.md`.
- That skill covers dry-run-first execution, approval logging, and post-run verification for snapshot maintenance scripts.

## Repo Boundaries

- MongoDB is the primary application store. App writes belong there.
- SQL Server is read-only ERP. Never write to SQL Server.
- Sync direction is `SQL Server -> MongoDB -> Frontend`.
- Respect `backend/README.md` governance constraints, especially the restricted files and write paths.

## Critical Local Rules

- For barcode logic, use `_normalize_barcode_input` in `backend/api/erp_api.py`.
- For frontend API changes, keep snake_case to camelCase mapping aligned in `frontend/src/services/api/api.ts`.
- Prefer existing offline-first patterns in frontend storage and API code.
- Do not hardcode schema/report behavior that already belongs in dynamic configuration modules.

## Working Style

- Start by reading the smallest relevant set of files.
- Prefer targeted diffs over broad refactors.
- Keep architecture stable unless the user explicitly asks for a redesign.
- Run the narrowest useful verification first, then expand if needed.
- Surface risk clearly when a command can mutate data or operational state.

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
  - `--execute` requires a human checkpoint before running.
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
