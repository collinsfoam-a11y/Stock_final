# UI / UX Screen Audit Matrix

**Target:** `Stock_final/frontend` v2.1.0 · **Date:** 2026-08-02
**Routes assessed:** 60 files under `app/`

## Legend

| Mark | Meaning |
|---|---|
| ✅ Pass | No defect found by the applied method |
| ⚠️ Minor | Cosmetic or low-impact inconsistency |
| 🟠 Major | Materially degrades usability, consistency or reliability |
| 🔴 Critical | Blocks the workflow or causes data/security harm |
| ➖ Not assessed | Requires device runtime, or the file is a thin delegate/redirect |

## Method and its limits

Ratings are derived from static analysis: token adoption and governance findings (UI), state-coverage and workflow tracing (UX), safe-area/keyboard/absolute-positioning primitives (Alignment), accessibility-prop density (A11y), virtualisation and animation patterns (Performance), `useWindowDimensions` and platform splits (Responsive), and loading/error/empty/retry/offline handling (Error handling).

**Alignment is marked ➖ for most screens deliberately.** Visual alignment cannot be honestly assessed without rendering. It is marked 🟠/🔴 only where a *structural* cause is present in code (missing keyboard avoidance on a form, type-suppressed `pointerEvents`, etc.). Per the audit's accuracy rules, no visual defect is asserted that was not observed.

---

## 1. Root and authentication routes

| Screen | UI | UX | Alignment | A11y | Perf | Responsive | Error handling | Overall |
|---|---|---|---|---|---|---|---|---|
| `app/_layout.tsx` (root shell) | ✅ | ✅ | ⚠️ | ➖ | ✅ | ✅ | ✅ | ✅ **Pass** |
| `app/index.tsx` (32 L, redirect) | ➖ | ✅ | ➖ | ➖ | ✅ | ➖ | ➖ | ✅ **Pass** |
| `app/welcome.tsx` (32 L, delegate) | ➖ | ✅ | ➖ | ➖ | ✅ | ➖ | ➖ | ✅ **Pass** |
| `app/login.tsx` (646 L) | ⚠️ | ✅ | ➖ | 🟠 | ⚠️ | ✅ | ✅ | ⚠️ **Minor** |
| `app/register.tsx` | ⚠️ | ✅ | ➖ | 🟠 | ✅ | ✅ | ✅ | ⚠️ **Minor** |
| `app/forgot-password.tsx` | ⚠️ | ✅ | ➖ | 🟠 | ⚠️ | ✅ | ✅ | ⚠️ **Minor** |
| `app/reset-password.tsx` | ⚠️ | ✅ | ➖ | 🟠 | ✅ | ✅ | ✅ | ⚠️ **Minor** |
| `app/otp-verification.tsx` | ⚠️ | ✅ | ➖ | 🟠 | ✅ | ✅ | ✅ | ⚠️ **Minor** |
| `app/security.tsx` | ⚠️ | ⚠️ | ➖ | 🟠 | ✅ | ✅ | ⚠️ | ⚠️ **Minor** |
| `app/notifications.tsx` | ⚠️ | ✅ | ➖ | 🟠 | ⚠️ | ✅ | ✅ | ⚠️ **Minor** |
| `app/help.tsx` (386 L) | 🟠 | ⚠️ | ➖ | 🟠 | ✅ | ✅ | 🟠 | 🟠 **Major** |
| `app/debug.tsx` (24 L) | ➖ | ➖ | ➖ | ➖ | ✅ | ➖ | ➖ | ⚠️ **Minor** |
| `app/+not-found.tsx` | ⚠️ | ✅ | ➖ | ➖ | ✅ | ✅ | ✅ | ⚠️ **Minor** |

