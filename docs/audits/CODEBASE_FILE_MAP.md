# Codebase File Map — stk_final / Stock_final

Generated 2026-08-01. Branch `update-all-local-changes`.

## Legend

| Mark | Meaning |
|---|---|
| `[ACTIVE]` | On the runtime path (imported by app factory / router / screen graph) |
| `[TEST]` | Test or fixture |
| `[OPS]` | Tooling, migration, CI, deployment — run manually, not at runtime |
| `[SHIM]` | Backward-compat re-export only. Zero own logic |
| `[DUP]` | Duplicate or overlapping implementation of another file |
| `[DEAD]` | Zero inbound references from source or tests |
| `[JUNK]` | Build artifact, log, backup, one-shot scratch script, vendored third party |

---

# 1. Workspace root — `/Users/noufi1/stk_final`

The outer directory is a thin wrapper. Only 12 files are tracked by its git repo.

```
stk_final/
├── CLAUDE.md                       [ACTIVE]  agent instructions
├── .gitignore                      [ACTIVE]  ignores every sibling clone below
├── mcp.fixed.json                  [JUNK]    0 bytes, empty placeholder
├── .claude/                        [OPS]     agent config
├── plans/                          [OPS]     116K planning docs
├── docs/                           [OPS]     16K
├── Stock_final/                    [ACTIVE]  === THE ACTUAL PRODUCT (6.6G on disk) ===
│
├── frontend/                       [DUP]     10M — stale copy of Stock_final/frontend.
│                                             18 files diverge; Stock_final's copy is newer
│                                             (has OperationalShell, dashboardAdapter,
│                                             ScanAcknowledgeOverlay that this one lacks).
│                                             gitignored. DELETE.
├── Stock_final_baseline/           [JUNK]    897M — pre-refactor snapshot, gitignored
├── Stock_final_remote/             [JUNK]    607M — remote mirror clone, gitignored
├── app.log                         [JUNK]    94K stray log
├── .DS_Store                       [JUNK]    14K
│
├── goose/                          [JUNK]    622M  vendored third-party clone
├── nocobase/                       [JUNK]    vendored clone
├── nocobase-app/                   [JUNK]    empty dir
├── vibe-kanban/                    [JUNK]    vendored clone
├── claude-mem/                     [JUNK]    vendored clone
├── everything-claude-code/         [JUNK]    vendored clone
├── antigravity-awesome-skills/     [JUNK]    vendored clone
├── awesome-agent-skills/           [JUNK]    vendored clone
├── coll_git/                       [JUNK]    92K
├── .kilo/ .zcode/ .vscode/         [JUNK]    IDE/agent scratch, gitignored
└── .mypy_cache/ .pytest_cache/ .ruff_cache/  [JUNK] tool caches
```

**Reclaimable at this level: ~2.2 GB** (baseline + remote + vendored clones + stale frontend).

---

# 2. `Stock_final/` root

## 2.1 Keep

```
Stock_final/
├── README.md                       [ACTIVE]
├── ARCHITECTURE.md                 [ACTIVE]
├── AGENTS.md / GEMINI.md / DESIGN.md  [OPS]  agent + design instructions
├── USER_WORKFLOWS.md               [ACTIVE]  domain reference
├── TODO.md                         [OPS]
├── Makefile                        [ACTIVE]  task entrypoints
├── pytest.ini                      [ACTIVE]  testpaths=backend/tests only
├── mypy.ini                        [ACTIVE]
├── docker-compose.yml              [ACTIVE]
├── docker-compose.production.yml   [ACTIVE]
├── Jenkinsfile                     [OPS]
├── .gitlab-ci.yml                  [OPS]
├── .github/workflows/              [OPS]  7 files
├── .safety-policy.yml              [OPS]
├── .dockerignore .gitattributes .gitignore  [ACTIVE]
├── .env.production.example         [ACTIVE]
├── .env -> backend/.env            [ACTIVE]  symlink
├── .flake8 -> backend/.flake8      [ACTIVE]  symlink
├── backend_restart.sh              [OPS]
├── backend_port.json               [OPS]  runtime port handoff
├── k8s/ nginx/ redis/ monitoring/  [OPS]  deployment manifests
├── ios/                            [ACTIVE]  16 tracked files
└── backups/mongo/*.archive.gz      [OPS]  one restore archive
```

## 2.2 `[JUNK]` — one-shot codemod scripts, already applied

Each of these opens one specific source file, string-replaces, and writes it back.
They were the refactor tooling for the July modularization. All are now spent.

| File | What it rewrote |
|---|---|
| `fix_app_imports.py` | bulk import fixups |
| `fix_duplicates.py` / `fix_duplicates.sh` | dedupe pass |
| `fix_factory.py` | `backend/app/factory.py` |
| `fix_health.py` | `backend/app/routers.py` |
| `fix_occ_tests.py` | `backend/tests/api/test_count_line_occ_threading.py` |
| `fix_repo.py` | `backend/repositories/base.py` |
| `patch_facade.py` | AST facade generator |
| `rewrite_lifespan.py`, `rewrite_lifespan2.py` | `backend/core/lifespan.py` (two generations of the same script) |
| `rewrite_routes.py` | `backend/api/count_lines_routes.py` |
| `split_god_module.py` | AST module splitter |
| `update_insert.py`, `update_write_core.py` | `backend/services/count_lines/write_core.py` (two scripts, same target) |
| `update_routers.py` | `backend/app/routers.py` |
| `check_duplicates.py`, `check_router_prefixes.py` | one-off audits |

