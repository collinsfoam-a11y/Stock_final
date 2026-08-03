# Post-Deploy Monitoring & Next-Sprint Hardening Plan

**Context:** Security-hardened release deployed to a single-region MongoDB replica set with a CDN in front of static assets. Backend: 1163 tests green, 9 audit findings closed (stack trace stripping, SQL injection fix, `StrictBaseModel` migration, OCC fixes). Frontend: 10 deploy-critical patches verified (authStore hardening, offlineStorage DTO boundaries, console→createLogger migration, error sanitization, Zod count-line validation).

**Repo observability surface (verified):**

- Prometheus scraping `backend:8001/api/metrics` every 15s (`monitoring/prometheus.yml`)
- Grafana dashboard "Stock Verify Backend" with HTTP req/s, HTTP errors/s, avg request duration, uptime (`monitoring/grafana/dashboards/backend-overview.json`)
- Backend error logs persisted to MongoDB `error_logs` collection (`backend/services/error_log.py`) with stack-trace redaction, queryable via `/api/logs/error-logs` and `/api/logs/error-logs/stats` (`backend/api/logs_api.py`)
- Backend `sanitize_for_logging()` in `backend/utils/api_utils.py`
- Frontend `createLogger` in `frontend/src/services/logging.ts` — dev console sink + production sink (warn/error only); **no remote sink wired yet**
- Frontend offline queue in AsyncStorage key `offline_queue` (`frontend/src/services/offline/offlineStorage.ts`)

**EXTERNAL (not in repo — must verify out-of-band):**

- Sentry / Expo crash reporting SDK is **not** in `frontend/package.json` or `app.config.js` → no remote JS crash capture today
- No alerting rules (PagerDuty/Opsgenie) visible in repo → confirm with infra team
- MongoDB replica set metrics (oplog lag, connection pool) → confirm via `mongosh` or cloud provider dashboard

---

## Deliverable 1: Post-Deploy Monitoring Checklist (First 48 Hours)

### 1. Backend 422 ValidationError Spikes

| Field | Value |
| ------- | ------- |
| **What to watch** | 422 response rate on `/api/count-lines` (POST) and `/api/sync/batch` (POST) |
| **Where to watch** | Grafana "HTTP Errors / sec" panel (filter for 422); backend logs `grep "422\|ValidationError\|Extra fields are not permitted"` |
| **What "bad" looks like** | `pydantic_core._pydantic_core.ValidationError: Extra fields are not permitted` in backend logs; 422 rate >5% of count-line/sync requests; error_logs collection spike with `error_type=ValidationError` |
| **Escalation action** | If >5% of count-line or sync requests 422 within any 15-min window: (1) check `GET /api/logs/error-logs/stats` for `ValidationError` count trend; (2) inspect a sample 422 response body to identify the extra field; (3) if frontend-originated, hotfix the frontend payload (add field to whitelist or remove from payload); (4) if batch sync, temporarily relax `SyncRecord` to `BaseModel` (allow extra) as a rollback valve while the frontend fix ships |

### 2. Auth Failure Rate

