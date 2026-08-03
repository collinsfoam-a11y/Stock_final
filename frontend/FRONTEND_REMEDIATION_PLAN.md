# Frontend Remediation Plan

**Target:** `frontend/` v2.1.0 · **Date:** 2026-08-02
**Companion documents:** `FRONTEND_COMPREHENSIVE_AUDIT_REPORT.md` · `FRONTEND_FINDINGS_REGISTER.md` · `DESIGN_SYSTEM_AUDIT.md` · `DEPENDENCY_RISK_REGISTER.md` · `FRONTEND_PERFORMANCE_AUDIT.md` · `UI_UX_SCREEN_AUDIT_MATRIX.md`

**Effort scale:** XS < ½ day · S ≤ 1 day · M 2-3 days · L 4-7 days · XL > 1 week

> ⚠️ **State notice.** FE-P0-001 (build failure) and FE-P1-009 (typecheck error) were fixed by a concurrent process during the audit and re-verified green. They are excluded from the backlog below except for the residual FE-P2-017. **32 findings remain open.**

---

## Phase 0 — Safety and data integrity (P0 only)

**Gate: nothing ships until this phase is complete and verified.**

| Action | Priority | Effort | Risk | Dependencies | Acceptance criteria |
|---|---|---|---|---|---|
| **0.1** Add `owner_user_id` to `OfflineQueueItem`; populate in `addToOfflineQueue` from the authenticated user | P0 | S | Low | Backend agreement on the field name if it is forwarded | Every new queue entry carries the enqueuing user's id; existing entries treated as `owner_user_id: null` |
| **0.2** In `syncService.syncOfflineQueue`, skip and quarantine entries whose `owner_user_id` ≠ current user, routing them to `failed_manual_review` | P0 | S | **Medium** — must not drop counts | A queue entry created by user A is **never** submitted under user B's token; it appears in `app/supervisor/offline-queue.tsx` for resolution |
| **0.3** Add `COUNT_LINES_CACHE` to `clearReadCaches()` so cached count lines do not survive logout | P0 | XS | Low | 0.1 | After `logout()`, `count_lines_cache` is absent from AsyncStorage |
| **0.4** Surface quarantined cross-user entries in the supervisor offline-queue screen with a clear reason and a reassign/discard action | P0 | M | Low | 0.2 | Supervisor can see, attribute and resolve orphaned entries |
| **0.5** Write the regression test that would have caught this: enqueue as A → logout → login as B → sync → assert 0 submitted, 1 quarantined, `count_lines_cache` absent | P0 | S | Low | **1.1** (tests must be able to run) | Test passes; fails if 0.1-0.3 are reverted |

**Explicitly rejected approach:** calling `clearOfflineQueue()` unconditionally on logout. That would trade a P0 attribution bug for a P0 **data-loss** bug — silently destroying counts an operator recorded offline. Quarantine, never delete.

**Phase 0 exit criteria**
- 0.1-0.5 complete and the regression test is green.
- Manual two-operator verification on a shared physical device.

---

## Phase 1 — Production blockers (P1)