## 2.3 `[JUNK]` — ad-hoc probes named `test_*` at repo root

Not collected: `pytest.ini` sets `testpaths = backend/tests`. These are manual REPL scripts
that hit a live Mongo/SQL/HTTP endpoint. They shadow real test names and confuse discovery.

`test_middleware.py`, `test_mongo_query.py`, `test_mongo_types.py`, `test_mongo_users.py`,
`test_route.py`, `test_search.py`, `test_search_auth.py`, `test_search_service.py`,
`test_search_service2.py` `[DUP of test_search_service.py]`, `test_sql_types.py`

Also ad-hoc: `check_indexes.py`, `seed_items.py`, `update_passwords.py`
— these duplicate real entries in `backend/scripts/` (`create_item_indexes.py`,
`add_test_items.py`, `create_staff_users.py`). Move or delete.

## 2.4 `[JUNK]` — artifacts and heavyweight blobs

| Path | Size | Note |
|---|---|---|
| `worktrees/` (L02…L14) | **321M** | 12 abandoned feature worktrees; only `.gitignore` is tracked |
| `app.log` | 9.9M | tracked-adjacent runtime log |
| `app.log.1` | 10M | rotated |
| `app.log.2` … `app.log.5` | 115B each | empty rotations |
| `backend_startup_new.log` | 376K | |
| `backend_server.log` | 139B | |
| `collinsfoam-a11y-...-report.json` | 2.1M | committed a11y report |
| `Stock_final_main_analysis_report-2.pdf` | 1.2M | committed PDF |
| `erpnext_items_import.xlsx` | 2.9M | committed data dump |
| `erpnext_items_import2.xlsx` | 2.5M | `[DUP]` of the above |
| `Supplier.xlsx` | 28K | committed data dump |
| `.env.bak`, `.flake8.bak` | | backups of live config |
| `.DS_Store` | 14K | |
| `frontend_analysis.md`, `post_fix_verification.md`, `CODE_PATCH_SUMMARY.md`, `CODEBASE_ANALYSIS_REPORT.md` (35K) | | point-in-time reports; belong under `docs/audits/` if kept |
| `.venv/` | **1.2G** | |
| `.venv-gito/` | 109M | second unused venv |
| `awesome-codex-skills/` | 16M | vendored, 0 tracked files |
| `.agent/` | 4.5M, 356 tracked | vendored agent skill packs |
| `.codex/` | 4.1M, 460 tracked | vendored agent skill packs — includes an unrelated Brazilian auction scraper (`.codex/skills/junta-leiloeiros/`, 30 Python files) |

**~2.0 GB reclaimable inside Stock_final; ~470 tracked files are vendored agent packs, not product code.**

---

# 3. `backend/` — FastAPI service (541 tracked files)

## 3.1 Composition root

```
backend/
├── server.py                       [ACTIVE]  uvicorn entrypoint
├── app/
│   ├── factory.py                  [ACTIVE]  create_app(); imports 51 api modules
│   ├── bootstrap.py                [ACTIVE]  startup seeding
│   ├── routers.py                  [ACTIVE]  RouterRegistry, 46 core routes
│   ├── root_router.py              [ACTIVE]  legacy top-level routes
│   ├── middleware.py               [ACTIVE]  CORS/gzip/trusted-host/LAN/projection guard
│   ├── observability.py            [ACTIVE]  46L — app-level tracing hookup
│   ├── static.py                   [ACTIVE]
│   └── settings_runtime.py         [ACTIVE]  5L
├── app_factory.py                  [SHIM]    23L -> app/factory + app/root_router. 9 importers
├── core/
│   ├── lifespan.py                 [ACTIVE]  startup/shutdown
│   ├── database.py                 [ACTIVE]
│   ├── globals.py                  [ACTIVE]
│   ├── startup.py                  [ACTIVE]
│   ├── uow.py                      [ACTIVE]  unit of work
│   ├── websocket_manager.py        [ACTIVE]
│   ├── schemas/                    [ACTIVE]  audit_log, config_version, conflict, snapshot, user_settings
│   └── validators/pin_validator.py [ACTIVE]
├── config/
│   ├── core.py                     [ACTIVE]  772L settings
│   ├── governance.py               [ACTIVE]
│   ├── mappings.py                 [ACTIVE]  ERP column mappings
│   └── runtime.py                  [ACTIVE]
├── config_governance.py            [SHIM]    5L -> config.governance. 2 importers
├── db_mapping_config.py            [SHIM]    5L -> config.mappings. 2 importers
├── db/  indexes, initialization, migrations, runtime   [ACTIVE]
├── exceptions.py                   [ACTIVE]  208L
├── error_messages.py               [ACTIVE]
├── sql_server_connector.py         [ACTIVE]  SQL Server read-only bridge
├── locustfile.py                   [OPS]     load test
├── pyproject.toml / pytest.ini / .coveragerc / pyrightconfig.json / .flake8   [ACTIVE]
├── requirements.txt / .dev.txt / .production.txt   [ACTIVE]
├── Dockerfile / .dockerignore / .env.example       [ACTIVE]
├── app_factory.py.bak              [JUNK]    33K backup of a deleted god-module
├── extract_auth.patch              [JUNK]    54B leftover patch
├── api/STOCK_VERIFY_2-db-maped.code-workspace  [JUNK]  VS Code workspace inside api/
└── app.log, app.log.1..5, backend_startup.log  [JUNK]
```

