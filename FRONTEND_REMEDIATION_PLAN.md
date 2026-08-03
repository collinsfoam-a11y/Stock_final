# Frontend Remediation Plan & Implementation Roadmap

This document outlines the step-by-step prioritized backlog to resolve all identified frontend findings, restore production build readiness, enforce design governance, and guarantee data integrity.

---

## 1. Remediation Backlog Matrix

### Phase 0 — Safety and Data Integrity (P0 Critical)

| Action Item | Priority | Effort | Risk | Dependencies | Acceptance Criteria |
|---|---|---|---|---|---|
| **ACT-P0-01**: Implement `LogoutService` in `src/services/auth/logoutService.ts` and fix `UniversalLogout.tsx` broken import | **P0** | S | Low | None | `npm run build:web` (`expo export --clear -p web`) completes with exit code 0. |
| **ACT-P0-02**: Add `@sentry/react-native` to `jest.config.js` `transformIgnorePatterns` and add global mock in `jest.setup.js` | **P0** | XS | Low | None | `npm run test` executes with 112 / 112 test suites passing cleanly. |
| **ACT-P0-03**: Replace custom homebrew 32-bit PIN hash in `secureStorage.ts` with standard cryptographic hashing via `expo-crypto` | **P0** | S | Medium | `expo-crypto` | Biometric PIN verification uses hardware-backed SecureStore on native and SHA-256 with random per-device salt on Web. |
| **ACT-P0-04**: Consolidate parallel `improved-*.tsx` screens into canonical file names and delete `item-detail.tsx.patch` | **P0** | S | Low | None | Exactly 1 screen file per route under `app/`. No duplicate URL routes. |

---

### Phase 1 — Production Release Blockers (P1 High)

| Action Item | Priority | Effort | Risk | Dependencies | Acceptance Criteria |
|---|---|---|---|---|---|
| **ACT-P1-01**: Remove `sentry-expo` and install missing peer dependencies `expo-application` and `expo-device` | **P1** | S | Medium | Expo SDK 55 | `npx expo-doctor` passes all 19 checks with 0 errors or warnings. |
| **ACT-P1-02**: Uninstall unused heavy packages (`framer-motion`, `@react-three/fiber`, `@react-three/drei`, `@shopify/react-native-skia`, `lucide-react-native`) | **P1** | XS | Low | None | `npm run knip:check` reports 0 unused dependencies. |
| **ACT-P1-03**: Resolve ESLint errors and execute automated UI governance codemods for primitives and safe back navigation | **P1** | M | Low | Token structure | `npm run lint` and `npm run governance:ui:strict` pass without errors. |
| **ACT-P1-04**: Refactor auth store `logout()` to use explicit Zustand store reset registry without swallow-all catch blocks | **P1** | S | Low | None | Logout purges 100% of user data, cached queries, scan sessions, and notifications. |

---

### Phase 2 — UX and Design Consistency (P2 Medium)

| Action Item | Priority | Effort | Risk | Dependencies | Acceptance Criteria |
|---|---|---|---|---|---|
| **ACT-P2-01**: Refactor oversized screen components (`StaffHomeScreen.tsx`, `sync-conflicts.tsx`, `variances.tsx`) into sub-components | **P2** | M | Low | None | File line count per component reduced under 400 lines. |
| **ACT-P2-02**: Replace hardcoded hex colors and raw pixel layout values with centralized design tokens from `@/theme/themeTokens` | **P2** | M | Low | Token scale | Dark mode theme toggle functions seamlessly without color bugs. |
| **ACT-P2-03**: Wrap interactive touch elements with `AppTouchable` and add explicit `accessibilityLabel` / `accessibilityRole` props | **P2** | S | Low | `AppTouchable` | 100% of touch controls announced correctly in VoiceOver / TalkBack. |

---

### Phase 3 — Performance and Maintainability (Optimization)

| Action Item | Priority | Effort | Risk | Dependencies | Acceptance Criteria |
|---|---|---|---|---|---|
| **ACT-P3-01**: Convert heavy inventory lists in `variances.tsx` and `items.tsx` from `<ScrollView>` to `@shopify/flash-list` | **P3** | S | Low | `@shopify/flash-list` | Scroll frame rate maintained at steady 60 FPS on large sessions. |
| **ACT-P3-02**: Replace whole-store Zustand subscriptions in scanner hooks with fine-grained atomic selectors | **P3** | S | Low | Zustand | Re-render count during rapid barcode scanning reduced by > 70%. |
| **ACT-P3-03**: Wrap Reanimated layout transitions with reduced-motion accessibility preference checks | **P3** | XS | Low | Reanimated | UI responds instantly when user enables "Reduce Motion" in system settings. |

---

### Phase 4 — Strategic Maturity (Long-Term Improvements)

| Action Item | Priority | Effort | Risk | Dependencies | Acceptance Criteria |
|---|---|---|---|---|---|
| **ACT-P4-01**: Implement E2E smoke tests in Playwright covering full barcode scanning and supervisor recount workflow | **P4** | M | Low | Playwright | `npm run e2e:recount-smoke` passes reliably in CI. |
| **ACT-P4-02**: Automate web bundle size regression testing in CI pipeline (`npm run bundle:web:guard`) | **P4** | S | Low | Metro | Web export bundle size monitored and capped at 2.5MB. |
