# Codebase In-Depth Analysis — Stock_final

---

## 1. System Identity

The application is a **stock-count / inventory verification platform** branded "Lavanya E-Mart" (internal project name: STOCK_VERIFY_2). It enables retail staff to conduct physical stock counts against an ERP baseline (SQL Server), record discrepancies, and allow supervisors to review, approve or reject counts in real time.

---

## 2. Technology Stack

| Layer | Technology |
|---|---|
| Backend language | Python 3.x |
| Backend framework | FastAPI (async) |
| Primary database | MongoDB (Motor async driver) |
| Secondary ERP source | SQL Server (accessed via sync services) |
| Frontend framework | React Native + Expo SDK 55 |
| Frontend language | TypeScript (strict mode) |
| Frontend routing | Expo Router (file-based) |
| Mobile storage | MMKV (native key-value) |
| Real-time channel | WebSockets (FastAPI/Starlette native) |
| Authentication | JWT HS256 (authlib.jose) + HttpOnly cookies |
| Monitoring | Grafana + Prometheus (backend-overview dashboard) |
| E2E tests | Playwright (9 spec files) |
| Unit tests (FE) | Jest |
| Package manager (FE) | pnpm |

---

## 3. Directory Structure

```
Stock_final/
├── backend/
│   ├── api/              # 40+ route modules (one per domain)
│   │   └── v2/           # Versioned endpoints with standardised ApiResponse shapes
│   ├── app/              # FastAPI app factory (thin compat wrapper)
│   ├── auth/             # JWT provider, cookie helpers, dependency injectors
│   ├── config/           # Deprecated governance re-export wrapper
│   ├── core/
│   │   ├── schemas/      # Pydantic schemas for audit, conflict, snapshot, user settings
│   │   ├── validators/   # PIN validator
│   │   └── websocket_manager.py
│   ├── db/               # Motor client init, seed data
│   ├── middleware/        # 10 middleware modules
│   ├── models/           # Pydantic domain models
│   ├── scripts/
│   │   └── archive/      # 12 historical one-off migration/backfill scripts
│   └── services/         # Business logic services (referenced but not fully read)
├── frontend/
│   ├── e2e/              # 9 Playwright spec files
│   └── src/
│       ├── bootstrap/    # Phased startup sequence
│       ├── components/   # UI component trees
│       ├── constants/    # Feature flags, permissions, role gates, scan config
│       ├── core/config/  # Control plane flags
│       ├── data/repositories/ # Control plane data repositories
│       ├── domain/
│       │   ├── events/   # Typed domain event definitions
│       │   ├── policies/ # Inventory business rules (count line validation)
│       │   └── reducers/ # Event sourcing reducers for session and count line state
│       ├── domains/
│       │   ├── auth/     # Auth service, types, store bindings
│       │   └── inventory/hooks/scan/ # 12+ custom hooks for the scan workflow
│       └── services/     # Scan dedup, item verification API, smart suggestions
├── monitoring/grafana/   # Grafana dashboard JSON
├── reports/              # Dependency, runtime convergence, UI governance baselines
├── scripts/              # Port detection, Mongo init
├── ios/                  # Xcode project (Expo prebuild output)
└── .agent/backups/       # Pre-migration MongoDB metadata snapshots (2026-05-03)
```

---

## 4. Backend Architecture

### 4.1 Entry Point and App Factory

`backend/app/factory.py` is a **compatibility shim** that does:

```python
from backend.app_factory import *  # noqa: F401,F403
def create_app() -> FastAPI: return _app_factory.app
app = create_app()
```

The real application object lives in `backend/app_factory` (not directly read, but referenced). The wildcard re-export (`*`) with suppressed linting means any new symbol added to `app_factory` automatically becomes part of the `backend.app.factory` public surface without explicit declaration — a maintenance hazard.

### 4.2 Middleware Stack

Ten middleware modules, layered in `backend/middleware/setup.py` delegating to `backend/app/middleware.register_middleware`. In stack order (outer to inner):

1. **`request_id`** — generates `X-Request-ID` UUID per request
2. **`logging_middleware`** — `SessionContextLoggingMiddleware`, pure ASGI (not `BaseHTTPMiddleware`) to avoid TaskGroup crashes; decodes JWT payload without signature verification for log context; logs `→ METHOD /path` and `← METHOD /path → STATUS (Xms)`
3. **`performance_middleware`** — request duration tracking
4. **`compression_middleware`** — gzip/brotli response compression
5. **`security_headers`** — adds HSTS, X-Frame-Options, CSP, etc.
6. **`input_sanitization`** — `InputSanitizationMiddleware` (BaseHTTPMiddleware); regex-detects XSS patterns (script tags, event handlers, iframe), SQL injection (`--`, `union select`, `or 1=1`), and path traversal (`../`) in query params and JSON bodies; configurable `block_violations` flag
7. **`rate_limit_middleware`** — `RateLimitMiddleware`, pure ASGI; per-user (from JWT) or per-IP; skips `/api/health`, `/api/auth/login`, `/api/auth/register`; sends `X-RateLimit-*` headers on every non-blocked response
8. **`request_size_limit`** — blocks oversized payloads
9. **`lan_enforcement`** — optional; blocks non-RFC1918/non-loopback IPs with 403
10. **`security`** (module-level) — provides `sanitize_barcode`, `sanitize_filter_keys`, `LoginRateLimiter`, `BatchRateLimiter` as utilities (not a middleware class itself)

### 4.3 Authentication System

**Tokens:**
- Access token: JWT HS256, 15-minute TTL (configurable via `ACCESS_TOKEN_EXPIRE_MINUTES`)
- Refresh token: JWT stored in MongoDB `refresh_tokens` collection, 30-day TTL
- Delivered via both `Authorization: Bearer` header and HttpOnly cookies (`sv_access_token`)

**Login flow:**
1. IP rate-limit check (cache service, configurable `RATE_LIMIT_MAX_ATTEMPTS`)
2. User lookup by username
3. Password verify (Argon2 via `verify_password`)
4. Legacy password field migration (if `password` field exists instead of `hashed_password`, rehashes and removes legacy field on-the-fly)
5. Single-session enforcement: revokes all existing refresh tokens for user before issuing new ones
6. Tokens generated, stored, cookies set
7. Login attempt logged, audit event emitted

**PIN login flow:**
- Strategy 0: Username-scoped O(1) lookup (most secure — used when `username` is provided)
- Strategy 1: O(1) fast lookup via `pin_lookup_hash` (SHA-256)
- Strategy 2: O(N) legacy scan of all users with `pin_hash`, with opportunistic migration to `pin_lookup_hash`
- PIN validated via Argon2 `pin_hash`
- Same single-session enforcement as password login

**WEAK_PIN blocklist:**
`{"1234", "0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999", "4321"}` — enforced at `change_pin` and `pin_setup`, but see §6.2 for contradiction.

**Password reset:** OTP via WhatsApp delivery service; 3-step flow (request → verify → confirm); on confirm, all refresh tokens are revoked (H5 fix comment).

**WebSocket auth:** Supports Bearer header, `Sec-WebSocket-Protocol: jwt,<token>`, single subprotocol with 3-dot JWT format, cookie fallback, and legacy query param (deprecated). JWT verified before `websocket.accept()`.

### 4.4 API Surface

**v1 routes (backend/api/):**
- `auth_routes.py` — login, pin-login, register, me, heartbeat, pin-setup, change-pin, change-password, password-reset flow
- `admin_control_api.py`, `admin_dashboard_api.py` — admin management
- `analytics_api.py` — heatmap KPIs
- `count_lines_api.py` — count line CRUD
- `dynamic_fields_api.py` — custom field definitions
- `enrichment_api.py` — item enrichment
- `enterprise_api.py` — IP lists, feature flags (server-side), GDPR data subject requests, retention policies
- `exports_api.py` — scheduled exports (CSV/JSON) for sessions, count lines, variance reports, activity logs
- `item_verification_api.py` — stock verification
- `locations_api.py` — warehouse/floor/rack hierarchy
- `logs_api.py`, `service_logs_api.py` — log retrieval
- `mapping_api.py` — ERP field mapping
- `master_settings_api.py` — global settings
- `metrics_api.py` — KPI metrics
- `notes_api.py` — annotated notes
- `notifications_api.py` — push notifications
- `permissions_api.py` — user permission management
- `pin_auth_api.py` — PIN management
- `preferences_api.py` — user preferences
- `rack_api.py` — rack registry
- `realtime_dashboard_api.py` — live dashboard data
- `reconciliation_api.py` — session-level count vs ERP aggregation
- `reporting_api.py`, `report_generation_api.py` — report generation
- `security_api.py` — security dashboard (failed logins, suspicious IPs, sessions, audit log)
- `sql_verification_api.py` — SQL Server quantity verification
- `supervisor_pin.py` — supervisor PIN override
- `sync_conflicts_api.py`, `sync_management_api.py`, `sync_status_api.py` — ERP sync management
- `user_settings_api.py` — per-user settings
- `variance_api.py` — variance reasons + trend (both marked `deprecated=True`)
- `websocket_api.py` — WebSocket endpoint
- `error_reporting_api.py` — client-side error reporting

**v2 routes (backend/api/v2/):**
- `items.py` — paginated item list, fuzzy search, semantic search, visual search (image OCR + barcode), item detail with optional SQL verification
- `sessions.py` — versioned session endpoints
- `metrics.py` — v2 metrics
- `health.py` — health check
- `connection_status.py` — connectivity status

### 4.5 Reconciliation Engine

`reconciliation_api.py` runs a MongoDB aggregation pipeline on `count_lines`:

1. Matches non-superseded lines for a session
2. Groups by `item_code`, summing `counted_qty`
3. Lookups `erp_items` for current `stock_qty`
4. Projects three variance metrics:
   - `count_variance = total_counted − baseline_qty` (physical vs ERP at session start)
   - `erp_drift = current_system_stock − baseline_qty` (ERP changed since session start)
   - `final_gap = total_counted − current_system_stock` (physical vs live ERP)
5. Flags baseline conflicts (`baseline_values` set size > 1)
6. Sorts by `|count_variance|` descending

### 4.6 Governance Layer

`backend/config_governance.py` defines three production safety flags:

- `SQL_VERIFY_STRICT` — default `True`; enforces SQL variance policy
- `SQL_MAX_VARIANCE` — default 10,000; capped at 100,000
- `SQL_MAX_LATENCY_MS` — default 5,000ms; capped at 60,000ms

`backend/config/governance.py` (deprecated re-export) adds three kill-switch flags:

- `ENABLE_SQL_SYNC_WRITE` — default `False`
- `ENABLE_AUTO_VERIFICATION` — default `False`
- `ENABLE_CONFLICT_AUTO_RESOLUTION` — default `False`

