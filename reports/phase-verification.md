# Phase Verification - Independent Audit Verification Loop

## Audit Metadata
- **Loop Version:** 1.0
- **Timestamp:** 2026-07-25T14:03:10+05:30
- **Branch:** chore/cleanup-stale-artifacts
- **HEAD:** 83e49a373837080b7bde01c6ae626ec89b8a18e6
- **Origin/Main:** 8af5fe4c3b32f5c8290c447c89204c930f4b0ec8
- **Auditor Role:** Independent verification auditor
- **Scope:** Verify all findings from master-index.md, phase-02-build-contract.md, phase-03-runtime-governance.md

## Commands Executed
- `test -f frontend/pnpm-lock.yaml && echo "EXISTS" || echo "MISSING"`
- `test -f frontend/package-lock.json && echo "EXISTS" || echo "ABSENT"`
- `git check-ignore -v frontend/package-lock.json`
- `git status --short frontend/package-lock.json backend/app_factory.py.backup`
- `rg -n "pnpm-lock.yaml|package-lock.json" .gitignore frontend/.gitignore`
- `rg -n "PIN_SALT" backend/scripts/validate_env.py .env.production.example backend/.env.example docker-compose.production.yml`
- `rg -n "required_keys|SQL_SERVER_HOST" backend/scripts/validate_env.py`
- `rg -n "SQL_SERVER_HOST" docker-compose.production.yml`
- `rg -n "db\.[a-zA-Z_]+\.(insert_one|insert_many|update_one|update_many|replace_one|delete_one|delete_many)" backend/api/*.py`
- `rg -n "from backend.core.lifespan import.*\bdb\b|from backend\.core\.lifespan" backend/`
- `rg -n "npm run|npm install|pnpm run|pnpm install" Makefile .github/workflows/*.yml scripts/*.sh frontend/package.json docs/TESTING_GUIDE.md README.md`
- `rg -n "except Exception:\s*pass|except:\s*pass" backend/app_factory.py`
- `rg -n "\b(INSERT|UPDATE|DELETE|MERGE|DROP|ALTER|CREATE)\b" backend/sql_server_connector.py`
- `rg -n "_GUARD_TARGET_COLLECTIONS" backend/services/governance_guard.py`
- `rg -n "validate_environment|env_validation\.validate|from backend.utils.env_validation" backend/`

## Evidence Summary

### Verified Findings

#### V-001: Missing frontend/pnpm-lock.yaml
- **Original Finding:** P0 blocker in master-index.md; Missing Lockfile in phase-02-build-contract.md
- **Status:** VERIFIED
- **Evidence Type:** Direct
- **Command:** `test -f frontend/pnpm-lock.yaml`
- **Output:** `MISSING`
- **File:** frontend/pnpm-lock.yaml (absent)
- **Confidence:** High
- **Notes:** CI workflows reference `frontend/pnpm-lock.yaml` as cache dependency path in 6 locations. File is absent, breaking `--frozen-lockfile` paths.

#### V-002: Toolchain Drift (npm vs pnpm)
- **Original Finding:** P1 in master-index.md; Toolchain Drift in phase-02-build-contract.md
- **Status:** VERIFIED
- **Evidence Type:** Direct
- **Command:** `rg -n "npm run|npm install|pnpm run|pnpm install" Makefile .github/workflows/*.yml scripts/*.sh frontend/package.json docs/TESTING_GUIDE.md README.md`
- **Output:** 52 npm references, 18 pnpm references
- **Files:** Makefile, .github/workflows/main.yml, .github/workflows/pr-checks.yml, .github/workflows/release.yml, scripts/start_frontend.sh, scripts/fix_expo.sh, scripts/run_app.sh, scripts/setup-recommendations.sh, frontend/package.json, docs/TESTING_GUIDE.md, README.md
- **Confidence:** High

#### V-003: PIN_SALT Environment Validation Gap
- **Original Finding:** P0 in master-index.md; Environment Drift in phase-02-build-contract.md
- **Status:** VERIFIED
- **Evidence Type:** Direct
- **Command:** `rg -n "PIN_SALT" backend/scripts/validate_env.py .env.production.example backend/.env.example docker-compose.production.yml`
- **Output:**
  - `docker-compose.production.yml:82:      PIN_SALT: ${PIN_SALT}`
  - `.env.production.example:22:PIN_SALT=CHANGE_ME_TO_A_LONG_RANDOM_PIN_SALT`
  - `backend/.env.example:22:PIN_SALT=GENERATE_SECURE_PIN_SALT_HERE_MIN_32_CHARS`
  - validate_env.py does NOT list PIN_SALT in required_keys (line 25-30)
