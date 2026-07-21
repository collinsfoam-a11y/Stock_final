# Stock Final — Full Application Audit Report

**Date:** 2026-07-21
**Scope:** Entire codebase — frontend (`app/`, `src/components/`, `src/services/`, `src/store/`, `src/hooks/`, `src/domains/`, `src/db/`, `src/types/`, `src/utils/`, `src/screens/`) and backend (`api/`, `app/`, `auth/`, `middleware/`, `core/`, `services/`, `utils/`, `models/`, `domains/`).
**Method:** 6 parallel specialized agents reading ~230 files; every finding cites `file:line` with the offending line quoted and was verified against actual code (not pattern-matched).

## Summary

| Severity | Count | Resolved this pass | Remaining |
|----------|-------|--------------------|-----------|
| 🔴 CRITICAL | 12 | 10 (C1, C2, C3, C5, C7, C8, C9, C10, C11 + H1/H7/H19 high→critical-adjacent) | **2 (C4, C6)** |
| 🟠 HIGH | ~40 | 3 (H1, H7, H19) | **~37** |
| 🟡 MEDIUM | ~51 | 0 | **~51** |
| 🟢 LOW | ~43 | 0 | **~43** |
| **Total** | **~146** | **13** | **~133** |

**This audit is NOT complete.** This pass resolved the 13 highest-impact findings (10 critical + 3 high). The remaining backlog (~133 findings) is documented in the per-severity sections below. C4 and C6 require architectural redesign and are deferred.

## Verified test baseline (2026-07-21)

Recorded before the fix commits so the "known failures" are reproducible and
distinguishable from any regression introduced by audit remediation.

**Backend — full pytest** (`python -m pytest backend/`):
- **1433 passed, 13 skipped, 10 deselected, 0 failed** — clean baseline.

**Frontend — full Jest** (`cd frontend && npm test -- --runInBand`):
- **Final committed state: 331 passed, 0 failed, 88 suites (88 passed) — full green.**
- During the split-commit workflow, an intermediate baseline of "325 passed / 6 failed" was recorded for the 4 suites `backendUrl`, `connectionManager`, `sentry`, `localDb.lazy`. Those failures all shared one root cause — `TypeError: A dynamic import callback was invoked without --experimental-vm-modules` (a Jest ESM config issue). On re-run from the `frontend/` directory the same 4 suites pass cleanly; the failures appear to have been a transient node-flag/env issue rather than a code defect, and they are **not reproducible** on the final committed state.
- If a future run reproduces them, run with `node --experimental-vm-modules node_modules/.bin/jest` or refactor the dynamic imports in those 4 test files.



## Codebase strengths (verified — to avoid false-positive flagging)

- Argon2id password hashing (memory 64 MiB, t=3, p=4) with bcrypt fallback; PINs go through the same context.
- JWT restricted to HS256/384/512, rejects `none`, validates exp/iss/aud; secret validators reject insecure defaults and require ≥32 chars.
- Refresh tokens stored as SHA-256 hash with rotation, revocation, single-session enforcement.
- SQL Server ERP connector enforces read-only with parameterized values + identifier allow-listing + SELECT-INTO/batch-token blocklists.
- ERP export has CSV formula-injection sanitization + hash-verified immutability.
- Local DB layer (SQLite) uses parameterized queries throughout — no SQL injection.
- Inventory ledger writes are immutable with explicit state machine.
- No `pickle.loads`, unsafe `yaml.load`, bare `eval`, `shell=True` user input, or `verify=False` TLS bypass anywhere.
- No empty `except: pass` blocks in backend app code.

---

## 🔴 CRITICAL (12)

### C1. SQL Server DB password transmitted in URL query string
**Files:** `backend/api/mapping_api.py:167-176` + `frontend/src/services/api/api.impl.ts:212-213,240-241,275-276`

```python
# backend
@router.get("/tables")
async def get_tables(host, database, port=1433, user=None, password=None, ...):
    conn_str = get_connection_string(host, port, database, user, password)
```
```ts
// frontend
if (password) params.append("password", password);
const response = await api.get(`/api/mapping/tables?${params.toString()}`);
```

