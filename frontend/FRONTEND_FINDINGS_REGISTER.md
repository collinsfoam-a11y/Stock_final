# Frontend Findings Register

**Target:** `frontend/` (workspace root; formerly `Stock_final/frontend/`) v2.1.0 · **Date:** 2026-08-02
**Confidence values:** `Confirmed` (proven by an executed command or unambiguous code read) · `High confidence` (strong static evidence, no runtime proof) · `Requires runtime verification`

> ⚠️ **Concurrency notice.** Another process restructured this repository and fixed two findings while the audit was in progress. All findings below were **re-verified against the post-change tree**. Two are marked ✅ RESOLVED; the rest still stand.

**Summary — open:** P0 = 1 · P1 = 8 · P2 = 16 · P3 = 7 · **Total open = 32** (2 resolved during audit; 34 raised)

---

## P0 — Critical

### ✅ FE-P0-001 — RESOLVED DURING AUDIT — Application did not bundle: unresolved `logoutService` import

```text
Finding ID:          FE-P0-001
Severity:            P0 (resolved)
Status:              ✅ RESOLVED during audit by a concurrent process; re-verified green
Confidence:          Confirmed (both the defect and the fix)
Affected files:      src/components/auth/UniversalLogout.tsx:8
                     src/services/auth/            (empty directory)
                     app/staff/settings.tsx:26                       (importer)
                     src/screens/staff/StaffHomeScreen.tsx:43        (importer)
                     src/components/navigation/AdminSidebar.tsx:23   (importer)
                     src/components/navigation/SupervisorSidebar.tsx:18 (importer)
                     src/components/ui/ModernHeaderWithLogout.tsx:6  (importer, itself dead)
Affected platforms:  iOS, Android, Web — all
```

**Evidence** — four independent tools agree:

```
$ npm run build:web
Web Bundling failed 25116ms index.js (2423 modules)
Error: Unable to resolve module ../../services/auth/logoutService
  from src/components/auth/UniversalLogout.tsx
None of these files exist:
  * src/services/auth/logoutService(.web.ts|.ts|.web.tsx|.tsx|...)
Import stack:
 src/components/auth/UniversalLogout.tsx
 app/staff/settings.tsx
build exit=1

$ npx tsc --noEmit
src/components/auth/UniversalLogout.tsx(8,31): error TS2307:
  Cannot find module '../../services/auth/logoutService'

$ npx expo lint
src/components/auth/UniversalLogout.tsx
  8:31  error  Unable to resolve path to module '../../services/auth/logoutService'  import/no-unresolved

$ npx knip
Unresolved imports (1)
../../services/auth/logoutService  src/components/auth/UniversalLogout.tsx:8:31
```

`ls -la src/services/auth/` returns an empty directory (created 2026-08-02 15:35).

**Current behaviour:** Metro cannot resolve the module. The web export aborts at 2423/2423 modules; native bundling fails identically for any route reaching the module.

**Expected behaviour:** The bundle builds; tapping Sign Out on any role's screen performs a logout.

**Root cause:** `LogoutService` was designed (documented across five files in `src/docs/`, e.g. `UI_UX_IMPROVEMENTS.md:34-62`, `COMPREHENSIVE_UI_UX_VALIDATION.md:109-111`) and `UniversalLogout` was written against it, but `src/services/auth/logoutService.ts` was never implemented. `UniversalLogout.tsx:75` and `:109` call `LogoutService.performLogout(...)`. The gap was invisible because all six `authStore` test suites fail to execute (FE-P1-001) and the `lint` script's exit status was not being enforced in the last run.

**Operational impact:** Total release failure. Additionally, the *intended* unified logout was never built — the codebase still has two competing logout paths (`authStore.logout` and the dead `authStore.clearAuth`).

**Recommended remediation** — either:
- **(a) Minimal:** delete line 8 and replace `LogoutService.performLogout({...})` at `:75`/`:109` with `await useAuthStore.getState().logout()`, preserving the existing force-logout fallback semantics; or
- **(b) Complete:** implement `src/services/auth/logoutService.ts` exporting `LogoutService.performLogout({ force })` that wraps `authStore.logout()` and returns a structured result, then delete the dead `authStore.clearAuth`.

Option (b) is preferred because it also resolves FE-P2-003.

### ✅ Resolution applied by the concurrent process

`src/services/auth/logoutService.ts` was created (option **b**), exporting `LogoutService.performLogout()` which delegates to `useAuthStore.getState().logout()`.

**Re-verified 2026-08-02:**

```
$ npx tsc --noEmit          → exit 0
$ npm run build:web         → exit 0, "Exported: dist"
```

**Residual follow-up (new, P2 — tracked as FE-P2-017).** The implemented force-logout branch bypasses the full teardown:

```ts
// src/services/auth/logoutService.ts
} catch (error) {
  if (options?.force || options?.forceLogout) {
    useAuthStore.setState({ user: null, isAuthenticated: false } as any);   // ← direct setState
    return { success: true, message: "Forced logout performed" };
  }
```

This clears only two state fields. It does **not** clear secure storage, the TanStack Query cache, the notification store, the scan-session store, recent items or read caches — all of which `authStore.logout()` handles. A forced logout therefore leaves the previous user's tokens and cached data on the device while reporting `success: true`. It also uses `as any`, defeating the store's typing. Additionally, `LogoutOptions` declares `clearCache`, `redirectPath` and `checkPendingWork`, none of which the implementation reads.

**Recommendation:** make the force branch call `authStore.logout()` again (or a `forceTeardown()` that runs the same cleanup ignoring network errors) rather than `setState`. This is closely related to FE-P0-002 — both concern incomplete teardown.

```text
Effort:              (a) XS   (b) S   — resolution applied; residual FE-P2-017 is XS
Dependencies:        Fix FE-P1-001 first so authStore tests can verify the change
Validation method:   npm run build:web exits 0                    ✅ verified
                     npx tsc --noEmit exits 0                     ✅ verified
                     npx expo lint no import/no-unresolved error   ✅ verified
                     manual: Sign Out works from staff settings, supervisor sidebar, admin sidebar
                     NEW: assert forced logout clears storage + caches (FE-P2-017)
```

---

### FE-P0-002 — Offline write queue and count-line cache survive logout and carry no user ownership

