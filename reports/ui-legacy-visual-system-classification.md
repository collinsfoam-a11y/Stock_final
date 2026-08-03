# UI Legacy Visual System Classification

Date: 2026-05-08

This classification controls retirement of old visual systems while preserving operational stability.

| System | Classification | Current State | Replacement | Rule |
| --- | --- | --- | --- | --- |
| `auroraTheme` | migration-required | 0 scanner-tracked operational imports | `useUiTokens`, `themeTokens` | No new usage. Existing large supervisor/dashboard screens now consume token-fed operational bridges only. |
| `legacyCompat` | wrapper-only | Compatibility bridge for old theme consumers | `useUiTokens`, `themeTokens` | Allowed only inside migration paths and legacy consumers. |
| `PremiumButton` | wrapper-only | Adapter over `AppButton` | `AppButton` | No production imports outside `components/premium`. |
| `PremiumCard` | wrapper-only | Adapter over `AppCard` | `AppCard` | No production imports outside `components/premium`. |
| `PremiumInput` | wrapper-only | Adapter over `AppInput` | `AppInput` | No production imports outside `components/premium`. |
| `GlassCard` | approved-exception | Deprecated component, no direct app imports after this pass | `AppCard` | Appearance/demo only until removed. |
| `EnhancedButton` | wrapper-only | Deprecated compatibility surface | `AppButton` | No new imports. |
| `EnhancedInput` | wrapper-only | Deprecated compatibility surface | `AppInput` | No new imports. |
| `RippleButton` | wrapper-only | Deprecated tokenized compatibility facade | `AppButton` | No new imports. |
| `AuroraBackground` | approved-exception | Deprecated background implementation used only through approved wrappers | `ScreenContainer backgroundType="solid"` | Operational screens must not use it. |
| `ParticleField` | removable | Decorative implementation retained for legacy background compatibility | none | Remove after `AuroraBackground` retirement. |
| `PatternBackground` | approved-exception | Deprecated background implementation used only through approved wrappers | `ScreenContainer backgroundType="solid"` | Appearance/demo only until removed. |

## Enforcement State

- Runtime dev warnings are centralized in `frontend/src/components/ui/legacyVisualSystem.ts`.
- Deprecated component families are adapter-only, exception-only, or quarantine-only.
- New direct `Premium*`, `Glass*`, `Enhanced*`, aurora, particle, and pattern usage remains blocked or reported by `frontend/scripts/check-ui-governance.cjs`.
- Approved legacy facade exports are tracked as `quarantine` P2 findings, not production P1 debt.
- Full strict governance currently has zero blocking P0/P1 findings.

## Next Retirement Order

1. Replace the remaining token-fed operational bridge consumers with direct `useUiTokens` styles during screen decomposition.
2. Replace the remaining `ScreenContainer` decorative background compatibility path after appearance routes stop depending on it.
3. Remove `ParticleField` once `AuroraBackground` has no consumers.
4. Remove `Enhanced*` and `Premium*` exports after downstream imports remain at zero for one release cycle.
