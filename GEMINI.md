# STOCK_VERIFY_2-db-maped Development Guidelines

Auto-generated from all feature plans. Last updated: 2025-12-26

## Active Technologies

- MongoDB (Primary), SQL Server (Read-only ERP), Redis (Optional Cache) (002-system-modernization-and-enhancements)

## Project Structure

```text
src/
tests/
```

## Commands

make agent-ci

## Code Style

Python 3.10+ (Backend), TypeScript 5.0+ (Frontend): Follow standard conventions

## Recent Changes
- 002-system-modernization-and-enhancements: Added Python 3.10+ (Backend), TypeScript 5.0+ (Frontend) + FastAPI, React Native (Expo), MongoDB, SQL Server (pyodbc)

- 002-system-modernization-and-enhancements: Added Python 3.10+ (Backend), TypeScript 5.0+ (Frontend) + FastAPI, React Native (Expo), MongoDB, SQL Server (pyodbc)

<!-- MANUAL ADDITIONS START -->
## Agent Safety Overlay

- Operate autonomously for inspection, code edits, and test execution.
- Pause for explicit user confirmation before high-impact actions.

### Human Checkpoint Triggers

- Running scripts with mutating flags such as `--execute`, `--apply`, `--write`, or similar.
- Database backfills, migrations, or bulk repair jobs that update MongoDB records.
- Deployments, rollbacks, infrastructure changes, or commands that can affect live systems.
- Destructive git actions such as force pushes, history rewrites, or mass deletes.
- Security-sensitive changes touching auth, secrets, permissions, or production access.

### Required Flow

1. Inspect first.
2. Prefer dry-run or read-only mode.
3. Summarize expected impact.
4. Log the request with `./scripts/python.sh scripts/agent_approval_log.py`.
5. Ask for confirmation before the mutating step.

### Repo-Specific Reminders

- SQL Server is read-only ERP. Do not write to it.
- Respect `backend/README.md` governance constraints.
- Treat `backend/scripts/backfill_session_snapshots.py --execute` as confirmation-required.
- Use `agent_skills/session-snapshot-maintenance/SKILL.md` for snapshot repair or cleanup work.

### UI/UX Overlay

- For UI work, default to a functional mobile utility style with clear hierarchy and semantic status colors.
- Avoid mixed visual languages, AI-purple or pink-heavy gradients, glass-heavy layering, and ornamental shadows on operational screens.
- Require `44x44` minimum touch targets, safe-area aware layouts, visible labels, explicit states, and accessible contrast.
- Respect reduced motion and text scaling before considering a screen complete.
<!-- MANUAL ADDITIONS END -->