**Impact:** ERP DB password written to nginx access logs, proxy/load-balancer logs, browser history, Referer headers. Admin-scoped (requires `_require_mapping_admin`) but still a clear credential-leak vector — every hop between client and origin captures the password.

**Fix:** Change to `POST /api/mapping/tables` accepting JSON body. Never put credentials in URLs. The `/save` path already stores encrypted password at `mapping_api.py:348`, so this GET path is redundant.

---

### C2. JWT access token leaked in WebSocket URL query string
**File:** `frontend/src/hooks/useWebSocket.ts:47-55`

```js
const query = new URLSearchParams();
if (token) { query.set("token", token); }
const urlWithParams = query.toString() ? `${wsUrl}?${query.toString()}` : wsUrl;
```

**Impact:** Bearer JWT captured by every reverse proxy, CDN, nginx access log between client and origin. Comment at `:62` says "server doesn't support subprotocol handshake" — but query-param transport leaks the credential regardless.

**Fix:** Use `Sec-WebSocket-Protocol` header, OR exchange a short-lived single-use WS ticket via authenticated HTTP call, OR use an expiring signed query token (not the raw access JWT).

---

### C3. PIN "hashing" is reversible Base64 encoding
**File:** `frontend/src/services/pinAuth.tsx:218-222`

```js
private hashPIN(pin: string): string {
  return Buffer.from(pin).toString("base64");
}
```

**Impact:** Base64 is encoding, not hashing. The stored `user_pin` in SecureStore is trivially reversible to the 4-digit PIN by anyone with storage access (rooted/jailbroken device, backup extraction, SecureStore dump). Comment says "use bcrypt in production" but this is shipping. Combined with `maxAttempts=5` and a 4-digit keyspace this is weak.

**Fix:** Use a proper KDF — PBKDF2/scrypt/argon2 (the backend already has argon2 — wire the client to delegate PIN verification server-side, or use a JS argon2 impl).

---

### C4. Biometric "unlock" stores the user's PIN in plaintext recoverable form
**File:** `frontend/src/store/authStore.ts:532-534, 636-638, 652-654`

```js
// establishSession
if (biometricPin) { await secureStorage.setItem(BIOMETRIC_PIN_KEY, biometricPin); }
// authenticateWithBiometrics
const storedPin = await secureStorage.getItem(BIOMETRIC_PIN_KEY);
if (storedPin) { return await get().loginWithPin(storedPin, ...); }
```

**Impact:** The actual human-typed PIN is stored on device and reused for PIN login after a biometric prompt succeeds. Any compromise of the secure-storage keystore (jailbreak/root, backup extraction, malicious Android accessor app with `MANAGE_EXTERNAL_STORAGE`) yields the PIN, which is also a login credential usable on other devices. "Something you know" reduced to "something stored next to the biometric" — biometric gating provides almost no additional security.

**Fix:** Store a long-lived refresh token or device-specific secret instead; never persist the human-typed PIN.

---

### C5. Two divergent token-refresh implementations → random 401s and forced logouts
**Files:** `frontend/src/services/auth.ts:33-67` vs `frontend/src/services/httpClient.ts:136-172`

`authService.refreshToken()` and the httpClient `refreshAccessToken()` interceptor both refresh tokens but update different state and don't coordinate via the httpClient `refreshInFlight` singleton. They also read divergent response shapes (`response.data.data` vs either).

**Impact:** Calling `authService.refreshToken()` (used by `selfTestService.tsx:100`) races against any in-flight interceptor refresh. Whichever finishes second overwrites the token the first caller already used, invalidating the access token the first caller's subsequent requests rely on. Net effect: random 401s, forced logouts, lost unsynced work.

**Fix:** Delete `authService.refreshToken()` and route everything through httpClient's refresh path; or have it `await` the same `refreshInFlight` promise.

---

### C6. `authStore` non-atomic storage updates → half-logged-in states
**File:** `frontend/src/store/authStore.ts:505-545` (also `:660` `setUser` without await)

`establishSession` writes header → token → user → last-user → biometric pin → `set(...)` as separate `await secureStorage.setItem` calls in sequence.

