# Copilot Instructions — Stock Verify Codebase

These rules help AI coding agents work productively and safely in this repo. Focus on the patterns actually used here; don’t introduce new frameworks or rewrite architecture.

## 🏗 Architecture & Boundaries
- **Hybrid Database Model**:
  - **MongoDB (Primary)**: Stores app state, sessions, counts, and discrepancies. **ALL WRITES go here.**
  - **SQL Server (ERP)**: **READ-ONLY** source of truth for items/inventory. Never write to SQL Server.
  - **Sync**: Data flows `SQL Server -> MongoDB -> Frontend`.
- **Backend**: FastAPI (Python 3.10+), Motor (Async Mongo), PyODBC (SQL).
- **Frontend**: React Native (Expo 54), TypeScript, Zustand (State), Offline-first architecture.
- **Network**: Production web prefers same-origin `/api`; development can use `EXPO_PUBLIC_BACKEND_URL` or nearby `8001+` backend probing.

## 🛠 Developer Workflows
- **Startup**: Use `make start` for full stack. Individual: `make backend` (port 8001), `make frontend` (port 8081).
- **Preferred Agent Verification**: Use `make agent-ci` for compact success output and full logs only on failure.
- **Testing**:
  - **Backend**: `make python-test` (pytest). **Mock MongoDB** with `AsyncMock` for collection methods.
  - **Frontend**: `make node-test` (Jest).
  - **Full CI**: `make ci` runs lint, typecheck, and tests for both.
- **Lint/Format**: `make format` (Black/Ruff/Prettier) and `make lint`.

## 🧠 Human Checkpoints
- For local analysis, code edits, and test runs, proceed autonomously.
- Before any high-impact action, switch to an explicit confirmation flow.
- High-impact actions include:
  - Running scripts with mutating flags such as `--execute`, `--apply`, `--write`, or equivalent.
  - Database backfills, migrations, or bulk repair jobs that update MongoDB state.
  - Deployments, rollbacks, infrastructure changes, or changes with live-environment impact.
  - Destructive git actions such as force pushes, history rewrites, or mass deletes.
  - Security-sensitive changes affecting auth, secrets, permissions, or production access.
- Required sequence for risky work:
  - Inspect first.
  - Prefer dry-run or read-only mode.
  - Summarize expected impact.
  - Log the request with `./scripts/python.sh scripts/agent_approval_log.py`.
  - Ask the user to confirm before the mutating step.

## 🎨 UI/UX Rules
- For screen or component work, preserve the existing mobile design language and pick one visual direction per screen.
- Stock and recount flows should favor functional minimal UI, semantic status colors, and clear hierarchy over decoration.
- Avoid AI-purple or pink-heavy gradients, mixed icon styles, glass-heavy layering, and random shadow stacks on operational screens.
- Minimum UX bar: `44x44` touch targets, `8dp` spacing between adjacent touchables, safe-area aware layouts, visible labels and focus states, and `4.5:1` text contrast.
- Respect reduced motion and text scaling, and verify loading, empty, error, success, and disabled states before finishing UI work.

## 🚨 Critical Conventions
- **SQL Queries**:
  - **MUST** be parameterized using `?` placeholders. NO f-strings for values.
  - **Mapping**: Define table/column maps in `backend/db_mapping_config.py`.
  - **Discovery**: Use `backend/api/mapping_api.py` for schema inspection.
- **Barcode Logic**:
  - **Strict Validation**: 6-digit numeric only. Prefixes: 51, 52, 53.
  - **Normalization**: ALWAYS use `_normalize_barcode_input` from `backend/api/erp_api.py`.
- **Frontend Data**:
  - **Normalization Layer**: `frontend/src/services/api/api.ts` maps backend snake_case to frontend camelCase. Update this when adding API fields.
  - **Offline**: Use `offlineStorage.ts` patterns. Check `isOnline()` before API calls.
- **Auth**:
  - Native clients use Bearer tokens; web can use the cookie-based browser auth flow.
  - Use `current_user: dict = Depends(get_current_user)` dependency.

## 🧩 Integration Points
- **Dynamic Configuration**:
  - Do not hardcode report schemas. Use `backend/api/dynamic_reports_api.py`.
  - Check `backend/config.py` for Pydantic-validated settings (e.g., `CORS_ALLOW_ORIGINS`).
- **Enhanced API**:
  - Use `backend/api/enhanced_item_api.py` (V2) for item lookups (includes caching/monitoring).

## ⚠️ Forbidden Actions
- **No SQL Writes**: `INSERT`, `UPDATE`, `DELETE` on SQL Server are strictly prohibited.
- **No CORS Wildcards**: Use specific origins in `backend/config.py`.
- **No Secrets in Code**: Fail fast if `JWT_SECRET` is missing.
- **No Unconfirmed Mutations**: Do not run high-impact mutating commands without a prior human checkpoint.

## 📂 Key Files
- `backend/server.py`: App entry, router mounting.
- `backend/db_mapping_config.py`: SQL schema mappings.
- `frontend/src/services/api/api.ts`: Frontend API layer & type normalization.
- `Makefile`: Source of truth for build/test commands.
- `agent_skills/session-snapshot-maintenance/SKILL.md`: Approval-safe snapshot repair workflow.