All default to the most conservative (safest) value.

### 4.7 WebSocket Manager

`WebSocketManager` is a **process-level singleton** (`manager = WebSocketManager()`). It maintains three in-memory dicts:

- `active_connections: {user_id: [WebSocket]}`
- `session_connections: {session_id: [WebSocket]}`
- `user_roles: {user_id: role}`

Methods: `connect`, `disconnect`, `send_personal_message`, `broadcast_to_session`, `broadcast_all`, `broadcast_to_roles`, `ping_all` (liveness check with dead-socket pruning), `get_connection_stats`.

### 4.8 Database Seed Data

`backend/db/initialization.py` creates three default users at startup if they don't exist:

| Username | Password | Role | PIN |
|---|---|---|---|
| staff1 | staff123 | staff | 1234 |
| supervisor | super123 | supervisor | 1234 |
| admin | admin123 | admin | 1234 |

Ten mock ERP items (ITEM001–ITEM010, food/personal care/household categories) plus one E2E test item (`barcode: 513456`).

---

## 5. Frontend Architecture

### 5.1 App Startup Sequence

`initializeApp()` in `src/bootstrap/initApp.ts` runs phases in sequence with progress reporting (0–100%):

| Phase | % | Action |
|---|---|---|
| monitoring | 5 | `initMonitoringAndDevTools` |
| fonts | 10–15 | Font readiness check |
| storage | 20–30 | MMKV initialize (2s timeout) |
| auth | 40 | `loadStoredAuth` with `initAuthAndSettings` |
| settings | 70 | `loadSettings` |
| deferred-services | 82 | ThemeService (1s timeout, fire-and-forget) |
| runtime | 90 | Background sync registration (1s timeout, auth-gated); `initMobileRuntime` |
| ready | 100 | Return cleanup function |

All deferred services use `withTimeout` wrappers and `Promise.allSettled` — failures are logged in dev but never block startup.

### 5.2 Event Sourcing (Client-Side)

The frontend implements a **CQRS/event sourcing pattern** for two aggregates:

**Session** (`sessionProjectionReducer.ts`):
Events: `SESSION_STARTED`, `SESSION_STATUS_CHANGED`, `SESSION_RESUMED`, `SESSION_HEARTBEAT`, (fallback → `FINALIZED`)
Snapshot fields include: `localSessionId`, `serverSessionId`, `warehouse`, `locationKey` (composite key `WAREHOUSE::TYPE::NAME::RACK`), `status`, `type`, `staffUser`, `staffName`, lifecycle timestamps (`startedAt`, `closedAt`, `reconciledAt`, `completedAt`, `finalizedAt`), `syncStatus`, `projectionVersion`.

**Count Line Review** (`countLineReviewProjectionReducer.ts`):
Events: `COUNT_LINE_APPROVED`, `COUNT_LINE_REJECTED`, `STOCK_VERIFIED`, (fallback → unverified)
On rejection: sets `blindRecountRequired: true`, `dualVerificationRequired: true`, `originalCountHidden: true`.

### 5.3 Inventory Scan Workflow

The scan domain (`src/domains/inventory/hooks/scan/`) is decomposed into 12 custom hooks:

- `useItemState` — item lookup state
- `useWorkflowState` — scan workflow step machine
- `useScanState` — scanner/input state
- `useItemForm` — form field state (quantity, batch mode, damage, condition, remark, photo, MRP, category, serial numbers, mfg date)
- `useItemMetadataState` — item metadata
- `useItemEvidenceState` — photo and evidence state
- `usePhotoState` — camera/photo state
- `useQuantityCountManager` — batch quantity management
- `useBatchManagement` — batch mode
- `useFlexibleDateField` — manufacturing date field with flexible format
- `useItemDraftAutosave` — autosaves draft to storage
- `useItemSubmission` — submission logic (duplicate detection, strict mode variance confirmation, payload build, API call)

`useItemSubmission` flow:
1. `validateForm(item, sessionType)`
2. `confirmStrictVariance` — if session is STRICT and `counted_qty ≠ stock_qty`, shows native Alert
3. `handleDuplicateCount` — calls `checkItemCounted`; if already counted, presents "Add / New Entry / Cancel" choice
4. `buildCountLinePayload` — assembles all form state into `CreateCountLinePayload`
5. `createCountLine` API call
6. Haptic feedback on success

### 5.4 Inventory Policies (Client-side Enforcement)

`src/domain/policies/inventoryPolicies.ts` — `enforceCountLinePolicies()`:

- `counted_qty` must be finite and non-negative
- Max decimal precision: 3 (configurable via context)
- UoM "NOS" rejects fractional quantities
- `allowFraction: false` context rejects fractional quantities
- Serial numbers must be unique (case-insensitive after `trim().toUpperCase()`)
- Serialized items: quantity must be integer and equal the serial count
- Both `serial_numbers` and `serial_entries` arrays are normalized and merged

### 5.5 Feature Flags

`src/constants/flags.ts` — `FeatureFlags` type with 16 flags. Resolution priority (last wins):

1. Hardcoded defaults
2. `EXPO_PUBLIC_FLAG_<flagName>` environment variable
3. URL query param `flag.<flagName>` or `<flagName>` (web only)
4. `localStorage["feature_flag_overrides_v1"]` (web only)
5. `uiUpgradeMasterEnabled` master kill switch forces all `UI_EPIC_FLAGS` to `false`

All UI flags are currently `true` by default:
`uiUpgradeMasterEnabled`, `uiAuthRedirectV2`, `uiThemeTokensV2`, `uiVisualSystemV2`, `uiSettingsV2`, `uiScanV2`

`src/constants/roleFeatureFlags.ts`:

**Supervisor hard-disabled routes (compile-time):**
`db-mapping`, `error-logs`, `export`, `export-results`, `export-schedules`, `notes`, `watchtower`

**Admin hard-disabled routes (compile-time):**
`ai-assistant`

### 5.6 Scan Deduplication

`ScanDeduplicationService` — tracks only the **last** scanned barcode with a 3-second window. If any different barcode is scanned between two identical scans, the dedup window resets. The singleton is exported as `scanDeduplicationService`.

### 5.7 TypeScript Configuration

`tsconfig.json` enables:
- `strict: true`
- `noUncheckedIndexedAccess: true` (array/object access returns `T | undefined`)
- `noImplicitReturns: true`
- `forceConsistentCasingInFileNames: true`
- Custom plugin: `typescript-plugin-filter-text-errors.js` (suppresses specific TS errors)
- Path alias: `@/*` → `./src/*`

---

## 6. Identified Issues

### 6.1 Duplicate Route Conflict in `v2/items.py`

Two `@router.get("/{...}")` routes at line 327 and line 435 share the same path pattern on the same router:

```python
@router.get("/{item_id}", ...)          # line 327 — GET by MongoDB ObjectId
async def get_item_v2(item_id: str, ...)

@router.get("/{item_code}", ...)        # line 435 — GET by item_code with SQL verify option
async def get_item_details(item_code: str, ...)
```

FastAPI registers routes in declaration order. `get_item_details` (line 435) is **unreachable** — every request to `/{x}` will be handled by `get_item_v2` (line 327). The SQL verification feature (`?verify_sql=true`) is therefore dead code in this file.

### 6.2 Default PIN Contradicts Weak PIN Blocklist

`db/initialization.py` seeds all three default users with PIN `"1234"`. `auth_routes.py` defines `WEAK_PINS = {"1234", ...}` and blocks this value in `_validate_new_pin_value`. The system seeds an account with a PIN it then refuses to let users set manually. On first login, users cannot change PIN to a "stronger" value if they try `1234` — but they are also not prompted to change the seeded `1234` PIN.

### 6.3 In-Memory Rate Limiters Do Not Survive Multi-Worker Deployments

`backend/middleware/security.py` exports:
```python
login_rate_limiter = LoginRateLimiter()   # defaultdict in process memory
batch_rate_limiter = BatchRateLimiter()   # defaultdict in process memory
```

These are process-level singletons. With Gunicorn/Uvicorn multi-worker deployments, each worker has an independent copy. An attacker distributing 5 requests across 5 workers would bypass a `max_attempts=5` limit entirely.

The `check_rate_limit` function in `auth_routes.py` uses a separate cache service (presumably Redis-backed), so the login endpoint itself is correctly guarded. The in-memory limiters are a residual hazard if used elsewhere.

### 6.4 WebSocket Manager Not Shareable Across Workers

`core/websocket_manager.py` exports `manager = WebSocketManager()` — a single in-process instance. In a multi-worker deployment, `broadcast_all` and `broadcast_to_roles` operate only on the current worker's connections. Supervisor broadcasts for real-time dashboard updates will silently reach only the fraction of clients connected to that specific worker.

### 6.5 Semantic Search Scalability

`GET /api/v2/items/semantic` unconditionally fetches `LIMIT 500` items from MongoDB into Python memory, then runs sentence-transformer encoding on all of them. At 500 items this is a blocking CPU operation per request with no caching. Growth of the catalog degrades response time linearly. There is no vector index or approximate nearest-neighbor structure.

### 6.6 No Backend Test Suite

`backend/tests/` contains `test_queries.json` (a data file) but zero Python test files. The only automated quality gates are frontend Jest unit tests and 9 Playwright E2E specs. Backend logic (reconciliation pipeline, sync service, governance policy enforcement, authentication flows) has no unit test coverage.

### 6.7 Timezone Inconsistency

Mixed usage of timezone-aware and timezone-naive datetimes throughout the backend:

- `datetime.now(timezone.utc)` — timezone-aware (correct)
- `datetime.now(timezone.utc).replace(tzinfo=None)` — naive UTC (stripping tzinfo)

MongoDB stores datetimes as BSON UTC. Mixing aware and naive datetimes in Python comparison operators (`>`, `<`) raises `TypeError` in Python 3.x. The `.replace(tzinfo=None)` pattern is used in MongoDB query building (e.g., `security_api.py` line 116, `variance_api.py` line 41) while `timezone.utc` aware datetimes are stored during writes. This is latent and suppressed by MongoDB's implicit UTC normalization but breaks local datetime comparisons.

### 6.8 Logging Middleware Decodes JWT Without Verification

`_extract_user_context` in `logging_middleware.py` base64-decodes the JWT payload to extract `sub` and `role` for log context, without calling the JWT signature verifier. A client can craft an arbitrary JWT payload (with any `sub`, `role`, `session_id`) that passes this extraction. The resulting log lines will contain attacker-controlled values, which can corrupt audit logs or inject into structured log outputs if log aggregation systems parse them. Authentication itself is not compromised (the actual auth middleware still verifies the signature), but log integrity is.

### 6.9 Deprecated Module Mutates Canonical Data Structure