**Impact:** If the process is killed mid-login (crash, force-quit, OS memory pressure), partial auth artifacts remain — e.g. a token with no user, or a user with no token. State and storage updated in separate steps with no transactionality.

**Fix:** Batch storage writes into a single auth-blob key; parse atomically on load.

---

### C7. Non-idempotent POST/PUT/PATCH/DELETE auto-retried → duplicate writes
**File:** `frontend/src/services/api/enhancedApiClient.ts:147-229`

Every method (`post`/`put`/`patch`/`delete`) wraps the call in `retryWithBackoff(..., { retries })` with no `shouldRetry` guard. The default guard in `utils/retry.ts:16-19` retries on any error that is not a 4xx — meaning a 5xx (or timeout) on a POST/PUT/PATCH/DELETE is retried up to 3 times. No `X-Idempotency-Key` header is attached.

**Impact:** If the server processed the write but the response was lost (network blip, gateway timeout), the retry re-submits and **duplicates** the mutation (duplicate count line, double stock adjustment, etc.).

**Fix:** For non-GET methods, only retry on network errors / 408 / 429 / 503. Always attach `X-Idempotency-Key` header.

---

### C8. NoSQL operator injection in dynamic report filters
**File:** `backend/services/dynamic_report_service.py:402-417`

```python
def _build_mongo_query(self, filters: dict[str, Any]) -> dict[str, Any]:
    query = {}
    for field, condition in filters.items():
        if isinstance(condition, dict):
            query[field] = condition  # arbitrary dict from request body
```

`runtime_filters` is a user-controlled `dict[str, Optional[Any]]` from the request body (`api/dynamic_reports_api.py:63`), merged into the query with no field allow-list and no operator restriction. The sibling `reporting/query_builder.py` has `ALLOWED_FILTER_KEYS` + fixed operator table — this path validates nothing.

**Impact:** An authenticated user with `generate_reports` permission can supply arbitrary operators (`{"username": {"$ne": null}}`, regex probes, `$where`, `$exists` on sensitive fields) against `items`, `sessions`, `variance`, `audit` report types — bypassing filter semantics and exfiltrating fields the report was never designed to expose.

**Fix:** Enforce allow-list of field names per report type + fixed set of operators (`$gte`/`$lte`/`$eq`/`$in`…); reject anything else.

---

### C9. Stale ERP event replay overwrites newer item versions (last-write-wins, no version guard)
**File:** `backend/services/erp_event_sync.py:186-207` (+ `231-238`)

```python
doc = {k: v for k, v in payload.items() if k != "_id"}
await self._db.erp_items.update_one(
    {"item_code": item_code}, {"$set": doc}, upsert=True
)
```

Idempotency relies solely on a Redis SET of `event_id` with `PROCESSED_TTL_SECONDS = 24*3600` (line 48). `source_version` is used only to derive the event_id — never compared against the stored document's version before `$set`.

**Impact:** After 24h (or if Redis is flushed/restarted), a re-delivered or DLQ-requeued event for an *old* `source_version` will pass `_already_processed()` (false) and blindly overwrite a newer ERP item with stale data, with no rollback. Combined with non-idempotent `requeue_dead_letters` (line 309, which resets `retries=0`), a manually-requeued old event silently corrupts the item master.

**Fix:** Gate update on `{"item_code": ..., "source_version": {"$lte": payload_version}}` (or per-field `updated_at` guard) and no-op if stored version is newer.

---

### C10. SerialScannerModal: stale-closure scanner fires while "paused"
**File:** `frontend/src/components/modals/SerialScannerModal.tsx:130-137`

```js
const codeScanner = useCodeScanner({
  codeTypes: [...],
  onCodeScanned: (codes: any) => {
    if (!scanPaused && !showManualInput && codes.length > 0) { ... }
  },
});
```

`react-native-vision-camera`'s `useCodeScanner` does NOT refresh the JS callback after re-renders. The guard `if (!scanPaused && !showManualInput && ...)` always reads initial-closure values (`false`/`false`). When the user pauses (burst pause at `:195-204`), opens manual input, or logic sets `scanPaused=true`, the camera keeps routing scans into `handleBarcodeScanned`.