**Notes**
- `app/login.tsx` is the tested, linked login (`__tests__/login.test.tsx`, `__tests__/login_accessibility.test.tsx`). A11y is 🟠 because status changes on failed login are not announced (FE-P1-010) and placeholder contrast fails (FE-P1-006).
- `app/help.tsx` has **zero** loading, error, empty, retry or offline handling (measured `load=0 err=0 empty=0 retry=0 offline=0`) yet is a 386-line content screen — 🟠 for UI (13 UI015 governance findings incl. `padding:16`, `gap:16`, `borderRadius:12` at `:298-303`) and error handling.
- `app/forgot-password.tsx:193` uses `entering={FadeInDown.duration(600).springify()}` — a 600 ms decorative entrance on a recovery flow (governance UI016).
- `app/+not-found.tsx:24,34` uses raw `padding: 20` / `paddingVertical: 15` — off the spacing scale.

---

## 2. Duplicate / unlinked routes — FE-P1-005

These 8 files have **zero inbound links** but remain URL-addressable expo-router routes. They are rated on their status as duplicates, not on internal quality.

| Screen | LOC | UI | UX | Alignment | A11y | Perf | Responsive | Error handling | Overall |
|---|---:|---|---|---|---|---|---|---|---|
| `app/improved-login.tsx` | 646 | 🔴 | 🔴 | ➖ | 🟠 | 🟠 | ➖ | ⚠️ | 🔴 **Critical** |
| `app/improved-welcome.tsx` | 359 | 🔴 | 🟠 | ➖ | 🟠 | 🟠 | ➖ | ⚠️ | 🔴 **Critical** |
| `app/improved-help.tsx` | 522 | 🔴 | 🟠 | ➖ | 🟠 | 🟠 | ➖ | ⚠️ | 🔴 **Critical** |
| `app/staff/improved-home.tsx` | 541 | 🔴 | 🟠 | ➖ | 🟠 | 🟠 | ➖ | ⚠️ | 🔴 **Critical** |
| `app/staff/improved-scan.tsx` | 521 | 🔴 | 🟠 | ➖ | 🟠 | 🟠 | ➖ | ⚠️ | 🔴 **Critical** |
| `app/staff/improved-settings.tsx` | 493 | 🔴 | 🟠 | ➖ | 🟠 | 🟠 | ➖ | ⚠️ | 🔴 **Critical** |
| `app/supervisor/improved-dashboard.tsx` | 734 | 🔴 | 🟠 | ➖ | 🟠 | 🟠 | ➖ | ⚠️ | 🔴 **Critical** |
| `app/admin/dashboard-web.tsx` | 568 | 🔴 | 🟠 | ➖ | 🟠 | 🟠 | ➖ | ⚠️ | 🔴 **Critical** |

**Why Critical, not Major:** `/improved-login` is a second authentication surface reachable by URL, outside the tested auth path and outside the e2e auth spec. `app/improved-help.tsx:413` carries a blocking P1 governance finding (`backgroundColor: "#f5f5f5"`). `app/supervisor/improved-dashboard.tsx` and `app/staff/improved-*` mix the light unified palette with the dark `legacyColors` palette (FE-P1-008). Total: **4,384 LOC** shipped and never executed.

**Action:** delete all 8 after diffing for wanted behaviour.

---

## 3. Staff routes

| Screen | UI | UX | Alignment | A11y | Perf | Responsive | Error handling | Overall |
|---|---|---|---|---|---|---|---|---|
| `app/staff/_layout.tsx` | ✅ | ✅ | ➖ | ➖ | ✅ | ✅ | ⚠️ | ✅ **Pass** |
| `app/staff/index.tsx` (9 L, redirect) | ➖ | ✅ | ➖ | ➖ | ✅ | ➖ | ➖ | ✅ **Pass** |
| `app/staff/home.tsx` → `StaffHomeScreen` (951 L) | ⚠️ | 🔴 | ➖ | 🟠 | ⚠️ | ✅ | ⚠️ | 🔴 **Critical** |
| `app/staff/scan.tsx` | ⚠️ | ⚠️ | ➖ | 🟠 | ⚠️ | ✅ | ⚠️ | ⚠️ **Minor** |
| `app/staff/item-detail.tsx` (761 L) | ⚠️ | ⚠️ | ➖ | 🟠 | ⚠️ | ✅ | ⚠️ | ⚠️ **Minor** |
| `app/staff/history.tsx` (582 L) | ⚠️ | ✅ | ➖ | 🟠 | ⚠️ | ✅ | ✅ | ⚠️ **Minor** |
| `app/staff/settings.tsx` | ⚠️ | 🔴 | ➖ | 🟠 | ✅ | ✅ | 🟠 | 🔴 **Critical** |