```text
Finding ID:          FE-P0-002
Severity:            P0
Confidence:          Confirmed (code) / Requires runtime verification (end-to-end reproduction)
Affected files:      src/services/offline/offlineStorage.ts:20-27   (STORAGE_KEYS)
                     src/services/offline/offlineStorage.ts:79-89   (OfflineQueueItem)
                     src/services/offline/offlineStorage.ts:504     (clearOfflineQueue — 0 callers)
                     src/services/offline/offlineStorage.ts:924     (clearAllCache — 0 callers)
                     src/services/offline/offlineStorage.ts:949-959 (clearReadCaches)
                     src/store/authStore.ts:614-701                 (logout)
                     src/services/syncService.ts:770                (flush)
Affected platforms:  iOS, Android, Web — all
```

**Evidence:**

```ts
// offlineStorage.ts:20-27 — one global namespace, no user scoping
const STORAGE_KEYS = {
  ITEMS_CACHE:       "items_cache",
  OFFLINE_QUEUE:     "offline_queue",
  SESSIONS_CACHE:    "sessions_cache",
  COUNT_LINES_CACHE: "count_lines_cache",
  LAST_SYNC:         "last_sync",
  USER_DATA:         "user_data",
};

// offlineStorage.ts:79-89 — no owner field
export interface OfflineQueueItem {
  id: string; type: "count_line" | "session" | "unknown_item";
  data: Record<string, unknown>; timestamp: string; retries: number;
  status: "pending" | "pending_retry" | "blocked_conflict" | "failed_manual_review";
  idempotency_key?: string; last_error?: string | null; last_attempted_at?: string | null;
}

// offlineStorage.ts:949-959 — what logout actually clears
export const clearReadCaches = async () => {
  await AsyncStorage.multiRemove([
    STORAGE_KEYS.ITEMS_CACHE,
    STORAGE_KEYS.SESSIONS_CACHE,
    STORAGE_KEYS.LAST_SYNC,     // ← OFFLINE_QUEUE and COUNT_LINES_CACHE absent
  ]);
};
```

Caller search across `src/` and `app/`:

```
$ grep -rn "clearOfflineQueue\|clearAllCache" src app | grep -v __tests__ | grep -v offlineStorage.ts
(no results)
```

`authStore.logout()` (`:693-700`) calls only `clearReadCaches()`.

**Current behaviour:** After logout, `offline_queue` and `count_lines_cache` remain in AsyncStorage. `syncService.syncOfflineQueue()` (`:770`) reads the queue and flushes every entry using whatever `Authorization` header is currently attached.

**Expected behaviour:** Logout either (a) flushes and clears the queue, or (b) preserves it but tags each entry with its owning user and refuses to sync entries whose owner differs from the authenticated user, surfacing them for supervisor resolution.

**Root cause:** The offline layer was designed as a device-level singleton. User scoping was implemented for *preferences* (`setUserPreferenceScope` at `authStore.ts:608`/`:656`) and *filters* (`resetFilterStoreForLoggedOutUser`) but never extended to the write queue or count-line cache.

**Operational impact** — this is the classic shared-device warehouse scenario:

1. Operator A counts 40 items offline on the shared handheld. Entries queue with valid idempotency keys.
2. A's shift ends; A signs out. Queue is **not** cleared.
3. Operator B signs in. Wi-Fi returns.
4. `syncService` flushes A's 40 count lines under **B's** bearer token.

Consequences: inventory counts attributed to the wrong operator (audit-trail corruption); B additionally sees A's `count_lines_cache` in offline views (cross-user data exposure). The idempotency keys prevent *duplicate* submission but do nothing about *mis-attribution*. Both "incorrect inventory results" and "cross-user data leakage" are P0 categories in the agreed severity model.

**Recommended remediation:**

1. Add `owner_user_id: string` to `OfflineQueueItem`; populate in `addToOfflineQueue` from `useAuthStore.getState().user?.id`.
2. In `syncService.syncOfflineQueue`, skip and quarantine entries where `owner_user_id !== currentUserId`, routing them to the existing `failed_manual_review` status and the supervisor `offline-queue.tsx` screen.
3. In `authStore.logout()`, additionally remove `STORAGE_KEYS.COUNT_LINES_CACHE`, and either call `clearOfflineQueue()` (if the product rule is "counts must be synced before shift end") or leave the queue with the owner guard in place (safer — never destroys counts).
4. Add `COUNT_LINES_CACHE` to `clearReadCaches`.

**Recommendation:** implement steps 1, 2 and 4, and *not* an unconditional `clearOfflineQueue()` on logout — silently deleting unsynced counts would trade a P0 attribution bug for a P0 data-loss bug.

```text
Effort:              M (2-3 days incl. tests and supervisor-screen surfacing)
Dependencies:        FE-P1-001 (tests must run); coordinate with backend on whether it
                     already rejects count lines whose operator ≠ token subject
Validation method:   New Jest test: enqueue as user A → logout → login as B →
                     syncOfflineQueue() → assert 0 entries submitted, 1 quarantined;
                     assert count_lines_cache absent after logout;
                     manual two-operator device test
```

---

## P1 — High

### FE-P1-001 — 25 of 112 test suites cannot execute (all auth + sync-contract coverage dead)

```text
Finding ID:          FE-P1-001
Severity:            P1
Status:              OPEN — re-verified after the concurrent changes
Confidence:          Confirmed
Affected files:      jest.config.js:19 (transformIgnorePatterns)
Affected platforms:  CI / developer tooling
```

**Evidence** (re-verified run; the initial pass showed 26 failed — one fewer now that FE-P0-001 is fixed):

```
$ npm test                                   → exit 1
Test Suites: 25 failed, 87 passed, 112 total
Tests:       21 failed, 402 passed, 423 total

62 × SyntaxError: Unexpected token 'export'
  node_modules/.pnpm/@sentry+react-native@7.11.0_.../dist/js/index.js:1
  export { addBreadcrumb, ... } from '@sentry/core';
  at Object.require (src/store/authStore.ts:10:1)
```

```js
// jest.config.js:19 — allow-lists the deprecated package, not the current one
transformIgnorePatterns: [
  "node_modules/(?!(.pnpm/)?((jest-)?react-native|@react-native(-community)?|expo(nent)?|"
  + "@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|"
  + "@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg))",
//                        ^^^^^^^^^^^ present     @sentry/react-native ABSENT
],
```

Suites dead as a result include **every** auth suite:
`src/store/__tests__/authStore.logout.test.ts`, `authStore.biometric.test.ts`, `authStore.establishSession.test.ts`, `authStore.loadStoredAuthRace.test.ts`, `authStore.pendingRedirect.test.ts`, `tests/authStore.test.ts`, plus `tests/sync-engine-contract.test.ts`, `src/services/api/__tests__/inventoryWorkflowApi.offlineCount.test.ts`, and 18 others. Two further suites fail on FE-P0-001.