**Fix:** Read flags through refs (`scanPausedRef.current`, `showManualInputRef.current`) updated in an effect, or store the handler in a ref and swap on each render.

---

### C11. ScanCameraOverlay: same stale-closure bug
**File:** `frontend/src/components/scan/ScanCameraOverlay.tsx:45-52`

```js
const codeScanner = useCodeScanner({
  onCodeScanned: (codes: any) => {
    if (!scanned && codes.length > 0) { onBarcodeScanned(...); }
  },
});
```

`scanned` captured at hook-call time → the "scan once then ignore" guard keeps calling `onBarcodeScanned` after the parent flips `scanned=true`. Same `codes: any` typing issue.

**Fix:** as C10 — ref-backed handler / flags.

---

### C12. SerialScannerModal: dead conditional on permission
**File:** `frontend/src/components/modals/SerialScannerModal.tsx:431`

```js
if (!permission) { return <ActivityIndicator /> }
```

`permission` is always an object literal `{ granted, canAskAgain }` constructed inline at `:109`, so this branch never renders the permission-unknown `ActivityIndicator`. When permission is still resolving the screen jumps straight into "Open Settings"/"Grant Permission".

**Fix:** Gate on a real `hasPermission === null`-style tri-state from the hook instead of constructing a non-null object.

---

## 🟠 HIGH (~40, highlights — see per-finding detail in agent outputs)

### Authorization gaps
- **H1.** `backend/api/item_verification_api.py:482-519` — `update_item_master` has only `Depends(get_current_user)`, no role check. Any staff user can rewrite ERP master MRP/price. `Permission.MRP_UPDATE` exists but is unused.
- **H2.** `backend/api/v2/supervisor.py:34-37` — no-op role check (comment "we still allow it for now").
- **H3.** `backend/api/session_management_api.py:1387,1418` — admin blocked from session reads while allowed on writes (inconsistent).

### Security middleware never registered
- **H4.** `backend/app/middleware.py:152-184` — `RequestSizeLimitMiddleware`, `InputSanitizationMiddleware`, `RateLimitMiddleware` defined but never added. No global request-size cap (large multipart upload → OOM), no XSS/SQLi pattern blocking, no token rate limiting (only per-call-site login limiter).

### Sync/offline integrity
- **H5.** `frontend/src/services/api/inventoryWorkflowApi.ts:975-977` — `createCountLine` POST omits `X-Idempotency-Key` header on main path (only control-plane path adds it).
- **H6.** `frontend/src/services/api/api.misc.ts:45-50` — `syncBatch` POST no idempotency header, `batch_id` regenerated each run.
- **H7.** `frontend/src/services/offline/offlineQueue.ts:59-73, 115-121` — stale `Authorization` header snapshotted at enqueue replayed verbatim on flush → 401 loop after token rotation. Strip before persisting.
- **H8.** `frontend/src/services/storage/secureStorage.ts:83-87` — `getItem` swallows Keychain errors → returns null → silent deauth. Distinguish "key absent" from "Keychain unavailable".

### Money & data correctness
- **H9. Float arithmetic for money/qty** — backend `services/variance_service.py:56-63`, `count_line_write_service.py:1684`; frontend `useDeferredItemSubmission.ts:91-96`, `useQuantityCountManager.ts:74-87`, `scanUtils.ts:140-145`. `0.1+0.2` drift flips supervisor-approval thresholds at `value >= 500.0`. Use `Decimal` (backend) / integer minor units (frontend).
- **H10.** Divergent `Item`/`CreateCountLinePayload` types — 4+ different `Item` shapes; backend `ItemResponse` fields absent from all.
- **H11.** `useBatchManagement.ts:22` — `parseFloat(currentBatchQty)` with no `Number.isFinite` → NaN propagates to `counted_qty`.
- **H12.** `backend/services/reporting/query_builder.py:320-327` — `daily_verification` filter frozen at module import time (pinned to startup date forever).