| Action | Priority | Effort | Risk | Dependencies | Acceptance criteria |
|---|---|---|---|---|---|
| **1.1** Add `@sentry/react-native` and `@sentry/core` to `jest.config.js` `transformIgnorePatterns` (FE-P1-001) | P1 | XS | None | — | `npm test` → 0 failed suites; all 6 `authStore` suites and `sync-engine-contract` execute |
| **1.2** Remove `sentry-expo` from `package.json` **and** `app.json` `plugins`; drop it from `transformIgnorePatterns` (FE-P1-003) | P1 | XS | Low — 0 source imports | 1.1 | `npx expo-doctor` → 19/19; EAS build succeeds iOS **and** Android; a test exception reaches Sentry |
| **1.3** Remove the 9 phantom dependencies; delete `tailwind.config.js` (FE-P1-002) | P1 | XS | Very low — 0 imports | — | `npx knip` → 0 unused deps; `build:web` exits 0 |
| **1.4** Regenerate `pnpm-lock.yaml`; add `pnpm install --frozen-lockfile` to CI | P1 | XS | Low | 1.2, 1.3 | Clean checkout installs reproducibly |
| **1.5** Fix the 5 failing WCAG AA contrast pairs at token level (FE-P1-006) | P1 | S | Low — token-level, propagates to 87 files | — | All semantic fg/bg pairs ≥ 4.5:1 (≥ 3:1 large text) |
| **1.6** Add a contrast assertion to `scripts/check-ui-governance.cjs` | P1 | S | None | 1.5 | CI fails on any future sub-4.5:1 semantic pair |
| **1.7** Delete the 8 unlinked duplicate routes (4,384 LOC) after diffing for wanted behaviour (FE-P1-005) | P1 | M | **Medium** — must not lose a wanted improvement | — | 0 `improved-*` route files; `/improved-login` returns 404; e2e auth spec passes; bundle shrinks |
| **1.8** Extend `app/__tests__/route-hygiene.test.ts` to fail on unlinked routes and non-source files under `app/` | P1 | S | Low | 1.7 | Test fails if an orphan route or a stray `.patch` reappears |
| **1.9** Add `accessibilityLiveRegion` to Toast and OfflineStatusIndicator; announce scan outcomes (FE-P1-010) | P1 | M | Low | — | VoiceOver and TalkBack announce save / queued-offline / sync-failed / scan result |
| **1.10** Expose `highContrast` in `THEME_METADATA` — the theme already exists at `themes.ts:672` (FE-P1-010, FE-P3-006) | P1 | XS | None | — | High-contrast theme selectable in settings |
| **1.11** Resolve the 3 blocking governance P1s (FE-P1-007) | P1 | XS | None | 1.7 removes 2 of 3 | `governance:ui:health` → `Status: PASS` |
| **1.12** Decide `apps/` + `packages/`: delete, or remove `MockHttpClient` and inject the real client (FE-P1-004) | P1 | S (delete) / L (complete) | **High if left as-is** | Architecture decision | `grep MockHttpClient` → 0 hits in shipped code |
| **1.13** Fix the force-logout path to run full teardown instead of `setState` (FE-P2-017) | P1 | XS | Low | 0.1-0.3 | Forced logout clears storage and all caches; no `as any` |
| **1.14** Migrate the 12 remaining files off `legacyColors`; delete the legacy palette (FE-P1-008) | P1 | L | Medium — visual regression risk | 1.7 removes 2 of 14 | `grep legacyColors` → 0 hits outside `src/theme`; visual e2e passes |
| **1.15** Set `app.json` `primaryColor` to `#0655A5` (FE-P1-008) | P1 | XS | None | — | Splash and OS chrome match the in-app primary |
| **1.16** Add `doctor:expo` to the `ci` script | P1 | XS | None | 1.2 | CI fails on any future duplicate native module |

**Phase 1 exit criteria**
- `npm run ci` exits 0 (lint + typecheck + test + `governance:ui:strict` + `knip:check`).
- `npx expo-doctor` → 19/19.
- `npm run build:web` and EAS builds for **both** iOS and Android succeed.
- Manual pass on one small Android phone and one iPhone at **200% text scale**: login → scan → count → offline → sync → logout.

---

## Phase 2 — UX and design consistency (high-impact P2)

| Action | Priority | Effort | Risk | Dependencies | Acceptance criteria |
|---|---|---|---|---|---|
| **2.1** Migrate the 3 restricted `TouchableOpacity` imports to `AppTouchable` (FE-P2-015) | P2 | XS | Low | — | `npx expo lint` → 0 errors |
| **2.2** Delete `clearAuth` — the dead 85-line duplicate of `logout` (FE-P2-003) | P2 | XS | Low | 1.13 | One logout path; `authStore` tests green |
| **2.3** Add loading / error / empty / retry / offline states to the 8 screens with the weakest coverage | P2 | M | Low | — | `help.tsx`, `supervisor/settings.tsx`, `staff/settings.tsx`, `recount-request.tsx`, `security.tsx`, `admin/permissions.tsx`, `observation-detail.tsx` each have all five |
| **2.4** Aggregate logout cleanup failures and surface a warning instead of silent `catch {}` (FE-P2-004) | P2 | S | Low | 1.13 | A failed teardown warns the user and reports to Sentry |
| **2.5** Delete `ModernHeaderWithLogout`, `ScreenHeader`, `LoadingSkeleton`; migrate their 3 call-sites | P2 | S | Low | 1.7 | One canonical header, one skeleton family |
| **2.6** Fix the `ModernButton` primary-variant theme bypass | P2 | XS | Low | 1.14 | Primary variant follows the active theme like all others |
| **2.7** Consolidate the 5 `AppState` listeners into one provider (PERF-05) | P2 | S | Medium — resume behaviour | — | `governance:runtime:health` → PASS; no duplicate foreground requests |
| **2.8** Gate the 25 `withRepeat` animations behind reduced motion + screen focus (FE-P2-008) | P2 | M | Low | — | Reduced-motion coverage ≥ floor; no animation runs off-screen |
| **2.9** Reduce the 547 arbitrary spacing/radius values, highest-density files first | P2 | L | Low | — | Token adoption ≥ 65%; ratchet the floor upward |
| **2.10** Raise `accessibilityLabel` coverage from 42% toward 80%, prioritising icon-only controls | P2 | L | Low | — | Governance accessibility coverage rises; axe assertions pass |
| **2.11** Add `maxFontSizeMultiplier` where fixed-height rows would clip at 200% scale | P2 | S | Low | Runtime verification first | No clipped text at 200% on either platform |
| **2.12** Fix the type-suppressed `pointerEvents: "none" as any` in `app/_layout.tsx:369` | P2 | XS | Low | — | No `as any`; correct behaviour on RN and RN-Web |