**Root cause:** `@sentry/react-native@7` ships untranspiled ESM. `authStore.ts:10` imports it, so anything transitively importing `authStore` — which is most of the app — fails to parse. The pattern was written for `sentry-expo` and never updated when `@sentry/react-native` was added.

**Operational impact:** 23% of the suite is silently dead. Logout cleanup, session establishment, load-race handling and the sync engine contract are unverified — the exact areas containing both P0s.

**Recommended remediation:** add `@sentry/react-native|@sentry/core|@sentry/[a-z-]+` to the `transformIgnorePatterns` negative-lookahead group. If FE-P1-003 is fixed first, drop `sentry-expo` from the pattern at the same time.

```text
Effort:              XS
Dependencies:        None
Validation method:   npm test → 0 failed suites (after FE-P0-001 also fixed)
```

---

### FE-P1-002 — Nine declared dependencies are neither installed nor used

```text
Finding ID:          FE-P1-002
Severity:            P1
Confidence:          Confirmed
Affected files:      package.json:152-159 (dependencies), :194-197 (devDependencies)
                     tailwind.config.js   (orphaned config that requires two of them)
Affected platforms:  Build / CI
```

**Evidence:**

```
$ for p in framer-motion nativewind tailwindcss @react-three/fiber \
           lucide-react-native @shopify/react-native-skia; do
    node -p "try{require('./node_modules/$p/package.json').version}catch(e){'NOT INSTALLED'}"
  done
NOT INSTALLED  (× 6, and likewise @react-three/drei, daisyui, @types/framer-motion)

$ grep -rn "from 'framer-motion'\|from 'nativewind'\|lucide-react-native\|react-native-skia" src app
src/docs/AI_UI_IMPLEMENTATION_GUIDE.md:58,101,127,150,...   ← markdown prose only
src/docs/SENIOR_UI_UX_ENGINEERING_STRATEGY_IMPLEMENTATION.md:338,501,722
(no .ts/.tsx hits)

$ npx knip
Unused dependencies (5): framer-motion, @react-three/fiber, @react-three/drei,
                         lucide-react-native, @shopify/react-native-skia
Unused devDependencies (1): @types/framer-motion
```

`nativewind`, `tailwindcss` and `daisyui` escaped knip only because `tailwind.config.js` is matched by knip's `*.config.js` entry pattern and `require`s them — but that file is **not referenced by `metro.config.js` or `babel.config.js`**, so NativeWind is not wired into the build at all. It is dead configuration that would throw if any tool actually loaded it.

**Current behaviour:** `package.json` and `pnpm-lock.yaml` disagree with the installed tree. A clean `npm ci` / `pnpm install` on CI or a new machine installs a three.js renderer, Skia (a native module), Framer Motion (a React-DOM animation library, unusable in React Native) and a Tailwind/DaisyUI toolchain — none of which any source file imports.

**Expected behaviour:** `package.json` lists only what the app uses.

**Root cause:** An aspirational UI/UX modernisation plan (documented in `src/docs/AI_UI_IMPLEMENTATION_GUIDE.md` and the root-level `FULL_APP_UI_UX_IMPROVEMENTS_SUMMARY.md`, dated 2026-08-02) added the dependency declarations and `tailwind.config.js` without installing or adopting them.

**Operational impact:** Install-time bloat and CI/local divergence today; native build risk once Skia is actually installed (it is a native module requiring a config plugin that is not present); `@types/framer-motion` is additionally a deprecated stub — Framer Motion ships its own types.

**Recommended remediation:** remove all 9 declarations and delete `tailwind.config.js`. If NativeWind adoption is genuinely planned, do it as a separate, complete change (install + `metro.config.js` `withNativeWind` + `babel.config.js` preset + `global.css`), not as a dangling manifest entry.

```text
Effort:              XS
Dependencies:        None
Validation method:   npx knip reports 0 unused dependencies;
                     npm run build:web still succeeds;
                     pnpm-lock.yaml regenerates without the 9 packages
```

---

### FE-P1-003 — Duplicate Sentry SDK: two native module versions and two Expo config plugins

```text
Finding ID:          FE-P1-003
Severity:            P1
Confidence:          Confirmed
Affected files:      package.json:120 (@sentry/react-native ^7.11.0), :146 (sentry-expo ^7.0.1)
                     app.json:70-77 (both plugins registered)
Affected platforms:  iOS, Android (native builds)
```

**Evidence:**

```
$ npx expo-doctor
17/19 checks passed. 2 checks failed.

✖ Check that required peer dependencies are installed
  Missing peer dependency: expo-application   (required by sentry-expo)
  Missing peer dependency: expo-device        (required by sentry-expo)
  Your app may crash outside of Expo Go without these dependencies.

✖ Check that no duplicate dependencies are installed
  Found duplicates for @sentry/react-native:
    ├─ @sentry/react-native@7.11.0
    └─ @sentry/react-native@5.5.0  (via sentry-expo@7.0.1)
```

```jsonc
// app.json:70-77 — both registered
"plugins": [
  ["sentry-expo", { "organization": "${SENTRY_ORG}", "project": "${SENTRY_PROJECT}" }],
  "@sentry/react-native"
]
```

**Current behaviour:** `expo-doctor` fails. Two versions of a native module are present; two config plugins both attempt to configure Sentry native initialisation and source-map upload.

**Expected behaviour:** One Sentry SDK, one plugin.

**Root cause:** `sentry-expo` is the legacy wrapper, superseded by `@sentry/react-native` for Expo SDK 50+. The migration added the new package without removing the old one. `app/_layout.tsx:8` imports only `@sentry/react-native`, confirming `sentry-expo` is not used in application code.

**Operational impact:** Native builds may only contain one version of a native module — this can fail the EAS build outright or produce non-deterministic crash reporting. The missing `expo-application` / `expo-device` peers are flagged as a potential crash outside Expo Go.

**Recommended remediation:** remove `sentry-expo` from `package.json` dependencies and from `app.json` `plugins`; also remove `sentry-expo` from `jest.config.js` `transformIgnorePatterns` when applying FE-P1-001.

```text
Effort:              XS
Dependencies:        Apply together with FE-P1-001 (same transformIgnorePatterns line)
Validation method:   npx expo-doctor → 19/19 passed;
                     EAS build succeeds for iOS and Android;
                     a deliberate test exception appears in Sentry
```

---

