# Frontend Comprehensive Audit Report

**Target:** `Stock_final/frontend` (Lavanya Mart Stock Verify, v2.1.0)
**Audit date:** 2026-08-02
**Auditor role:** Senior Frontend Architect / UI-UX Auditor / Accessibility Specialist / Mobile Performance Engineer / Design-System Governance Reviewer
**Scope:** iOS, Android, Web (Expo Router universal app)
**Method:** Static inspection of ~540 TS/TSX files plus execution of the repository's own verification and governance gates. This audit modified no source files.

> ### ⚠️ Concurrency notice — read first
>
> **Another process was modifying this repository during the audit.** Two things happened between 15:38 and 15:53 on 2026-08-02:
>
> 1. The repository was **restructured**: the contents of `Stock_final/` were moved up into the workspace root, so the frontend now lives at `frontend/` rather than `Stock_final/frontend/`. File paths in these reports use the **current** location.
> 2. A concurrent agent **wrote its own copies of all seven deliverable filenames to the workspace root** (`/Users/noufi1/stk_final/*.md`, timestamped 15:38). Those files are **not** part of this audit and have been left untouched. **This audit's deliverables are the copies in `frontend/`.**
> 3. That same process **fixed FE-P0-001 and FE-P1-009 while the audit was in progress.** Both were re-verified as resolved at 16:0x and are recorded below as *Resolved during audit*. Every other finding was re-verified against the post-change tree and **still stands**.

---

## A. Executive Summary

### Verdict

> ## ❌ NOT PRODUCTION READY
>
> The build blocker (FE-P0-001) was **fixed during this audit by a concurrent process** — `npx tsc --noEmit` and `npm run build:web` both now exit 0, re-verified. That removes the release-stopping bundler failure.
>
> **The application remains not production ready** on the strength of the second, still-unfixed P0: the offline write queue and count-line cache are **never cleared on logout and carry no user ownership**, so on a shared warehouse device one operator's pending counts flush under the next operator's session — mis-attributing inventory counts and exposing one operator's cached count lines to another.
>
> Three further gates also still fail: 25 of 112 test suites cannot execute (including **every** `authStore` suite), `expo-doctor` reports a duplicate Sentry native module, and the project's own `governance:ui:health` gate reports `FAIL`.

### Health ratings

| Dimension | Rating | Basis |
|---|---:|---|
| **Overall frontend health** | **4.5 / 10** | Strong service/API layer and governance tooling, undermined by a broken build and an unscoped offline queue |
| UI consistency | 6.5 / 10 | Real shared primitive set; 8 unlinked duplicate screens and 3 header variants remain |
| UX quality | 6.0 / 10 | Workflows are complete and recoverable; logout journey is broken, sync status is under-communicated |
| Design-system maturity | 5.5 / 10 | Genuine token system with CI enforcement, but 61% adoption and 4 competing colour palettes |
| Accessibility | 4.0 / 10 | 42% label coverage, AA contrast failures in shipped tokens, status changes not announced |
| Performance | 6.5 / 10 | No `useNativeDriver: false`, virtualisation present; two parallel animation stacks and 25 infinite animations |
| Dependency health | 3.5 / 10 | 9 declared-but-uninstalled packages, duplicate Sentry native module, `expo-doctor` failing |
| Maintainability | 5.0 / 10 | `strict` TypeScript and good service layering vs. 503 `any`, 107 `eslint-disable`, ~19% coverage floor |
| Production readiness | 3.5 / 10 | Build now passes, but a data-integrity P0 stands; 25 of 112 suites cannot execute; governance health gate FAILs |

### Gate results

Two passes were run: an initial pass at ~15:35 and a **re-verification pass after the concurrent changes**. The re-verified column is authoritative.

| Command | Initial (15:35) | Re-verified (16:0x) | Detail |
|---|---|---|---|
| `npx tsc --noEmit` | ❌ 2 errors | ✅ **exit 0** | Both errors fixed by the concurrent process |
| `npm run build:web` | ❌ exit 1 at 2423/2423 modules | ✅ **exit 0** | `logoutService.ts` implemented; `dist/` exported |
| `npm test` | ❌ 26/112 suites failed | ❌ **25 of 112 suites failed**, 21 of 423 tests | 60+ × `SyntaxError: Unexpected token 'export'` from `@sentry/react-native` |
| `npx expo lint` | ❌ exit 1 — 4 errors, 117 warnings | ❌ **exit 1** | 3 × restricted `TouchableOpacity` remain (the `import/no-unresolved` error is fixed) |
| `npx expo-doctor` | ❌ 2 of 19 failed | ❌ **2 of 19 failed** | Missing `sentry-expo` peers (`expo-application`, `expo-device`); duplicate `@sentry/react-native` 7.11.0 + 5.5.0 |
| `governance:ui` | ⚠️ 632 findings | ⚠️ **633 findings** (P1: 3, P2: 630) | 547 arbitrary spacing/radius, 64 inline motion timings |
| `governance:ui:health` | ❌ FAIL | ❌ **FAIL** | 3 blocking P1 (limit 0); token adoption 61% vs 65% floor; reduced-motion 9% vs 11% floor |
| `governance:runtime:health` | ⚠️ WARN | ⚠️ **WARN** | AppState listeners 5 (limit 4) |
| `npx knip` | ⚠️ 5 unused deps, 1 unused devDep, 1 unresolved import | ⚠️ **5 unused deps** | Config is too broad to detect unused *files* (see FE-P2-014) |
| `npm install` | ⏭️ not run | ⏭️ **not run** | Substitution documented: running it would mutate `pnpm-lock.yaml` during a read-only audit. The installed tree was inspected directly via `require('<pkg>/package.json').version` instead. |