**Notes**
- `staff/home` and `staff/settings` are 🔴 because both import `UniversalLogout`, which **fails to resolve** (FE-P0-001). `app/staff/settings.tsx:26` is the exact import stack Metro reports. Neither screen can be bundled.
- `app/staff/settings.tsx` measures `load=0 err=2 empty=0 retry=0 offline=0` — no loading, retry or offline handling on a screen that performs sign-out.
- `app/staff/scan.tsx` is the primary operational surface: offline handling present (`offline=3`, `retry=6`), and the scan → count workflow traces cleanly with idempotency and conflict recovery. A11y 🟠 solely because scan results are not announced (FE-P1-010).
- `app/staff/item-detail.tsx` has a stray unapplied `item-detail.tsx.patch` beside it (FE-P3-003).

---

## 4. Supervisor routes

| Screen | UI | UX | Alignment | A11y | Perf | Responsive | Error handling | Overall |
|---|---|---|---|---|---|---|---|---|
| `app/supervisor/_layout.tsx` | ✅ | ✅ | ➖ | ➖ | ✅ | ✅ | ✅ | ✅ **Pass** |
| `app/supervisor/index.tsx` (redirect) | ➖ | ✅ | ➖ | ➖ | ✅ | ➖ | ➖ | ✅ **Pass** |
| `app/supervisor/dashboard.tsx` (685 L) | 🟠 | ✅ | ➖ | 🟠 | ⚠️ | ✅ | ⚠️ | 🟠 **Major** |
| `app/supervisor/sessions.tsx` | ⚠️ | ✅ | ➖ | 🟠 | ⚠️ | ✅ | ✅ | ⚠️ **Minor** |
| `app/supervisor/session/[id].tsx` → `SessionDetailScreen` (1144 L) | ⚠️ | ⚠️ | ➖ | 🟠 | 🟠 | ✅ | ⚠️ | 🟠 **Major** |
| `app/supervisor/items.tsx` (578 L) | ⚠️ | ✅ | ➖ | 🟠 | ⚠️ | ✅ | ✅ | ⚠️ **Minor** |
| `app/supervisor/variances.tsx` (764 L) | ⚠️ | ✅ | ➖ | 🟠 | ⚠️ | ✅ | ✅ | ⚠️ **Minor** |
| `app/supervisor/variance-details.tsx` (525 L) | ⚠️ | ⚠️ | ➖ | 🟠 | ⚠️ | ✅ | 🟠 | ⚠️ **Minor** |
| `app/supervisor/approval-queue.tsx` | ⚠️ | ✅ | ➖ | 🟠 | ⚠️ | ✅ | ✅ | ⚠️ **Minor** |
| `app/supervisor/offline-queue.tsx` | ⚠️ | ✅ | ➖ | 🟠 | ⚠️ | ✅ | ✅ | ⚠️ **Minor** |
| `app/supervisor/sync-conflicts.tsx` (775 L) | ⚠️ | ✅ | ➖ | 🟠 | 🟠 | ✅ | ✅ | ⚠️ **Minor** |
| `app/supervisor/recount-request.tsx` | ⚠️ | ⚠️ | ➖ | 🟠 | ✅ | ✅ | 🟠 | ⚠️ **Minor** |
| `app/supervisor/observation-detail.tsx` | ⚠️ | ⚠️ | ➖ | 🟠 | ✅ | ✅ | 🟠 | ⚠️ **Minor** |
| `app/supervisor/activity-logs.tsx` | ⚠️ | ✅ | ➖ | 🟠 | ⚠️ | ✅ | ✅ | ⚠️ **Minor** |
| `app/supervisor/user-workflows.tsx` (730 L) | ⚠️ | ⚠️ | ➖ | 🟠 | ⚠️ | ✅ | ✅ | ⚠️ **Minor** |
| `app/supervisor/bulk-ops.tsx` (5 L, delegate) | ➖ | ➖ | ➖ | ➖ | ✅ | ➖ | ➖ | ✅ **Pass** |
| `app/supervisor/settings.tsx` (172 L) | ⚠️ | ⚠️ | ➖ | 🟠 | ✅ | ✅ | 🔴 | 🟠 **Major** |

