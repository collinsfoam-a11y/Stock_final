# Frontend Tech Debt

A living, prioritized backlog. Numbers captured 2026-06 from `knip`, `tsc`, the
UI-governance scanner, and `wc -l`. Update as items are burned down.

## 1. Dead code (knip)

`npm run knip` currently reports:

| Category | Count |
|---|---|
| Unused files | ~176 |
| Unused exports | ~258 |
| Unused exported types | ~70 |
| Unused dependencies | 5 (`expo-brightness`, `expo-clipboard`, `expo-keep-awake`, `lottie-react-native`, `react-hook-form`) |
| Unlisted dependencies | 3 |

Spot-checks confirmed these are largely real (e.g. `ChartsPanel`, `PermissionGate`,
`AppLogo` have zero importers; `ErrorLogsPanel` is reachable only from the unused
`AnalyticsDashboard`). Whole feature areas appear built-but-never-wired
(`src/components/analytics/**`, `src/components/charts/**`, several admin panels).

**Plan — triage incrementally, do not bulk-delete blind.**
1. Start with leaf components that have zero importers (lowest risk).
2. Then remove the cascading parents (panels/dashboards) they fed.
3. Verify each dependency removal against dynamic usage before dropping from
   `package.json` (RN libs are sometimes referenced via native config, not imports).
4. Knip runs **advisory** in CI today; once the count is driven down, flip it to
   blocking to prevent regression.

## 2. Oversized files (> 800 lines)

| File | Lines | Notes |
|---|---:|---|
| `src/styles/scanStyles.ts` | 1856 | style module — check overlap with `src/styles/screens/Scan.styles.ts` |
| `src/services/api/inventoryWorkflowApi.ts` | 1273 | service — split by resource |
| `src/screens/supervisor/SessionDetailScreen.tsx` | 1144 | screen — extract styles, then panels |
| `src/components/modals/SerialScannerModal.tsx` | 1050 | the live serial scanner |
| `src/styles/modernDesignSystem.ts` | 1028 | design tokens module |
| `src/store/authStore.ts` | 1014 | store — split slices |
| `src/screens/staff/StaffHomeScreen.tsx` | 959 | screen |
| `src/services/offline/offlineStorage.ts` | 933 | service |
| `src/components/admin/ErrorLogsPanel.tsx` | 839 | **also flagged dead by knip** — likely just delete |
| `src/services/api/adminOperationsApi.ts` | 834 | service |
| `src/services/syncService.ts` | 833 | service |

**Plan:** prioritize user-facing screens/components over services. Use the
style-extraction-then-sub-component pattern (see `docs/CONVENTIONS.md`). One file
per focused PR. `ErrorLogsPanel` overlaps with the dead-code list — verify and
delete rather than split.

## 3. Typed routes (expo-router)

Routes are navigated with `router.push(x as any)` / `as never` casts, which defeat
type checking on route strings.

**Plan (own PR):**
1. Set `expo.experiments.typedRoutes = true` in `app.json`.
2. Add a CI step that generates route types (`expo` prebuild / `expo customize`)
   **before** `tsc`, so CI actually catches route typos.
3. Remove the `as any` / `as never` route casts incrementally.

Enabling the flag alone is a no-op without step 2 (CI has no generated types), so
it was intentionally **not** shipped with the tooling PR.

## 4. UI-governance findings (P2, advisory)

The scanner flags non-blocking issues, concentrated in the large staff screens:

- **UI015** — arbitrary spacing/radius values (e.g. `paddingHorizontal: 12`).
  Replace with spacing tokens.
- **UI016** — inline animation timings (e.g. `withTiming(1, { duration: 2000 })`).
  Move to tokenized motion durations with reduced-motion checks.
- **UI017** — raw `TouchableOpacity` without `accessibilityRole`/label and a 44×44
  target. Migrate to approved button primitives.

**Plan:** fold into each oversized-screen split PR (touch the file once).

## Done (recent)

- Killed 5 `*.screen.tsx` phantom routes; moved a stray component out of `app/`.
- Removed dead nav/layout components (`BottomNavBar`, `StaffTabBar`, `AppHeader`,
  `StaffLayout`/`AdminLayout`/`SupervisorLayout`) and the duplicate bottom-nav system.
- Deleted the superseded `serial-scanner` screen (live one is `SerialScannerModal`).
- Added `route-hygiene` regression test; wired the Jest suite + knip into CI.
- Split `item-detail.tsx` (896→652) and `scan.tsx` (914→757).
- Added the admin/supervisor mobile nav drawer.