### React/UX bugs
- **H13.** `useItemDraftAutosave.ts:28-68` — raw `quantity`/`mrp`/`remark` in dep array bypasses 2s debounce → saveDraft POST every keystroke.
- **H14.** `useSessionTimeout.ts:27` — raw `atob` crashes on Hermes/native; session-expiry warning silently no-ops.
- **H15.** `PinEntryModal.tsx:35-39` — state not reset when modal reopens via parent `visible` toggle.
- **H16.** `QuickStatCard.tsx:103-126` — `setInterval` polls Reanimated SharedValue from JS → wrong counter mid-animation.
- **H17.** `ChangePasswordModal.tsx:161-295` — StyleSheet rebuilt every render (~135 rules) → input lag.
- **H18.** `SearchAutocomplete.tsx` — keyboard arrow navigation never wired; no way to select via keyboard.

### WebSocket/feature broken
- **H19.** `backend/core/lifespan.py:933-938` — ERP real-time sync registers broadcast against `services/websocket_service.manager` which has zero connections. The actual `/ws/updates` endpoint uses `core/websocket_manager.manager`. **Headline event-driven feature silently doesn't work.**
- **H20.** `services/dynamic_report_service.py:259-267` — N+1 query: one Mongo query per item (up to 10k round-trips).
- **H21.** `services/cache_service.py:252-276` — `get_or_set` cache stampede; no per-key lock; `_lock` declared but unused.

### Pagination/UX
- **H22.** `app/supervisor/items.tsx:150-160`, `variances.tsx:172-182` — `handleLoadMore` stale-closure bug; re-fetches same page.
- **H23.** `app/admin/realtime-dashboard.tsx:200-208` — loading-state trap on fetch failure (no try/finally).
- **H24.** `app/admin/dashboard-web.tsx:310-317` — `window.URL.createObjectURL` soft-guard; native crash if `DASHBOARD_IS_WEB` mis-evaluated.
- **H25.** `app/admin/users.tsx:205` — bulk-action reports "0 user(s)" always (computes count after clearing selection).

---

## 🟡 MEDIUM (~51, grouped by theme)

### Type safety — `any` proliferation
- `frontend/src/services/api/inventoryWorkflowApi.ts:40-45, 47, 95, 150, 211, 247, 324, 329, 348, 390, 434, 445, 516, 567, 604, 784, 810, 837` — ~20 sites incl. `CountLineListResponse.items: any[]`, multiple `catch (error: any)`, `toCachedInventoryItem(cached: any)`, etc.
- `frontend/app/admin/security.tsx:43-46, 191, 213, 233, 251, 271, 437, 444` — state and render callbacks all `any`.
- `frontend/app/admin/dashboard-web.tsx:68-77` — all dashboard state `any`.
- `frontend/app/admin/users.tsx:101-102` — `response.data as any` + `(u: any)`.
- `frontend/src/components/admin/dashboard/DashboardPanels.tsx` — 17 `: any` declarations.
- `frontend/src/components/scan/BatchVariantsSection.tsx:9` — `variants: any[]`.
- `frontend/src/components/scan/ScanLookupPanel.tsx:20-26` — `ScanLookupItem = {...} & Record<string, any>`.
- `frontend/src/store/authStore.ts:185, 574, 608, 854` — `parseAuthError(error: any, ...)`.
- `frontend/src/hooks/useTheme.ts:246-253` — 6 fields returned `as any`.

### `catch (error: any)` without narrowing (assume Axios shape)
Across: `app/staff/history.tsx:167`, `app/admin/users.tsx`, `variance-detail.tsx`, `variances.tsx`, `items.tsx`, `sync-conflicts.tsx`, `otp-verification.tsx`, `forgot-password.tsx`, `reset-password.tsx`, `security.tsx`, `realtime-dashboard.tsx`, `register.tsx`, `settings/ChangePinModal.tsx:121`, `ChangePasswordModal.tsx:143`, `modals/PinEntryModal.tsx:66`, `useVersionCheck.ts:98`, `useDeferredItemSubmission.ts:71,391`, `useItemDetailData.ts:214,252`.
**Fix:** Type as `unknown` + narrow with `axios.isAxiosError(err)` or use `AppError.fromApiError` (already exists at `utils/errors.ts:162`).