**Notes**
- `supervisor/dashboard.tsx` is 🟠 for UI: it imports **both** the light unified palette and the dark `legacyColors` palette (FE-P1-008), as do 4 of its child components (`SupervisorStatsSection`, `SupervisorActivitySection`, `SupervisorRecentSessionsSection`, `SupervisorOverviewCard`).
- `session/[id].tsx` delegates to a 1,144-line screen mixing fetching, business rules and presentation (FE-P2-002) — 🟠 Perf for the same reason.
- `supervisor/settings.tsx` measures `load=0 err=0 empty=0 retry=0 offline=0` across 172 lines — **no error, loading or offline state at all** on a settings screen that writes user preferences. 🔴 error handling.
- `offline-queue.tsx` and `sync-conflicts.tsx` are the recovery surfaces for FE-P0-002 and are well built (`offline=27`, `empty=6`, `retry=3`). They are the right place to surface quarantined cross-user queue entries.
- `supervisor/_layout.tsx:67` gates on `user?.role === "admin"` — correct as UI, but see FE-P2-010.

---

## 5. Admin routes

| Screen | UI | UX | Alignment | A11y | Perf | Responsive | Error handling | Overall |
|---|---|---|---|---|---|---|---|---|
| `app/admin/_layout.tsx` | ✅ | ✅ | ➖ | ➖ | ✅ | ✅ | ⚠️ | ✅ **Pass** |
| `app/admin/index.tsx` (9 L, redirect) | ➖ | ✅ | ➖ | ➖ | ✅ | ➖ | ➖ | ✅ **Pass** |
| `app/admin/users.tsx` (604 L) | ⚠️ | ✅ | ➖ | 🟠 | ⚠️ | ✅ | ✅ | ⚠️ **Minor** |
| `app/admin/settings.tsx` (527 L) | 🟠 | ✅ | ➖ | 🟠 | ⚠️ | ✅ | ✅ | 🟠 **Major** |
| `app/admin/security.tsx` (776 L) | 🟠 | ⚠️ | ➖ | 🟠 | ⚠️ | ✅ | ✅ | 🟠 **Major** |
| `app/admin/permissions.tsx` (533 L) | ⚠️ | ⚠️ | ➖ | 🟠 | ⚠️ | ✅ | 🟠 | ⚠️ **Minor** |
| `app/admin/realtime-dashboard.tsx` | ⚠️ | ✅ | ➖ | 🟠 | 🟠 | ✅ | ✅ | ⚠️ **Minor** |
| `app/admin/logs.tsx` | ⚠️ | ✅ | ➖ | 🟠 | ⚠️ | ✅ | ✅ | ⚠️ **Minor** |
| `app/admin/sql-config.tsx` | ⚠️ | ⚠️ | ➖ | 🟠 | ✅ | ✅ | ⚠️ | ⚠️ **Minor** |
| `app/admin/unknown-items.tsx` | ⚠️ | ✅ | ➖ | 🟠 | ⚠️ | ✅ | ✅ | ⚠️ **Minor** |
| `app/admin/control-panel.tsx` (5 L, delegate) | ➖ | ➖ | ➖ | ➖ | ✅ | ➖ | ➖ | ✅ **Pass** |
| `app/admin/live-view.tsx` (5 L, delegate) | ➖ | ➖ | ➖ | ➖ | ✅ | ➖ | ➖ | ✅ **Pass** |
| `app/admin/metrics.tsx` (12 L, delegate) | ➖ | ➖ | ➖ | ➖ | ✅ | ➖ | ➖ | ✅ **Pass** |
| `app/admin/reports.tsx` (12 L, delegate) | ➖ | ➖ | ➖ | ➖ | ✅ | ➖ | ➖ | ✅ **Pass** |