## 3.2 `api/` — 68 route modules

**`[ACTIVE]`** — 51 modules imported by `app/factory.py`:
`admin_control_api`, `admin_dashboard_api`, `analytics_api`, `approval_api`, `auth`(shim),
`count_lines_api`(shim), `damage_api`, `dynamic_fields_api`, `dynamic_reports_api`,
`enhanced_item_api`, `enrichment_api`, `enterprise_api`, `erp_api`, `error_reporting_api`,
`exports_api`, `health`, `item_verification_api`, `locations_api`, `logs_api`, `mapping_api`,
`master_settings_api`, `metrics_api`, `notes_api`, `notifications_api`, `offline_sync_api`,
`permissions_api`, `pi_api`, `pin_auth_api`, `preferences_api`, `rack_api`,
`realtime_dashboard_api`, `reconciliation_api`, `recount_api`, `report_generation_api`,
`reporting_api`, `search_api`, `security_api`, `self_diagnosis_api`, `service_logs_api`,
`session_management_api`, `sql_verification_api`, `sync_batch_api`, `sync_conflicts_api`,
`sync_management_api`, `sync_status_api`, `unknown_items_api`, `user_management_api`,
`user_settings_api`, `variance_api`, `websocket_api`, `v2/`

Shared: `schemas.py` (14 importers) `[ACTIVE]`, `response_models.py` (8) `[ACTIVE]`.

**`api/v2/`** `[ACTIVE]` — reached through `v2/__init__.py`'s `v2_router`:
`items.py`, `sessions.py`, `health.py`, `connection_status.py`, `metrics.py`, `supervisor.py`.

### Marked

| File | Mark | Detail |
|---|---|---|
| `api/auth.py` | `[SHIM]` | 6L `from backend.api.auth_routes import *`. 17 importers still target the shim instead of `auth_routes` (1411L) |
| `api/count_lines_api.py` | `[SHIM]` | 6L `from backend.api.count_lines_routes import *`. 5 importers vs the real 2732L module |
| `api/location_session_api.py` | `[DEAD]` | 0 refs anywhere |
| `api/master_session_api.py` | `[DEAD]` | 0 refs anywhere |
| `api/schemas_variance.py` | `[DEAD]` | 0 refs; `schemas.py` carries the live variance models |
| `api/security_txt.py` | `[DEAD]` | 0 refs; never mounted |
| `api/test_support_api.py` | `[TEST]` | test-only mutation surface, explicitly exempted in `tests/test_governance_contracts.py` |

## 3.3 `services/` — 96 modules

### Modularization shims — 14 files, ~100 lines total, still carrying 60+ importers

The July refactor moved implementations into subpackages and left thin re-exports behind.
The shims work, but every module below is a name that resolves to somewhere else, and callers
have not been migrated. This is the single largest source of "which file is real?" confusion
in the backend.

| Shim `[SHIM]` | Real implementation | Importers still on the shim |
|---|---|---|
| `services/cache_service.py` | `services/cache/manager.py` | 6 |
| `services/redis_service.py` | `services/cache/redis_connection.py` | 13 |
| `services/rate_limiter.py` | `services/rate_limiting/limiter.py` | 3 |
| `services/lock_manager.py` | `services/locking/redis_manager.py` | 7 |
| `services/lock_service.py` | `services/locking/mongo_service.py` | 6 |
| `services/projection_service.py` | `services/projections/core.py` | 5 |
| `services/projection_read_service.py` | `services/projections/reader.py` | 6 |
| `services/projection_write_service.py` | `services/projections/writer.py` | 11 |
| `services/auto_diagnosis.py` | `services/diagnostics/auto_diagnosis.py` | 3 |
| `services/auto_recovery.py` | `services/resilience/auto_recovery.py` | 1 |
| `services/auto_sync_manager.py` | `services/scheduler/auto_sync_manager.py` | 1 |
| `services/auto_error_finder.py` | `services/diagnostics/auto_error_finder.py` | **0 — `[DEAD]`, delete now** |
| `config_governance.py` (root) | `config/governance.py` | 2 |
| `db_mapping_config.py` (root) | `config/mappings.py` | 2 |

### Real service modules `[ACTIVE]`

Counting core: `count_lines/{write_core,validation,governance,observation,session_aggregator}.py`,
`count_line_write_service.py` (254L, the real orchestrator), `count_state_machine.py`,
`recount_service.py`, `approval_engine.py`, `session_lifecycle_service.py`,
`session_state_machine.py`, `canonical_inventory.py`, `inventory_adjustment_service.py`.

Variance/reporting: `sql_variance_engine.py`, `variance_service.py`, `ai_variance.py`,
`reporting/{query_builder,compare_engine,export_engine,snapshot_engine}.py`,
`advanced_report_service.py`, `dynamic_report_service.py`, `system_report_service.py`,
`scheduled_export_service.py`, `heatmap_service.py`, `analytics_service.py`.

Projections: `projections/{core,reader,writer}.py`, `read_router.py`, `snapshot_service.py`.

Sync/ERP: `sync/{core_sync,discovery,nightly,realtime,scheduler}.py`, `sql_sync_service.py`,
`sql_verification_service.py`, `change_detection_sync.py`, `sync_conflicts_service.py`,
`enrichment_service.py`, `variant_service.py`, `unknown_item_service.py`.