### Finding counts

| Severity | Open | Resolved during audit | Total raised |
|---|---:|---:|---:|
| P0 — Critical | **1** | 1 (FE-P0-001) | 2 |
| P1 — High | **8** | 1 (FE-P1-009) | 9 |
| P2 — Medium | 16 | 0 | 16 |
| P3 — Low | 7 | 0 | 7 |
| **Total** | **32** | **2** | **34** |

---

## B. Repository and Technology Overview

| Layer | Technology | Notes |
|---|---|---|
| Framework | Expo SDK `~55.0.28`, React Native `0.83.10`, React `19.2.0` | Current; no version-skew issues detected |
| Platforms | iOS, Android, Web (`react-native-web ^0.21.2`) | `supportsTablet: true`; `userInterfaceStyle: automatic` |
| Routing | `expo-router ~55.0.17`, file-based, `asyncRoutes.web = true` | 60 route files under `app/` |
| State | Zustand `^5.0.14` — 7 stores | `authStore` (1,000 LOC), `settingsStore` (701), `scanSessionStore`, `notificationStore`, `filterStore`, `networkStore`, `notificationPolling` |
| Server state | TanStack Query `^5.101.4` | Cleared on logout |
| Styling | Custom token system: `src/theme/unified/*` + runtime `ThemeContext` → `useUiTokens()` | 122 files use `useUiTokens`, 87 use static `@/theme/unified` |
| Data fetching | Axios `^1.19.0` via `src/services/httpClient.ts` | 30 s timeout, refresh-token flow, 401 circuit breaker |
| Storage | `expo-secure-store` + `AsyncStorage` + `expo-sqlite` | Web tokens held **memory-only** (good) |
| Offline | `src/services/offline/offlineStorage.ts` (998 LOC) + `src/services/syncService.ts` (839 LOC) | Idempotency keys, batched flush (50/batch), retry/backoff |
| Observability | `@sentry/react-native ^7.11.0` **and** deprecated `sentry-expo ^7.0.1` | Duplicate — see FE-P1-003 |
| Testing | Jest `~29.7.0` + `jest-expo`, `@testing-library/react-native`, Playwright `^1.62.1` (10 e2e specs), Storybook 8 | Coverage floor: 19% statements / 13% branches |
| Build | Metro; EAS Build; `expo export -p web` | Web bundle-size regression guard configured |
| Governance | 3 bespoke CI scanners: UI governance, UI governance health, runtime convergence | Genuinely mature — and currently failing |

**Notable strength:** this repository has unusually good self-governance infrastructure (authority-boundary ESLint rules preventing the frontend from recomputing backend reconciliation values, bundle-regression guards, token-adoption trend gates). The problems found below are largely *regressions against the project's own standards*, not the absence of standards.

---

## C. Critical Findings (P0 and P1)