`backend/config/governance.py` (the deprecated compatibility wrapper) calls:

```python
GOVERNANCE_FINGERPRINT.update({"flags": {...}})
```

This mutates the `dict` object imported from `backend/config_governance.py` (the canonical module). If this module is imported by any code path, it permanently modifies the canonical `GOVERNANCE_FINGERPRINT` as a side effect. Importing a "deprecated" module should not have state-mutating side effects.

### 6.10 `ScanDeduplicationService` Dedup Window is Single-Entry

The deduplication service maintains only `lastScan: ScanHistory | null`. Scanning barcode A, then B, then A again — all within 3 seconds — would not catch the second A scan as a duplicate, because scanning B reset `lastScan` to B. This is insufficient for scenarios involving rapid multi-item scanning near each other.

### 6.11 Wildcard Re-Export in App Factory

```python
from backend.app_factory import *  # noqa: F401,F403
```

Any symbol added to `app_factory` (including private helpers, internal constants) becomes part of `backend.app.factory`'s implicit public API. This makes it impossible to know what is exported without inspecting the source, and suppresses the linting rules (F401: unused import, F403: wildcard import) that would normally catch this.

### 6.12 Deprecated Routes Still Active

`variance_api.py` marks both endpoints `deprecated=True` in their route decorators but provides no successor route reference and they remain fully functional. The `deprecated=True` flag only affects OpenAPI documentation.

### 6.13 Archive Scripts Signal Past Data Quality Incidents

`backend/scripts/archive/` contains 12 one-off scripts:
- `check_barcode_lengths.py`, `check_other_barcodes.py`, `check_other_barcode_columns.py`, `check_sql_barcodes.py`, `check_sql_duplicates.py`, `explore_barcodes.py` — barcode data quality investigations
- `backfill_item_projection_collections.py`, `backfill_session_dashboard_projection.py`, `backfill_session_snapshots.py` — projection backfills after schema changes
- `v31_projection_validation.py`, `validate_projection_vs_legacy.py` — projection reconciliation scripts
- `migrate_user_settings.py` — settings migration

These are archived (not runnable from CI/CD) but indicate at least three categories of historical data integrity issues: barcode format inconsistencies across ERP and MongoDB, projection collection drift, and user settings schema migration.

---

## 7. Architectural Patterns

### 7.1 Result Monad
`Ok`/`Fail` types from `backend/utils/result.py` are used throughout `auth_routes.py` for composable error propagation without exceptions. The `@result_to_response` decorator converts `Result` to HTTP responses. Consistent within auth; not adopted uniformly across other API modules.

### 7.2 Compatibility Shims (Ongoing Refactoring)
Three explicit compatibility wrappers exist:
- `backend/app/factory.py` → re-exports `backend/app_factory`
- `backend/api/auth.py` → re-exports `backend/api/auth_routes`
- `backend/config/governance.py` → re-exports `backend/config_governance`

Each preserves old import paths during a refactoring migration. They indicate in-progress architectural reorganisation.

### 7.3 Two-Layer Search (Items)
Item lookup uses a hybrid strategy:
- Exact match: barcode / manual_barcode / item_code
- Fuzzy fallback: rapidfuzz `partial_ratio` (name) + `ratio` (code, barcode) with weighting (barcode ×1.2, code ×1.1, name ×1.0)
- Semantic fallback: sentence-transformers reranking
- Visual: pyzbar barcode decode + pytesseract OCR → exact/fuzzy/semantic pipeline

### 7.4 ASGI-Native Middleware
`RateLimitMiddleware` and `SessionContextLoggingMiddleware` use raw ASGI `__call__` pattern rather than `BaseHTTPMiddleware`. `BaseHTTPMiddleware` is noted in code comments to cause TaskGroup crashes with streaming responses. This is a deliberate architectural choice consistent with Starlette best practices for async-safe middleware.

### 7.5 Service Injection via Registry
`sync_management_api.py` uses module-level globals `_erp_sync_service` and `_change_detection_service` with setter functions (`set_erp_sync_service`, `set_change_detection_service`) — a service locator pattern. Services are registered at startup and endpoints degrade gracefully (400 / fallback response) when services are unavailable.

---

## 8. Database Collections

From MongoDB metadata backups (`stock_verification` database):
`sessions`, `count_lines`, `count_line_drafts`, `erp_items`, `erp_config`, `erp_sync_metadata`, `users`, `refresh_tokens`, `login_attempts`, `audit_logs`, `enterprise_audit_logs`, `activity_logs`, `device_sessions`, `security_events`, `security_ip_lists`, `security_lockouts`, `security_sessions`, `feature_flags`, `item_serials`, `item_variances`, `rack_registry`, `notifications`, `dynamic_fields`, `batch_records`, `verification_records`, `verification_sessions`, `report_snapshots`, `report_compare_jobs`, `data_archive`, `data_retention_policies`, `data_subject_requests`, `discount_requests`, `barcode_requests`, `error_logs`, `migrations`

The `stock_count` and `stock_count_test` databases are also present (older/test databases based on backup metadata).

---

## 9. Test Coverage

| Area | Coverage |
|---|---|
| Backend unit tests | None found |
| Frontend unit tests | Jest — bootstrap, realtime dashboard, serial scanner state, item submission, autosave, error messages, flag constants |
| Frontend E2E (Playwright) | 9 specs: core flow, auth, admin dashboard, misplaced item, recount assignment, supervisor smoke, visual, watchtower regression, stale-auth redirect |
| Backend integration | None found |

The E2E suite tests the full stack (login → session → scan → verify → logout) and includes a stale-auth redirect test that verifies no retry storms (≤2 stats requests, ≤1 refresh, ≤1 WebSocket attempt after token expiry).

---

## 10. Security Posture Summary

| Control | Status |
|---|---|
| JWT access tokens (15 min) | Active |
| Refresh token rotation | Active (stored in DB, revocable) |
| Single-session enforcement | Active (configurable via `AUTH_SINGLE_SESSION`) |
| PIN brute-force (4-digit) | Mitigated via Argon2 hash + rate limiting |
| Login rate limiting | Active (cache-backed, per-IP) |
| Input sanitization | Active (regex-based, middleware) |
| MongoDB injection prevention | Allowlist-based filter key sanitization |
| CSRF | Mitigated via SameSite cookie + HttpOnly |
| LAN-only enforcement | Optional middleware (configurable) |
| Security dashboard | Active (admin-only: failed logins, suspicious IPs, sessions, audit log) |
| Password reset token revocation | Active (all refresh tokens revoked on reset) |
| Weak PIN blocklist | Active (but seeded with `1234` — see §6.2) |
| Multi-worker rate limit sharing | Not implemented (in-memory) |
| Audit logging | Active (login, pin, password events) |
| Log injection prevention | Partial (`sanitize_for_logging` used in most places; logging middleware does not verify JWT before logging claims) |

---

## 11. Extended Service Layer Analysis (Second Pass)

### 11.1 Application Factory (`backend/app_factory.py`)

The real application entry point. 850 lines.

**Router registration:** 50+ routers registered through a `RouterRegistry` dataclass passed to `register_routers()`. Optional routers (notes, enterprise, enrichment, reconciliation, pin_auth, v2, test_support) are guarded by `try/except ImportError` at module level — unavailability of any optional module does not prevent startup.

**Sentry integration:** Configured at module import time (not deferred) with `StarletteIntegration` and `FastApiIntegration`. `traces_sample_rate` and `profiles_sample_rate` both default to `0.1`. Only activates if `SENTRY_DSN` is set.

**API docs gating:** `_api_docs_enabled()` disables Swagger/ReDoc/OpenAPI JSON in production and staging unless `ENABLE_API_DOCS=true` is explicitly set. Development default is enabled.

**ORJSONResponse:** Set as `default_response_class`, providing faster JSON serialization than stdlib.

**Business logic inline in factory:** `verify_stock`, `unverify_stock`, `get_count_lines`, and two legacy analytics aggregation routes are defined directly in `app_factory.py` rather than in dedicated API modules. These functions also serve as test entry points (noted via `"Exposed for direct test usage"` comment).

**`init_default_users` duplication:** Both `app_factory.py` (lines 300–355) and `backend/db/initialization.py` define `init_default_users`. The `lifespan.py` version calls `db/initialization.py:init_default_users(db)`. The function in `app_factory.py` is never called from `lifespan.py` — it is a dead duplicate.

**`RUNNING_UNDER_PYTEST` flag:** Module-level detection of pytest via `"pytest" in sys.modules`. Controls test_support router loading and some logging behavior. Not gated from non-test contexts.

**`LOG_ROUTE_TABLE` env var:** When set, logs the full route table at startup — useful for debugging route conflicts (such as Issue §6.1).

### 11.2 Lifespan Startup Sequence (`backend/core/lifespan.py`)

The `@asynccontextmanager async def lifespan(app: FastAPI)` function runs on every startup/shutdown. Approximately 1,000 lines. Startup phases (in order):

1. **Runtime globals set** — `set_client`, `set_db`, `set_cache_service`, `set_refresh_token_service`
2. **Redis + PubSub** — `init_redis()`, `get_pubsub_service().start()`, `get_lock_manager(redis_service)`; failure is non-fatal with warning
3. **mDNS** — `start_mdns(port)`; failure is non-fatal
4. **SQL Server** — `asyncio.wait_for(asyncio.to_thread(sql_connector.connect, ...), timeout=startup_sql_timeout)` (default 5s); failure is non-fatal
5. **Enhanced connection pool** — `asyncio.create_task(_init_connection_pool())` in background; never blocks API startup
6. **MongoDB ping** — mandatory; raises `SystemExit` if MongoDB unavailable in non-development modes
7. **Default user seeding** — gated by `AUTO_SEED_DEFAULT_USERS` setting (default `False` in production); emits explicit warning if enabled in production
8. **Migrations** — `MigrationManager.ensure_indexes()` + `run_migrations()`
9. **AutoSyncManager** — creates a background task if SQL is configured
10. **ERP Sync + Change Detection Sync** — `await erp_sync_service.start()`, `await change_detection_sync.start()`
11. **Database health monitoring** — `database_health_service.start()`
12. **Cache initialization** — `await cache_service.initialize()`
13. **Auth dependencies** — `init_auth_dependencies(db, SECRET_KEY, ALGORITHM)`
14. **LockService + VariantService + SnapshotService** — initialized; failure does not abort
15. **CountLines API** — `init_count_lines_api(activity_log_service, lock_service, snapshot_service, variant_service, sql_connector)`
16. **Scheduled export service** — `scheduled_export_service.start()`
17. **Enterprise services** (conditional on `g.ENTERPRISE_AVAILABLE`) — EnterpriseAuditService, EnterpriseSecurityService, FeatureFlagService, DataGovernanceService
18. **Search service** — `init_search_service(database)`
19. **Globals injection** — `g.db`, `g.cache_service`, etc.
20. **Backend port info** — `PortDetector.get_local_ip()`, SSL detection, `save_backend_info(port, ip, protocol)`

