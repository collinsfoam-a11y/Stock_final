# Frontend Performance Audit

**Target:** `frontend/` v2.1.0 · **Date:** 2026-08-02
**Performance rating: 6.5 / 10**

## Method and its limits

This is a **static** performance audit. No profiler, no device trace, no React DevTools render count, no Lighthouse run. Every claim below is either (a) a measured static fact, or (b) a hypothesis explicitly marked *Requires runtime verification*.

Per the audit's accuracy rules, **no memoisation is recommended anywhere in this document.** No re-render problem was measured, and none can be without profiling. Recommending `useMemo`/`useCallback` on suspicion is how codebases acquire memoisation that costs more than it saves.

---

## 1. What is already correct

These are genuine strengths and should not be disturbed:

| Practice | Evidence | Benefit |
|---|---|---|
| **No JS-thread animation driver** | `grep "useNativeDriver: false"` → **0 occurrences** | All RN `Animated` work runs on the UI thread. This is the single most common RN performance defect and it is absent |
| **List virtualisation present** | `@shopify/flash-list` in **17 files**, `FlatList` in 11 | Large session/item/variance lists are virtualised |
| **Web code splitting** | `app.json` → `expo-router` `asyncRoutes: { web: true }` | Routes load on demand on web |
| **Lazy root shell** | `app/_layout.tsx:19` `React.lazy(() => import("../src/bootstrap/AppShell"))` | Keeps the root bundle small |
| **Lazy heavy screen** | `app/staff/home.tsx:4-5` lazily imports `StaffHomeScreen` (951 LOC) | Defers the largest staff screen |
| **Bundle regression CI guard** | `scripts/check-web-bundle-regression.cjs`, `budget.json`, `bundle:web:guard` | Bundle growth is gated, not merely observed |
| **Console stripped in production** | `babel.config.js:17-19` `transform-remove-console` under `env.production` | 199 `console.*` calls do not ship in release builds |
| **Boot has a hard timeout** | `app/_layout.tsx:26` `BOOT_HARD_TIMEOUT_MS = 14000` plus a 4.5 s stall detector (`:25`) | Startup cannot hang indefinitely; degrades to cached state |
| **Sync batching** | `syncService.ts:777` `BATCH_SIZE = 50` | Bounded payloads on queue flush |
| **Idempotent queue writes** | `offlineStorage.ts:369-405` de-duplicates in place by idempotency key | Prevents unbounded duplicate growth |
| **Virtualisation trend gate** | `governance:ui:health` tracks virtualisation coverage (21%, floor 19%) | Regression is measured |

---

## 2. Static measurements

| Signal | Count | Interpretation |
|---|---:|---|
| TS/TSX files in `src` + `app` | ~533 | — |
| Files > 900 LOC | 7 | Parse + evaluate cost concentrated in few modules |
| `FlashList` files | 17 | Good |
| `FlatList` files | 11 | Acceptable |
| Files with `.map()` inside a `ScrollView` | **33** | Non-virtualised rendering candidates |
| `react-native-reanimated` files | 62 | — |
| RN core `Animated` files | 62 | **Two parallel animation stacks** |
| `withRepeat` (infinite animations) | **25** | Continuous GPU/CPU work |
| `useNativeDriver: false` | **0** | ✅ |
| `setInterval` | 24 | 18 owner files (governance limit 19) |
| `setTimeout` | 44 | — |
| `AppState.addEventListener` | **5** | ⚠️ Over the governance limit of 4 |
| `Dimensions.get` | 5 | Low — good |
| `useWindowDimensions` | 33 | ✅ Correct responsive primitive |
| `AbortController` / request cancellation | **0** | No in-flight request cancellation anywhere |
| `LinearGradient` / `BlurView` | 3 / 4 | Low — good (blur is expensive on Android) |
| Reduced-motion coverage (governance) | **9%** (floor 11%) | ⚠️ Below floor |
| Inline animation timings (governance UI016) | **64** | Motion not tokenised |