Platform: `cache/*`, `locking/*`, `rate_limiting/*`, `resilience/*`, `scheduler/*`,
`diagnostics/*`, `circuit_breaker.py`, `concurrency.py`, `enhanced_connection_pool.py`,
`database_{health,manager,optimizer}.py`, `pubsub_service.py`, `websocket_service.py`,
`event_service.py`, `feature_flags.py`, `flag_resolver.py`, `watchdog_service.py`,
`mdns_service.py`, `monitoring_service.py`, `observability.py` (388L).

Security/audit: `enterprise_security.py`, `enterprise_audit.py`, `audit_service.py`,
`governance_audit_service.py`, `governance_guard.py`, `logic_guard.py`, `data_governance.py`,
`pin_auth_service.py`, `otp_service.py`, `refresh_token.py`, `activity_log.py`, `error_log.py`.

Notifications: `notification_service.py`, `whatsapp_service.py`.

### Marked

| File | Mark | Detail |
|---|---|---|
| `services/config_version_service.py` | `[DEAD]` | 0 refs in src or tests |
| `services/errors.py` | `[DEAD]` `[DUP]` | 34L, 0 refs; `backend/exceptions.py` (208L) is the live error taxonomy |
| `services/cache/redis_service.py` | `[DEAD]` `[DUP]` | 62L `RedisCacheService`; 0 refs. `cache/redis_connection.py` (240L, `RedisService`) is the live one. Two files, same name concept, inside the same package |
| `services/ai_search.py` | | 115L, 1 ref. Overlaps `search_service.py` (433L) + `enhancedSearchService` on the client. Verify before keeping |
| `services/analytics_service.py` | | 0 source refs, 1 test ref — test-only survivor |
| `services/count_state_machine.py` | | 0 source refs, 1 test ref |
| `services/inventory_adjustment_service.py` | | 0 source refs, 1 test ref |
| `services/websocket_service.py` | | 0 source refs, 1 test ref — `core/websocket_manager.py` is what runs |

## 3.4 `middleware/` — 14 files, 6 wired

`[ACTIVE]` (registered in `app/middleware.py`): `lan_enforcement.py`,
`projection_consistency_guard.py`, `security_headers.py`.
`[ACTIVE]` (1 ref each, verify): `security.py`, `tenant_isolation.py`, `performance_middleware.py`.

`[DEAD]` — **zero references**, superseded by `app/middleware.py`'s inline registration:

- `middleware/compression_middleware.py` — replaced by `GZipMiddleware`
- `middleware/input_sanitization.py`
- `middleware/logging_middleware.py`
- `middleware/rate_limit_middleware.py` — `[DUP]` of `services/rate_limiting/limiter.py`
- `middleware/request_id.py`
- `middleware/request_size_limit.py`
- `middleware/setup.py` — `[DUP]` the old registration entrypoint, now `app/middleware.py`

## 3.5 `models/`, `repositories/`, `utils/`, `auth/`

```
models/
├── user.py              [ACTIVE]
├── approval.py          [ACTIVE]
├── audit.py             [ACTIVE]
├── preferences.py       [ACTIVE]
├── analytics.py         [DEAD]  0 refs
├── snapshot.py          [DEAD]  21L, 0 refs — core/schemas/snapshot.py (30L) is live
└── sync.py              [DEAD]  0 refs

repositories/
├── base.py              [ACTIVE]
└── count_lines.py       [ACTIVE]

auth/
├── dependencies.py      [ACTIVE]
├── jwt_provider.py      [ACTIVE]
├── permissions.py       [ACTIVE]
├── cookies.py           [ACTIVE]
└── rate_limiter.py      [DUP]   third rate-limiter in the tree, alongside
                                 services/rate_limiting/limiter.py and
                                 middleware/rate_limit_middleware.py

utils/
├── api_utils.py         [ACTIVE]
├── auth_utils.py        [ACTIVE]
├── crypto_utils.py      [ACTIVE]
├── db_connection.py     [ACTIVE]
├── datetime_utils.py    [ACTIVE]
├── erp_utils.py         [ACTIVE]
├── env_validation.py    [ACTIVE]
├── logging_config.py    [ACTIVE]
├── port_detector.py     [ACTIVE]
├── service_manager.py   [ACTIVE]
├── tracing.py           [ACTIVE]
├── result.py            [DUP]   379L Result type — 16 importers
├── result_types.py      [DUP]   127L second Result type — 5 importers. Pick one
├── validation.py        [ACTIVE] 528L; 0 source refs but 1 test — overlaps
│                                 services/count_lines/validation.py (476L)
├── async_utils.py       [DEAD]  test-only
├── error_handler_with_diagnosis.py  [DEAD]  test-only
├── pagination.py        [DEAD]  0 refs
├── pdf_generator.py     [DEAD]  0 refs
├── secret_generator.py  [DEAD]  0 refs — scripts/generate_secrets.py is what runs
└── structured_logging.py [DEAD] 0 refs — logging_config.py is live
```

## 3.6 `backend/tests/` — 232 files `[TEST]`

```
tests/
├── conftest.py                     [ACTIVE]
├── api/            33 files        [TEST]
├── services/       17 files        [TEST]
├── governance/     11 files        [TEST]  authority-boundary contracts
├── middleware/      3 files        [TEST]
├── core/ app/ utils/ integration/  [TEST]
├── snapshots/      config + route baselines  [ACTIVE] drift detection
├── evaluation/     11 files        [OPS]   excluded via addopts --ignore
└── archive/         6 files        [JUNK]  excluded via addopts --ignore
    ├── test_basic.py, test_simple.py, test_comprehensive.py
    └── test_coverage_final.py, test_coverage_improvements.py, test_coverage_part2.py
                                     — three overlapping coverage-padding suites, [DUP]
```