---

## Phase 3 — Performance and maintainability

| Action | Priority | Effort | Risk | Dependencies | Acceptance criteria |
|---|---|---|---|---|---|
| **3.1** Establish a device performance baseline (cold start, TTI, scroll FPS, resume) | P2 | M | None | — | Documented baseline on one mid-range Android + one iPhone |
| **3.2** Enable Sentry Performance tracing (SDK already installed) | P2 | S | Low | 1.2 | Field cold-start and navigation timings visible |
| **3.3** Triage the 33 `ScrollView` + `.map()` files; convert only unbounded ones (PERF-03) | P2 | M | Medium | 3.1 | 1,000-row list TTI and scroll FPS improve measurably |
| **3.4** Migrate the offline queue to `expo-sqlite` to remove O(n) enqueue cost (PERF-09) | P2 | L | **High** — touches the data-integrity path | Phase 0 complete | Enqueue time flat from depth 10 → 1000; all offline tests green |
| **3.5** Add request cancellation via TanStack Query `signal` (PERF-04) | P2 | M | Medium | — | No requests complete after their screen unmounts |
| **3.6** Consolidate onto Reanimated; retire RN `Animated` except the boot overlay (PERF-01) | P2 | L | Medium | 2.8 | One animation runtime; bundle shrinks |
| **3.7** Replace the 64 inline animation timings with motion tokens (PERF-08) | P2 | M | Low | 3.6 | Governance motion advisories → 0 |
| **3.8** Split `SessionDetailScreen` (1,144 L) and `SerialScannerModal` (1,082 L) | P2 | L | Medium | 3.1 | No screen module > 400 LOC; TTI improves |
| **3.9** Narrow `knip.json` `entry` so unused-file detection actually works (FE-P2-014) | P2 | S | Low | 1.7 | knip reports genuinely unreachable files |
| **3.10** Reduce the 503 `any` / 107 `eslint-disable` occurrences in the highest-risk services first | P2 | L | Low | — | `authStore`, `offlineStorage`, `syncService`, `httpClient` free of `any` |
| **3.11** Remove `typescript-plugin-filter-text-errors.js` and fix the underlying diagnostics (FE-P2-013) | P2 | S | Low | — | Developers see the same error set as CI |
| **3.12** Clean up: 14 empty dirs, 2 dead tsconfig aliases, `item-detail.tsx.patch`, 3 dead themes | P3 | S | None | 1.12 | Tree contains no empty dirs or stray artefacts |
| **3.13** Route the 199 `console.*` calls through the `log` service (FE-P3-005) | P3 | S | Low | — | No direct `console.*` outside the log service |
| **3.14** Add a user-visible warning + supervisor escalation when the queue passes `maxQueueSize` (FE-P3-004) | P3 | S | Low | 3.4 | Operator is warned before storage pressure becomes a problem |
| **3.15** Consolidate `overrides` and `pnpm.overrides` into one source | P3 | XS | Low | 1.4 | Single override source; identical resolution |

---

## Phase 4 — Strategic maturity

| Action | Priority | Effort | Risk | Dependencies | Acceptance criteria |
|---|---|---|---|---|---|
| **4.1** Raise coverage floors incrementally toward 60% overall and **80%+ on `authStore`, `offlineStorage`, `syncService`, `httpClient`** | P2 | XL | Low | 1.1 | Thresholds ratcheted in `jest.config.js`; never lowered |
| **4.2** Build the missing test layer: offline-across-logout, sync concurrency, logout cleanup, conflict resolution, large-dataset rendering | P1 | L | Low | 1.1, Phase 0 | Every critical workflow has a failure-path test |
| **4.3** Add accessibility assertions (axe-core on web, RNTL a11y queries on native) to the release gate | P2 | M | Low | 1.9 | A11y regressions fail CI |
| **4.4** Implement the canonical token structure from `DESIGN_SYSTEM_AUDIT.md` §5, including `on*` colour pairings | P2 | XL | Medium | 1.5, 1.14, 2.9 | Contrast failures become structurally impossible |
| **4.5** Add `runtimeVersion`, `expo-updates` channels, an iOS EAS profile and a development profile (FE-P2-012) | P1 | S | Low | 1.2 | A shipped defect can be hotfixed OTA; iOS builds are configured |
| **4.6** Confirm backend authorises every endpoint by role independently of the client (FE-P2-010) | P1 | S | — | **Backend team** | Documented confirmation that UI role checks are presentation-only |
| **4.7** Decide the `apps/` + `packages/` architecture direction and execute it fully | P2 | XL | High | 1.12 | One architecture, not two |
| **4.8** Reduce screen-level styling in favour of design-system components | P3 | XL | Low | 4.4 | Governance findings trend toward 0 |
| **4.9** Expand e2e coverage beyond the current 10 specs to all critical workflows | P2 | L | Low | — | Offline, sync-conflict and recount flows covered end-to-end |