---

## 3. Findings

### PERF-01 — Two parallel animation stacks (FE-P2-007) · P2

```text
Confidence:   Confirmed
Evidence:     react-native-reanimated imported in 62 files;
              RN core `Animated` used in 62 files
Platforms:    iOS, Android, Web
```

**User-visible impact:** Inconsistent motion feel between screens; both libraries' runtimes ship in every bundle.

**Root cause:** Incremental migration to Reanimated that never completed.

**Correction:** Standardise on Reanimated. Migrate RN-core `Animated` usages, with one deliberate exception: `app/_layout.tsx:76,138-146` uses RN `Animated` for the boot overlay, which runs *before* the theme and Reanimated worklet runtime are guaranteed available. Leave that one.

**Effort:** L · **Expected gain:** Bundle reduction; consistent frame behaviour. **Not quantified — requires measurement.**
**Measurement:** `npm run bundle:web:report` before/after; Perfetto/Systrace frame timing on a mid-range Android device.

---

### PERF-02 — 25 infinite animations with 9% reduced-motion coverage (FE-P2-008) · P2

```text
Confidence:   Confirmed (count) / Requires runtime verification (battery + frame impact)
Evidence:     grep withRepeat → 25 sites
              governance:ui:health → Reduced-motion coverage 9% (floor 11%) — WARN
Platforms:    iOS, Android
```

**User-visible impact:** Continuous compositor work on warehouse handhelds. Two concrete risks: measurable battery drain across a full shift, and no relief for operators with vestibular sensitivity.

**Whether animations continue while a screen is not visible was not verified** — this needs a runtime check. If any `withRepeat` is not cancelled on blur, it is a straightforward waste.

**Correction:**
1. A single `useReducedMotion()` hook wrapping `AccessibilityInfo.isReduceMotionEnabled()` + its change subscription; every `withRepeat` gated on it.
2. Cancel infinite animations on screen blur via `useFocusEffect`.
3. Replace decorative loops (shimmer, pulse) with static states in operational screens — an inventory app should favour clarity and predictability over motion.

**Effort:** M · **Expected gain:** Reduced idle CPU/GPU; accessibility compliance.
**Measurement:** Xcode Instruments (Energy Log) / Android Studio Energy Profiler, idle on the staff home screen for 5 minutes, before/after.

---

### PERF-03 — 33 files render `.map()` inside a `ScrollView` (FE-P2-016) · P2

```text
Confidence:   High confidence (that some are unbounded) / Requires runtime verification (which ones)
Evidence:     33 files match; governance virtualisation coverage 21%
Platforms:    All
```

**User-visible impact:** For any collection that grows with data — session lists, variance lists, item lists, activity logs — every row mounts at once. Scroll jank and slow screen entry proportional to dataset size.

**Important qualification:** many of the 33 are almost certainly bounded (settings sections, a fixed set of stat tiles, form field groups). Rendering 6 settings rows in a `ScrollView` is correct and converting it to `FlashList` would be a regression. **The work is triage, not blanket conversion.**

**Correction:** Audit the 33 and classify each as bounded (leave) or unbounded (convert to `FlashList`). Prioritise: `app/supervisor/variances.tsx` (764 L), `app/supervisor/items.tsx` (578 L), `app/staff/history.tsx` (582 L), `app/supervisor/activity-logs.tsx`, `app/admin/users.tsx` (604 L).

**Effort:** M · **Expected gain:** Bounded render cost on the largest lists.
**Measurement:** Render a 1,000-row session on a mid-range Android device; measure time-to-interactive and scroll FPS before/after.

---

### PERF-04 — No request cancellation anywhere (FE-P2-006) · P2

```text
Confidence:   Confirmed
Evidence:     grep "AbortController" / "signal:" across src/services → 0 hits
              src/services/httpClient.ts:22 — timeout 30000
Platforms:    All
```