**Governance write guards installed at DB level:** `install_db_write_guards(db)` is called at module level (before `lifespan`) to wrap the Motor DB client — it installs `GovernedCollection` proxies on `count_lines`, `sessions`, `verification_sessions`, `recount_requests`, `session_snapshots`, `unknown_items`.

**MongoDB client options:** `maxPoolSize=100`, `minPoolSize=10`, `maxIdleTimeMS=45000ms`, `serverSelectionTimeoutMS=5000ms`, `retryWrites=True`, `retryReads=True`.

**Password hashing context:** Argon2 first with 64MB memory cost, 3 iterations, 4 threads; bcrypt fallback. `CryptContext` is configured at module import, not deferred. A probe bcrypt hash is computed during module load to verify bcrypt is working.

### 11.3 Rate Limiter Service (`backend/services/rate_limiter.py`)

**`RateLimiter`** implements a token bucket algorithm:
- Default 100 req/min, burst of 20
- Per-user or per-endpoint bucketing via composite key (`user:{id}|endpoint:{path}`)
- `_lock = Lock()` (threading.Lock, not asyncio) — compatible with the event loop since the bucket operations are synchronous O(1) lookups
- Cleanup of stale buckets (idle > 1 hour) happens in-band during `is_allowed()` when the window resets; not a background task
- Returns `(allowed: bool, info: dict)` with `remaining`, `limit`, `reset_in`, and `retry_after`

**`ConcurrentRequestHandler`** wraps `asyncio.Semaphore(max_concurrent=50)`:
- `acquire(timeout=5.0)` uses `asyncio.wait_for` — returns `False` on timeout rather than raising
- `release()` decrements `_active` counter under `asyncio.Lock`
- This is an in-process concurrency cap, not distributed

Both are process-level singletons; the multi-worker scaling concern from §6.3 applies here equally.

### 11.4 Cache Service (`backend/services/cache_service.py`)

**`CacheService`** with Redis primary and in-memory fallback:
- `redis.asyncio` imported optionally; falls back if unavailable
- `socket_timeout=5.0s` on both Redis operations and the `initialize()` ping
- In-memory eviction: LRU-by-expiry, removes 20% of oldest items when `max_memory_size` (default 100) is reached; not a true LRU (sorts by expiry, not access time)
- `CustomJSONEncoder` handles `ObjectId` and `datetime` serialization
- `get_or_set(prefix, key, factory, ttl)` — cache-aside pattern; does not lock between miss and set (potential thundering herd if multiple requests miss simultaneously on a cold cache)
- `cache_on_demand` decorator resolves `cache_service` from `backend.core.globals` at call time (lazy); if globals not initialized, bypasses cache transparently
- `get_async` and `set_async` are aliases for `get` and `set` (backward compatibility)

**Issue:** `get_or_set` has a race window. Between `await self.get(...)` returning `None` and `await self.set(...)`, multiple concurrent callers can all call the factory function simultaneously. With the in-memory backend this causes redundant computation; with Redis it could cause excessive DB reads.

### 11.5 Refresh Token Service (`backend/services/refresh_token.py`)

**Token format:** UUID-based JWT with `type: "refresh"`, `jti: str(uuid4())`, `iss: "stk-verify-api"`, `aud: "stk-verify-client"`. Access tokens have `type: "access"`, same issuer/audience.

**Storage:** Tokens stored by SHA-256 hash (`_hash_token`). Raw token never persisted. Reduces blast radius if `refresh_tokens` collection is leaked.

**Single-session enforcement:** `_store_refresh_token` calls `revoke_all_user_tokens(username, grace_period_seconds=10, raise_on_error=True)` before inserting the new token. A 10-second grace period prevents race conditions from parallel app-init requests minting two tokens simultaneously.

**Grace period logic:** When `grace_period_seconds > 0`, revoked tokens get a `grace_until` field set to `now + 10s`. The `_cleanup_expired_tokens` query only deletes revoked tokens where `grace_until` does not exist or has passed — this allows the verify query to continue finding the old token during the grace window if needed.

**Rotation:** `refresh_access_token` issues a new refresh token, stores it (which revokes all old tokens), then revokes the old token explicitly. Order is: store new → revoke old. Since `store_new` internally calls `revoke_all`, the explicit `revoke_token(old)` after is redundant but harmless.

**Opportunistic migration:** Legacy records that stored raw tokens (field `token`) are migrated to `token_hash` on verify, with the raw `token` field removed via `$unset`.

**`RefreshTokenPersistenceError`:** Custom exception raised if `revoke_all_user_tokens` fails with `raise_on_error=True`. Propagates up through `_store_refresh_token` to callers.

### 11.6 Circuit Breaker (`backend/services/circuit_breaker.py`)

Standard three-state machine: `CLOSED` → `OPEN` → `HALF_OPEN` → `CLOSED`.

**`CircuitBreakerConfig`:** Pydantic model with `failure_threshold=5`, `success_threshold=3`, `timeout_seconds=30.0`, `half_open_max_calls=3`.

**M10 fix:** When already in `OPEN` state, recording a failure does NOT update `_last_failure_time`. This prevents indefinite postponement of `HALF_OPEN` transition under sustained load (starvation fix).

**`CircuitBreakerRegistry`:** Global dict of named circuit breakers. Thread-safe via `asyncio.Lock`. Module-level `circuit_breaker_registry` instance.

**`with_circuit_breaker` decorator:** Handles both sync and async wrapped functions. On circuit open, invokes optional `fallback` or raises `CircuitOpenError`.

**Integration:** Circuit breakers are created on-demand via `get_circuit_breaker(name, config)`. No evidence of pre-wired breakers for specific services at startup — they are created lazily when first called.

### 11.7 Canonical Inventory (`backend/services/canonical_inventory.py`)

Shared domain logic for session and count-line operations. No database writes — pure queries and pure transformations.

**Status constants:** `ACTIVE_SESSION_STATUSES = {"OPEN", "ACTIVE", "PAUSED", "RECONCILE"}`, `FINALIZED_SESSION_STATUSES = {"COMPLETED", "CLOSED", "CANCELLED"}`, `APPROVED_COUNT_LINE_STATUSES = {"approved", "locked"}`, `BLOCKING_APPROVAL_STATUSES = {"NEEDS_REVIEW", "REJECTED"}`.

**Status normalization:** `normalize_session_status` maps legacy aliases: `IN_PROGRESS → ACTIVE`, `RECONCILING → RECONCILE`. Also detects `ACTIVE` sessions with `reconciled_at` set and promotes them to `RECONCILE`.

**`is_count_line_effectively_reviewed`:** A composite predicate — returns `True` if:
- `verified` field is truthy, OR
- status is `approved` or `locked`

Returns `False` (not reviewed) if:
- `approval_status` is `NEEDS_REVIEW` or `REJECTED`, OR
- has `assigned_to` and `recount_requested_at` (pending recount), OR
- has positive variance and is neither approved nor locked

**`is_blocking_finalization`:** Determines if a count line blocks session finalization. Superseded and locked lines never block. Lines with positive variance and no approval block. Approved lines with variance do not block (supervisor already signed off). C3+MM10 fix comment.

**`recompute_session_totals`:** Full cursor scan of all non-superseded count lines for a session. Computes `total_items`, `total_variance`, `verified_items`, `pending_items`, `damage_items`, `last_activity`. Handles multiple `last_activity` types (float timestamps, ISO strings, datetime objects) via M5 fix.

**`build_session_lookup`:** Always generates an `$or` clause covering `id`, `session_id`, and `ObjectId(_id)` — normalizes the three different ID fields used historically across the codebase.

### 11.8 Count Line State Machine (`backend/services/count_state_machine.py`)

Six states: `DRAFT → SUBMITTED → PENDING_APPROVAL → APPROVED/REJECTED → LOCKED`.

**Allowed transitions:**
- `DRAFT → SUBMITTED`: staff, supervisor, admin
- `SUBMITTED → PENDING_APPROVAL`: system (auto-transition)
- `SUBMITTED → DRAFT`: supervisor, admin (reopen)
- `PENDING_APPROVAL → APPROVED`: supervisor, admin
- `PENDING_APPROVAL → REJECTED`: supervisor, admin
- `APPROVED → LOCKED`: admin only
- `APPROVED → DRAFT`: admin only (override)
- `REJECTED → DRAFT`: staff, supervisor, admin (recount)
- `LOCKED`: terminal, no transitions

**Edit permissions:**
- `DRAFT`: all roles
- `SUBMITTED`: supervisor, admin; staff locked out
- `PENDING_APPROVAL`: admin only; staff and supervisor cannot edit
- `APPROVED`: admin only
- `REJECTED`: staff (own only), supervisor, admin
- `LOCKED`: nobody

All transitions write through `CountLineWriteService` and log to `activity_logs` collection with from/to states, user, role, reason, and metadata.

**`can_transition("system", ...)` bypass:** The "system" role is used for auto-transitions. `StateTransition.can_transition` returns `True` for any transition with `"system"` in `required_roles`. No runtime check prevents API callers from claiming `user_role="system"` — this relies entirely on the auth layer not issuing tokens with `role: system`.

### 11.9 Session State Machine (`backend/services/session_state_machine.py`)

Seven states: `OPEN, ACTIVE, PAUSED, RECONCILE, COMPLETED, CLOSED, CANCELLED`.

**Transitions:**
- `OPEN → {ACTIVE, RECONCILE, CANCELLED, CLOSED}`
- `ACTIVE → {PAUSED, RECONCILE, COMPLETED, CLOSED, CANCELLED}`
- `PAUSED → {ACTIVE, COMPLETED, CLOSED, CANCELLED}`
- `RECONCILE → {CLOSED, COMPLETED}`
- `COMPLETED → {CLOSED}`
- `CLOSED → {}` (terminal)
- `CANCELLED → {}` (terminal)

`can_transition` uses case-insensitive normalization via `_normalize` (calls `value.upper()`). Returns `False` for unknown state strings rather than raising.

### 11.10 Governance Guard (`backend/services/governance_guard.py`)

**Write authority system:** A `ContextVar[Optional[str]]` named `governance_write_authority` tracks which service is currently executing writes. Three authorized authorities:
- `CountLineWriteService` → may write `count_lines`
- `SessionLifecycleService` → may write `sessions`, `verification_sessions`, `recount_requests`, `session_snapshots`
- `UnknownItemService` → may write `unknown_items`