### FE-P1-004 — DI container backed by a mock HTTP client is imported by two production-named services

```text
Finding ID:          FE-P1-004
Severity:            P1
Confidence:          Confirmed
Affected files:      apps/mobile/src/di/container.ts:8-15, :30-32, :47
                     src/services/sync/background-sync-scheduler.ts:3   (importer)
                     src/services/navigation/navigation-service.ts:3    (importer)
Affected platforms:  iOS, Android, Web
```

**Evidence:**

```ts
// apps/mobile/src/di/container.ts:8-15
// Mock HTTP client implementation for now - would be replaced with actual implementation
class MockHttpClient {
  async get<T>(url: string)  { return { data: {} as T, status: 200, statusText: 'OK', headers: {} }; }
  async post<T>(url: string, data?: any) { return { data: {} as T, status: 200, ... }; }
  async put<T>(...)   { ... status: 200 ... }
  async patch<T>(...) { ... status: 200 ... }
  async delete<T>(...){ ... status: 200 ... }
}

// :30-32 — injected into the sync engine, at module scope
const httpClient  = new MockHttpClient() as any;
const syncEngine  = Platform.OS === 'web' ? ({...} as any) : new SQLiteSyncEngine(httpClient);
const scanner     = new KeyboardWedgeScanner();   // side-effectful construction on import

// :47
export const container = new MobileDIContainer();
```

```
$ grep -rn "navigation-service\|background-sync-scheduler" src app | grep -v /docs/
(no results — neither importer is itself referenced)
```

**Current behaviour:** The container is instantiated at module load whenever either importer is loaded. Because neither importer has any consumer, the code is **dormant** — there is no live impact today.

**Expected behaviour:** No production module graph should contain an HTTP client that fabricates `status: 200` responses.

**Root cause:** A ports-and-adapters scaffold (`apps/` + `packages/`, created 2026-08-02) was started and left incomplete: 14 empty directories, a mock transport, and a typecheck error (FE-P1-009).

**Operational impact:** Latent, high-severity. `SQLiteSyncEngine` constructed with `MockHttpClient` reports every queued operation as succeeding while discarding the payload. The file names (`background-sync-scheduler`, `navigation-service`) read as production infrastructure; a future developer wiring either one would introduce **silent inventory data loss** with no error surface. Additionally `new KeyboardWedgeScanner()` runs at import time, an unwanted side effect.

**Recommended remediation:** Decide the scaffold's fate.
- If abandoned: delete `apps/` and `packages/`, delete the two orphan services, and remove the `@stock-verification/*` aliases from `tsconfig.json`.
- If intended: remove `MockHttpClient` entirely so an unconfigured container throws loudly, inject the real `httpClient` from `src/services/httpClient.ts`, make container construction lazy, and fix FE-P1-009.

```text
Effort:              S (delete)  /  L (complete)
Dependencies:        Product/architecture decision on the monorepo direction
Validation method:   grep for MockHttpClient returns 0 hits in shipped code;
                     npx tsc --noEmit exits 0
```

---

### FE-P1-005 — Eight unlinked duplicate screens remain URL-addressable routes

```text
Finding ID:          FE-P1-005
Severity:            P1
Confidence:          Confirmed
Affected files:      app/improved-login.tsx            (646 LOC)
                     app/improved-help.tsx             (522)
                     app/improved-welcome.tsx          (359)
                     app/staff/improved-home.tsx       (541)
                     app/staff/improved-scan.tsx       (521)
                     app/staff/improved-settings.tsx   (493)
                     app/supervisor/improved-dashboard.tsx (734)
                     app/admin/dashboard-web.tsx       (568)
                     Total: 4,384 LOC
Affected platforms:  Web (URL-addressable), iOS/Android (bundle weight)
```

**Evidence:**

```
$ grep -rn "improved-login\|improved-welcome\|improved-help\|improved-home\|\
improved-scan\|improved-settings\|improved-dashboard" app src | grep -v /docs/ \
  | grep -v "^app/improved\|^app/staff/improved\|^app/supervisor/improved"
(no results — zero inbound links)
```

**Current behaviour:** expo-router registers every file under `app/` as a navigable route. `/improved-login`, `/staff/improved-scan` etc. resolve on web even though nothing links to them. All 8 are compiled into the bundle on every platform.

**Expected behaviour:** One canonical implementation per screen; no orphan routes.

**Root cause:** A UI/UX refresh created parallel `improved-*` implementations intended to replace the originals. The cut-over never happened and the originals remain the linked versions.

**Operational impact:**
- **Security/UX:** `/improved-login` is a second, unmaintained authentication form outside the tested login path (`__tests__/login.test.tsx` covers `app/login.tsx` only). It is reachable by anyone who guesses or is sent the URL.
- **Maintenance:** every design-system or auth change must be applied twice or silently diverges. `improved-login.tsx` and `login.tsx` are both 646 LOC — near-identical twins.
- **Bundle:** ~4,384 LOC of never-executed screen code ships to every device.

**Recommended remediation:** Diff each `improved-*` against its canonical counterpart; port any genuinely wanted improvement into the canonical file; delete all 8. Then extend `app/__tests__/route-hygiene.test.ts` with a fourth assertion that every non-`_layout`, non-`index`, non-`+not-found` route file is referenced by at least one `router.push`/`<Link>`/`<Redirect>` in the tree.

```text
Effort:              M (diff + port + delete + guard test)
Dependencies:        None
Validation method:   route-hygiene test fails if an unlinked route reappears;
                     npm run build:web bundle size decreases;
                     e2e auth spec still passes
```

---

### FE-P1-006 — Shipped semantic colour tokens fail WCAG AA contrast

```text
Finding ID:          FE-P1-006
Severity:            P1
Confidence:          Confirmed (ratios computed from the token source)
Affected files:      src/theme/unified/colors.ts:122-194 (semanticColors)
                     src/theme/unified/colors.ts:199-227 (darkColors)
Affected platforms:  iOS, Android, Web — every screen
```

**Evidence** — WCAG 2.1 relative-luminance ratios computed from the exact token values:

| Token pair | Foreground | Background | Ratio | AA (4.5:1) |
|---|---|---|---:|---|
| `text.muted` / `text.disabled` on surface | `neutral[400]` `#94A3B8` | `#FFFFFF` | **2.56** | ❌ FAIL |
| `input.placeholder` on input background | `#94A3B8` | `#FFFFFF` | **2.56** | ❌ FAIL |
| `button.disabledText` on `button.disabled` | `#94A3B8` | `neutral[200]` `#E2E8F0` | **2.08** | ❌ FAIL |
| White label on `status.success` | `#FFFFFF` | `success[500]` `#22C55E` | **2.28** | ❌ FAIL |
| White label on `status.warning` | `#FFFFFF` | `warning[500]` `#F59E0B` | **2.15** | ❌ FAIL |
| White label on `secondary[500]` | `#FFFFFF` | `#06B6D4` | **2.43** | ❌ FAIL |
| White label on `status.error` | `#FFFFFF` | `error[500]` `#EF4444` | 3.76 | ⚠️ large text only |
| White label on `status.info` | `#FFFFFF` | `info[500]` `#3B82F6` | 3.68 | ⚠️ large text only |
| Dark mode `text.disabled` | `neutral[600]` `#475569` | `neutral[900]` `#0F172A` | **2.36** | ❌ FAIL |
| `text.secondary` on surface | `neutral[600]` `#475569` | `#FFFFFF` | 7.58 | ✅ pass |
| `text.tertiary` on surface | `neutral[500]` `#64748B` | `#FFFFFF` | 4.76 | ✅ pass |
| White on `primary[500]` | `#FFFFFF` | `#0655A5` | 7.37 | ✅ pass |

**Current behaviour:** Placeholder text, hint text, disabled controls and success/warning status chips render at 2.1-2.6:1.

**Expected behaviour:** ≥4.5:1 for normal text, ≥3:1 for large text and non-text UI indicators (WCAG 1.4.3 / 1.4.11).

**Root cause:** The palette was chosen for aesthetic hierarchy; contrast was never validated. There is no contrast check in the governance scanner (which checks *whether* a token is used, not *what it contrasts against*).

**Operational impact:** Warehouse handhelds are used under mixed and often harsh lighting. Placeholders and disabled-state cues become invisible; a white-on-amber "WARNING" chip — the highest-stakes status in a counting app — is the single worst offender at 2.15:1. Affects every low-vision operator and every operator in glare.

**Recommended remediation:**
- `text.muted`, `text.disabled`, `input.placeholder`: `neutral[400]` → `neutral[500]` `#64748B` (4.76:1).
- `button.disabledText`: use `neutral[600]` `#475569` on `neutral[200]` (4.71:1), and additionally convey disabled state via `accessibilityState={{ disabled: true }}` rather than colour alone.
- Status chips: either dark text on the `*[100]` tint (e.g. `warning[900]` on `warning[100]`) or white text on `*[700]`. Never white on `*[500]` for amber/green/cyan.
- Dark mode `text.disabled`: `neutral[600]` → `neutral[500]`.
- Add an automated contrast assertion to `scripts/check-ui-governance.cjs` so regressions are caught in CI.

```text
Effort:              S (token change) + M (audit call-sites, add CI check)
Dependencies:        None — token-level change propagates automatically to the 87
                     files importing @/theme/unified
Validation method:   Automated ratio assertion in the governance script;
                     manual verification with iOS/Android accessibility inspectors
```

---

### FE-P1-007 — The project's own UI governance health gate is failing

```text
Finding ID:          FE-P1-007
Severity:            P1
Confidence:          Confirmed
Affected files:      app/improved-help.tsx:413            (UI002 hardcoded colour)
                     src/components/ui/ModernHeaderWithLogout.tsx:130 (UI002)
                     src/components/auth/UniversalLogout.tsx:130      (UI007 generic error copy)
                     reports/ui-governance-health-baseline.json
Affected platforms:  CI
```

**Evidence:**

```
$ node ./scripts/check-ui-governance-health.cjs
UI governance health
Status: FAIL

Hard gates
- FAIL Blocking P0/P1 findings: 3 (limit 0)
- FAIL P1 findings: 3 (limit 0)

Advisory trend gates
- WARN Token adoption estimate: 61% (floor 65%)
- WARN Reduced-motion coverage: 9% (floor 11%)
- PASS Total governance findings: 632 (limit 1211)
```

The 3 blocking P1s:

```
P1 UI002 app/improved-help.tsx:413                    backgroundColor: "#f5f5f5"
P1 UI002 src/components/ui/ModernHeaderWithLogout.tsx:130  backgroundColor: "#f0f0f0"
P1 UI007 src/components/auth/UniversalLogout.tsx:130
         "An error occurred during logout"  → Failure states must say what failed,
         why when known, what the user can do next, and how to retry.
```

**Root cause:** All 3 sit in files that are themselves defects — two are in dead/duplicate files (`improved-help.tsx` per FE-P1-005; `ModernHeaderWithLogout.tsx` has zero consumers), and the third is in the broken `UniversalLogout` (FE-P0-001). Fixing FE-P0-001 and FE-P1-005 clears all three.

**Operational impact:** `npm run ci` cannot pass, so no change can be merged through the intended gate. Token adoption has also regressed 4 points below the agreed floor.

**Recommended remediation:** Resolve FE-P0-001 and FE-P1-005 (which removes 2 of 3 findings and the file containing the third); replace the generic logout error string with specific copy per failure mode. Then resume token migration to clear the 61% → 65% adoption warning.

```text
Effort:              XS (given FE-P0-001 and FE-P1-005 are fixed)
Dependencies:        FE-P0-001, FE-P1-005
Validation method:   npm run governance:ui:health → Status: PASS
```

---

### FE-P1-008 — Four mutually inconsistent brand primaries; 14 files mix a light and a dark palette

```text
Finding ID:          FE-P1-008
Severity:            P1
Confidence:          Confirmed
Affected files:      src/theme/unified/colors.ts:25   colors.primary[500]      = #0655A5
                     src/theme/unified/colors.ts:260  legacyColors.primary[500]= #3B82F6
                     app.json:9                       primaryColor             = #3B82F6
                     tailwind.config.js:16            primary.500              = #3b82f6
                     + 14 files importing both palettes (listed below)
Affected platforms:  iOS, Android, Web
```

**Evidence** — `legacyColors` is a **dark** palette living beside a **light** one in the same module:

```ts
// unified/colors.ts:135-144 — semanticColors: LIGHT
background: { primary: colors.neutral[0] /* #FFFFFF */, ... }
text:       { primary: colors.neutral[900] /* #0F172A */, ... }

// unified/colors.ts:365-398 — legacyColors: DARK
background: { default: "#020617", paper: "#0F172A", elevated: "#1E293B", ... }
text:       { primary: "#F8FAFC", secondary: "#94A3B8", ... }
```

Files importing **both** the light unified tokens (`semanticColors` / `useUiTokens`) and the dark `legacyColors` (usually aliased `modernColors`):

