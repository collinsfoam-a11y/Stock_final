# UI Governance Migration Report

Date: 2026-05-08

## Gate Status

- Full UI governance strict gate: PASS
- Blocking P0/P1 findings: 0
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

## Current Migration Inventory

Generated with `node frontend/scripts/check-ui-governance.cjs --strict --report --max-findings=0`.

- Files scanned: 402
- Total findings: 1410
- P1 findings: 74, all deprecated debt
- P2 advisory findings: 1336
- Deprecated usage: 72
- Token adoption advisories: 1040
- Accessibility advisories: 223
- Motion advisories: 73
- Virtualization advisories: 2
- Navigation blockers: 0

## Remaining Advisory Debt

- Replace remaining `auroraTheme` imports with `useUiTokens` or semantic tokens during feature touches.
- Retire `GlassCard`, `AuroraBackground`, `ParticleField`, `PatternBackground`, `EnhancedButton`, `EnhancedInput`, and `Premium*` exports after consumers are migrated.
- Convert the two remaining dense-screen advisories in admin security/users screens to virtualization-safe renderers.
- Tokenize remaining raw spacing/radius values as screens are edited.
- Add accessibility props or approved primitives for remaining direct `TouchableOpacity` and `Pressable` controls.
- Replace remaining inline animation timings with tokenized motion values and reduced-motion checks.

## Enforcement Commands

- `npm run governance:ui:test`
- `npm run governance:ui:changed:strict`
- `node frontend/scripts/check-ui-governance.cjs --strict`
- `npm run governance:ui:report`
- `npm run typecheck`