Plus ~140 flat `tests/test_*.py`. Notable `[DUP]` pairs there:
`test_auth.py` exists at both `tests/test_auth.py` and `tests/api/test_auth.py`;
`test_integration.py` and `test_integration_api.py` overlap.

## 3.7 `backend/scripts/` — 52 files `[OPS]`

Legitimate one-time/periodic operations. Notable clusters worth consolidating:

- Barcode probes `[DUP]` cluster: `check_barcode_lengths.py`, `check_other_barcode_columns.py`,
  `check_other_barcodes.py`, `check_sql_barcodes.py`, `check_sql_barcodes_v2.py`,
  `explore_barcodes.py`, `barcode_analyzer.py` — seven scripts asking the same question of
  SQL Server; `check_sql_barcodes_v2.py` supersedes `check_sql_barcodes.py`.
- Index creation `[DUP]` cluster: `add_performance_indexes.py`, `create_feature_indexes.py`,
  `create_item_indexes.py`, `optimize_session_indexes.py` — plus `../scripts/ensure_indexes.py`
  and `../scripts/check_db_indexes.py` and root `check_indexes.py`. **7 index scripts.**
- Projection validation `[DUP]` cluster: `validate_projection_parity.py`,
  `validate_projection_vs_legacy.py`, `validate_v31_projections.py`,
  `v31_projection_validation.py`, `replay_consistency_check.py` — five overlapping validators,
  the last two named almost identically.

---

# 4. `frontend/` — Expo / React Native (605 tracked files)

The frontend is materially cleaner than the backend. Only **6 unreferenced source files**
across 451 files in `src/`.

## 4.1 Config and root

```
frontend/
├── package.json / pnpm-lock.yaml / pnpm-workspace.yaml   [ACTIVE]
├── app.json / eas.json                 [ACTIVE]  Expo config
├── babel.config.js / metro.config.js   [ACTIVE]
├── tsconfig.json                       [ACTIVE]
├── index.js                            [ACTIVE]  entry
├── jest.config.js / jest.setup.js / jest.polyfills.js   [TEST]
├── playwright.config.ts / playwright/  [TEST]  e2e
├── e2e/                                [TEST]
├── knip.json                           [OPS]  dead-code config
├── budget.json / lighthouserc.json     [OPS]  perf budgets
├── Dockerfile / nginx.conf             [OPS]
├── plugins/ scripts/                   [OPS]
├── expo-sqlite.d.ts, react-native-text-override.d.ts,
│   typescript-plugin-filter-text-errors.js            [ACTIVE]  type shims
├── openapi.json                        [OPS]  generated contract
│
├── knip_output.txt          [JUNK] [DUP]  49K stale run. Cites 247 "unused files" under
│                                          src/api/generated/** — that directory no longer
│                                          exists. Also cites src/styles/modernDesignSystem.ts,
│                                          deleted. Actively misleading; delete or regenerate.
├── lint-report.txt          [JUNK]  7K, Apr 29
├── fix_tests.py             [JUNK]  one-shot codemod
├── fix_touchables.py        [JUNK]  one-shot codemod
├── test-login.js            [JUNK]  ad-hoc probe
├── test_config.js           [JUNK]  107B stub
├── app/staff/item-detail.tsx.patch   [JUNK]  5K orphan patch
├── dist/                    [JUNK]  5.2M build output
├── node_modules/            [JUNK]  3.9G
├── android/ ios/            [JUNK]  gitignored native build dirs
├── testsprite_tests/        [OPS]   third-party test harness output
└── tests/ __tests__/        [TEST]
```

## 4.2 `app/` — Expo Router file routes, 58 files, all `[ACTIVE]`

```
app/
├── _layout.tsx, index.tsx, +not-found.tsx
├── login.tsx  register.tsx  welcome.tsx  forgot-password.tsx
├── reset-password.tsx  otp-verification.tsx
├── help.tsx  security.tsx  notifications.tsx  debug.tsx
├── staff/          _layout, index, home, scan, item-detail, history, settings
├── supervisor/     _layout, index, dashboard, sessions, session/[id], items,
│                   variances, variance-details, approval-queue, recount-request,
│                   observation-detail, offline-queue, sync-conflicts, bulk-ops,
│                   activity-logs, user-workflows, settings
├── admin/          _layout, index, dashboard-web, realtime-dashboard, live-view,
│                   control-panel, users, permissions, security, settings,
│                   sql-config, reports, metrics, logs, unknown-items
└── __tests__/route-hygiene.test.ts   [TEST]  guards route structure
```

## 4.3 `src/` — 451 files