**`install_db_write_guards(db)`:** Wraps six collections with `GovernedCollection` proxies at the Motor client level. All write methods (`insert_one`, `insert_many`, `update_one`, `update_many`, `replace_one`, `delete_one`, `delete_many`, `find_one_and_*`, `bulk_write`) are intercepted and call `_require_write_authority()`. Direct writes without an active `write_authority` context raise `GovernanceViolation`.

**Bypass exists:** The `__getattr__` fallthrough in `GovernedCollection` returns uninstrumented methods for anything not explicitly defined — e.g., `aggregate`, `find`, `count_documents`, `watch`. Only write methods are guarded.

**`assert_valid_write(context)`:** Secondary async guard that validates session state before writes. Checks:
- DB is present in context
- session_id resolves to an existing, non-finalized session
- Session must be `ACTIVE` (unless `require_active_session=False`)
- `location_id`, `floor_id`, `rack_id` must all be present (unless `require_full_context=False`)
- Optional `from_state → to_state` transition validated against `SESSION_TRANSITIONS`

**Dual state model:** `LEGACY_TO_CANONICAL_STATUS` maps the 7-value operational state set (`OPEN, ACTIVE, PAUSED, RECONCILE, COMPLETED, CLOSED, CANCELLED`) to a 4-value canonical set (`CREATED, ACTIVE, REVIEW, FINALIZED`). The governance guard uses the canonical set; the session state machine uses the operational set. These are two parallel but related state models in the same codebase.

### 11.11 Logic Guard (`backend/services/logic_guard.py`)

Controls the "phase-0" v1/v2 business logic routing. Implements the "logic pin" pattern: the first mutation to a session pins which logic version (v1 or v2) will be used for all subsequent operations on that session.

**`LogicExecutionContext`:** Pydantic model validated with `@model_validator`. Enforces: if `is_kill_switch_active`, `logic_version` must be `v1`. If `should_persist_pin`, both `pin_logic_version` and `pin_scope_source` must be set.

**`resolve_and_enforce_logic`:** Calls `resolve_phase0_flags` to determine the target version, then checks `is_global_disable_active`. If the session already has a stored pin (`logic_version` + `logic_scope_source` fields), that pin is used. New sessions record the pin on first mutation.

**`LogicGuardConflictError`:** Includes `request_context`, `resolved_flags`, `stored_pin`, `attempted_logic` — rich enough for structured log aggregation.

**`enforce_session_logic`:** The public entrypoint used by API handlers. Catches `LogicGuardConflictError` → HTTP 409, `FlagResolutionError` → HTTP 409, all other exceptions → HTTP 500.

### 11.12 PIN Auth Service (`backend/services/pin_auth_service.py`)

Separate from the main auth route PIN logic. Operates on the `pin_authentication` collection (not the `users` collection directly).

- `set_pin`: Argon2 hash via `passlib.CryptContext`; validates 4–6 digit format; upserts `pin_hash` + `enabled: True` + resets `failed_attempts`
- `verify_pin`: Checks `enabled`, lockout state, then `pwd_context.verify(pin, pin_hash)`; increments `failed_attempts`; locks after 3 failures for 15 minutes
- `max_attempts = 3` (more aggressive than auth_routes which has configurable limits)
- Lockout check: `datetime.now(timezone.utc).replace(tzinfo=None) < pin_record["locked_until"]` — timezone-naive comparison (same tz inconsistency as §6.7)

**Relationship to `auth_routes` PIN logic:** `auth_routes.py` has its own `_find_user_by_pin` and PIN verification logic operating on the `users` collection (via `pin_hash` and `pin_lookup_hash` fields). `PINAuthService` operates on a separate `pin_authentication` collection. These are two parallel PIN systems. It is unclear whether both are active simultaneously or one supersedes the other. The `pin_auth_api.py` likely uses `PINAuthService` while `auth_routes.py` uses the inline logic.

### 11.13 AI Search Service (`backend/services/ai_search.py`)

Singleton via `__new__` pattern. Model: `all-MiniLM-L6-v2` from sentence-transformers. Lazy initialization on first use.

`search_rerank(query, candidates, top_k=20)`:
1. Encodes query to tensor
2. Encodes all candidates in batch (`candidate_texts = name + category + subcategory`)
3. Computes cosine similarity matrix
4. Sorts and returns top `top_k`

No caching of candidate embeddings between calls. For large candidate sets this is a synchronous CPU-bound operation that blocks the event loop. The comment acknowledges this: "for larger sets, we need pre-computed embeddings." The v2 items endpoint fetches 500 candidates unconditionally before passing to this service.

### 11.14 Lock Manager (`backend/services/lock_manager.py`)

Redis-backed distributed locks and user presence tracking.

**Rack locks:** `SET rack:lock:{rack_id} {user_id} EX {ttl} NX` (atomic set-if-not-exists with expiry). Lock release and renewal use Lua scripts to ensure TOCTOU-safe compare-and-delete / compare-and-expire (C4, C5 fix comments).

**Session creation:** Lua script with NX guard: `if exists → return 0; else HSET + EXPIRE → return 1`. Prevents duplicate session locks (H10+MM8 fix).

**User heartbeats:** `SET user:heartbeat:{user_id} {timestamp} EX 90`. `is_user_active` checks key existence. `get_active_users` scans `user:heartbeat:*` pattern.

**`force_release_all_user_locks`:** Admin/cleanup function that scans all rack locks and deletes any owned by the specified user. Uses `SCAN` cursor pagination.

**`get_active_users` / `cleanup_expired_locks`:** Both use `SCAN cursor match pattern count=100` cursor loops. Correct pattern for large Redis keyspaces.

### 11.15 WhatsApp Service (`backend/services/whatsapp_service.py`)

Three provider modes: `disabled` (default — raises `WhatsAppDeliveryError`), `mock` (logs to WARNING with full message text), `twilio` (HTTP POST to Twilio REST API).

`is_delivery_configured()` returns `True` only for `twilio` with all three credentials present, or `mock`. The `disabled` provider returns `False`. This separates delivery capability detection from the send path.

**Fail-closed default:** `WHATSAPP_PROVIDER=disabled` means password reset OTP delivery fails by default until explicitly configured. Prior to this refactoring, mock mode silently returned `True` — the fix is documented in the module docstring.

**Twilio path:** `httpx.AsyncClient` with configurable timeout. 4xx/5xx responses from Twilio raise `WhatsAppDeliveryError`. Phone numbers are normalized to `whatsapp:+{number}` format.

### 11.16 Runtime Module (`backend/services/runtime.py`)

Two module-level globals and their getter/setter pairs:
- `_CACHE_SERVICE: Optional[CacheService]`
- `_REFRESH_TOKEN_SERVICE: Optional[RefreshTokenService]`

Getters raise `RuntimeError` if called before initialization (not None-safe). Both are set during `lifespan` startup phase via `set_cache_service` and `set_refresh_token_service`.

---

## 12. Extended Frontend Analysis (Second Pass)

### 12.1 Auth Service (`src/services/auth.ts`)

Uses `apiClient` (axios instance from `httpClient`) and `useAuthStore` (Zustand).

- `getAccessToken()` / `getRefreshToken()`: reads from `secureStorage`
- `refreshToken()`: POST to `/api/auth/refresh` with `{refresh_token}` body; on success, stores new tokens in `secureStorage` and updates `apiClient.defaults.headers.common["Authorization"]`
- `getCurrentUser()`: reads synchronously from `useAuthStore.getState().user`
- `logout()`: calls `useAuthStore.getState().logout()` then clears `secureStorage`

Two separate storage layers: `secureStorage` (encrypted device storage) for token persistence, and Zustand store for in-memory auth state. The `httpClient` axios defaults are updated on refresh but not on initial load — tokens must be re-injected into axios defaults each session or axios uses them from the `Authorization` header added by interceptors.

### 12.2 Enhanced API Client (`src/services/api/enhancedApiClient.ts`)

`EnhancedApiClient` class wrapping the base `httpClient` (axios):
- All methods (`get`, `post`, `put`, `patch`, `delete`) use `retryWithBackoff` with configurable `retries` (default 3)
- Normalizes legacy response shapes `{data: T}` and `{success: true, data: T}` into `ApiResponse<T>`
- Error responses normalized to `{success: false, error: {code, message, details}}`
- Exported singleton at `/api/v2` base URL

Retry logic lives in `retryWithBackoff` utility (not read, but referenced). The retry applies to all HTTP methods including POST/PUT/PATCH — non-idempotent mutations are retried. This could cause duplicate count line submissions if the server accepted but the response was lost.

### 12.3 Auth Domain Types (`src/domains/auth/types.ts`)

`UserSettings` interface: 40+ fields covering theme, notifications, sync, offline mode, cache, scanner, display, export, backup, auth, and operational mode settings. `operational_mode: "live_audit" | "routine" | "training"` — three distinct operational contexts that presumably affect how the scan workflow behaves.

`AuthState`: `user`, `isAuthenticated`, `isLoading`, `error`.

Types derived from Zod schemas (`UserSchema`, `LoginResponseSchema`) — schema-first type derivation via `z.infer<>`.

### 12.4 Offline Count Line Service (`src/services/offline/offlineCountLine.ts`)

Single source of truth for creating offline count lines.

`createOfflineCountLine(countData, deviceContext)`:
1. Reads user from `useAuthStore.getState().user`
2. Falls back to item cache (`getItemFromCache(item_code)`) for item name if not in payload
3. Generates `idempotency_key` via `generateOfflineId()` (UUID-based)
4. Creates `OfflineAuditMetadata` with `created_offline: true`, `sync_status: "pending"`, device ID, app version, source screen
5. Calls `cacheCountLine(finalCountLine)` and `addToOfflineQueue("count_line", finalCountLine)`

**H14 fix:** Previously, persistence failures were swallowed and the function returned "success" even when data was not saved. Now raises `Error` with descriptive message if `cacheCountLine` or `addToOfflineQueue` throw. Callers must handle the rejection.

**`finalCountLine` merge:** `{...countData, ...offlineCountLine}` — `offlineCountLine` fields take precedence over `countData` fields for any overlapping keys. Ensures the audit metadata and UUID-based ID are not overridden by caller-provided data.

### 12.5 Token Store (`src/services/storage/tokenStore.ts`)

In-memory cache (`cachedAccessToken`, `cachedRefreshToken`) backed by `secureStorage`.

- `getAccessToken()` / `getRefreshToken()` — synchronous, from module-level vars
- `setTokens()` — sets both in-memory and calls async `secureStorage.setItem`
- `clearTokens()` — nulls in-memory and calls async `secureStorage.removeItem`
- `initialize()` — reads both from `secureStorage` into module-level vars