```
src/components/ui/ModernButton.tsx
src/components/modals/PhotoCaptureModal.tsx
src/components/modals/PinEntryModal.tsx
src/components/charts/SimpleLineChart.tsx
src/components/scan/LocationVerificationSection.tsx
src/components/supervisor/RecountAssignmentModal.tsx
src/components/supervisor/dashboard/SupervisorStatsSection.tsx
src/components/supervisor/dashboard/SupervisorActivitySection.tsx
src/components/supervisor/dashboard/SupervisorRecentSessionsSection.tsx
src/components/supervisor/dashboard/SupervisorOverviewCard.tsx
src/components/supervisor/dashboard/ImprovedSupervisorDashboard.tsx
src/components/supervisor/dashboard/CreateSessionModal.tsx
app/supervisor/dashboard.tsx
app/supervisor/improved-dashboard.tsx
```

Concrete theme bypass in `ModernButton.tsx:86-94` — the primary variant resolves to a **static** colour while every other variant follows the **runtime** theme:

```ts
const primaryBackground   = theme?.isDark ? colors.primary[500] : semanticColors.button.primary; // static
const secondaryBackground = themedColors?.surfaceElevated ?? semanticColors.button.secondary;    // runtime
```

**Current behaviour:** Brand blue is `#0655A5` on token-migrated screens and `#3B82F6` on `legacyColors` screens. Splash screen and OS chrome use `#3B82F6` (`app.json`). Under a non-default theme, `ModernButton`'s primary stays `#0655A5` while its surroundings re-theme.

**Expected behaviour:** One primary, sourced from one place, honouring the active theme.

**Root cause:** An incomplete migration from a dark-first "modern" palette to a light-first unified palette. The compatibility shim (`legacyColors`) was intended as temporary and became permanent.

**Operational impact:** Visible brand inconsistency between screens; risk of low-contrast or invisible text where a dark-palette colour lands on a light-palette surface; theme switching is partially broken.

**Recommended remediation:** Migrate the 14 files off `legacyColors`/`modernColors` onto `useUiTokens()`; delete `legacyColors`, `legacyTheme` and the other `legacy*` exports from `src/theme/unified/`; set `app.json` `primaryColor` to `#0655A5`; delete `tailwind.config.js` (FE-P1-002). Add a `no-restricted-imports` pattern banning `legacyColors`/`legacyTheme` once migration completes — mirroring the existing rule that already bans `theme/modernDesign` and `theme/legacyCompat`.

```text
Effort:              L (14 files + token deletion + lint rule)
Dependencies:        FE-P1-005 removes 2 of the 14 files outright
Validation method:   grep for legacyColors/legacyTheme returns 0 hits outside src/theme;
                     governance token-adoption estimate rises above the 65% floor;
                     visual regression via e2e/visual.spec.ts
```

---

### ✅ FE-P1-009 — RESOLVED DURING AUDIT — Typecheck error in `apps/mobile` auth service

```text
Finding ID:          FE-P1-009
Severity:            P1 (resolved)
Status:              ✅ RESOLVED during audit by a concurrent process
Confidence:          Confirmed
Affected files:      apps/mobile/src/shared/auth/AuthService.ts:204
Affected platforms:  CI
Re-verified:         npx tsc --noEmit → exit 0
```

> **This does not resolve FE-P1-004.** The `MockHttpClient` in `apps/mobile/src/di/container.ts` is still present and still injected into `SQLiteSyncEngine`. Only the type error was fixed.

**Evidence:**

```
$ npx tsc --noEmit
apps/mobile/src/shared/auth/AuthService.ts(204,18): error TS2339:
  Property 'createAuthInterceptor' does not exist on type 'AuthService'.
```

`AuthService.ts:204` declares `export const createAuthInterceptor = (axiosInstance?: AxiosInstance) => {...}` which calls `getAuthService()` (returning the `AuthService` interface) and then `service.attachAuthHeaders(config)`; the interface and implementation have diverged.

**Root cause:** Part of the incomplete `apps/` scaffold (FE-P1-004). `tsconfig.json` `include` is `["**/*.ts", "**/*.tsx", ...]` with no `apps/` exclusion, so the incomplete scaffold blocks the whole typecheck.

**Operational impact:** `npm run typecheck` and therefore `npm run ci` fail independently of FE-P0-001.

**Recommended remediation:** Resolve alongside FE-P1-004 — delete the scaffold, or fix the `AuthService` interface to declare the members its consumers use. Do **not** simply add `apps/` to `tsconfig` `exclude` while the container is still imported by `src/services/`; that hides a real error in reachable code.

```text
Effort:              XS
Dependencies:        FE-P1-004 decision
Validation method:   npx tsc --noEmit exits 0
```

---

### FE-P1-010 — Dynamic status changes are not announced to screen readers

```text
Finding ID:          FE-P1-010
Severity:            P1
Confidence:          Confirmed (measurement) / Requires runtime verification (VoiceOver/TalkBack)
Affected files:      src/components/feedback/Toast.tsx, ToastProvider.tsx
                     src/components/ui/OfflineStatusIndicator.tsx
                     src/components/scan/* (scan result surfaces)
                     app/supervisor/offline-queue.tsx, sync-conflicts.tsx
Affected platforms:  iOS (VoiceOver), Android (TalkBack), Web (ARIA live regions)
```

**Evidence** — measured across 209 non-test component/screen files:

| Mechanism | Occurrences |
|---|---:|
| `accessibilityLiveRegion` | 8 |
| `AccessibilityInfo.announceForAccessibility` | 1 |
| `accessibilityHint` | 13 |
| Files with any `accessibilityLabel` | 87 / 209 (42%) |

**Current behaviour:** Toasts, sync-status transitions, offline/online changes and scan outcomes render visually with no programmatic announcement.

**Expected behaviour:** WCAG 2.1 SC 4.1.3 (Status Messages, AA) — status changes that do not receive focus must be programmatically determinable and announced.

**Root cause:** Accessibility work concentrated on static labelling (`AppTouchable` enforces labels on touchables) without covering dynamic state.

**Operational impact:** This app's entire feedback model is status-driven: "counted", "queued offline", "synced", "sync failed", "duplicate scan", "variance detected". A blind or low-vision operator receives **none** of it and cannot tell whether a count was recorded. Combined with FE-P1-006 (low-contrast status chips), status is effectively inaccessible through both the visual and the assistive channel.