```
src/
├── bootstrap/      13  [ACTIVE]  AppShell, RootStack(+.web), initApp, initAuthAndSettings,
│                                 initDevTools, initMobileRuntime, BootStateViews(+.web)
├── components/    174  [ACTIVE]  see 4.4
├── screens/         4  [ACTIVE]  IndexScreen, WelcomeScreen, StaffHomeScreen, SessionDetailScreen
├── features/       35  [ACTIVE]  auth/, inventory/ (scan hooks + services), reports/
├── services/      100  [ACTIVE]  see 4.5
├── store/          14  [ACTIVE]  auth, filter, network, notification(+polling),
│                                 scanSession, settings (zustand)
├── viewModels/      9  [ACTIVE]  adapters enforcing the authority boundary
├── core/           10  [ACTIVE]  config/, events/, policies/, reducers/ (event-sourced client)
├── data/            4  [ACTIVE]  controlPlaneDb + 3 repositories
├── db/              2  [ACTIVE]  localDb (SQLite)
├── hooks/          17  [ACTIVE]
├── utils/          23  [ACTIVE]
├── types/          13  [ACTIVE]
├── theme/          15  [ACTIVE]  see 4.6
├── styles/          3  [ACTIVE]  globalStyles + 2 screen style sheets
├── constants/       9  [ACTIVE]  config, flags, permissions, roleFeatureFlags, fontAssets(x3)
├── context/         1  [ACTIVE]  ThemeContext (540L, 17 importers)
├── config/          1  [ACTIVE]  location.ts
├── scanner/         2  [ACTIVE]  serialScanRules
└── assets/          2  [ACTIVE]  fonts, images
```

### `[DEAD]` — the only unreferenced source files in the frontend

| File | Detail |
|---|---|
| `src/viewModels/recountAdapter.ts` | 0 importers. The recount components import their types directly |
| `src/components/ui/PatternBackground.tsx` | 0 importers. The only occurrence of the name outside the file is a config **key** in `legacyVisualSystem.ts:49`, not an import |
| `src/services/scanDeduplicationService.ts` | 10L `export * from "@/features/inventory/services/scanDeduplicationService"`. 0 importers — a `[SHIM]` nothing points at |
| `src/viewModels/index.ts` | barrel, 0 importers — everything imports the concrete adapter |
| `src/components/identity/index.ts` | barrel, 0 importers |
| `src/components/operational/index.ts` | barrel, 0 importers |
| `src/components/recount/index.ts` | barrel, 0 importers |
| `src/components/variance/index.ts` | barrel, 0 importers |

These five barrels are leftovers from the feature-folder restructure: created as public
surfaces, never adopted. Either route imports through them or delete them.
(`src/components/settings/index.ts` looks similar but **is** live — three settings screens
import it by relative path, so it stays.)

## 4.4 `src/components/` — 174 files

| Folder | Count | Status |
|---|---|---|
| `ui/` | 40 + 16 tests | `[ACTIVE]` design-system primitives |
| `scan/` | 18 | `[ACTIVE]` counting workflow |
| `admin/` | 18 | `[ACTIVE]` dashboard, realtime-dashboard, users |
| `supervisor/` | 8 | `[ACTIVE]` |
| `settings/` | 8 | `[ACTIVE]` |
| `modals/` | 9 | `[ACTIVE]` |
| `operational/` | 7 | `[ACTIVE]` exception routing, finalization gate, baseline banner |
| `navigation/` | 8 | `[ACTIVE]` |
| `recount/` | 5 | `[ACTIVE]` blind-recount guard, comparison, lineage |
| `forms/` `charts/` `feedback/` `auth/` `identity/` `variance/` `layout/` `branding/` `common/` | 3-5 each | `[ACTIVE]` |
| root: `DataTable`, `ErrorBoundary(+.web)`, `LoadingSkeleton`, `PullToRefresh`, `SwipeableRow` | 5 | `[ACTIVE]` |
| `*.stories.tsx` (DataTable, Input, Modal, SearchAutocomplete) | 4 | `[OPS]` Storybook, no Storybook config present — verify |
| `ui/legacyVisualSystem.ts` | 67L, 3 refs | `[DUP]` explicitly named legacy; migration target |

## 4.5 `src/services/` — 100 files

```
services/
├── api/                    24  [ACTIVE]  api.ts + api.impl.ts + admin/* + per-domain clients
├── control-plane/           4  [ACTIVE]  countLine, countLineReview, session, event bus
├── offline/                 3  [ACTIVE]  offlineQueue, offlineStorage, offlineCountLine
├── sync/ + syncService.ts + syncQueue.ts + syncStatusPolling.ts + backgroundSync.ts
│                            6  [ACTIVE]
├── storage/                 2  [ACTIVE]  asyncStorage, secureStorage
├── device/                  3  [ACTIVE]  expoCamera (.ts/.native.ts/.web.tsx)
├── observability/           1  [ACTIVE]  controlPlaneMetrics
├── devtools/reactotron.ts   1  [OPS]     guarded optional dev dep
├── httpClient.ts, backendUrl.ts, networkService.ts, connectionManager.ts,
│   connectionMonitoring.ts, healthRequest.ts     [ACTIVE]  transport
├── authUnauthorizedHandler.ts, deviceId.ts       [ACTIVE]
├── enhancedSearchService.ts                      [ACTIVE]
├── scanDeduplicationService.ts                   [SHIM] [DEAD]  10L re-export of
│                                     features/inventory/services/scanDeduplicationService.ts
│                                     with 0 importers. Delete.
├── itemVerificationApi.ts (in api/)              [SHIM]  10L re-export of
│                                     features/inventory/services/itemVerificationApi.ts.
│                                     Reachable only through services/api/index.ts; every
│                                     real caller already imports the features/ path direct
├── logging.ts, sentry.ts, toastService.ts, haptics.ts, scanSoundService.ts  [ACTIVE]
├── themeService.ts, userPreferenceScope.ts, queryClient.ts, mmkvStorage.ts  [ACTIVE]
├── errorRecovery.ts, updateService.ts, versionService.ts,
│   backupReminderService.ts, enhancedFeatures.ts   [ACTIVE]
└── __tests__/ + inline *.test.ts                  [TEST]
```