**User-visible impact:** Navigating away from a screen does not cancel its in-flight requests. On a slow warehouse network with a 30 s timeout, a user who opens and abandons three screens leaves three requests running for up to 30 s each — wasted mobile data and battery, and a late response can attempt to update unmounted state.

**Correction:** Attach an `AbortController` per query and abort on unmount. TanStack Query supplies `signal` to `queryFn` — the plumbing is largely available; it needs to be threaded through `httpClient`.

**Effort:** M · **Expected gain:** Lower data usage and fewer wasted round-trips on rapid navigation.
**Measurement:** Charles/Proxyman capture while navigating rapidly between five screens; count requests that complete after their screen unmounts.

---

### PERF-05 — Five `AppState` listeners, above the governance limit · P2

```text
Confidence:   Confirmed
Evidence:     governance:runtime:health → "WARN AppState listener usage count: 5 (limit 4)"
              grep AppState.addEventListener → 5
Platforms:    iOS, Android
```

**User-visible impact:** Each listener runs its own foreground/background handler. On app resume, five independent handlers fire — a likely cause of duplicated refresh work and a resume-latency contributor. The project set the limit at 4 deliberately; this is a tracked regression.

**Correction:** Consolidate into one `AppStateProvider` that fans out to subscribers, so resume work is coordinated and ordered.

**Effort:** S · **Expected gain:** Faster, more predictable resume; fewer duplicate network calls on foreground.
**Measurement:** Instrument resume handlers; count network requests fired within 2 s of foregrounding, before/after.

---

### PERF-06 — 24 `setInterval` sites across 18 files · P2

```text
Confidence:   Confirmed (count) / Requires runtime verification (leak vs clean teardown)
Evidence:     grep setInterval → 24; governance "Interval owner file count: 18 (limit 19)" — PASS
```

**Assessment: this is at the project's own limit but passing.** Polling is legitimate here — `notificationPolling.ts`, sync scheduling, the `realtime-dashboard`. The audit did **not** confirm any leaked interval; the boot path in `app/_layout.tsx:152-161` shows a correct `clearBootTimers` teardown pattern, which is a good sign for the codebase's habits.

**Correction:** Verify every interval is cleared on unmount and paused on background. Prefer a single scheduler over 18 independent owners.

**Effort:** S (audit) · **Measurement:** Instrument `setInterval`/`clearInterval` in dev; assert balanced counts after navigating the full app and backgrounding.

---

### PERF-07 — Seven modules over 900 LOC (FE-P2-002) · P2

```text
Confidence:   Confirmed
Evidence:     inventoryWorkflowApi.ts 1305 · SessionDetailScreen.tsx 1144 ·
              SerialScannerModal.tsx 1082 · authStore.ts 1000 ·
              offlineStorage.ts 998 · StaffHomeScreen.tsx 951 · syncService.ts 839
```

**User-visible impact:** Parse and evaluation cost concentrated in a few modules, affecting cold start and first navigation to those screens. `SessionDetailScreen` is behind a route so it benefits from `asyncRoutes` on web, but on native it is bundled eagerly.

**Nuance:** large *service* modules (`inventoryWorkflowApi`, `offlineStorage`, `syncService`) are less of a performance concern than large *screen* modules, because they are mostly pure functions that tree-shake and parse cheaply relative to component trees. Prioritise the screens.

**Correction:** Split `SessionDetailScreen` and `SerialScannerModal` into a data hook plus presentational children.

**Effort:** L · **Measurement:** `npm run bundle:web:report` per-chunk sizes; native TTI to the session detail screen.

---

### PERF-08 — 64 inline animation timings bypass motion tokens · P3

```text
Confidence:   Confirmed
Evidence:     governance UI016 → 64 findings, e.g.
              app/forgot-password.tsx:193  entering={FadeInDown.duration(600).springify()}
```