Related: `themes.ts:672` defines a `highContrast` theme, but `ThemeContext.tsx:170-173` `THEME_METADATA` exposes only `light` and `dark` — an accessibility theme was built and never made selectable.

**Recommended remediation:**
1. `accessibilityLiveRegion="polite"` (+ `role="status"` on web) on `Toast` and `OfflineStatusIndicator`.
2. `accessibilityLiveRegion="assertive"` for sync failures and duplicate-scan warnings.
3. `AccessibilityInfo.announceForAccessibility()` after each scan resolves, stating item and quantity.
4. Add `highContrast` to `THEME_METADATA` so the existing theme becomes reachable.
5. Add an accessibility assertion suite covering the scan → save → sync path.

```text
Effort:              M
Dependencies:        None
Validation method:   Manual VoiceOver and TalkBack pass over scan → save → offline → sync;
                     axe-core assertions in the Playwright web suite
```

---

## P2 — Medium

| ID | Finding | Confidence | Evidence | Impact | Remediation | Effort |
|---|---|---|---|---|---|---|
| **FE-P2-001** | Parallel unfinished architecture: `apps/` + `packages/` duplicate storage/sync/scanner concerns already implemented in `src/services/`; 14 empty directories | Confirmed | `find apps packages -type d -empty` → 14; `packages/core/domain`, `packages/core/entities`, `apps/mobile/src/core/{security,networking,platform,persistence,telemetry}`, `apps/mobile/src/features/{discrepancies,reporting,recount,verification}`, `apps/mobile/src/shared/{permissions,audit}` | Two architectures describing the same concerns; onboarding confusion; dead `tsbuildinfo` artefacts committed | Delete or complete; see FE-P1-004 | M |
| **FE-P2-002** | 7 modules exceed 900 LOC with mixed responsibilities | Confirmed | `inventoryWorkflowApi.ts` 1305, `SessionDetailScreen.tsx` 1144, `SerialScannerModal.tsx` 1082, `authStore.ts` 1000, `offlineStorage.ts` 998, `StaffHomeScreen.tsx` 951, `syncService.ts` 839 | `SessionDetailScreen` and `SerialScannerModal` mix fetching, business rules and presentation → hard to test, high regression risk | Extract data hooks and presentational children; target < 400 LOC per screen | L |
| **FE-P2-003** | `authStore.clearAuth` is a dead ~85-line near-duplicate of `logout` | Confirmed | `authStore.ts:703-786` vs `:614-701`; `grep clearAuth` → only unrelated `clearAuthToken` in `navigation-service.ts:80` | Two logout implementations, one dead — directly contributed to FE-P0-001 going unnoticed | Delete `clearAuth`; keep `logout` as the single path | XS |
| **FE-P2-004** | Every logout cleanup step is `catch { /* Best-effort */ }` with no user-visible signal | Confirmed | `authStore.ts:637,655,660,668,677,685,693` — 7 swallowed blocks | A failed teardown reports success; residual user data persists silently | Aggregate failures; surface a "sign-out incomplete — data may remain on this device" warning and log to Sentry | S |
| **FE-P2-005** | Idempotency key falls back to `Date.now()_Math.random()` when no stable key can be derived | High confidence | `offlineStorage.ts:294-297` `buildQueueItemId`; `:299-340` `resolveIdempotencyKey` returns `undefined` for `unknown_item` without a stable field | A retry after app restart may generate a different key → duplicate `unknown_item` submissions | Derive a deterministic key from payload content (e.g. hash of barcode + session + timestamp bucket) | S |
| **FE-P2-006** | No request cancellation anywhere | Confirmed | `grep AbortController\|signal:` across `src/services` → 0 hits | Abandoned screens complete their fetches; wasted mobile data and battery; late responses can update unmounted state | Attach `AbortController` in the query layer; abort on unmount | M |
| **FE-P2-007** | Two parallel animation stacks | Confirmed | `react-native-reanimated` in 62 files; RN core `Animated` in 62 files | Two motion vocabularies and easing conventions; larger bundle; inconsistent feel | Standardise on Reanimated; migrate RN `Animated` except in `_layout.tsx` boot overlay | L |
| **FE-P2-008** | 25 infinite `withRepeat` animations with 9% reduced-motion coverage | Confirmed | `grep withRepeat` → 25; governance reduced-motion coverage 9% vs 11% floor; 64 UI016 inline-timing findings | Continuous GPU work on warehouse handhelds (battery); vestibular-accessibility problem; decorative motion reduces operational clarity | Gate every `withRepeat` behind `AccessibilityInfo.isReduceMotionEnabled()`; replace decorative loops with static states | M |
| **FE-P2-009** | `biometric_pin_hash` written to `localStorage` on web | Confirmed | `secureStorage.ts:42` `localStorage.setItem(\`${key}_hash\`, hashedValue)`; `:114` read-back | A hash, not a PIN — but offline-attackable if the hash is fast/unsalted. Web tokens are correctly memory-only, so this is the one persisted credential artefact | Disable biometric-PIN storage on web, or use a slow salted KDF and document the threat model | S |
| **FE-P2-010** | Role gating is UI-only while 8 duplicate routes are directly URL-addressable | Confirmed (frontend) / **Backend responsibility** | `app/supervisor/_layout.tsx:67`, `MobileNavDrawer.tsx:45`, `SupervisorSidebar.tsx:173`; FE-P1-005 routes | Hidden controls remain technically executable. Correct as *UI*; requires independent server-side authorisation | Confirm the backend authorises every endpoint by role regardless of client; treat all client role checks as presentation only | S (verification) |
| **FE-P2-011** | ATS relaxed for local network in production config | Confirmed | `app.json:31-33` `NSAllowsArbitraryLoadsInLocalNetwork: true` | Permits cleartext HTTP to local-network hosts. Justified for on-prem backends; a risk if unintended | Confirm intentional; document in the release checklist | XS |
| **FE-P2-012** | No OTA channel, no iOS EAS profile, no development profile | Confirmed | `app.json` has no `runtimeVersion`/`updates`; `eas.json` defines only `preview` and `production`, both Android-only | No hotfix path for a shipped defect; iOS builds unconfigured | Add `runtimeVersion`, `expo-updates` channels, and iOS + development EAS profiles | S |
| **FE-P2-013** | A TypeScript language-service plugin suppresses a class of RN diagnostics in-editor | Confirmed | `tsconfig.json:38-42` → `typescript-plugin-filter-text-errors.js:23-35` filters `"must be rendered within a <Text/>"` from `getSemanticDiagnostics` | `tsc --noEmit` ignores plugins so CI is unaffected, but developers are shown a filtered error set; real "string outside `<Text>`" bugs are invisible in-editor | Remove the plugin and fix the underlying false positives, or narrow it to specific files with a documented justification | S |
| **FE-P2-014** | `knip` is configured so broadly that it cannot detect unused *files* | Confirmed | `knip.json:4-22` lists 13 `src/**` globs as **entry points**, including `src/components/**`, `src/services/**`, `src/hooks/**` — everything is an entry, so nothing is unreachable | The dead-code gate reports 0 unused files while 4,384 LOC of unlinked routes (FE-P1-005) and several dead components exist | Reduce `entry` to `app/**`, `scripts/**`, `*.config.*`, `e2e/**` and stories; let `project` cover the rest | S |
| **FE-P2-015** | Three components import restricted `TouchableOpacity`, bypassing the accessibility wrapper | Confirmed | `src/components/ui/EnhancedScanInput.tsx:7`, `OfflineStatusIndicator.tsx:2`, `StandardizedErrorCard.tsx:2` — these are 3 of the 4 lint **errors** | `AppTouchable` exists specifically to guarantee touch-target size and accessibility props; these three opt out. `StandardizedErrorCard` is used by 10 files, so the gap is widely distributed | Migrate to `AppTouchable` | XS |
| **FE-P2-016** | 33 files render `.map()` inside a `ScrollView` (virtualisation coverage 21%) | High confidence | `grep -l ".map(" | xargs grep -l ScrollView` → 33; governance virtualisation coverage 21% (floor 19%) | Not all are long lists, but any unbounded collection rendered this way degrades with data volume — a real risk on session/variance/item screens | Audit the 33; convert unbounded collections to `FlashList` | M |
| **FE-P2-017** | **NEW** — the fix applied to FE-P0-001 introduces an incomplete force-logout path | Confirmed | `src/services/auth/logoutService.ts` force branch: `useAuthStore.setState({ user: null, isAuthenticated: false } as any)` — clears 2 state fields only, skipping secure storage, TanStack Query cache, notification store, scan-session store, recent items and read caches that `authStore.logout()` clears. Declared `LogoutOptions` fields `clearCache`, `redirectPath`, `checkPendingWork` are never read | A forced logout leaves the previous user's tokens and cached data on the device **while reporting `success: true`**. Directly compounds FE-P0-002 | Call `authStore.logout()` (or a `forceTeardown()` running the same cleanup while ignoring network errors) in the force branch; remove the `as any`; implement or drop the unused options | XS |