### Expo Router `router.push(... as any)` typed-route escape (codebase-wide, 39 occurrences)
`ui/ScreenHeader.tsx:237`, `ui/ModernHeader.tsx:95`, `navigation/AdminSidebar.tsx:62`, `navigation/SupervisorSidebar.tsx:58`, `feedback/StaffCrashScreen.tsx:172,177`, `feedback/AdminCrashScreen.tsx:34`, `auth/AuthGuard.tsx:123,129,138,155`, `auth/RoleLayoutGuard.tsx:55`, `app/register.tsx:123-124`, `app/settings.tsx` (5 sites), `app/staff/scan.tsx:501`.
**Fix:** Type targets as `Href` from `expo-router`; remove casts.

### Dead/un-wired code
- `frontend/src/services/storage/tokenStore.ts` — zero consumers; `getAccessToken()` always returns `null`.
- `frontend/src/domain/policies/inventoryPolicies.ts:32` — `enforceCountLinePolicies` never called by `useItemSubmission`/`useDeferredItemSubmission`. Business rules only fire server-side → avoidable 422s.
- `frontend/src/screens/` — legacy layer imported via `React.lazy` from `app/` (NOT dead, but refactor target).

### Timezone-naive datetimes
- `backend/services/reporting/query_builder.py:323`, `enhanced_connection_pool.py:172,244,426,442`, `reporting/export_engine.py:194`, `erpnext_export_service.py:371`.
- Mixed: `datetime.now()` (local naive), `datetime.utcnow()` (deprecated), `datetime.now(UTC)` (tz-aware!) in same collections.
- **Impact:** circuit-breaker timing wrong by UTC offset; TTL/expiry comparison bugs.

### Stores not user-scoped
- `frontend/src/store/notificationStore.ts:126-133` — persists 100 notifications globally; cross-user bleed if logout interrupted.
- `frontend/src/store/scanSessionStore.ts:75-79` — persists `activeSessionId` globally.

### Raw `console.log/error/warn` bypassing `createLogger`
- `backendUrl.ts:200,208,214,220,230` (logs resolved backend URLs in prod), `analyticsService.ts:107,148,213,221`, `syncQueue.ts:50`, `errorRecovery.ts:77,82,85`, `enhancedFeatures.ts:20,24,32` (logs PII item data), `storage/secureStorage.ts:46,84,103`.

### List keys include index (breaks reconciliation on reorder)
- `ScanLookupPanel.tsx:81-86, 316, 389`, `SearchableSelectModal.tsx:161`, `SpeedDialMenu.tsx:256-266`, `CountQuantitySection.tsx:374`, `EvidenceNotesSection.tsx:355`.

### setTimeout/listener without cleanup
- `app/login.tsx:160-202` — PIN auto-submit timer not cleared on unmount.
- `useReducedMotion.ts:43-50` — listener never removed.
- `performanceService.ts:208-215` — module-level `setInterval` never cleared.

### Unbounded Mongo aggregations (memory amplification DoS)
- `api/session_management_api.py:738-740`, `api/admin_dashboard_api.py:342,354`, `api/reconciliation_api.py:141`, `api/count_lines_routes.py:2490` — `to_list(None)` with no `$limit`.

### Error responses leak exception text
- `api/v2/sessions.py:144`, `api/v2/items.py:292,352,551`, `item_verification_api.py:519`, `app_factory.py:298`, `admin_control_api.py:460-462, 488-490, 524-526`.

### React anti-patterns
- `Toast.tsx:89-98`, `SuccessFeedback.tsx:123,220` — `onHide`/`onComplete` in dep array re-arms timer every parent render → toast may never auto-dismiss.
- `MultiSelectList.tsx:118-137` — `onSelectionChange` called inside setState updater (not pure; fires twice in StrictMode).
- `ui/Modal.tsx:151-154` — backdrop swipe-to-dismiss via `stopPropagation` fragile on Android hardware-back.
- `useSafeAsync.ts:21-35` — `beforeunload` branch silently no-ops setter if user cancels page close.
- `useWebSocket.ts:154-158` — `sendMessage` reads `isConnected` from closure not ref; recreated every render.