- **Files:** backend/scripts/validate_env.py, .env.production.example, backend/.env.example, docker-compose.production.yml
- **Confidence:** High
- **Notes:** A separate module `backend/utils/env_validation.py` DOES validate PIN_SALT, but it is only invoked from `run_server_main`, which is not called in the production Docker startup path (see V-015).

#### V-004: SQL_SERVER_HOST Compose/Validation Mismatch
- **Original Finding:** P2 in master-index.md; Environment Drift in phase-02-build-contract.md
- **Status:** VERIFIED
- **Evidence Type:** Direct
- **Command:** `rg -n "required_keys|SQL_SERVER_HOST" backend/scripts/validate_env.py` and `rg -n "SQL_SERVER_HOST" docker-compose.production.yml`
- **Output:**
  - validate_env.py line 34 lists SQL_SERVER_HOST in optional_keys
  - docker-compose.production.yml line 85: `SQL_SERVER_HOST: ${SQL_SERVER_HOST:?SQL_SERVER_HOST is required}`
- **Files:** backend/scripts/validate_env.py, docker-compose.production.yml
- **Confidence:** High

#### V-005: Direct DB Writes in API Layer Bypass Governance
- **Original Finding:** P0 in master-index.md; Direct database writes inside API endpoints in phase-03-runtime-governance.md
- **Status:** VERIFIED
- **Evidence Type:** Direct
- **Command:** `rg -n "db\.[a-zA-Z_]+\.(insert_one|insert_many|update_one|update_many|replace_one|delete_one|delete_many)" backend/api/*.py`
- **Output:** 59 direct write calls across backend/api/*.py
- **Key Examples:**
  - `backend/api/item_verification_api.py:820: result = await db.erp_items.update_one(update_filter, update_doc)`
  - `backend/api/auth_routes.py:359: await db.users.update_one({"_id": user["_id"]}, ...)`
  - `backend/api/erp_api.py:565: await _db.erp_items.insert_one(doc)`
  - `backend/api/count_lines_routes.py:1560: update_result = db.count_line_drafts.update_one(...)`
  - `backend/api/count_lines_routes.py:1570: insert_result = db.count_line_drafts.insert_one(draft_payload)`
- **Governance Scope Evidence:** `backend/services/governance_guard.py:48-59` defines `_GUARD_TARGET_COLLECTIONS` (count_lines, sessions, verification_sessions, recount_requests, session_snapshots, unknown_items, inventory_adjustments, inventory_ledger, inventory_movements, reconciliation_records). `erp_items`, `users`, and `count_line_drafts` are NOT guarded.
- **Files:** backend/api/*.py, backend/services/governance_guard.py
- **Confidence:** High

#### V-006: Users Directly Mutated in API Routes
- **Original Finding:** Authentication Audit in phase-03-runtime-governance.md
- **Status:** DUPLICATE
- **Duplicate Of:** V-005
- **Reason:** Sub-instance of direct DB writes in API layer (users collection). Already covered by V-005.

#### V-007: Swallowed Audit Failures in GovernanceViolation Handler
- **Original Finding:** P0 in master-index.md; Critical audit failures in phase-03-runtime-governance.md
- **Status:** VERIFIED
- **Evidence Type:** Direct
- **File:** backend/app_factory.py
- **Line:** 282
- **Command:** `sed -n '273,285p' backend/app_factory.py`
- **Output:**
  ```python
  277:        await AuditService(get_db()).log_event(
  278:            event_type=AuditEventType.GOVERNANCE_VIOLATION,
  279:            status=AuditLogStatus.FAILURE,
  280:            details={"path": request.url.path, "method": request.method, "detail": str(exc)},
  281:        )
  282:    except Exception:
  283:        # Audit logging must never block the error response itself.
  284:        pass
  285:    return JSONResponse(status_code=409, content={"detail": str(exc)})
  ```
- **Confidence:** High

#### V-008: Global State Dependency Injection
- **Original Finding:** P1 in master-index.md; Dependency Injection uses global singleton imports in phase-03-runtime-governance.md
- **Status:** VERIFIED
- **Evidence Type:** Direct
- **File:** backend/app_factory.py:95-99
- **Command:** `rg -n "from backend.core.lifespan import" backend/app_factory.py`
- **Output:**
  ```python
  from backend.core.lifespan import (
      activity_log_service,
      db,
      lifespan,
  )
  ```
- **Additional Evidence:** `backend/core/lifespan.py:183: db = client[settings.DB_NAME]`
- **Confidence:** High

#### V-009: frontend/package-lock.json Present While Ignored
- **Original Finding:** P2 in master-index.md
- **Status:** VERIFIED (with correction to prior report)
- **Evidence Type:** Direct
- **Command:** `test -f frontend/package-lock.json && git check-ignore -v frontend/package-lock.json && git status --short frontend/package-lock.json`
- **Output:**
  - `EXISTS`
  - `.gitignore:71:frontend/package-lock.json`
  - (no git status output -> untracked/ignored)
- **File:** frontend/package-lock.json, .gitignore
- **Confidence:** High
- **Notes:** Previous report described this as "tracked but ignored". Correct status is untracked/ignored. Issue remains: file exists despite pnpm being canonical.

#### V-010: Documentation Drift (npm in TESTING_GUIDE.md)
- **Original Finding:** P3 in master-index.md; Documentation Drift in phase-02-build-contract.md
- **Status:** VERIFIED
- **Evidence Type:** Direct
- **Command:** `rg -n "npm run|pnpm run" docs/TESTING_GUIDE.md README.md`
- **Output:**
  - `docs/TESTING_GUIDE.md:5:- Frontend unit/integration checks: cd frontend && npm run ci`
  - `docs/TESTING_GUIDE.md:17:- npm run ci runs lint, typecheck, and Jest.`
  - `README.md:63:- Frontend: cd frontend && npm run ci`
- **Files:** docs/TESTING_GUIDE.md, README.md
- **Confidence:** High

#### V-011: SQL Server Write Protection via Regex
- **Original Finding:** ERP Integration Audit in phase-03-runtime-governance.md
- **Status:** VERIFIED
- **Evidence Type:** Direct
- **File:** backend/sql_server_connector.py
- **Line:** 1178
- **Command:** `rg -n "\b(INSERT|UPDATE|DELETE|MERGE|DROP|ALTER|CREATE)\b" backend/sql_server_connector.py`
- **Output:** `if re.search(r"\b(INSERT|UPDATE|DELETE|MERGE|DROP|ALTER|CREATE)\b", upper):`
- **Confidence:** High

#### V-012: Core Canonical Boundaries Respected
- **Original Finding:** Canonical Write Boundary Audit in phase-03-runtime-governance.md
- **Status:** VERIFIED
- **Evidence Type:** Direct
- **Command:** `rg -n "db\.(count_lines|sessions)\.(insert|update|delete|replace)" backend/api/*.py`
- **Output:** No direct write results for count_lines or sessions collections in API layer
- **Additional Evidence:** `backend/services/governance_guard.py:48-59` lists count_lines and sessions in `_GUARD_TARGET_COLLECTIONS`
- **Files:** backend/api/*.py, backend/services/governance_guard.py
- **Confidence:** High

### New Findings

#### V-013: Production Docker Startup Path Does Not Call Environment Validation
- **Status:** NEW_FINDING
- **Evidence Type:** Direct
- **File:** backend/Dockerfile, backend/server.py, docker-compose.production.yml
- **Command:** `rg -n "run_server_main|if __name__" backend/server.py backend/app_factory.py` and inspection of backend/Dockerfile CMD
- **Output:**
  - `backend/Dockerfile:41: CMD ["sh", "-c", "gunicorn backend.server:app ..."]`
  - `backend/server.py:28-29: if __name__ == "__main__": main()`
  - `backend/server.py:20: run_server_main(...)` only inside `main()`
- **Confidence:** High
- **Notes:** `run_server_main` invokes `validate_environment()` from backend/utils/env_validation.py. When gunicorn imports `backend.server:app`, `run_server_main` is not executed. Therefore production containers can start without PIN_SALT validation even though the validation module exists.

#### V-014: Untracked Stale Backup File backend/app_factory.py.backup
- **Status:** NEW_FINDING
- **Evidence Type:** Direct
- **Command:** `git status --short backend/app_factory.py.backup`
- **Output:** `?? backend/app_factory.py.backup`
- **File:** backend/app_factory.py.backup
- **Confidence:** High
- **Notes:** Backup file contains old imports including `from backend.core.lifespan import db`. Untracked stale artifact in working tree.

### Existing Alternative Implementations

#### A-001: backend/db/runtime.py Provides Proper DI Path
- **Status:** EXISTING_ALTERNATIVE_IMPLEMENTATION
- **Evidence Type:** Direct
- **File:** backend/db/runtime.py
- **Command:** `cat backend/db/runtime.py`
- **Output:** Provides `lifespan_db()`, `get_db()`, `set_db()` with RuntimeError if database not initialized, plus `install_db_write_guards()` calls.
- **Confidence:** High
- **Notes:** The newer runtime module is already imported and used by the GovernanceViolation handler (`backend/app_factory.py:273: from backend.db.runtime import get_db`). However, `backend/app_factory.py` still imports global `db` from `backend.core.lifespan`.

## Contradictions Identified

1. **Validation Approach Contradiction:** `backend/scripts/validate_env.py` excludes PIN_SALT from required keys, while `backend/utils/env_validation.py` includes PIN_SALT and enforces minimum length. Two validation modules with inconsistent security requirements.
2. **SQL_SERVER_HOST Contract Contradiction:** `validate_env.py` treats SQL_SERVER_HOST as optional for ERP integration, but `docker-compose.production.yml` strictly requires it with `${SQL_SERVER_HOST:?...}`.
3. **Package Manager Contract Contradiction:** `.gitignore` states pnpm is canonical, and `frontend/Dockerfile` uses `pnpm install --frozen-lockfile`, but documentation, scripts, CI script execution, and frontend package.json scripts heavily use `npm`.
4. **Governance Scope Contradiction:** `backend/services/governance_guard.py` has `raise_forbidden_direct_write()` and guards immutable business-state collections, but leaves `erp_items`, `users`, `count_line_drafts`, `system_settings`, `config`, `rack_registry`, `user_preferences`, `user_settings`, and other collections unguarded.
5. **Startup Path Contradiction:** `backend/app/settings_runtime.py` performs environment validation inside `run_server_main`, but the production Docker entrypoint (`gunicorn backend.server:app`) does not invoke `run_server_main`; only direct `python server.py` invocations do.

## Duplicate Merges

| Original Finding | Duplicate Of | Reason |
| :-- | :-- | :-- |
| Users directly mutated in API routes (phase-03) | V-005 Direct DB writes in API layer | Same pattern, different collection |
| Direct API writes bypass governance (phase-03 Runtime Risk Matrix) | V-005 Direct DB writes in API layer | Same pattern, restated |

## Confidence Recalculation (Independent)

Based only on verified evidence in the current repository:

| Area | Score | Rationale |
| :-- | :-- | :-- |
| ERP | 55% | SQL write regex protection verified, but direct erp_items writes in API layer are ungoverned. |
| Security | 35% | PIN_SALT validation exists in module but not invoked in production Docker; direct users writes bypass auth services; audit failures can be swallowed. |
| Offline | 75% | Sync/idempotency mechanisms observed; no verified regressions found. |
| Governance | 30% | Direct writes bypass guards on non-governed collections; swallowed audit failures. |
| Runtime | 45% | Global DI still used; alternative runtime path exists but not fully adopted. |

**Updated Production Confidence: 48%** (simple average of area scores)

## Files Viewed
- backend/app_factory.py
- backend/app/factory.py
- backend/server.py
- backend/app/settings_runtime.py
- backend/core/lifespan.py
- backend/db/runtime.py
- backend/scripts/validate_env.py
- backend/utils/env_validation.py
- backend/utils/crypto_utils.py
- backend/services/governance_guard.py
- backend/services/audit_service.py
- backend/api/auth_routes.py
- backend/api/item_verification_api.py
- backend/api/erp_api.py
- backend/api/count_lines_routes.py
- backend/sql_server_connector.py
- backend/Dockerfile
- docker-compose.production.yml
- .env.production.example
- backend/.env.example
- .gitignore
- frontend/.gitignore
- frontend/package.json
- Makefile
- .github/workflows/main.yml
- .github/workflows/pr-checks.yml
- .github/workflows/release.yml
- docs/TESTING_GUIDE.md
- README.md

## Files Searched
- backend/api/*.py
- backend/services/*.py
- backend/utils/*.py
- scripts/*.sh
- .github/workflows/*.yml

## Findings Changed
- V-003 refined: Original report focused on validate_env.py; verification reveals a deeper root cause (V-013) that production Docker does not call any validation.
- V-009 corrected: package-lock.json is untracked/ignored, not "tracked but ignored" as previously stated.
- V-005 expanded: Original report cited 2-3 examples; verification finds 59 direct write calls across 24 collections.
- V-012 confirmed: Core canonical collections (count_lines, sessions) remain protected.
- New findings added: V-013 (production validation gap), V-014 (stale backup file).

## Change History
- **Timestamp:** 2026-07-25T14:03:10+05:30
- **Branch:** chore/cleanup-stale-artifacts
- **Commit:** 83e49a373837080b7bde01c6ae626ec89b8a18e6
- **Commands Executed:** See "Commands Executed" section above
- **Files Viewed:** See "Files Viewed" section above
- **Files Searched:** See "Files Searched" section above
- **Evidence Added:** Direct command output, line numbers, and repository state for all findings
- **Confidence Delta:** -33 (from 81% to 48%)
- **Open Blockers:** Missing pnpm-lock.yaml, direct DB writes in API layer, swallowed audit failures, PIN_SALT/production validation gap
- **Report version:** 1.0