Both names exist in two places, but neither is a real fork: the `src/services/` copies are
10-line `export *` shims left behind by the feature-folder move. The canonical bodies live in
`src/features/inventory/services/` (54L and 529L). Delete both shims — `scanDeduplication`
has no importers at all, and `itemVerificationApi`'s only reachability is the
`services/api/index.ts` barrel.

## 4.6 `src/theme/` — two parallel token systems `[DUP]`

| File | Lines | Importers | Status |
|---|---|---|---|
| `theme/themeTokens.ts` | 270 | **82** | `[ACTIVE]` the winner — runtime-derived `ThemeTokens` |
| `theme/unified/*` (7 files) | ~1000 | 83 files import from the folder | `[ACTIVE]` static token set |
| `theme/designTokens.ts` | 270 | **13** | `[DUP]` a third, independent Material-3 palette. Different content from `themeTokens.ts` despite the near-identical name. 13 components still on it |
| `theme/themes.ts` | 765 | 3 | `[ACTIVE]` `AppTheme` definitions consumed by `themeTokens` |
| `theme/unified/index.ts` | 181 | 0 direct | barrel; deep imports used instead |
| `theme/shadowUtils.ts` | 67 | 1 | only `designTokens.ts` uses it — dies with `designTokens` |
| `theme/operationalTheme.ts` | 20 | 1 | `[ACTIVE]` |
| `theme/operationalStyleBridge.ts` | 81 | 4 | `[ACTIVE]` |
| `theme/staffUiScale.ts` | 117 | 3 | `[ACTIVE]` |
| `theme/fontPreferences.ts` | 103 | 4 | `[ACTIVE]` |
| `hooks/useUiTokens.ts` | 84 | **111** | `[ACTIVE]` the canonical consumer hook |
| `hooks/useTheme.ts` | 302 | 14 | `[ACTIVE]` |
| `context/ThemeContext.tsx` | 540 | 17 | `[ACTIVE]` |
| `styles/globalStyles.ts` | 371 | 4 | `[ACTIVE]` |
| `components/ui/legacyVisualSystem.ts` | 67 | 3 | `[DUP]` self-declared legacy |

**Three token vocabularies coexist**: `themeTokens` (dynamic, 82 refs) + `theme/unified`
(static, 83 refs) + `designTokens` (Material-3, 13 refs). `useUiTokens` at 111 refs is the
de-facto standard. Collapsing `designTokens.ts` + `shadowUtils.ts` + `legacyVisualSystem.ts`
into the unified set removes ~400 lines and one whole naming axis.

---

# 5. `scripts/` (repo root) — 136 files `[OPS]`

```
scripts/
├── start_*/stop_*/run_*   ~20  [OPS]   .sh and .ps1 pairs for every service
├── check_*                ~12  [OPS]   db, users, sessions, indexes, health, vulnerabilities
├── verify_*                ~8  [OPS]
├── test_*                  ~7  [OPS]   manual integration probes, not pytest
├── export_*/sync_*         ~6  [OPS]   ERPNext + Tally
├── deploy_*/backup_*/restore_*  ~10  [OPS]
├── spec-kit/              10  [OPS]   bash + powershell mirrors of the same 5 commands
├── legacy/                21  [JUNK]  self-declared legacy; has its own README.
│                                      start_all_complete.sh, start_all_services.sh,
│                                      start_services.sh, run_system.sh, launch_system.sh
│                                      are five variants of one startup script
├── Untitled-8.ipynb        1  [JUNK]  untitled notebook
├── start_backend.ps1.clean 1  [JUNK]  editor artifact next to start_backend.ps1
├── deduplicate_all.py, db_audit_dupes.py, fix_duplicate_db.py  [OPS]  overlapping dedupe tools
└── cleanup_codebase.sh, repo_cleanup.sh   [DUP]  two repo-cleanup scripts
```

Startup-script sprawl: `start_all.sh`, `start_all.ps1`, `start_backend.sh`, `start_backend.ps1`,
`start_frontend.sh`, `start_frontend.ps1`, `start_frontend_new_window.ps1`, `start_local_db.sh`,
`start_with_redis.sh`, `start_tunnel.ps1`, `run_app.sh`, `restart_expo_lan.sh`, plus the 5
legacy variants — **17 ways to start the stack.** `Makefile` should be the single entrypoint.

---

# 6. `docs/` — 70 tracked files `[ACTIVE]` / `[OPS]`

```
docs/
├── architecture/          12  [ACTIVE]  DOMAIN, DATA_MODEL, SESSION_LIFECYCLE,
│                                        VARIANCE_ENGINE, INVENTORY_RULES, APPROVAL_WORKFLOW,
│                                        offline-command-protocol, per-domain notes
├── api/                    2  [ACTIVE]  command-contracts, compatibility-contracts
├── product/                3  [ACTIVE]  glossary, requirements, workflow-invariants
├── exec-plans/active/      7  [OPS]     L02..L07, L15 — mirror the 12 stale worktrees
├── plans/                  6  [OPS]     dated remediation plans, Mar–May 2026
├── audits/2026-05-03-...  16  [OPS]     the previous unused-file audit; CSVs + TSVs
├── audits/APP_HEALTH_AND_BUG_REPORT.md  [OPS]
├── runbooks/ testing/ decisions/        [OPS]  mostly .gitkeep
└── ~15 top-level .md       [ACTIVE]/[OPS]  API_REFERENCE, TESTING_GUIDE, CODEBASE_REPORT,
                                            APPLICATION_DOSSIER, BUSINESS_LOGIC_ANALYSIS,
                                            OPERATIONAL_EXPERIENCE_SPECIFICATION, ...
```