**Notes**
- `admin/settings.tsx` carries 8 UI015 governance findings in a single style block (`:445` `paddingHorizontal:16`, `:460` `gap:6`, `:464` `paddingHorizontal:14`, `:465` `paddingVertical:9`, `:475` `padding:16`, `:502` `gap:12`, `:503` `padding:16`, `:519-520`). `paddingVertical: 9` and `paddingHorizontal: 14` are off any plausible 4/8-point grid — 🟠 UI.
- `admin/security.tsx` uses five distinct raw radii — `24` (`:550`), `4` (`:590`), `8` (`:632`), `22` (`:702`), `3` (`:731`). Five radii in one screen is the clearest single instance of radius-scale drift in the codebase — 🟠 UI.
- `admin/realtime-dashboard.tsx` is 🟠 Perf: real-time polling plus dashboard rendering; it is also one of the screens contributing to the 5 `AppState` listeners flagged by `governance:runtime:health` (limit 4).
- The 4 delegate routes (5-12 LOC) forward to `src/components/admin/*` and are correctly thin.

---

## 6. Aggregate

| Rating | Count | % of 60 |
|---|---:|---:|
| ✅ Pass | 13 | 22% |
| ⚠️ Minor | 27 | 45% |
| 🟠 Major | 7 | 12% |
| 🔴 Critical | 13 | 22% |

**All 13 Critical ratings trace to just two findings:** the 8 unlinked duplicate routes (FE-P1-005) and the 3 screens blocked by the unresolved `logoutService` import (FE-P0-001) — plus `staff/home` and `staff/settings` counted in the latter. Deleting the duplicates and fixing the import removes every Critical rating in the matrix.

**Universal 🟠 on Accessibility:** every screen with interactive content is rated 🟠, driven by two codebase-wide findings rather than per-screen defects — FE-P1-006 (token contrast failures) and FE-P1-010 (status changes not announced, 42% label coverage). Both are fixed centrally, not screen by screen.

**Universal ⚠️ on UI:** driven by the 547 arbitrary spacing/radius governance findings distributed across the tree, and by token adoption sitting at 61% against a 65% floor.

## 7. Screens with the weakest state coverage

Measured occurrences of loading / error / empty / retry / offline handling per route file. Thin delegate files are excluded.

| Screen | LOC | load | err | empty | retry | offline | Verdict |
|---|---:|---:|---:|---:|---:|---:|---|
| `app/help.tsx` | 386 | 0 | 0 | 0 | 0 | 0 | No state handling at all |
| `app/supervisor/settings.tsx` | 172 | 0 | 0 | 0 | 0 | 0 | No state handling at all |
| `app/staff/settings.tsx` | — | 0 | 2 | 0 | 0 | 0 | No loading/retry/offline |
| `app/supervisor/recount-request.tsx` | — | 0 | 4 | 0 | 0 | 0 | No loading/retry/offline |
| `app/staff/improved-settings.tsx` | 493 | 0 | 14 | 0 | 1 | 12 | (duplicate — delete) |
| `app/security.tsx` | — | 2 | 6 | 0 | 0 | 0 | No empty/retry/offline |
| `app/admin/permissions.tsx` | 533 | 2 | 10 | 0 | 0 | 20 | No empty state or retry |
| `app/supervisor/observation-detail.tsx` | — | 2 | 5 | 0 | 0 | 0 | No empty/retry/offline |

These are the screens to prioritise when closing the error/loading/empty-state gap in Phase 2 of the remediation plan.