Synchronous access enables axios interceptors and other synchronous code to read tokens without async overhead. The trade-off is that the module-level vars are shared state — if two concurrent calls race on `initialize`, both will read the same values (benign) but if `clearTokens` races with `getAccessToken`, the in-memory value may be stale. Acceptable for single-threaded JS event loop.

### 12.6 Control Plane Flags (`src/core/config/controlPlaneFlags.ts`)

Five flags controlling event-driven architecture enablement:
- `enableEventDrivenCountLines` (default `true`)
- `enableEventDrivenCountLineReviews` (default `true`)
- `enableEventDrivenSessions` (default `true`)
- `enableProjectionReads` (default `true`)
- `strictProjectionReads` (default `false`)

All read from `process.env.EXPO_PUBLIC_CP_*` at module load time. `strictProjectionReads=false` means projection failures fall back to legacy reads rather than propagating errors.

`CONTROL_PLANE_PROJECTION_VERSION = "v4-control-plane"` — a versioning tag for the projection schema embedded in stored snapshots.

### 12.7 Services Directory Structure

The `frontend/src/services/` directory contains approximately 90 TypeScript files organized into:
- `api/` — 20 API modules (auth, enhanced, enrichment, reporting, item verification, user workflow, admin operations, etc.)
- `offline/` — offline count line, sync service (now a shim to `syncService.ts`)
- `storage/` — secure storage, token store, async storage service, MMKV storage
- `sync/` — conflict resolution (with tests)
- `audit/` — audit logger
- `control-plane/` — control plane event bus, count line review control plane
- `observability/` — operational telemetry, control plane metrics, analytics registry
- `monitoring/` — database status, performance service
- `device/` — Expo camera (native vs web variants)
- `utils/` — error recovery, haptics, notifications, validation, auto-recovery, auto-error-finder

Notable: `services/offline/syncService.ts` is a compatibility shim that re-exports from `services/syncService.ts` (canonical sync scheduling moved out of `offline/`). The shim carries a comment to remove it after one release cycle.

---

## 13. Additional Issues (Second Pass)

### 13.1 Dual PIN System With Unclear Relationship

The codebase contains two independent PIN authentication implementations:
- `backend/auth/auth_routes.py` — `_find_user_by_pin` with 3-strategy lookup against the `users` collection
- `backend/services/pin_auth_service.py` — `PINAuthService` operating against the separate `pin_authentication` collection

Both implement PIN verification with Argon2 hashing but different lockout parameters (auth_routes uses configurable `PIN_MAX_ATTEMPTS`; `PINAuthService` hardcodes `max_attempts=3`). It is unclear whether both systems coexist (different endpoints), one supersedes the other, or they were supposed to be merged. If a PIN is changed via `pin_auth_api.py` (which likely uses `PINAuthService`), the change may not reflect in the `users` collection PIN fields used by `auth_routes.py`.

### 13.2 Retry on Non-Idempotent Mutations

`EnhancedApiClient.post()` and `.patch()` apply `retryWithBackoff` with `retries=3` by default. Count line creation is a POST. If the server processes the request and returns a response that is lost in transit (network timeout), the client retries — potentially creating a duplicate count line. The `idempotency_key` field in `CreateCountLinePayload` exists precisely for this scenario, but its use depends on the server deduplicating on that key, which requires the server to have idempotency logic wired for the create count line endpoint.

### 13.3 `get_or_set` Cache Race Condition

`CacheService.get_or_set` has no mutex between the cache miss check and the factory call. In high-concurrency scenarios (especially with the in-memory backend), multiple concurrent calls with the same key will all miss and all invoke the factory function simultaneously. With a Redis backend, the `SET` operations are serialized by Redis, but all N callers still perform the expensive factory call. This is the classic "cache stampede" / thundering herd problem.

### 13.4 `init_default_users` Defined Twice

`app_factory.py` (lines 300–355) defines `init_default_users` that is never called. `backend/db/initialization.py` defines the canonical version called by `lifespan.py`. The dead definition in `app_factory.py` will cause confusion during maintenance if someone updates one but not the other.

### 13.5 `lock_service` Failure is Silently Ignored

In `lifespan.py`, `LockService` initialization failure sets `lock_service = None` with a log error comment "fallback? Or just fail." The `init_count_lines_api` is then called with `lock_service=None`. If count line locking is critical for preventing concurrent double-counts, a `None` lock service means locking is simply skipped. There is no observable indicator to operators that count line locking is inactive.

### 13.6 `auto_sync_manager` Instantiated Twice

In `lifespan.py`, `AutoSyncManager` is instantiated during module-level initialization (lines 312–321) via the conditional `if getattr(settings, "AUTO_SYNC_ENABLED", True)` block, and then re-instantiated inside the `lifespan` function (lines 553–590). The second instantiation overwrites the first. The module-level instance is registered via `set_auto_sync_manager(auto_sync_manager)` (line 321) but is then replaced by the lifespan-level instance. This means the first instance's configuration (including callbacks) is discarded.

### 13.7 `CircuitBreaker.is_available` and `acquire` Have a TOCTOU Gap

`is_available` is a property that does not acquire the lock. Between checking `is_available` and calling `acquire`, the circuit state can change. Any code that calls `if breaker.is_available: ... await breaker.acquire()` is subject to a race. However, since `acquire` always takes the lock and re-checks, the operation is ultimately correct — `acquire` may return `False` even when `is_available` returned `True`. This only matters if callers make decisions based on `is_available` without subsequently calling `acquire`.

### 13.8 Governance Guard `__getattr__` Bypass

`GovernedCollection.__getattr__` delegates all unrecognized attributes to the underlying Motor collection. This means `db.count_lines.find_one_and_update` is guarded, but `db.count_lines["find_one_and_update"]` (dict-style access) is not, and neither are any aggregation methods. The governance guard explicitly wraps only the write methods listed in `_GUARD_WRITE_METHODS`. Any new Motor write method added in a future driver version would bypass the guard until manually added to the list.

---

## 14. Extended Architectural Patterns (Second Pass)

### 14.1 Logic Pinning Pattern

The `logic_guard.py` + `flag_resolver.py` combination implements a novel "logic pinning" pattern for zero-downtime migration. When the first mutation hits a session, the current feature flag state (v1 or v2 logic version, at the applicable granularity scope: global, warehouse, user, or session) is written into the session document (`logic_version`, `logic_scope_source`). All subsequent mutations to that session use the pinned version, regardless of how feature flags change during the session's lifetime. This ensures a session is not processed with mixed logic versions.

A global kill switch (`is_global_disable_active`) overrides the pin and forces `v1` when active.

### 14.2 Canonical Write Authority

The governance guard system enforces a write-authority model: only three named services can write to six governance-protected collections. The authority is tracked via `ContextVar` (async-safe, request-scoped). Services declare authority via the `write_authority(service_name)` context manager. This is a zero-framework, in-process implementation of the architectural boundary that DDD practitioners would enforce through a bounded context or aggregate root pattern.

### 14.3 Operational vs Canonical Session Status

Two parallel session state models coexist:
- **Operational** (7 states): `OPEN, ACTIVE, PAUSED, RECONCILE, COMPLETED, CLOSED, CANCELLED` — used by `session_state_machine.py`, the API layer, and client-side event sourcing
- **Canonical** (4 states): `CREATED, ACTIVE, REVIEW, FINALIZED` — used by `governance_guard.py` and `assert_valid_write`

The mapping is defined in `LEGACY_TO_CANONICAL_STATUS` in `governance_guard.py`. Both models must be maintained consistently. Any new operational state added to the session state machine must also be mapped in `LEGACY_TO_CANONICAL_STATUS`, or `normalize_session_status` will return it verbatim (falling back to the raw value), which will not match any canonical state and `assert_valid_write` will block all mutations for sessions in that state.

### 14.4 Graceful Degradation Hierarchy

The application implements a multi-tier degradation strategy:
1. **MongoDB unavailable in development** → app starts with limited functionality (warning only)
2. **SQL Server unavailable** → ERP sync disabled; count operations against MongoDB only
3. **Redis unavailable** → falls back to in-memory cache, in-process rate limiting, no distributed locking
4. **Sentence-transformers unavailable** → semantic search disabled; fuzzy search continues
5. **Enterprise modules unavailable** → `ImportError` caught, enterprise features disabled, core continues
6. **Optional routers unavailable** → `ImportError` caught per-router, that route group is simply not registered

Only MongoDB is treated as a hard dependency in production (raises `SystemExit` if unavailable).

### 14.5 Activity Log Dual Write

Activity logging occurs through `ActivityLogService` (standalone collection `activity_logs`) and optionally `AuditService` (collection `audit_logs`). Both write at auth events. `ActivityLogService` is used broadly across count line operations, session management, and admin operations. `AuditService` accepts `AuditEventType` enum values and `AuditLogStatus`. The two collections serve different consumers: `activity_logs` for operational queries (what did a user do today), `audit_logs` for compliance (structured event-type records with success/failure status).

### 14.6 Offline-First Architecture (Frontend)

The offline path is a full parallel implementation:
- `createOfflineCountLine` creates a complete count line record with UUID ID and audit metadata
- Stored in two places: local cache (`cacheCountLine`) and offline queue (`addToOfflineQueue`)
- `idempotency_key` links the offline record to eventual server sync
- The sync service (canonical at `services/syncService.ts`) processes the queue when connectivity is restored
- `conflictResolution.ts` handles sync conflicts

The online path (`useItemSubmission`) has a fallback to `createOfflineCountLine` in the catch branch. Both paths use the same `CreateCountLinePayload` shape, ensuring sync compatibility.

### 14.7 OpenTelemetry Integration

`backend/utils/tracing.py` provides `init_tracing()` (configured at lifespan import, before app creation) and `instrument_fastapi_app(app)` (called in `app_factory.py` after the `FastAPI` instance is created). Both are wrapped in `try/except` to prevent tracing failures from blocking startup. The exporter and tracer provider details are in `tracing.py` (not read), but the integration points are confirmed.

---

## 15. Revised Security Posture (Extended)

| Control | Status | Notes |
|---|---|---|
| Refresh token SHA-256 hash storage | Active | Raw token never persisted |
| Refresh token rotation | Active | New token issued, old revoked on every refresh |
| Grace period for token revocation | Active | 10-second grace prevents login race conditions |
| Refresh token JWT type claim | Active | `type: "refresh"` verified on use |
| JWT `jti` (unique token ID) | Active | UUID4 per refresh token, prevents hash collisions |
| Circuit breaker (external calls) | Active | Per-named-service, registry-managed |
| Distributed rack locking (Redis) | Active | Lua-script-based atomic acquire/release/renew |
| Governance write guards | Active | `ContextVar`-based write authority enforcement |
| Session logic pinning | Active | Prevents mixed v1/v2 logic mid-session |
| WhatsApp OTP delivery | Configurable | Defaults to `disabled` (fail-closed) |
| Dual PIN system ambiguity | Risk | Two PIN collections, unclear which is authoritative for which flow |
| Cache stampede | Risk | `get_or_set` has no thundering herd protection |
| Retry on POST mutations | Risk | `EnhancedApiClient` retries non-idempotent operations |
| Lock service silently `None` | Risk | No operator-visible indicator when locking is disabled |