**User-visible impact:** A 600 ms spring entrance on a password-recovery screen is perceived latency the user cannot skip. Across an operational flow these compound into an app that feels slower than it is.

**Correction:** Replace with `motion.fast` (120 ms) / `motion.normal` (200 ms) tokens. Operational screens should use `fast`.

**Effort:** M (bulk codemod) · **Expected gain:** Perceived responsiveness. **Measurement:** Time from tap to interactive on the five most-used transitions.

---

## 4. Scenario analysis

Ratings are **static assessments**. Anything marked ⏱️ needs device measurement before it can be stated as fact.

| # | Scenario | Static assessment | Concerns |
|---|---|---|---|
| 1 | **Cold start** | ⏱️ Not measured | Lazy `AppShell` + lazy `StaffHomeScreen` are correct. `Sentry.init` runs at module scope (`_layout.tsx:41`) before render. `initializeApp` gates the UI on native (`:328`). 14 s hard timeout is a safety net, not a target |
| 2 | **Warm start** | ⏱️ Not measured | 5 `AppState` listeners all fire on resume (PERF-05) |
| 3 | **Login** | ✅ Reasonable | 30 s timeout; refresh-token flow; 401 circuit breaker prevents retry storms |
| 4 | **Screen navigation** | ⚠️ Mixed | `asyncRoutes` on web; native bundles all routes. 7 modules > 900 LOC (PERF-07) |
| 5 | **Large-list rendering** | ⚠️ Risk | FlashList in 17 files, but 33 files `.map()` in `ScrollView` (PERF-03) |
| 6 | **Search** | ✅ Good | `use-debounce` present; `SearchAutocomplete.tsx` (600 L) implements pagination + remote search |
| 7 | **Barcode scanning** | ⏱️ Requires verification | Camera + keyboard-wedge paths. `SerialScannerModal.tsx` is 1,082 LOC — the heaviest component on the hottest path |
| 8 | **Quantity updates** | ✅ Reasonable | Optimistic local write, queue on failure |
| 9 | **Offline persistence** | ⚠️ Risk | AsyncStorage read-modify-write of the whole queue per enqueue (`offlineStorage.ts:374,402,414`) — O(n) per write. At high queue depth this degrades. ⏱️ Verify with 500+ queued items |
| 10 | **Background sync** | ✅ Good | Batched at 50; retry/backoff; `expo-background-task` |
| 11 | **App resume** | ⚠️ Risk | PERF-05 |
| 12 | **Logout and cleanup** | ⚠️ Correctness issue | Not a performance problem — see FE-P0-002. Cleanup runs ~8 sequential `await`s including 6 dynamic `import()`s |

### Worth highlighting: PERF-09 — offline queue write is O(n) · P2

```text
Confidence:   High confidence (code) / Requires runtime verification (threshold)
Evidence:     offlineStorage.ts:374  const queue = await getOfflineQueue();   // full read
              offlineStorage.ts:402/414  await storage.set(OFFLINE_QUEUE, queue); // full write
```

Every enqueue deserialises the entire queue, scans it for a matching idempotency key, appends, and reserialises. Cost is O(n) per scan and O(n) per write. During a sustained offline counting session — exactly the situation the queue exists for — each successive scan gets slower.

`maxQueueSize` is advisory only (`:412-417` logs and preserves all entries), so there is no upper bound.

**Correction:** Move the queue to `expo-sqlite` (already a dependency) with an index on `idempotency_key`, or shard the AsyncStorage key. **Measurement:** time `addToOfflineQueue` at queue depths of 10 / 100 / 500 / 1000 on a mid-range Android device.

---

## 5. Performance optimisation plan

### 5.1 Immediate fixes (P1-adjacent, low risk)