| ID | Sev | Area | Finding | Evidence | User / Business Impact | Recommended Fix |
|---|---|---|---|---|---|---|
| ~~**FE-P0-001**~~ | ~~P0~~ | Build / Release | ✅ **RESOLVED DURING AUDIT.** Web and native bundles failed to build: `UniversalLogout.tsx:8` imported `../../services/auth/logoutService`, which did not exist | Was confirmed by `expo export` (exit 1 at 2423/2423), `tsc` (TS2307), `eslint` (`import/no-unresolved`) and `knip`. A concurrent process created `src/services/auth/logoutService.ts` (a `LogoutService.performLogout()` wrapper delegating to `authStore.logout()`) at ~15:42 | Was: no release possible on any platform | **Fixed.** Re-verified: `npx tsc --noEmit` exit 0, `npm run build:web` exit 0. ⚠️ Residual: the new `logoutService.ts` catch-branch uses `useAuthStore.setState({...} as any)` on force-logout, which bypasses the full teardown in `authStore.logout()` — worth a follow-up review |
| **FE-P0-002** | P0 | Offline / Data integrity | Offline write queue and count-line cache survive logout and have no user ownership | `offlineStorage.ts:949` `clearReadCaches()` removes only `ITEMS_CACHE`, `SESSIONS_CACHE`, `LAST_SYNC`. `clearOfflineQueue()` (`:504`) and `clearAllCache()` (`:924`) have **zero callers** repo-wide. `OfflineQueueItem` (`:79`) has no `user_id`/`session_owner` field | On a shared warehouse device: operator A counts offline → logs out → operator B logs in → A's queued count lines flush under **B's token**, mis-attributing inventory counts. B also sees A's cached `count_lines_cache` in offline views. Incorrect inventory results + cross-user data exposure | Add owner identity to `OfflineQueueItem`; call `clearOfflineQueue()` + remove `COUNT_LINES_CACHE` in `authStore.logout()`; refuse to flush queue entries whose owner ≠ current user |
| **FE-P1-001** | P1 | Testing | **25 of 112** Jest suites cannot execute — including **all 6 `authStore` suites** and the sync contract test | `jest.config.js:19` `transformIgnorePatterns` allow-lists `sentry-expo` but **not** `@sentry/react-native`; 62 × `SyntaxError: Unexpected token 'export'` | Logout cleanup, session establishment, biometric auth, load-race and sync-engine contract are all **completely unverified**. The two P0s above would have been caught | Add `@sentry/react-native` (and `@sentry/core`) to `transformIgnorePatterns` |
| **FE-P1-002** | P1 | Dependencies | 9 packages declared in `package.json` but **not installed and not used by any source file** | `framer-motion`, `@react-three/fiber`, `@react-three/drei`, `lucide-react-native`, `@shopify/react-native-skia`, `nativewind`, `tailwindcss`, `daisyui`, `@types/framer-motion`. Only references are inside `src/docs/*.md` prose. `node -p require(...)` → NOT INSTALLED for all | A clean `npm ci` pulls a three.js + Skia + Tailwind toolchain the app never uses: large install, native build risk (Skia is a native module), and CI/local divergence today because the lockfile and manifest disagree | Remove all 9 from `package.json`; delete the orphaned `tailwind.config.js` |
| **FE-P1-003** | P1 | Dependencies / Native | Two Sentry SDKs installed and both registered as Expo config plugins | `expo-doctor`: duplicate `@sentry/react-native@7.11.0` **and** `@sentry/react-native@5.5.0` (via `sentry-expo@7.0.1`); missing peers `expo-application`, `expo-device`. `app.json:70-77` registers **both** `sentry-expo` and `@sentry/react-native` plugins | Native builds may only contain one version of a native module → EAS build failure or non-deterministic crash reporting. `sentry-expo` is superseded by `@sentry/react-native` | Remove `sentry-expo` from `package.json` and from `app.json` `plugins` |
| **FE-P1-004** | P1 | Architecture | A DI container backed by a **mock HTTP client** is wired into two production-named services | `apps/mobile/src/di/container.ts:9-15` — `MockHttpClient` returns `{data:{}, status:200}` for every verb; injected into `new SQLiteSyncEngine(httpClient)` at module scope (`:47` `export const container = new MobileDIContainer()`). Imported by `src/services/sync/background-sync-scheduler.ts:3` and `src/services/navigation/navigation-service.ts:3` | Currently **dormant** — neither importer is referenced by `src/` or `app/`, so no live impact. But the file names read as production infrastructure; wiring either one would make every sync operation report success while silently discarding the write | Delete `apps/`+`packages/` scaffolding or complete it; at minimum remove `MockHttpClient` so the failure is loud |
| **FE-P1-005** | P1 | UI consistency / Security | 8 unlinked duplicate screens (4,384 LOC) remain URL-addressable routes | `app/improved-login.tsx` (646), `improved-help.tsx` (522), `improved-welcome.tsx` (359), `staff/improved-home.tsx` (541), `staff/improved-scan.tsx` (521), `staff/improved-settings.tsx` (493), `supervisor/improved-dashboard.tsx` (734), `admin/dashboard-web.tsx` (568). Grep confirms **zero inbound links** | expo-router registers every file under `app/` as a route, so `/improved-login` is reachable by URL on web — a second, unmaintained login form outside the tested auth path. All 8 ship in the bundle | Delete the 7 `improved-*` files after diffing for any wanted behaviour; extend `app/__tests__/route-hygiene.test.ts` to fail on unlinked routes |
| **FE-P1-006** | P1 | Accessibility | Shipped semantic colour tokens fail WCAG AA contrast | Computed from `src/theme/unified/colors.ts`: `text.muted`/`text.disabled`/`input.placeholder` = `neutral[400] #94A3B8` on white → **2.56:1**; `button.disabledText` on `button.disabled` → **2.08:1**; white on `success[500]` → **2.28:1**; white on `warning[500]` → **2.15:1**; white on `secondary[500]` → **2.43:1**. AA requires 4.5:1 | Form placeholders, hint text, disabled controls and success/warning status badges are unreadable for low-vision users and in warehouse glare. Affects every screen | Darken to `neutral[500] #64748B` (4.76:1) for muted/placeholder; use `success[700]`/`warning[700]` backgrounds or dark text on light status chips |
| **FE-P1-007** | P1 | Design system | The project's own governance health gate is failing | `governance:ui:health` → `Status: FAIL`; blocking P1 findings 3 (limit 0); token adoption estimate **61%** vs 65% floor; reduced-motion coverage **9%** vs 11% floor | `npm run ci` cannot pass. Design-system convergence has regressed below the team's agreed floors | Fix the 3 P1 governance findings (2 hardcoded colours, 1 generic error copy); resume token migration |
| **FE-P1-008** | P1 | Design system | Four mutually inconsistent brand primaries coexist | `unified/colors.ts:25` `primary[500] = #0655A5` (Lavanya brand); `unified/colors.ts:260` `legacyColors.primary[500] = #3B82F6`; `app.json:9` `primaryColor: "#3B82F6"`; `tailwind.config.js:16` `primary.500: '#3b82f6'`. 14 files import both the **light** unified palette and the **dark** `legacyColors` palette (whose `background.default` is `#020617`) | Brand blue differs by screen; splash/system chrome does not match in-app primary. Files mixing light and dark palettes risk low-contrast or invisible text | Delete `legacyColors`/`legacyTheme` after migrating the 14 files; set `app.json primaryColor` to `#0655A5` |
| ~~**FE-P1-009**~~ | ~~P1~~ | Type safety | ✅ **RESOLVED DURING AUDIT.** Typecheck error in the `apps/mobile` DI tree | Was `apps/mobile/src/shared/auth/AuthService.ts(204,18)`: `TS2339: Property 'createAuthInterceptor' does not exist on type 'AuthService'` | Was: `npm run typecheck` and therefore `npm run ci` failed | **Fixed** by the concurrent process. Re-verified: `npx tsc --noEmit` exit 0. Note this does **not** resolve FE-P1-004 — the `MockHttpClient` in the same tree is still present |
| **FE-P1-010** | P1 | Accessibility | Dynamic status changes are not announced to screen readers | Across 209 component/screen files: `accessibilityLiveRegion` × 8, `announceForAccessibility` × 1, `accessibilityHint` × 13 | In an offline-first counting app, "saved", "queued offline", "sync failed" and scan results are the *primary* feedback. Blind and low-vision operators receive none of it. Serious WCAG 4.1.3 (Status Messages) failure | Add `accessibilityLiveRegion="polite"` to toast/sync/scan-result surfaces; announce scan outcomes explicitly |