---

## 16. API Layer Analysis (Third Pass)

### 16.1 count_lines_routes.py — The Critical Write Path (2,834 lines)

`count_lines_routes.py` is the largest single file in the backend and the most consequential. `count_lines_api.py` is a one-line re-export (`from backend.api.count_lines_routes import *`). The file carries a comment targeting future splitting into `_helpers.py`, `_schemas.py`, `_routes_write.py`, `_routes_read.py`.

**Module-level service singletons** (`_activity_log_service`, `_lock_service`, `_snapshot_service`, `_variant_service`) are initialised via `init_count_lines_api()` called from the lifespan. If that call does not happen (test harness, partial startup), all four are `None`. The code guards against `_lock_service is None` explicitly for every lock acquisition, but if `_activity_log_service` is `None` all activity logging is silently skipped, leaving no audit trail for any count-line operation.

**Create count line flow** (`POST /count-lines`): 13-step pipeline — session validity → logic guard → idempotency key lookup → ERP item fetch → baseline resolution (snapshot or ERP direct) → governance evaluation → risk flag detection → misplaced-stock detection → lock acquisition → duplicate check → document build → MongoDB transaction (insert + supersede old version if recount + draft update) → lock release. All of this runs serially in one HTTP request. The `mongo_transaction` context manager wraps the DB-writes; the lock is held across the entire transaction but released in `finally`, so failures on the transaction side still release the lock.

**Idempotency key handling**: if a `idempotency_key` from the request matches an existing count line in the session, the existing record is returned directly (`return existing_idempotent`). The returned object has had `_id` popped but is otherwise the raw MongoDB document — any extra fields added since the first call are returned, which is correct. If the key is absent, a UUID is assigned to `idempotency_key` from `count_line_id` so every line always carries one.

**Risk flag detection** (`detect_risk_flags`): 7 rules — LARGE_VARIANCE, MRP_MISMATCH, MRP_REDUCED_SIGNIFICANTLY, HIGH_VALUE_VARIANCE, SERIAL_MISSING_HIGH_VALUE, MISSING_CORRECTION_REASON, MRP_CHANGE_WITHOUT_REASON — plus PHOTO_PROOF_REQUIRED. The M1 fix explicitly handles zero-stock items to avoid a false 100% variance. The STRICT_MODE_VARIANCE flag is appended downstream in `_build_count_line_risk_context` for strict sessions.

**`_ensure_session_accepts_counts`**: only checks `status in ["OPEN", "ACTIVE"]` and `reconciled_at`. This is a string equality check against un-normalised status strings — if the session status arrives as `"open"` (lowercase) the check fails and the user gets a 400. The canonical normalisation in `canonical_inventory.py` is not called here.

**Verified count line filter** (`get_count_lines` with `verified=True/False`): when the `verified` filter is set, the function streams the full count_lines cursor for the session and filters in Python using `is_count_line_effectively_reviewed`. This is an in-memory full scan — for large sessions (thousands of lines) this is O(N) with no MongoDB-side filtering.

**Approval/rejection lock pattern**: `lock_count_line_approval` (Redis) is acquired before loading the count line document; the lock is released in `finally`. There is a gap between lock acquisition and the `find_one` — another worker could have already approved/rejected in that gap and the second approver will overwrite without detection (no optimistic concurrency check on `approval_status`).

**`_broadcast_dashboard_refresh`**: fire-and-forget WebSocket broadcast after every write (create/verify/unverify/approve/reject). Failures are caught and logged as warnings. The broadcast reaches only the current process's WebSocket manager — cross-worker clients do not receive updates.

**Draft handling**: `count_line_drafts` collection is updated inside the `_persist_count_line_document` transaction. The `draft_update_result` has a `try/except TypeError` fallback for cases where the Motor driver does not support the `session=` kwarg — this is a compatibility shim for test/mock environments.

**Serial number uniqueness check** (`GET /count-lines/check-serial/{session_id}/{serial_number}`): queries three collections in order — `serial_registry`, `item_serials` (legacy), `count_lines` (embedded arrays). This is three sequential DB reads per request. The check is best-effort; it is not atomic with count line creation, so two concurrent submissions of the same serial number to different count lines in the same session can both succeed.

### 16.2 admin_control_api.py

Provides service management endpoints (`/api/admin/control/*`). Uses `psutil` to inspect running processes by scanning configured port ranges and matching command line strings (`BACKEND_PROCESS_NEEDLE = "server.py"`). Process scanning is inherently racy — a process might terminate between `is_port_in_use` and `get_process_using_port`.

**Service start endpoints are placeholders**: `POST /services/backend/start` and `POST /services/frontend/start` do not actually spawn processes. They check if a process is already running and return a note instructing the operator to use shell scripts. These are operational endpoints with no actual implementation.

**Health score algorithm**: 60% weight from critical services (backend + MongoDB), 40% from optional (frontend + SQL Server). Issues subtract 10 points each, capped at 30. Score ≥ 80 = healthy, ≥ 50 = degraded, < 50 = critical. SQL Server disconnected contributes only to the 40% optional tier, so it never triggers "critical" status alone.

**MongoDB status check** uses `auth_deps._initialized` as a guard before sending a ping — this is accessing a private attribute on the dependency object, coupling the admin API to the internal state of the auth dependency.

**`GET /devices`**: queries `db.sessions` (not `db.auth_sessions` or `db.users`) for device info. It deduplicates on `ip_address + platform`, which means two different users on the same device/IP appear as one entry.

**Log reading**: reads the application log file synchronously (`open(log_path)`). This blocks the event loop for the duration of the file read. For large log files this will block all other requests on that worker.

### 16.3 permissions_api.py

Clean implementation. All write endpoints (`/add`, `/remove`, `/disable`, `/enable`) are gated behind `require_permission(Permission.USER_MANAGE)` through the `Depends(require_admin)` router-level dependency plus the explicit `require_permission` on individual handlers. Activity log is written on every mutation using a lazy import of `ActivityLogService` inside the handler body (not as a dependency-injected service).

`/permissions/available` returns all permissions grouped by prefix. The `"admin"` category groups permissions starting with `user.`, `settings.`, or `db_mapping.` — permissions not matching any prefix would be uncategorised and invisible in this view.

The `/roles` endpoint returns role permissions but only covers `staff`, `supervisor`, `admin`. Any role that exists in the system but is not in `ROLE_PERMISSIONS` would return an empty list without error.

### 16.4 sync_conflicts_api.py

Four conflict resolution values: `accept_server`, `accept_local`, `merge`, `ignore`. Auto-resolve strategies: `server_wins`, `local_wins`, `newest_wins`.

**Batch resolve** iterates serially — one `await sync_service.resolve_conflict(...)` per conflict ID in a loop. For large conflict batches (100+ items) this serialises all resolutions. Partial failures are collected and returned in `errors`, so the endpoint succeeds even if some conflicts failed.

**`auto_resolve_conflicts`**: the `strategy` parameter is a query param with no body validation — it must match one of three strings, otherwise a 400 is returned. The implementation delegates to `sync_service.auto_resolve_simple_conflicts(strategy=strategy)`.

### 16.5 pin_auth_api.py

**`POST /auth/pin/change`**: requires current password (`hashed_password` from the JWT-resolved `current_user` dict) before allowing PIN change. Verifies password using `verify_password`, then calls `PINAuthService.set_pin(str(current_user["_id"]), new_pin)` — this uses the MongoDB `_id` as the user identifier, which is the `pin_authentication` collection keyed on `user_id = str(user._id)`.

**`POST /auth/login/pin`**: uses the same rate limiter (`check_rate_limit(ip_address)`) as password login. Calls `find_user_by_username` (from `backend.api.auth`, which queries the `users` collection). Then calls `PINAuthService.verify_pin(str(user["_id"]), request.pin)` (queries `pin_authentication`). On success, calls `generate_auth_tokens` — the same token generation path as password login, producing a full access + refresh token pair. Rate limit is reset on success.

**PIN format enforcement**: `new_pin: str = Field(..., min_length=4, max_length=4, pattern=r"^\d{4}$")` — exactly 4 decimal digits. Comment notes this is an M13 fix to match login validation.

**PIN system clarification**: pin_auth_api.py definitively shows the two systems are complementary, not competing. Password login stores hashes in `users.hashed_password`. PIN login stores hashes in `pin_authentication` keyed on `user._id`. PIN change requires the current password to be verified first. So the `users` collection remains the authoritative identity store; `pin_authentication` is a secondary credential attached to the same user by `_id`.

### 16.6 realtime_dashboard_api.py

**Dual delivery** — both SSE (`GET /dashboard/stream`) and WebSocket (`WS /dashboard/ws/{token}`). The SSE stream does not perform authentication — `require_role(...)` is on the dependency but the token is passed as a query param (`?token=`), meaning the JWT is in the URL and will appear in server access logs. The WebSocket endpoint in this file uses the raw token as the user_id (the `token` path parameter), not decoded to a username — the `ConnectionManager` in this file is a separate instance from the main `websocket_manager.manager`.

**Two separate WebSocket managers**: `realtime_dashboard_api.py` defines its own `ConnectionManager` singleton at module level (`manager = ConnectionManager()`). The main `websocket_api.py` uses `backend.core.websocket_manager.manager`. These are entirely independent — the dashboard WS manager and the scan-event WS manager operate on separate connection dictionaries. A supervisor connected to the dashboard WS endpoint cannot receive scan events from the main manager, and vice versa.

**SSE event loop**: `asyncio.sleep(refresh_interval)` inside the generator, default 10 seconds. `asyncio.CancelledError` is caught and breaks the loop. Other exceptions are caught and an error event is yielded before sleeping 5 seconds and retrying — this means a persistent error (e.g. DB down) causes repeated 5-second retry cycles producing error SSE events rather than closing the connection.

**Dashboard data export** (`POST /export/csv`, `/export/xlsx`): `page_size=10000` hardcoded for exports. No RBAC beyond `require_role("supervisor", "admin")` — any supervisor can export all count line data.

**`@trace_dashboard_query` decorator**: wraps the three main read endpoints for OpenTelemetry tracing. Used in conjunction with `trace_span` context manager in the fallback branch.

### 16.7 websocket_api.py (Main WS Endpoint)