---

## Sequencing summary

```text
Phase 0  ──────────────  P0 data integrity            5 actions   ~1 week
   │                     BLOCKS ALL RELEASE
   ▼
Phase 1  ──────────────  P1 production blockers      16 actions   ~2 weeks
   │                     Exit: npm run ci green, expo-doctor 19/19,
   │                           iOS + Android builds, 200% text-scale pass
   ▼
Phase 2  ──────────────  UX + design consistency     12 actions   ~3 weeks
   ▼
Phase 3  ──────────────  Performance + maintainability 15 actions ~4 weeks
   │                     3.1 (baseline) MUST precede 3.3-3.8
   ▼
Phase 4  ──────────────  Strategic maturity            9 actions   ongoing
```

### Critical-path dependencies

- **1.1 gates everything testable.** Until the Jest transform is fixed, 25 suites cannot run and no change to `authStore`, sync or offline behaviour can be verified. **Do it first — it is XS.**
- **Phase 0 depends on 1.1** for its regression test. In practice: apply 1.1, then Phase 0.
- **1.7 (delete duplicate routes) unblocks three others**: it removes 2 of 3 blocking governance P1s (1.11), 2 of the 14 palette-mixing files (1.14), and 4,384 LOC of bundle.
- **3.1 (performance baseline) must precede 3.3-3.8.** Optimising without a baseline is unverifiable.
- **3.4 (SQLite queue migration) must follow Phase 0.** Do not restructure the queue while its user-scoping semantics are still being fixed.

### Recommended first week

| Day | Actions | Rationale |
|---|---|---|
| 1 | 1.1, 1.3, 1.2, 1.4 | All XS; restores the test suite and fixes `expo-doctor` in a single day |
| 2 | 1.5, 1.15, 1.10, 1.16 | Token-level contrast fix + high-contrast theme — large accessibility gain for XS/S effort |
| 3-4 | 0.1, 0.2, 0.3, 0.5 | The remaining P0, now testable |
| 5 | 0.4, 1.13, 2.2 | Supervisor surfacing + logout teardown consolidation |

This ordering front-loads the highest ratio of risk reduction to effort: by end of day 2, four failing gates are green and the worst accessibility defect is fixed, for well under a day of actual code change.

---

## Governance to add alongside remediation

Each gate below would have caught one of the findings in this audit at the moment it was introduced.

| Gate | Catches | Add in |
|---|---|---|
| `pnpm install --frozen-lockfile` in CI | The 9 phantom dependencies | Phase 1 (1.4) |
| `doctor:expo` in `npm run ci` | The duplicate Sentry native module | Phase 1 (1.16) |
| Contrast assertion in the governance scanner | Sub-AA token pairs | Phase 1 (1.6) |
| Route-hygiene: unlinked routes + non-source files | The 8 duplicate routes; `item-detail.tsx.patch` | Phase 1 (1.8) |
| `no-restricted-imports` on `legacyColors` / `globalStyles` / `designTokens` | Palette drift | Phase 1 (1.14) |
| Narrowed `knip.json` entry list | Dead files of any kind | Phase 3 (3.9) |
| Coverage floors ratcheted, never lowered | Test-coverage regression | Phase 4 (4.1) |
| axe-core / RNTL accessibility assertions | Accessibility regression | Phase 4 (4.3) |

**A closing observation.** This codebase already has unusually strong governance infrastructure — an authority-boundary ESLint rule that stops the frontend recomputing backend reconciliation values, bundle-regression guards, and token-adoption trend gates with committed floors. Almost every finding in this audit is a **regression against standards the project already set for itself**, not an absence of standards. The remediation is therefore mostly a matter of restoring gates to green and closing the specific holes the existing gates do not cover — not of building a quality practice from scratch.