| Field | Value |
| ------- | ------- |
| **What to watch** | 401/403 rate on `/api/auth/*`, `/api/auth/me`, and session heartbeat endpoints |
| **Where to watch** | Grafana "HTTP Errors / sec" (filter 401/403); backend logs `grep "401\|403\|token\|expired"`; `error_logs` collection filtered by `endpoint=/api/auth/*` |
| **What "bad" looks like** | Sustained 401 spike >2× baseline within first 2 hours; users reporting "logged out unexpectedly"; `decodeJwtPayload` returning `null` for previously-tolerated malformed tokens; clock skew causing false `exp` expiry |
| **Escalation action** | (1) Check server clock sync (`timedatectl status` / NTP); (2) sample a 401 response — if `token expired` but user was just logged in, check JWT `exp` claim vs server time; (3) if the `decodeJwtPayload` try/catch is too strict, verify the frontend `authStore.ts:79-89` is returning `null` (not throwing) — a `null` return should trigger re-login, not a crash; (4) if >10% of active users affected, consider rolling back `authStore.ts` to the pre-hardening version (the old code would `JSON.parse` without try/catch and crash on bad tokens, but at least wouldn't silently log users out) |

### 3. Database Write Latency (count_lines)

| Field | Value |
| ------- | ------- |
| **What to watch** | P99 latency on `count_lines` collection writes (insert + `find_one_and_update` with version checks) |
| **Where to watch** | `EXTERNAL: MongoDB profiler or cloud provider dashboard` — the repo's Grafana dashboard tracks HTTP request duration, not DB-level latency; backend `api_metrics` collection (`backend/api/admin_dashboard_api.py:288`) has avg response time from the last 100 API calls |
| **What "bad" looks like** | P99 write latency >500ms (was likely <100ms pre-OCC); `find_one_and_update` with `{version: N}` filter causing lock contention or missed index; timeout errors in backend logs (`grep "ServerSelectionTimeoutError\|lock"`) |
| **Escalation action** | (1) Check `db.count_lines.getIndexes()` — ensure `{session_id: 1, version: 1}` compound index exists for the OCC version-filtered query; (2) if lock contention, check `db.currentOp()` for long-running transactions; (3) if index missing, create it: `db.count_lines.createIndex({session_id: 1, version: 1})`; (4) if latency is from OCC retries (version conflicts), check backend logs for `version_conflict` or `WriteConflict` — may need to tune retry count |

### 4. Frontend Crash Rate

| Field | Value |
| ------- | ------- |
| **What to watch** | JS exceptions: `JSON.parse` SyntaxError, `null is not an object` (evaluating `lastLoggedUser.username`), `Cannot read property 'id' of null` in auth hydration |
| **Where to watch** | `EXTERNAL: Sentry / Expo crash reporting` — **not currently configured** in the repo (no `sentry-expo` or `@sentry/react-native` in `package.json`). Until configured, monitor via: (1) App Store / Play Store crash reports; (2) user-reported issues; (3) `createLogger` output in dev builds |
| **What "bad" looks like** | Crash on app launch (auth initialization); `authStore.ts` clearing storage on every launch (corrupted-storage recovery too aggressive); users stuck on welcome screen after valid login |
| **Escalation action** | (1) If launch crashes spike, check if `authStore.ts:917-923` (storedLastUser catch) or `authStore.ts:944-975` (storedUser parse + validation) is clearing valid data — the `user.id && user.username` guard at line 960 may be rejecting a valid user object with a different field name; (2) if so, hotfix the guard to accept the actual `User` interface fields; (3) **set up Sentry as a P0 post-deploy task** (see Next-Sprint item #10) |

### 5. Offline Queue Growth

| Field | Value |
| ------- | ------- |
| **What to watch** | `offline_queue` AsyncStorage length on client devices; backend sync batch rejection rate |
| **Where to watch** | Frontend: `getCacheStats()` in `offlineStorage.ts` returns `queuedOperations` count — add a debug endpoint or log it on app foreground; Backend: `error_logs` filtered by `endpoint=/api/sync/batch` and `error_type=ValidationError`; Grafana HTTP errors on sync endpoint |
| **What "bad" looks like** | Queue length growing without bound (>100 items per device); sync batch returning 422 repeatedly; `retries` field on queue items climbing without successful sync; infinite retry loop where `ENRICHMENT_WHITELIST` or `StrictBaseModel` rejects a payload that previously passed |
| **Escalation action** | (1) Sample a stuck queue item — inspect its `data` field and `last_error`; (2) if `last_error` contains `Extra fields are not permitted`, the frontend is sending a field the backend `StrictBaseModel` rejects → add the field to the backend model or remove it from the frontend payload; (3) if `last_error` contains `ENRICHMENT_WHITELIST` rejection, the `pickEnrichmentFields` helper is dropping a required field → add it to `ENRICHMENT_WHITELIST` in `enrichmentApi.ts:43`; (4) as a rollback valve, temporarily set `maxQueueSize` higher and add a dead-letter status to prevent infinite retry |

### 6. Biometric Login Failure Rate

| Field | Value |
| ------- | ------- |
| **What to watch** | `loginWithPin` failure rate after biometric unlock; `lastLoggedUser.has_pin` access patterns |
| **Where to watch** | Backend: `error_logs` filtered by `endpoint=/api/auth/login/pin` and `severity=warning`; Grafana 401 rate on pin-login endpoint; Frontend: `createLogger("authStore")` warn/error output |
| **What "bad" looks like** | Users who successfully unlock with biometric but then fail PIN login; `secureStorage.getItem` returning `null` for the PIN key (storage corruption recovery clearing it); `has_pin` flag mismatch between `lastLoggedUser` and actual server state |
| **Escalation action** | (1) Check if `authStore.ts` corrupted-storage recovery (lines 917-923, 944-975) is clearing the PIN alongside the user data — if `secureStorage.removeItem(AUTH_STORAGE_KEY)` also removes the PIN key, that's a regression; (2) verify `secureStorage.ts` key namespacing — the PIN key should be independent of `AUTH_STORAGE_KEY` and `TOKEN_STORAGE_KEY`; (3) if users are locked out, provide a "forgot PIN" → password re-login flow (should already exist) |

---

## Deliverable 2: Next-Sprint Hardening Plan

Items ranked by **risk if deferred** (highest risk first), with effort estimates and file-level implementation hints.

### Backend Remaining

| Priority | # | Item | Effort | Risk if Deferred | File & Hint |
| ---------- | --- | ------ | -------- | ------------------ | ------------- |
| **P1** | 2 | Sanitize `str(e)` in batch/merge error responses | 1 hour | **Medium** — info disclosure in 200 OK bodies; backend error messages could leak internal state to clients | `backend/api/sync_batch_api.py` — replace `str(e)` in response bodies with `sanitize_for_logging(str(e))` (already exists in `backend/utils/api_utils.py:31`); or return a generic message and log the detail server-side |
| **P1** | 3 | Add idempotency check to batch loop | 2 hours | **Medium** — duplicate count lines on retry; a retried sync batch with no per-item idempotency check will create duplicate `count_lines` documents | `backend/api/sync_batch_api.py` — in the batch processing loop, check `idempotency_key` field against existing `count_lines` before insert; skip or return existing if found |
| **P1** | 4 | Bound verified-filter read in `get_count_lines` | 1 hour | **Medium** — OOM risk on large sessions; unbounded `find({verified: false})` on a session with 10k+ lines loads all into memory | `backend/api/count_lines_routes.py` — add `.limit(page_size)` and `.skip((page-1)*page_size)` to the verified-filter query path; ensure `{session_id: 1, verified: 1}` index exists |
| **P2** | 1 | Migrate `SyncRecord` to `StrictBaseModel` | 30 min | **Low** — batch-level `StrictBaseModel` on the wrapper already blocks mass assignment; `SyncRecord` is the inner per-item model | `backend/api/sync_batch_api.py:67` — change `class SyncRecord(BaseModel)` to `class SyncRecord(StrictBaseModel)`; run existing sync batch tests to verify no field rejection |
| **P2** | 5 | Add version check to `add_quantity` | 30 min | **Low** — atomic `$inc` is mostly safe without OCC, but a concurrent `add_quantity` + `finalize` could produce inconsistent totals | `backend/api/count_lines_routes.py:1962` — add `version` field to the `find_one_and_update` filter: `{"_id": line_id, "version": expected_version}`; increment version in the update |

### Frontend Remaining

| Priority | # | Item | Effort | Risk if Deferred | File & Hint |
| ---------- | --- | ------ | -------- | ------------------ | ------------- |
| **P1** | 6 | Add Zod runtime validation for remaining API boundaries | 4 hours | **Medium** — schema drift crashes; count-line boundary is done (`a20dacd4`), but session create, item search, and sync batch responses are still untyped `any` | `frontend/src/types/schemas.ts` — add `SessionResponseSchema`, `SearchResultSchema`, `SyncBatchResponseSchema`; wire `safeParse` (fail-open) into `sessionManagementApi.ts`, `inventoryWorkflowApi.ts` (search paths), `syncQueue.ts` |
| **P1** | 8 | Hash/derive biometric PIN instead of storing raw | 4 hours | **Medium** — jailbreak PIN extraction; `expo-secure-store` encrypts at rest but a jailbroken device can read the keychain | `frontend/src/store/authStore.ts` + `frontend/src/services/storage/secureStorage.ts` — either (a) use `expo-secure-store` with `requireAuthentication: true` (biometric-protected keychain), or (b) derive a key from the PIN using PBKDF2 (`expo-crypto`) and store only the derived hash; backend verifies by re-deriving |
| **P2** | 7 | Migrate `Alert.alert()` to Toast for non-blocking errors | 3 hours | **Low** — UX debt; error messages are already sanitized, so this is purely a UX polish item | `frontend/src/screens/staff/StaffHomeScreen.tsx` (6 `Alert.alert` calls) and `frontend/src/screens/routes/WelcomeScreen.tsx` (2 calls) — replace non-blocking error alerts with `toastService.showError()` (already used in StaffHomeScreen); keep `Alert.alert` only for confirmations (destructive actions) |
| **P3** | 9 | Type the 300+ `any` API responses | 6 hours | **Low** — maintenance debt; no runtime risk since Zod validation (item #6) catches shape mismatches | `frontend/src/services/api/*.ts` — replace `any` return types with `z.infer<typeof XSchema>` or generated types from `npm run generate-client` (OpenAPI generator already configured in `package.json`) |
| **P3** | 10 | Add ESLint `react/no-array-index-key` | 15 min | **Negligible** — tech debt; only matters for dynamic lists where reorder/delete happens | `frontend/.eslintrc.js` — add `"react/no-array-index-key": "warn"` to rules; run `npm run lint:fix` to auto-fix where possible |

### New Items Identified During Monitoring Planning

| Priority | # | Item | Effort | Risk if Deferred | File & Hint |
| ---------- | --- | ------ | -------- | ------------------ | ------------- |
| **P0** | 11 | Set up Sentry / Expo crash reporting | 1 hour | **High** — without remote crash capture, Deliverable 1 item #4 (frontend crash rate) is blind; we cannot detect auth-store hardening regressions in production | `frontend/package.json` — `npm install @sentry/react-native`; `frontend/app.config.js` — add Sentry config with `SENTRY_DSN` env var; `frontend/src/App.tsx` — `Sentry.init()`; add source map upload to CI (`expo export --dump-sourcemap`) |
| **P1** | 12 | Add MongoDB index for OCC version-filtered queries | 15 min | **Medium** — without `{session_id: 1, version: 1}` index, `find_one_and_update` with version check does a collection scan on large sessions | `EXTERNAL: MongoDB shell` — `db.count_lines.createIndex({session_id: 1, version: 1})`; add to backend startup migration script (`backend/db/` or init script) |
| **P1** | 13 | Add offline queue growth alert | 1 hour | **Medium** — without this, Deliverable 1 item #5 (offline queue growth) is manual monitoring only | `frontend/src/services/backgroundSync.ts` — in the background sync task, log `queue.length` via `createLogger`; or add a periodic `getCacheStats()` check that warns if `queuedOperations > 50` |

---

## Recommended Sprint Sequencing

**Week 1 (P0 + P1):**

1. Item #11 — Set up Sentry (P0, 1h) — unblocks all frontend monitoring
2. Item #12 — MongoDB OCC index (P1, 15min) — prevents DB latency regression
3. Item #2 — Sanitize `str(e)` in batch responses (P1, 1h)
4. Item #3 — Idempotency check in batch loop (P1, 2h)
5. Item #4 — Bound verified-filter read (P1, 1h)
6. Item #6 — Zod validation for remaining API boundaries (P1, 4h)
7. Item #8 — Hash/derive biometric PIN (P1, 4h)

**Week 2 (P2 + P3):**
8. Item #1 — `SyncRecord` → `StrictBaseModel` (P2, 30min)
9. Item #5 — Version check in `add_quantity` (P2, 30min)
10. Item #7 — Alert→Toast migration (P2, 3h)
11. Item #13 — Offline queue growth alert (P1, 1h)
12. Item #9 — Type `any` API responses (P3, 6h)
13. Item #10 — ESLint `no-array-index-key` (P3, 15min)

**Total estimated effort:** ~29 hours (Week 1: ~13.25h, Week 2: ~11.25h + 6h typing)