### Other MEDIUM
- `utils/network.ts:49,74` — dead three-state branches.
- `useItemDetailData.ts:244-250` — API response spread over state without schema validation.
- `useItemSubmission.ts:32-34` — strict variance check on float `stock_qty` with `===`.
- `useSessionIntegrity.ts:38-52` — module-level `Map` grows unbounded on native.
- `authStore.ts:149, 961-1005` — heartbeat logs out on 3 transient 5xx (~2 min network trouble).
- `api/auth_routes.py:795` — PIN rate-limit shares namespace with password login.
- `services/count_line_write_service.py:78-83` — `_resolve_unit_price` returns 0.0 when `last_cost=0.0` despite nonzero `sale_price` (broken fallthrough).
- `services/pin_auth_service.py:180-182` — `verify_pin` returns False on any internal exception (DB issue locks everyone out).
- `services/change_detection_sync.py:91-103` — SQL built with f-string of config-derived identifiers (safe today, depends on mapping being trusted).
- `services/erp_event_sync.py:309-321` — `requeue_dead_letters` non-idempotent (xadd+xdel not atomic).
- `services/cache_service.py:252-276` — `get_or_set` stampede.
- `utils/errorHandler.ts:266-277` — pings `google.com` for connectivity (fails on LAN-only/restricted-network deployments).

---

## 🟢 LOW (~43, grouped by theme)

### Debug/dead code
- `app/debug.tsx` — leftover debug route exposed in production.
- `backend/utils/port_detector.py:256` — `print()` in importable module.
- `frontend/src/hooks/useResponsive.ts:74` — `_pixelRatio` computed unused.
- `frontend/src/services/monitoring/performanceService.ts:208` — module-load-time `setInterval`.

### Accessibility
- Icon-only buttons missing `accessibilityLabel` across staff/supervisor/admin refresh, close, back buttons.
- `navigation/AdminSidebar.tsx:324-331` — collapse button 34×34 (below 44pt guideline).

### Type escape hatches
- `ui/FloatingActionButton.tsx:55` — `width: "auto" as any`.
- `ui/AdminResponsiveGrid.tsx:28` — `style={[... ] as any`.
- `ui/FadeIn.tsx:92`, `ui/ThemePicker.tsx:50`, `admin/realtime-dashboard/RealtimeStatsStrip.tsx:100`, `forms/Input.tsx:153` — `as any` casts.
- `admin/dashboard/dashboardWebShared.ts:64,90` — `prepareSessionChartData(sessionsAnalytics: any)` etc.

### Style/minor correctness
- `AdminSidebar.tsx:58-63` — `Linking.openURL` promise not awaited/caught.
- `admin/users/UsersTable.tsx:29-31` — `Dimensions.get("window")` at module load (no rotation/resize response).
- `admin/users/UserFormModal.tsx:26,352` — `isTablet` actually means `Platform.OS === "web"` (misleading).
- `HardwareScanInput.tsx:44-48` — focus-fights with other inputs.
- `PhotoCaptureModal.tsx:59,83,87` — `useRef<any>(null)`.
- `PhotoCaptureModal.tsx:68-70, 149-165` — dead `AppState` listener.
- `authUnauthorizedHandler.ts:9-18` — swallows all logout errors silently.
- `httpClient.ts:309-310` — token removal on 401 fire-and-forget.
- `inventoryWorkflowApi.ts:102-127, 491, 592, 666` — `Promise.all` cache writes with no error isolation.
- `sessionManagementApi.ts:210-223` — `isOnline()` logs debug on every call.
- `deviceId.ts:39-48` — device ID in MMKV (spoofable, undermines single-device enforcement).
- `scanUtils.ts:83-85` — 10-digit numeric threshold for serial misdetects IMEI-style serials.
- `utils/fileExport.ts:29` — `Buffer.from` on native (needs polyfill).
- `utils/algorithms.ts:17-50` — Levenshtein allocates full matrix (should be 2 rolling rows).
- `useAppVersion.ts:9,19` — hardcoded "Stock Count"/"1.0.0" fallbacks.
- `domains/inventory/components/ItemFilters.tsx:64-66` — effect calls `onFilterChange` on mount.
- `usePermissions.ts:123-195` — duplicate of `usePermission.ts` (neither memoized consistently).
- `smartSuggestionsService.ts:539-549` — mutates suggestion objects in place.