`GET /ws/updates` — multi-strategy JWT extraction: Authorization header → Sec-WebSocket-Protocol (browser-compatible) → HttpOnly cookie → legacy query param (discouraged). The subprotocol echo-back path (`accept_subprotocol`) handles the `jwt,<token>` WebSocket subprotocol negotiation correctly.

**Role check** allows `supervisor`, `staff`, `user`, `admin`. The comment acknowledges that `"user"` may be the role value for staff depending on registration path — this is a known ambiguity in the role naming: `staff` vs `user` for the same conceptual role. Both are accepted.

**Client messages are consumed but ignored**: `await websocket.receive_text()` is in an infinite loop but the received data is discarded. The comment says "For now, we just echo or ignore." This means the main WS endpoint is unidirectional — server pushes only, clients cannot send meaningful messages.

### 16.8 reconciliation_api.py

Single endpoint: `GET /api/v2/reconciliation/session/{session_id}/summary`. Produces three variance metrics per item:
- `count_variance` = physical count − baseline ERP qty at time of scan
- `erp_drift` = current SQL Server qty − baseline ERP qty (how much ERP changed since baseline was frozen)
- `final_gap` = physical count − current SQL Server qty

This three-way split allows diagnosing whether discrepancies are due to counting errors or ERP movements between baseline and reconciliation time.

**Pipeline**: MongoDB aggregation with `$lookup` against `erp_items`. The filter excludes `SUPERSEDED`/`superseded` status lines, but also checks `superseded_by_version_id` as an `$or` clause — the two exclusion mechanisms are slightly redundant. The `$group` step uses `$max` for `baseline_qty` rather than `$first` — if multiple count lines for the same item code have different `erp_qty` values, the maximum is used, which may not be the correct baseline. `baseline_conflict: true` is set when multiple distinct baseline values exist, alerting the caller.

**Row-level access control**: staff users can only view sessions they own (`session.staff_user` or `session.user_id` must equal their username). Admin/supervisor see all.

### 16.9 mapping_api.py

Admin-only (`Depends(require_admin)` at router level). Provides SQL Server schema discovery and ERP column mapping for the sync layer.

**SSRF mitigation** (`_enforce_configured_sql_target`): in production/staging environments, the host/database/port provided in the API request must match the values configured in settings. In development, any target is allowed. This prevents the mapping API from being used as a proxy to arbitrary SQL hosts.

**SQL injection defence** (`_safe_identifier`): validates identifiers with `re.fullmatch(r"[A-Za-z0-9_ ]+", name)` and explicitly rejects `[` and `]` characters. Dynamic queries are constructed using square-bracket quoting: `[{schema}].[{table_name}]`. This is correct for SQL Server identifier quoting — validated identifiers containing only alphanumerics, underscores, and spaces cannot produce injection through bracket quoting.

**Password encryption**: ERP connection passwords are encrypted with Fernet using a key derived from `JWT_SECRET` (SHA-256 of the secret, base64url-encoded to 32 bytes). This ties credential security to the JWT secret rotation — if `JWT_SECRET` is rotated, all stored ERP passwords become unrecoverable. The plaintext password is explicitly unset from the document on save (`$unset: {"connection.password": ""}`).

**`pyodbc` graceful fallback**: at module level, `pyodbc` is replaced with `unittest.mock.MagicMock()` if not installed, with `pyodbc.Error` and `pyodbc.Connection` stubs. The `get_connection` function raises HTTP 503 in that case. This allows the module to import on systems without ODBC drivers while clearly failing at runtime.

### 16.10 notes_api.py

Simple per-user notes. Notes are scoped to `created_by` (username). Search uses `$regex` with `$options: "i"` on both `title` and `content`. The search query `safe_q` is run through `sanitize_for_logging` before being inserted into the regex pattern — `sanitize_for_logging` is a logging sanitiser, not a regex-escaping function. If a user submits a regex special character (e.g. `(`, `[`, `.`), it will be interpreted as regex syntax, not literal text. This is a ReDoS-risk surface and a semantically incorrect search (user expects literal search, gets regex).

Admin users bypass the `created_by` filter in DELETE (`if current_user.get("role") != "admin"`), allowing admins to delete any note. List and create operations are always scoped to the requester; there is no admin override for listing another user's notes.

### 16.11 notifications_api.py

Standard CRUD over `NotificationService`. Push token registration (`POST /devices`, `POST /devices/unregister`) persists device tokens for Expo push delivery. The `BatchNotificationRequest` model has `unread_count: int` as a required field — this appears to be a mistake; unread count is a response metric, not a request parameter. The field is not used in the endpoint handler.

No pagination on `GET /notifications` — limited to `limit` (max 100). For a user with a large notification history this is fine; for future-proofing it is a concern.

### 16.12 reporting_api.py (Query Builder)

`POST /api/reports/query/preview` accepts arbitrary `collection` and `filters` from any authenticated user. The `QueryBuilder.build_pipeline` method constructs a MongoDB aggregation pipeline from the spec. There is no allowlist of queryable collections — a user can specify `collection: "users"` or `collection: "refresh_tokens"` and receive paginated data from those collections. This is a significant access control gap.

### 16.13 security_api.py (Admin Security Dashboard)

Queries `login_attempts` collection for failed logins with filters (username, IP, time window). Aggregates top attacking IPs and usernames. Uses `datetime.now(timezone.utc).replace(tzinfo=None)` for time comparisons — naive datetime stored in MongoDB matches naive datetime in query, consistent with the rest of the codebase.

### 16.14 admin_control_api.py — Additional Observations

**`GET /reports/generate`**: the `report_id` and `format` params are query string params (not path params) on a `POST` endpoint. If `format="excel"` and `data` is falsy, a `pd.DataFrame([{"message": "No data"}])` is constructed inline — this imports `pandas` inside the request handler. If pandas is not installed, this raises `ImportError` mid-request instead of at startup.

**`POST /watchdog/run`**: instantiates `WatchdogService(db)` and calls `run_all_checks()` synchronously inside an HTTP request. No timeout is applied. If watchdog checks are slow (e.g., querying large collections), this endpoint will hold a worker for the full duration.

---

## 17. Additional Issues (Third Pass)

**Issue 17.1 — Reporting API unrestricted collection access**: `POST /api/reports/query/preview` accepts any `collection` name from any authenticated user and runs aggregation on it. No allowlist. The `users` collection (with hashed passwords, role data, permissions) and `refresh_tokens` (hashed but still metadata-rich) are queryable by staff users.

**Issue 17.2 — Notes search uses regex without escaping**: `notes_api.py` passes user input directly into `$regex` patterns. The call to `sanitize_for_logging` does not escape regex special characters. Users can construct malformed regex patterns causing query errors or ReDoS under adversarial input.

**Issue 17.3 — Session status case sensitivity in `_ensure_session_accepts_counts`**: `count_lines_routes.py` checks `session.get("status") not in ["OPEN", "ACTIVE"]` without normalisation. If the stored status is `"open"` or `"Active"`, the check rejects the count submission with a 400 even though the session is logically open.

**Issue 17.4 — Large session count line filter is an in-memory full scan**: when `verified` filter is specified in `GET /count-lines/session/{session_id}`, the code fetches all count lines for the session into the asyncio loop and filters in Python. Sessions with thousands of count lines will exhaust memory and block the event loop.

**Issue 17.5 — Approval race condition (no optimistic concurrency)**: two supervisors who call `PUT /count-lines/{id}/approve` within the Redis lock TTL gap (between lock expiry check and lock acquisition) can both approve the same count line sequentially. The second approval overwrites the first without conflict detection. The `matched_count == 0` check only catches missing documents, not double-approve.

**Issue 17.6 — Two independent WebSocket managers**: `realtime_dashboard_api.py` instantiates its own `ConnectionManager` separate from `backend.core.websocket_manager.manager`. Scan events broadcast to the main manager are invisible to clients connected to the dashboard manager. The `count_lines_routes.py` broadcasts specifically to `manager` (core), not to the dashboard manager — supervisors watching the live dashboard WebSocket do not see real-time scan events.

**Issue 17.7 — SSE endpoint leaks JWT in URL**: `GET /dashboard/stream` accepts auth via `require_role` dependency, but in practice the token must reach the server — without a documented mechanism in the dependency, the pattern likely relies on a cookie or a token being added manually. The dashboard WebSocket at `/dashboard/ws/{token}` embeds the JWT as a path parameter, which will appear in Nginx/Uvicorn access logs.

**Issue 17.8 — `start_backend`/`start_frontend` admin endpoints are no-ops**: both `POST /services/backend/start` and `POST /services/frontend/start` return success without spawning any process. Operators calling these via the admin UI will receive a "success" response while the service remains down.

**Issue 17.9 — Lazy pandas import in report handler**: `generate_report` with `format="excel"` imports `pandas` inside the request handler. If `pandas` or `xlsxwriter` is not installed, this raises an `ImportError` as an unhandled exception that FastAPI converts to a 500, with the stack trace in the response body unless `DEBUG=False` is set.

**Issue 17.10 — Log file read is synchronous blocking I/O**: `GET /admin/control/logs/{service}` reads the log file with synchronous `open()` inside an async request handler, blocking the event loop for the full file read duration.

---

## 18. Final Architectural Summary

The codebase implements a production-grade retail inventory audit platform with the following characteristics:

**Strengths observed across all passes:**
The governance guard system (ContextVar-based write authority + GovernedCollection proxy) is a sophisticated and unusual pattern that effectively prevents unsanctioned writes without introducing distributed coordination overhead. The count line state machine is well-defined and the `is_blocking_finalization` predicate correctly handles the C3+MM10 edge case where approved lines should not block session closure. The refresh token system (SHA-256 hash storage, jti UUID, grace period, opportunistic migration) is correctly implemented. The circuit breaker M10 fix (not updating `_last_failure_time` under sustained load) shows careful reasoning about timer starvation. The offline-first count line creation (H14 fix raising on persistence failure) demonstrates learning from production failures. Logic pinning for zero-downtime migration is a practical solution to the V1/V2 coexistence problem.

**Systemic risks:**
1. No backend Python test files. The only automated tests are Playwright E2E specs (9 files) and Jest unit tests for the frontend. The backend governance logic, state machines, and session finalization predicates have zero automated test coverage.
2. Process-level WebSocket manager and rate limiter become incorrect under multi-worker Uvicorn deployment. The codebase shows no indication this has been addressed (no Redis pub/sub for WebSocket fan-out).
3. The reporting API (`/api/reports/query/preview`) exposes the entire MongoDB database to any authenticated user — this is a critical access control gap that should be resolved immediately.
4. Synchronous I/O (log reads, psutil calls) in async handlers blocks the event loop on the admin control panel.
5. The dual WebSocket manager architecture means real-time scan events are invisible to the dashboard WebSocket endpoint — the "live dashboard" is not actually live for scan events.
