# UI Governance Migration Report

Date: 2026-05-08

## Gate Status

- Full UI governance strict gate: PASS
- Blocking P0/P1 findings: 0
- P1 findings: 0
- Changed-line UI governance strict gate: PASS
- TypeScript frontend check: PASS
- Governance scanner unit tests: PASS

## Implemented Hardening

- Added expanded static UI governance scanning for deprecated imports, decorative surfaces, unsafe navigation, dense-list risks, raw colors, arbitrary layout values, inline motion timings, and touchable accessibility gaps.
- Added scanner test coverage and CI integration.
- Added approved primitive facades: `AppButton`, `AppCard`, `AppInput`, `ConfirmDialog`, and `SyncIndicator`.
- Added centralized `safeBackNavigation()` and migrated direct back-navigation blockers.
- Removed operational `backgroundType="aurora"` usage from changed admin routes.
- Replaced changed operational `PremiumButton` and `PremiumInput` imports with approved facades.
- Converted the realtime dashboard table row renderer from `ScrollView + data.map()` to a memoized `FlatList` with stable keys and fixed row layout.
- Added reduced-motion and accessibility metadata to `SyncStatusPill`.
- Added `legacyVisualSystemRegistry` with once-per-component dev warnings for deprecated visual families.
- Converted `PremiumButton`, `PremiumCard`, and `PremiumInput` into wrapper-only adapters over `AppButton`, `AppCard`, and `AppInput`.
- Removed the remaining production `PremiumButton` consumer from `StickyFooter`.
- Migrated `AppearanceSettings` and `SwipeCard` away from `GlassCard` to `AppCard`.
- Converted admin security and user-management dense content from vertical `ScrollView` list rendering to `FlatList` surfaces.
- Added `frontend/src/utils/accessibility.ts` for operational hit slop, minimum touch targets, accessible button/toggle props, and accessibility state normalization.
- Added `frontend/src/utils/motion.ts` for governed motion durations with reduced-motion support.
- Updated `AnimatedPressable` to use governed accessibility and reduced-motion-aware press feedback.
- Migrated `CountQuantitySection` quantity and split-count controls to tokenized spacing/radius and accessible interaction props.
- Added dry-run `npm run codemod:premium-primitives` automation for deprecated `Premium*` primitive replacement candidates.
- Extended governance metrics with an accessibility file coverage estimate.
- Added machine-readable governance report output at `reports/ui-governance-report.json`.
- Added visual-system classification at `reports/ui-legacy-visual-system-classification.md`.
- Migrated shared feedback and utility components off `auroraTheme`: `InlineAlert`, `AnimatedCounter`, `ProgressRing`, `Shimmer`, `ActivityFeedItem`, `ScanFeedback`, `AdminCrashScreen`, and `StaffCrashScreen`.
- Converted `BatchDetailsModal` to semantic tokens, accessible controls, and `FlatList` batch rendering.
- Converted `RippleButton` into a deprecated tokenized compatibility facade without Aurora gradients or custom ripple styling.
- Migrated small realtime dashboard summary/stat components to semantic tokens.
- Removed glass styling from `EnhancedBottomSheet` and added tokenized reduced-motion handling plus accessible close controls.
- Migrated realtime dashboard column settings, item details, toolbar, and virtualized table components to semantic tokens and centralized accessibility props.
- Migrated admin user-management, security, SQL config, logs, unknown-item review, admin/supervisor layouts, and realtime dashboard shell off direct `auroraTheme` imports.
- Added `createOperationalStyleBridge()` as a token-fed quarantine bridge for large supervisor workflow screens pending deeper decomposition.
- Reclassified approved legacy facade exports as `quarantine` P2 scanner findings so production deprecated imports can hard fail without blocking quarantine files.
- Added `reports/ui-governance-health-baseline.json` and `npm run governance:ui:health` for post-stabilization sustainability checks.

## Current Migration Inventory

Generated with `node frontend/scripts/check-ui-governance.cjs --strict --report --max-findings=0 --output=reports/ui-governance-report.json`.

- Files scanned: 405
- Total findings: 1211
- P1 findings: 0
- P2 advisory/quarantine findings: 1211
- Deprecated usage: 0
- Quarantined legacy facade findings: 32
- Token adoption advisories: 922
- Accessibility advisories: 193
- Motion advisories: 64
- Virtualization advisories: 0
- Navigation blockers: 0
- Token adoption estimate: 65%
- Reduced-motion coverage: 8/74 animation files
- Virtualization coverage: 13/68 dense files
- Accessibility file coverage estimate: 43%

## Sustainability Baseline

The governance program is now in platform-health maintenance mode. Hard limits are locked at zero for blocking findings, P0/P1 findings, deprecated production usage, unsafe navigation findings, virtualization findings, operational `auroraTheme` findings, and decorative operational background findings.

Advisory ceilings are baseline health indicators, not cleanup targets for broad rewrites:

- Total findings ceiling: 1211
- Advisory findings ceiling: 1179
- Quarantine findings ceiling: 32
- Token adoption advisory ceiling: 922
- Accessibility advisory ceiling: 193
- Motion advisory ceiling: 64
- Token adoption floor: 65%
- Accessibility file coverage floor: 43%
- Reduced-motion coverage floor: 11%
- Virtualization coverage floor: 19%

Use `npm run governance:ui:health` to prevent hard-gate regression and expose advisory movement. Use `npm run governance:ui:health:strict-advisory` only when intentionally tightening the platform-health baseline.

## Remaining Advisory Debt

- Replace remaining token-fed operational bridge consumers with direct `useUiTokens` styles during screen decomposition.
- Retire `GlassCard`, `AuroraBackground`, `ParticleField`, `PatternBackground`, `EnhancedButton`, `EnhancedInput`, and `Premium*` exports after downstream imports remain at zero for one release cycle.
- Tokenize remaining raw spacing/radius values as screens are edited.
- Add accessibility props or approved primitives for remaining direct `TouchableOpacity` and `Pressable` controls.
- Replace remaining inline animation timings with tokenized motion values and reduced-motion checks.

## Enforcement Commands

- `npm run governance:ui:test`
- `npm run governance:ui:changed:strict`
- `node frontend/scripts/check-ui-governance.cjs --strict`
- `npm run governance:ui:report`
- `npm run governance:ui:report:json`
- `npm run governance:ui:health`
- `npm run typecheck`