---

## D. Detailed Findings by Area

The full per-finding records (Finding ID / Severity / Confidence / Affected files / Platforms / Evidence / Current vs Expected behaviour / Root cause / Operational impact / Remediation / Effort / Dependencies / Validation) are in **`FRONTEND_FINDINGS_REGISTER.md`**. This section summarises each area and flags anything not already covered above.

### D1. Architecture

**Assessment: adequate, with one abandoned parallel structure.**

Boundaries are genuinely respected in the mainline: routes in `app/` delegate to `src/screens/`, business logic sits in `src/services/` and `src/features/`, and an ESLint *authority boundary* rule (`.eslintrc.js:73-99`) actively forbids the UI from recomputing backend-authoritative reconciliation quantities (`erp_drift`, `final_gap`, `audit_delta`, …). That is a mature control and it is passing.

Weaknesses:

- **Parallel architecture (FE-P1-004, FE-P2-001).** `apps/mobile`, `apps/web-admin` and `packages/*` add a DI/ports-and-adapters layer created 2026-08-02. It contains 14 empty directories, a mock HTTP client, a typecheck error, and is reachable only from two unreferenced services. Two architectures now describe the same concerns (storage, sync, scanner).
- **Oversized modules (FE-P2-002).** 7 files exceed 900 LOC: `inventoryWorkflowApi.ts` (1,305), `SessionDetailScreen.tsx` (1,144), `SerialScannerModal.tsx` (1,082), `authStore.ts` (1,000), `offlineStorage.ts` (998), `StaffHomeScreen.tsx` (951). `SessionDetailScreen` and `SerialScannerModal` mix data fetching, business rules and presentation.
- **Dead duplicate (FE-P2-003).** `authStore.clearAuth` (`:703-786`) is an ~85-line near-copy of `logout` (`:614-701`) with **zero callers**. Two logout implementations, one of them dead, is exactly how FE-P0-001 escaped notice.
- **Empty directories (FE-P3-001).** `src/api`, `src/services/auth`, `packages/core/domain`, `packages/core/entities`, and 10 under `apps/mobile/src/`.

### D2. UI consistency

**Assessment: better than expected; duplication is concentrated in screens, not primitives.**

The primitive layer is genuinely consolidated — one `ModernButton`, one `ModernCard`, one `AppTouchable` (enforced by a `no-restricted-imports` rule banning raw `TouchableOpacity`). Remaining overlaps:

| Existing components | Duplicate purpose | Recommended canonical | Migration action |
|---|---|---|---|
| `ModernHeader` (19 uses), `ScreenHeader` (2 uses), `ModernHeaderWithLogout` (0 uses) | Screen header | **`ModernHeader`** | Migrate 2 `ScreenHeader` call-sites; **delete** `ModernHeaderWithLogout` (dead, and it calls the `useUniversalLogout` hook through a non-hook alias, defeating rules-of-hooks lint) |
| `LoadingSkeleton` (1), `Skeleton` (2), `SkeletonList` (4) | Loading placeholder | **`Skeleton` + `SkeletonList`** | Delete `LoadingSkeleton` |
| `LoadingSpinner` (6), inline `ActivityIndicator` | Busy indicator | **`LoadingSpinner`** | Replace inline usages |
| `improved-login` / `login`, `improved-welcome` / `welcome`, `improved-help` / `help`, `staff/improved-home` / `staff/home`, `staff/improved-scan` / `staff/scan`, `staff/improved-settings` / `staff/settings`, `supervisor/improved-dashboard` / `supervisor/dashboard`, `admin/dashboard-web` / `admin/index` | Whole screens | **Non-`improved` variants** | Delete the 8 duplicates (FE-P1-005) |
| `ErrorBoundary` + `ErrorBoundary.web`, `ToastProvider` + `ToastProvider.web` | Platform variants | Keep — legitimate platform splits | No action |

Three components still import restricted `TouchableOpacity` (`EnhancedScanInput.tsx:7`, `OfflineStatusIndicator.tsx:2`, `StandardizedErrorCard.tsx:2`) — these are the 3 lint **errors** and they bypass the accessibility guarantees `AppTouchable` provides.

### D3. UX workflows

Workflows were traced end-to-end. Structure is sound; three have defects.

```text
LOGOUT  (BROKEN — FE-P0-001)
Entry: staff settings / supervisor sidebar / admin sidebar
→ tap Sign Out
→ [BUNDLE FAILS TO RESOLVE — screen cannot load at all]
Failure condition: build-time, not runtime
Recovery path: none
Completion state: UNREACHABLE
```

```text
OFFLINE COUNT → SYNC  (UNSAFE ON SHARED DEVICES — FE-P0-002)
Entry: staff scan screen, device offline
→ scan item → enter qty → save
→ system queues to `offline_queue` with idempotency key   [correct]
→ operator logs out                                        [queue NOT cleared]
→ different operator logs in
→ connectivity restored → syncService flushes queue under NEW token
Decision point: none — no owner check exists
Failure condition: silent mis-attribution
Recovery path: none (counts land against the wrong operator)
Completion state: reports "synced" — falsely
```

```text
SCAN → COUNT  (SOUND)
Entry: staff home → Scan
→ camera/keyboard-wedge scan → item lookup (cache-then-network)
→ qty entry → serial/batch capture where required
→ save → optimistic write + queue on failure
Decision points: unknown item → admin queue; variance → exception card
Failure: network → offline queue with idempotency key
Recovery: supervisor `offline-queue` + `sync-conflicts` screens
Completion: count line persisted, visible in history ✅
```