---

## P3 — Low

| ID | Finding | Confidence | Evidence | Remediation | Effort |
|---|---|---|---|---|---|
| **FE-P3-001** | 14 empty directories committed | Confirmed | `src/api`, `src/services/auth`, `packages/core/domain`, `packages/core/entities`, + 10 under `apps/mobile/src/` | Delete (note: `src/services/auth` must instead be *populated* per FE-P0-001) | XS |
| **FE-P3-002** | `tsconfig.json` path aliases point at non-existent directories | Confirmed | `tsconfig.json` maps `@stock-verification/ui-components` → `./packages/ui-components` and `@stock-verification/types` → `./packages/types`; `packages/` contains only `core/` and `shared/` | Remove the two dead aliases | XS |
| **FE-P3-003** | Unapplied patch file committed into the routes directory | Confirmed | `app/staff/item-detail.tsx.patch` — a unified diff adding `BatchVariantData`, `createCountLine`, `toastService`, `Haptics` imports. `route-hygiene.test.ts` only inspects `.tsx/.ts/.jsx/.js`, so it slips through | Apply the change or delete the file; extend the hygiene test to reject non-source files under `app/` | XS |
| **FE-P3-004** | Offline queue growth is unbounded past `maxQueueSize` | Confirmed | `offlineStorage.ts:412-417` — logs `"Offline queue exceeded advisory limit; preserving all entries"` and keeps everything | Deliberate and correct (never drop counts), but add a user-visible warning and a supervisor escalation path when the advisory limit is passed | S |
| **FE-P3-005** | 37 `console.log` (only 16 `__DEV__`-guarded) and 162 `console.error` in production code | Confirmed | `babel.config.js:17-19` strips console only in the `production` babel env, so non-production profiles leak diagnostics | Route through the existing `log` service; keep the babel strip as defence in depth | S |
| **FE-P3-006** | 3 dead theme definitions (~300 LOC) and an unreachable high-contrast theme | Confirmed | `themes.ts` defines `light`, `dark`, `premium`, `ocean`, `sunset`, `highContrast`; `ThemeContext.tsx:170-173` `THEME_METADATA` exposes only `light` + `dark`; no code references `premium`/`ocean`/`sunset` outside the `ThemeKey` union | Delete `premium`/`ocean`/`sunset`; **expose `highContrast`** in `THEME_METADATA` (this is also an accessibility win — see FE-P1-010) | S |
| **FE-P3-007** | Coverage floor pinned at 19% statements / 13% branches | Confirmed | `jest.config.js:38-45` with a comment noting it sits just below the measured baseline | Appropriate as a ratchet, far too low as a release gate for inventory integrity. Raise incrementally; require 80%+ on `authStore`, `offlineStorage`, `syncService` specifically | L |

---

## Appendix A — Executed commands and raw results

| Command | Exit | Result |
|---|---:|---|
| `npx tsc --noEmit` | 1 | 2 errors (FE-P0-001, FE-P1-009) |
| `npx expo lint -- --no-error-on-unmatched-pattern` | 1 | 121 problems: 4 errors, 117 warnings |
| `node ./scripts/check-ui-governance.cjs --changed --strict` | 1 | Governance failures present |
| `npm test` | — | 26/112 suites failed; 22/423 tests failed |
| `npm run build:web` | 1 | Bundling failed at 2423/2423 modules |
| `npx expo-doctor` | — | 17/19 checks passed; 2 failed |
| `npx knip` | 0 | 5 unused deps, 1 unused devDep, 1 unresolved import, 1 duplicate export |
| `node ./scripts/check-ui-governance.cjs --report` | — | 632 findings (P1: 3, P2: 629) |
| `node ./scripts/check-ui-governance-health.cjs` | — | Status: FAIL |
| `node ./scripts/check-runtime-convergence.cjs` | — | Status: WARN (AppState listeners 5 > limit 4) |
| `npm install` | — | **Not run** — would mutate the lockfile during a read-only audit. Installed tree inspected via `node -p require('<pkg>/package.json').version` instead. |