| Action | Effort | Expected gain | Measurement |
|---|---|---|---|
| Remove the 9 phantom dependencies (FE-P1-002) | XS | Prevents a future install pulling three.js + Skia | `bundle:web:report` |
| Remove `sentry-expo` — eliminates a duplicate native module (FE-P1-003) | XS | Smaller native binary; removes build risk | EAS build size |
| Delete the 8 unlinked duplicate routes (FE-P1-005) | M | **4,384 LOC removed from every bundle** | `bundle:web:report` before/after |

### 5.2 Short-term optimisation

| Action | Effort | Expected gain | Measurement |
|---|---|---|---|
| Consolidate 5 `AppState` listeners into one provider (PERF-05) | S | Faster resume; fewer duplicate foreground requests | Request count within 2 s of foregrounding |
| Gate 25 `withRepeat` animations behind reduced motion + focus (PERF-02) | M | Lower idle CPU/GPU; accessibility | Energy profiler, 5 min idle |
| Triage the 33 `ScrollView` + `.map()` files; convert unbounded ones (PERF-03) | M | Bounded render cost on large lists | 1,000-row list TTI + scroll FPS |
| Replace 64 inline timings with motion tokens (PERF-08) | M | Perceived responsiveness | Tap-to-interactive on top 5 transitions |
| Audit the 24 `setInterval` sites for balanced teardown (PERF-06) | S | Prevents leaks | Balanced set/clear counts |

### 5.3 Architectural optimisation

| Action | Effort | Expected gain | Measurement |
|---|---|---|---|
| Migrate the offline queue to `expo-sqlite` (PERF-09) | L | Removes O(n) enqueue cost; unblocks long offline sessions | Enqueue timing at depth 10/100/500/1000 |
| Consolidate onto Reanimated; retire RN `Animated` (PERF-01) | L | Single runtime; consistent frames | Bundle report; frame timing |
| Split `SessionDetailScreen` and `SerialScannerModal` (PERF-07) | L | Faster navigation to the two heaviest screens | Per-chunk bundle size; native TTI |
| Add request cancellation via TanStack Query `signal` (PERF-04) | M | Lower data usage on rapid navigation | Proxy capture of orphaned requests |

### 5.4 Measurement and monitoring — **do this first**

The most important recommendation in this document: **there is currently no runtime performance measurement at all.** Bundle size is gated; nothing else is. Every "expected gain" above is unquantified precisely because there is no baseline to quantify against.

| Action | Effort | Why |
|---|---|---|
| Establish a device baseline (cold start, TTI per screen, scroll FPS, resume time) on one mid-range Android and one iPhone | M | Without this, no optimisation can be justified or verified |
| Enable Sentry Performance / tracing (the SDK is already installed) | S | Real-user cold-start and navigation timings from the field |
| Add `lighthouserc.json` to CI for the web build (config already exists, unused) | S | Web performance regression gating |
| Add a large-dataset render test (1,000 rows) to the Jest suite | M | Catches list regressions before release |
| Keep `bundle:web:guard` in CI and ratchet `budget.json` downward as dead code is removed | XS | Locks in the gains from §5.1 |

---

## 6. Explicitly *not* recommended

| Not recommended | Why |
|---|---|
| Adding `useMemo` / `useCallback` / `React.memo` | No re-render problem was measured. Speculative memoisation adds allocation and comparison cost and frequently makes things slower. **Profile first.** |
| Converting all 33 `ScrollView` + `.map()` files to `FlashList` | Many render bounded collections where `ScrollView` is correct and `FlashList` would regress. Triage, don't sweep |
| Upgrading dependencies for performance | No dependency was shown to be a bottleneck. See `DEPENDENCY_RISK_REGISTER.md` |
| Removing `expo-blur` / `expo-linear-gradient` | Only 4 and 3 usages respectively — not a material cost |
| Reducing the 30 s HTTP timeout | Deliberately set for slow warehouse networks (`httpClient.ts:22` comment). Cancellation (PERF-04) is the right fix, not a shorter timeout |