Cross-cutting UX gaps: sync/save status changes are not announced (FE-P1-010); the offline indicator exists but 21 of 60 routes never reference offline state at all; `UniversalLogout.tsx:130` emits the generic string `"An error occurred during logout"` (flagged P1 by the project's own governance rule UI007).

### D4. Alignment and layout

**No confirmed geometric defects were found by static analysis** — and I will not assert visual misalignment I cannot observe. What is verifiable:

- Safe-area handling is present in 29 files; `useWindowDimensions` (33 files) is correctly preferred over `Dimensions.get` (5 files) — good responsive hygiene.
- `KeyboardAvoidingView` appears in 15 files. Form-bearing screens without it are a **risk requiring runtime verification**, not a confirmed defect.
- 42 `position: "absolute"` usages. `app/_layout.tsx:369` passes `pointerEvents: "none" as any` inside a style object — a type-suppressed prop that behaves differently across RN and RN-Web.
- 547 governance UI015 findings (arbitrary spacing/radius) mean the 4/8-point grid is not consistently enforced; this produces *small* uneven whitespace rather than broken layouts.
- `maxFontSizeMultiplier` is used **0 times** and `allowFontScaling={false}` **0 times**. Not blocking font scaling is correct; but with no caps, fixed-height rows and buttons will clip at large accessibility font sizes. **Requires runtime verification** at 200% text scale.

Per-screen alignment status is in `UI_UX_SCREEN_AUDIT_MATRIX.md`.

### D5. Design system

See **`DESIGN_SYSTEM_AUDIT.md`** for the full analysis, proposed canonical token structure and migration strategy. Headline: the system is real and CI-enforced but only ~61% adopted, with 4 competing palettes (FE-P1-008), a light/dark palette-mixing hazard in 14 files, an unreachable `highContrast` theme, and 3 fully dead themes (`premium`, `ocean`, `sunset` — ~300 LOC in `themes.ts`, referenced only by the `ThemeKey` union).

### D6. Responsive and cross-platform

- Web, iOS and Android all supported; `supportsTablet: true`; `asyncRoutes.web` enabled for bundle splitting.
- Platform splits are clean and few: 8 `.web.tsx`/`.native.ts`/`.ios`/`.android` files, all justified (boot views, error boundary, toast provider, fonts, camera).
- `ios.infoPlist.NSAppTransportSecurity.NSAllowsArbitraryLoadsInLocalNetwork: true` (`app.json:31-33`) relaxes ATS. Justified for local-network backends but should be confirmed as intentional for production (**FE-P2-011**).
- No `runtimeVersion` / `expo-updates` channel configured, and `eas.json` has no `development` profile and no iOS build configuration (**FE-P2-012**).
- **Not assessed:** actual rendering on display cut-outs, landscape, and gesture-navigation devices — requires device runtime.

### D7. Accessibility

| Signal | Measured | Assessment |
|---|---:|---|
| Files with `accessibilityLabel` | 87 / 209 (42%) | **Serious** — majority of interactive surfaces unlabelled |
| Files with `accessibilityRole` | 61 | Moderate |
| `accessibilityHint` occurrences | 13 | Minor |
| `accessibilityState` occurrences | 41 | Acceptable |
| `accessibilityLiveRegion` | 8 | **Critical** (FE-P1-010) |
| `announceForAccessibility` | 1 | **Critical** |
| `allowFontScaling={false}` | 0 | ✅ Good — scaling not blocked |
| `maxFontSizeMultiplier` | 0 | Risk at 200% scale — needs runtime verification |
| Reduced-motion references | 28 files (9% governance coverage vs 11% floor) | **Serious** — 25 `withRepeat` infinite animations |
| Contrast | 5 token pairs fail AA (FE-P1-006) | **Critical** |
| `highContrast` theme | Defined (`themes.ts:672`) but **absent from `THEME_METADATA`** | **Serious** — an accessibility theme was built and never exposed to users |

Classification: **2 Critical** (contrast, status announcements), **3 Serious** (label coverage, reduced motion, unreachable high-contrast theme), **2 Moderate** (roles, hints), **1 Minor** (font-scale caps).

Affected user groups: blind/low-vision screen-reader users (announcements, labels), low-vision users (contrast, high-contrast theme, font scaling), vestibular-disorder users (reduced motion).

### D8. State management

**Assessment: good separation, one critical gap.**

7 Zustand stores with clear ownership; TanStack Query for server state; user-scoped preferences via `setUserPreferenceScope`. `logout()` (`authStore.ts:614-701`) clears: auth state, secure storage (auth/token/refresh/biometric-PIN/pending-redirect), notification store, TanStack Query cache (`cancelQueries` + `clear`), scan-session store, recent items, filter-store scope, and *read* caches. That is thorough.

Gaps:
- **Offline queue and `count_lines_cache` are not cleared (FE-P0-002).** This is the single hole in an otherwise complete teardown.
- Every cleanup step is wrapped in `catch { /* Best-effort */ }` with **no user-visible signal**. A failed teardown reports success (**FE-P2-004**).
- `clearAuth` is a dead ~85-line duplicate (**FE-P2-003**).
- All 6 `authStore` test suites currently fail to run (FE-P1-001), so none of this is verified.
- `authStore.ts` uses `require()` at 18 sites (lint warnings) as a test-environment shim — a code smell but functionally deliberate.

### D9. API and offline behaviour

**Assessment: the strongest area of the codebase.**

`src/services/httpClient.ts` is well engineered: 30 s timeout (`:22`), request interceptor attaching bearer tokens (`:239`), a **401 circuit breaker** to prevent logout storms (`:277-300`), refresh-token rotation (`:137-165`), `SESSION_REVOKED` handling (`:327`), and differentiated logging for logout/refresh/probe 401s.

`offlineStorage.ts` implements real idempotency: `resolveIdempotencyKey` (`:299`) derives stable keys from `data.idempotency_key`, `data.audit.idempotency_key`, count-line id, or `operation:sessionId`; `addToOfflineQueue` (`:369`) **de-duplicates in place** on matching key. `syncService.syncOfflineQueue` (`:770`) batches at 50, tracks per-item retries and `blocked_conflict` / `failed_manual_review` statuses, and surfaces conflicts through dedicated supervisor screens (`offline-queue.tsx`, `sync-conflicts.tsx`).

Residual risks:
- FE-P0-002 (no user scoping) — the one serious defect.
- `buildQueueItemId` (`:294`) falls back to `Date.now()_Math.random()` when no idempotency key can be derived. For `type: "unknown_item"` without a stable key this can produce duplicate submissions across app restarts (**FE-P2-005**, requires runtime verification).
- Queue overflow past `maxQueueSize` only logs a warning and preserves all entries (`:412-417`) — deliberate (never drop counts) but unbounded storage growth is possible on long offline stints (**FE-P3-004**).
- No request cancellation (`AbortController`) anywhere — abandoned screens complete their fetches (**FE-P2-006**).

### D10. Dependencies

See **`DEPENDENCY_RISK_REGISTER.md`**. Headline: 9 phantom packages (FE-P1-002), a duplicate Sentry native module (FE-P1-003), `jest-environment-jsdom@30.4.1` paired with `jest@29.7.0` (major mismatch), and `@babel/core` declared `^8.0.1` in `devDependencies` while `pnpm.overrides` pins `7.29.7` — the installed tree resolves to 7.29.7, so the manifest is misleading.

### D11. Performance

See **`FRONTEND_PERFORMANCE_AUDIT.md`**. Summary: no confirmed severe bottleneck. Positives: zero `useNativeDriver: false`; FlashList in 17 files; `asyncRoutes.web`; lazy `AppShell` and lazy `StaffHomeScreen`; bundle-regression CI guard. Concerns: 33 files render `.map()` inside `ScrollView` (virtualisation coverage is 21% per governance), two parallel animation stacks, 25 infinite `withRepeat` animations, 24 `setInterval` sites, and 5 `AppState` listeners (over the governance limit of 4).

Per the accuracy rules, **no memoisation changes are recommended** — no measurable re-render problem was demonstrated, and none can be without profiling.

### D12. Animations

- **Dual stacks:** `react-native-reanimated` in 62 files and RN core `Animated` in 62 files. Two motion vocabularies, two sets of easing/duration conventions (**FE-P2-007**).
- **64 inline animation timings** flagged by governance (UI016) — e.g. `entering={FadeInDown.duration(600).springify()}` in `app/forgot-password.tsx:193`. 600 ms spring entrances are decorative and slow down an operational flow.
- **25 `withRepeat` infinite animations** with only 9% reduced-motion coverage. Infinite motion on a warehouse-floor device is both a battery cost and a vestibular-accessibility problem (**FE-P1-010 adjacent**, tracked as **FE-P2-008**).
- No `useNativeDriver: false` — animations run on the UI thread. ✅

### D13. Security

**Assessment: notably good, two residual items.**

- ✅ **No hardcoded secrets.** Regex sweep for key/secret/password/token literals ≥16 chars across `src/` and `app/` returned zero hits. `.env` contains only `EXPO_PUBLIC_*` non-secret config.
- ✅ **Web tokens are memory-only.** `secureStorage.ts:22-26` holds `auth_token`, `refresh_token`, `auth_user` in an in-memory `Map` on web rather than `localStorage` — this correctly avoids XSS token theft. Native uses `SecureStore` with `AFTER_FIRST_UNLOCK` + `requireAuthentication: true`.
- ✅ Sentry `beforeSend` (`app/_layout.tsx:47-57`) filters breadcrumb URLs.
- ⚠️ **`biometric_pin_hash` is written to `localStorage` on web** (`secureStorage.ts:42,114`) — a hash, not a PIN, but still an offline-attackable artefact (**FE-P2-009**).
- ⚠️ **Role checks are UI-only.** `app/supervisor/_layout.tsx:67`, `MobileNavDrawer.tsx:45`, `SupervisorSidebar.tsx:173` gate on `user?.role`. This is correct *as UI*, but the 8 unlinked routes (FE-P1-005) are directly URL-addressable and must be assumed reachable — enforcement has to be server-side. Confirm the backend authorises every endpoint independently (**FE-P2-010**, backend responsibility).
- ⚠️ 162 `console.error` and 37 `console.log` calls; only 16 of the `console.log`s are `__DEV__`-guarded. `babel.config.js:17-19` strips console in `production` env — effective for release builds, but any non-production profile leaks diagnostics (**FE-P3-005**).
- `NSAllowsArbitraryLoadsInLocalNetwork: true` — see D6.

### D14. Code quality

| Signal | Count | Assessment |
|---|---:|---|
| TypeScript `strict` + `noUncheckedIndexedAccess` | ✅ enabled | Excellent baseline |
| `: any` / `as any` | 503 | Materially undercuts `strict` |
| `@ts-ignore` | 11 | Acceptable if justified |
| `@ts-expect-error` | 0 | — |
| `eslint-disable` | 107 | High |
| `TODO` / `FIXME` | 0 | ✅ Clean |
| Files > 900 LOC | 7 | See D1 |
| Lint warnings | 117 | Mostly unused vars + `require()` style |

Two governance concerns:
- **`typescript-plugin-filter-text-errors.js`** (`tsconfig.json:38-42`) silently drops `"must be rendered within a <Text/>"` diagnostics from the IDE language service. `tsc --noEmit` ignores plugins so CI is unaffected, but developers are shown a filtered error set — a class of real RN bug is invisible in-editor (**FE-P2-013**).
- **`tsconfig.json` path aliases point at non-existent directories**: `@stock-verification/ui-components` → `./packages/ui-components` and `@stock-verification/types` → `./packages/types`; neither exists (`packages/` contains only `core/` and `shared/`) (**FE-P3-002**).
- Stray artefact: `app/staff/item-detail.tsx.patch` — an unapplied diff committed into the routes directory (**FE-P3-003**).

### D15. Testing

| Type | Present | Status |
|---|---|---|
| Unit / service | Yes, extensive | 86 of 112 suites pass |
| Store tests | Yes (6 `authStore` suites) | ❌ **All fail to run** (FE-P1-001) |
| Component tests | Yes (`@testing-library/react-native`) | 6 suites fail to run |
| Sync contract | `tests/sync-engine-contract.test.ts` | ❌ Fails to run |
| Route hygiene | `app/__tests__/route-hygiene.test.ts` | ✅ Passes — but does not catch unlinked routes or `.patch` files |
| Offline / conflict | Partial (`inventoryWorkflowApi.offlineCount`, `syncBatch`) | ❌ Several fail to run |
| Accessibility | 1 (`__tests__/login_accessibility.test.tsx`) | Minimal |
| E2E (Playwright) | 10 specs incl. visual + auth + core-flow | Not executed (needs a running server) |
| Storybook | Configured, 4 stories | Minimal |

Coverage floor is pinned at **19% statements / 13% branches / 15% functions** (`jest.config.js:38-45`) — appropriate as a ratchet, far too low as a release gate for an inventory-integrity application.

Gaps: no logout-cleanup test currently executes; no offline-queue-across-logout test exists (which is precisely FE-P0-002); no concurrency test for simultaneous sync + logout; no large-dataset list performance test.

### D16. Production readiness

Blocking (current): FE-P0-002 (data integrity), FE-P1-001 (untested auth), FE-P1-003 (native build risk), FE-P1-005 (URL-addressable second login), FE-P1-007 (`npm run ci` cannot pass). Cleared: FE-P0-001, FE-P1-009.

Also missing for release: no `runtimeVersion`/OTA channel, no iOS EAS build profile, no `development` EAS profile, `expo-doctor` failing.

---

## E. Screen-by-Screen Audit Matrix

See **`UI_UX_SCREEN_AUDIT_MATRIX.md`** for all 60 routes.

---

## F. Component Consolidation Plan

See the table in **D2** and the expanded plan in **`DESIGN_SYSTEM_AUDIT.md` §4**.

---

## G. Dependency Risk Register

See **`DEPENDENCY_RISK_REGISTER.md`**.

---

## H. Performance Optimisation Plan

See **`FRONTEND_PERFORMANCE_AUDIT.md` §5**.

---

## I. Design-System Remediation Plan

See **`DESIGN_SYSTEM_AUDIT.md` §5-§8**.

---

## J. Prioritised Remediation Backlog

See **`FRONTEND_REMEDIATION_PLAN.md`**.

---

## K. Release Recommendation

> ## ❌ RELEASE REJECTED

### Absolute blockers (re-verified against current tree)

| # | Blocker | Gate that proves it |
|---|---|---|
| 1 | **FE-P0-002** — offline counts and count-line cache cross user boundaries on shared devices | Code inspection re-verified: `clearOfflineQueue` still has **zero callers**; `clearReadCaches` still omits `OFFLINE_QUEUE` and `COUNT_LINES_CACHE`; `OfflineQueueItem` still has **no owner field** |
| 2 | **FE-P1-001** — all authentication/logout/sync-contract tests fail to execute | `npm test` → **25 of 112 suites failed**, exit 1 |
| 3 | **FE-P1-003** — duplicate `@sentry/react-native` native module (7.11.0 + 5.5.0) + duplicate Expo plugin | `npx expo-doctor` → **2 of 19 checks failed** |
| 4 | **FE-P1-007** — the project's own governance health gate fails, so `npm run ci` cannot pass | `governance:ui:health` → **Status: FAIL** (3 blocking P1, limit 0) |
| 5 | **FE-P1-005** — a second, untested login screen is URL-addressable at `/improved-login` | Re-verified: 8 route files, **0 inbound links** |

**Cleared since the initial pass:** ~~FE-P0-001~~ (build) and ~~FE-P1-009~~ (typecheck) — both fixed by the concurrent process and re-verified green.

### Mandatory validation before re-review

1. `npm run ci` (lint + typecheck + test + `governance:ui:strict` + `knip:check`) exits **0**.
2. `npm run build:web` and an EAS build for **both** iOS and Android complete successfully.
3. `npx expo-doctor` reports **19/19** checks passed.
4. A new test proves the offline queue is empty and `count_lines_cache` is removed after `logout()`, and that a queue entry owned by user A is **not** flushed under user B's session.
5. `npm run governance:ui:health` reports `Status: PASS`.
6. Manual device verification on one small Android phone and one iPhone at **200% text scale**, covering login → scan → count → offline → sync → logout.

### Conditions for a subsequent conditional approval

Once blockers 1-5 clear, the release may be approved **with conditions** while the P1 accessibility items (FE-P1-006 contrast, FE-P1-010 announcements) are remediated on a committed timeline — provided the deployment is to a controlled pilot warehouse rather than the full fleet, and provided FE-P1-005 (unlinked duplicate routes, including the second login screen) is resolved first.

---

*No files were modified during this audit. Remediation awaits explicit authorisation.*