`docs/CODEBASE_REPORT.md` + root `CODEBASE_ANALYSIS_REPORT.md` (35K) + root
`frontend_analysis.md` + `docs/audits/2026-05-03-codebase-audit/` are four generations of the
same audit. `[DUP]` — consolidate under `docs/audits/`.

---

# 7. Action summary

## 7.1 Delete now — zero risk, zero references

**Backend source (14 files):**
```
backend/services/auto_error_finder.py       backend/services/config_version_service.py
backend/services/errors.py                  backend/services/cache/redis_service.py
backend/middleware/compression_middleware.py backend/middleware/input_sanitization.py
backend/middleware/logging_middleware.py    backend/middleware/rate_limit_middleware.py
backend/middleware/request_id.py            backend/middleware/request_size_limit.py
backend/middleware/setup.py                 backend/models/analytics.py
backend/models/snapshot.py                  backend/models/sync.py
backend/api/location_session_api.py         backend/api/master_session_api.py
backend/api/schemas_variance.py             backend/api/security_txt.py
backend/utils/pagination.py                 backend/utils/pdf_generator.py
backend/utils/secret_generator.py           backend/utils/structured_logging.py
```

**Frontend (8 files):** the five unadopted barrels (`viewModels/`, `components/{identity,
operational,recount,variance}/`) + `src/viewModels/recountAdapter.ts` +
`src/components/ui/PatternBackground.tsx` + `src/services/scanDeduplicationService.ts`.

**Artifacts and scratch (~2 GB in Stock_final, ~2.2 GB at workspace root):**
- `worktrees/` (321M), `app.log*`, `backend_startup_new.log`, `backend_server.log`
- `.venv-gito/` (109M), `awesome-codex-skills/` (16M)
- `*.bak`, `*.patch`, `.DS_Store`, `frontend/dist/`, `frontend/knip_output.txt`,
  `frontend/lint-report.txt`, `scripts/Untitled-8.ipynb`, `scripts/start_backend.ps1.clean`
- The 25 root-level `fix_*/rewrite_*/update_*/patch_*/split_*/check_*/test_*` one-shot scripts
- Workspace root: `frontend/` (stale duplicate), `Stock_final_baseline/`, `Stock_final_remote/`,
  and the 8 vendored third-party clones

## 7.2 Migrate then delete — shims with live callers

16 backward-compat shims, ~110 lines total, holding ~80 import sites hostage. Rewrite the
imports to the real modules (mechanical `sed`), then delete the shims. Highest-value targets by
caller count: `services/redis_service.py` (13), `services/projection_write_service.py` (11),
`api/auth.py` (17), `services/lock_manager.py` (7).

## 7.3 Consolidate — genuine duplicate implementations

| Pair | Recommendation |
|---|---|
| `utils/result.py` (379L, 16) vs `utils/result_types.py` (127L, 5) | Keep `result.py`, port the 5 |
| `theme/designTokens.ts` (13) vs `theme/themeTokens.ts` (82) vs `theme/unified/` (83) | Standardize on `useUiTokens` + `theme/unified`; retire `designTokens.ts` and `shadowUtils.ts` |
| `services/scanDeduplicationService.ts` + `services/api/itemVerificationApi.ts` | Not forks — 10L shims. Keep the `features/inventory/` bodies, delete both shims |
| 3 rate limiters (`auth/`, `services/rate_limiting/`, `middleware/`) | Keep `services/rate_limiting/limiter.py` |
| `utils/validation.py` (528L) vs `services/count_lines/validation.py` (476L) | Different scopes; rename to disambiguate |
| 7 barcode probe scripts, 7 index scripts, 5 projection validators | One script each with flags |
| 17 startup scripts + `scripts/legacy/` | `Makefile` targets only |
| 4 generations of codebase audit docs | One tree under `docs/audits/` |
| `erpnext_items_import.xlsx` + `...2.xlsx` (5.4M) | Keep neither in git |

## 7.4 Verify before touching

Files with **zero source references but one test reference** — the test is the only thing
keeping them alive. Either the feature was dropped and the test should go too, or the wiring
was lost in the refactor:

`services/analytics_service.py`, `services/count_state_machine.py`,
`services/inventory_adjustment_service.py`, `services/websocket_service.py`,
`utils/async_utils.py`, `utils/error_handler_with_diagnosis.py`, `utils/validation.py`,
`middleware/performance_middleware.py`, `middleware/tenant_isolation.py`

## 7.5 Scale

| | Files | Notes |
|---|---|---|
| Backend source | 309 | 541 tracked minus 232 tests |
| Backend tests | 232 | |
| Frontend `src/` | 451 | |
| Frontend `app/` routes | 58 | |
| Root `scripts/` | 136 | |
| Docs | 70 | |
| Vendored agent packs (`.agent`, `.codex`) | 816 | tracked but not product code |
| **Dead or junk identified** | **~90 tracked files** | plus ~4.2 GB of untracked artifacts |
