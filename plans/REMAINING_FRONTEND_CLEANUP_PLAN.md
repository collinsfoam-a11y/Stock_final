# Remaining Frontend Cleanup & Migration Plan

This plan details the remaining architectural and codebase debt remediation steps following the completed core cleanups (Dead API code removal, `adminOperationsApi` god module split, UI primitive deprecation, facade removal, and accessibility label fixes).

---

## 1. Theme Unification Phase 2 (~99 Files)

### Problem Statement

Currently, ~99 files import from legacy theme files (`@/theme/legacyCompat`, `@/theme/themeLegacy`, or `@/styles/modernDesignSystem`). `legacyCompat.ts` acts as a bridge between canonical design tokens in `@/theme/unified/` and older systems. Because gray<->neutral color aliasing and spacing scales do not map 1:1, mass automated replacement risks subtle visual regressions (color shade shifts, broken layout spacing, contrast drops).

### Target Architecture

- **Single Canonical Source**: All styling uses `@/theme/unified` tokens or the `useUiTokens()` hook.
- **Zero Legacy Theme Exports**: Complete removal of `legacyCompat.ts`, `themeLegacy.ts`, and `modernDesignSystem.ts`.

### Phased Migration Strategy & Execution Batches

#### Batch 1: Shared UI Primitives & Components (~15 files)

- **Scope**: Components in `src/components/ui/`, `src/components/forms/`, `src/components/modals/`.
- **Action**:
  1. Replace `import { ... } from "@/theme/legacyCompat"` with `import { useUiTokens } from "@/hooks/useUiTokens"` or `import { tokens } from "@/theme/unified"`.
  2. Map legacy color references (`semanticColors`, `unifiedColors`) to `uiTokens.colors`.
  3. Verify each component visually via Expo Web dev server (`localhost:8081`).

#### Batch 2: Staff Domain & Scan Experience (~30 files)

- **Scope**: `src/screens/staff/`, `src/components/scan/`, `app/staff/`.
- **Action**:
  1. Convert screen containers to `useUiTokens()`.
  2. Align scan input fields, barcode scanner overlays, and batch selection cards to unified tokens.
  3. Validate light and dark mode appearance during scanning workflows.

#### Batch 3: Supervisor & Admin Dashboards (~40 files)

- **Scope**: `app/supervisor/`, `app/admin/`, `src/components/supervisor/`, `src/components/admin/`.
- **Action**:
  1. Migrate dashboard cards, real-time tables, filter panels, and modal sheets.
  2. Verify chart colors and status badge color mappings.

#### Batch 4: Auth, Navigation & Root Layouts (~14 files)

- **Scope**: `app/_layout.tsx`, `app/login.tsx`, `app/register.tsx`, `src/components/navigation/`.
- **Action**:
  1. Migrate top navigation bars, sidebars, and drawer navigation.
  2. Remove legacy theme imports from `_layout.tsx` and root providers.

#### Batch 5: Legacy File Deprecation & Removal

- **Action**:
  1. Run `npx knip` or `grep` to verify zero inbound references to `legacyCompat.ts` and `themeLegacy.ts`.
  2. Delete `src/theme/legacyCompat.ts` and `src/theme/themeLegacy.ts`.
  3. Update `src/theme/index.ts` barrel.

---

## 2. Governance Tooling & CI/CD Enforcement

### Target

Prevent future tech debt, dead code re-introduction, or visual component sprawl by embedding quality gates into the CI/CD pipeline.

### Steps

1. **Promote UI Governance to Blocking Check**:
   - Add `npm run governance:ui:strict` to `.github/workflows/pr-checks.yml`.
   - Rejects PRs adding deprecated UI primitives or unapproved styling hacks.
2. **Web Bundle Size Guard**:
   - Enable `npm run bundle:web:guard` in CI to fail builds if web bundle size exceeds the 1.5MB threshold.
3. **Automated Dead Code Detection**:
   - Configure `knip` in CI to catch unused files, exports, or unused dependencies on every PR.

---

## 3. Platform Alignment & Cross-Platform Refinement

### Target

Maintain high performance across Expo iOS/Android native builds and React Native Web.

### Steps

1. **Screen Fork Convergence**:
   - Review `.native.tsx` vs `.web.tsx` screen forks (e.g. `WelcomeScreen`, `IndexScreen`).
   - Consolidate layout logic where possible, using platform hooks (`Platform.OS`) rather than full file forks unless platform behavior fundamentally differs.
2. **Animation Web Degradation**:
   - Ensure Reanimated animations degrade smoothly on web without causing re-render loops or layout shifts.