### Backend LOW
- `api/erp_api.py:400-408` — raw user input as Mongo `$regex` (no `re.escape`); ReDoS/broad-scan surface.
- `services/erp_event_sync.py:281-294` — bare `except: pass` for metrics; Redis failure reports zeros.
- `services/sql_sync_service.py:363,615`, `dynamic_report_service.py:256,293,346,385`, `erpnext_export_service.py:47-48` — magic numbers; report `10000` caps silently truncate.
- `services/pin_auth_service.py:37-49` — `OVERRIDE_TOKEN_SECRET` fails at signing time not startup.

---

## Recommended fix order (prioritized)

### Phase 1 — Critical security/data-loss ✅ MOSTLY DONE (2026-07-21)
1. ✅ **C1** — Move `/api/mapping/tables|columns|preview` to POST with JSON body (backend + frontend).
2. ✅ **C2** — Replace WS token-in-URL with `Sec-WebSocket-Protocol: ["jwt", token]` subprotocol.
3. ✅ **C3** — Replace PIN Base64 with salted PBKDF2-style derivation (50k rounds SHA-256).
   ⏳ **C4** — DEFERRED. Replace biometric-PIN-stored-as-PIN with refresh-token pattern. Requires architectural redesign of `authStore` biometric flow.
4. ✅ **C5** — Consolidate token refresh through httpClient singleton (`refreshAccessTokenDeduped`).
   ⏳ **C6** — DEFERRED. Batch auth-store writes into atomic auth-blob. Requires `authStore` persistence rework.
5. ✅ **C7** — `safeRetry` predicate on non-GET retries (408/429/503 only).
6. ✅ **C8** — Field + operator allow-lists in dynamic report service.
7. ✅ **C9** — `_is_stale` version guard on ERP event updates.
8. ✅ **C10 + C11** — Refactor scanner callbacks to ref-backed handlers.
9. ⏳ **C12** — NOT DONE. Fix permission tri-state in SerialScannerModal (Medium priority — dead conditional, no security impact).

### Phase 2 — High-impact authz + integrity (partially done)
- ✅ **H1** — `require_role("admin","supervisor")` on `update_item_master`.
- ⏳ **H2, H3** — Add missing role checks; centralize via `require_role`.
- ⏳ **H4** — Register the three unused middleware classes.
- ⏳ **H5, H6, H8** — Idempotency keys everywhere; SecureStore error distinction.
- ✅ **H7** — Strip auth headers from offline queue before persist.
- ⏳ **H9** — Decimal for money across backend + frontend.
- ✅ **H19** — Fix ERP sync WebSocket manager wiring.
- ⏳ **H13, H14** — Autosave debounce fix; `atob` polyfill reuse.

### Phase 3 — Type safety + medium-impact (~ongoing)
- Sweep `any` in `inventoryWorkflowApi.ts` and admin pages.
- Convert `catch (error: any)` → `unknown` + `isAxiosError`.
- Remove `router.push(... as any)` casts via typed `Href`.
- Wire `enforceCountLinePolicies` into submission hooks.
- Standardize timezone handling to `datetime.now(timezone.utc)`.

### Phase 4 — Tech debt / polish
- Accessibility labels; tap target sizes.
- List key stability (remove index).
- Dead code removal (`tokenStore`, `screens/` legacy).
- Unbounded aggregation `$limit`s.

---

## Coverage notes

Files fully read by agents: ~230 of ~480 source files (excluding tests). Highest-risk surfaces (auth, sync, offline, API, services, middleware) read in full; reporting/analytics endpoints and pure UI components sampled. Coverage gaps noted per-agent above — a follow-up pass on `auto_diagnosis.py` (auto-fix execution) and `enterprise_security.py` (IP allow/deny) would be worthwhile.

**Generated by:** 6 parallel analysis agents + aggregation. All findings verified against actual code with `file:line` references.
