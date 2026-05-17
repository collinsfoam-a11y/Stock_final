---
name: stock-ui-governance
description: Use when changing Stock Verify screens, forms, scan UI, navigation, spacing, colors, charts, animations, loading/error states, accessibility, or React Native components. Applies the current Stock Verify UI/UX governance docs and mobile warehouse utility style.
---

# Stock UI Governance

Use this skill before any UI change in the frontend.

## Authoritative Docs

- `docs/AGENT_UI_UX_RULES.md`
- `docs/STOCK_VERIFICATION_V3_UI_UX_GUIDE.md`
- `AGENTS.md`

The UI docs win over generic design skills.

## Product Style

Stock Verify is an operational warehouse tool. Favor:

- mobile-first utility layout
- clear hierarchy
- dense but readable cards
- semantic status colors
- large touch targets
- visible session, location, role, online/offline, and sync context
- minimal decoration

Avoid:

- AI-purple or pink-heavy gradients
- glass-heavy layering
- ornamental shadows
- mixed icon sets
- feature-local visual systems
- hidden sync, duplicate, validation, or projection failures

## Token And Component Rules

- Use centralized tokens and shared primitives.
- Do not hardcode new hex colors in feature components.
- Do not introduce arbitrary spacing, radius, typography, shadow, z-index, opacity, or motion values.
- New UI code should prefer token-driven APIs such as `useUiTokens`, `ThemeTokens`, `ScreenContainer`, `UnifiedText`, and `UnifiedView` where available.
- Do not import directly from `theme/modernDesign` or `theme/unified` outside theme infrastructure unless an existing local pattern requires it.
- Icon-only controls need accessible labels.
- Routine UI motion should stay within governance timing and respect reduced motion.

## Screen Contract Checks

For operational screens, ask:

- Does it reduce counting mistakes?
- Is scan feedback immediate and unambiguous?
- Is offline/sync state visible when writes are possible?
- Is there one clear primary action?
- Does back/exit preserve context?
- Are loading, empty, error, retry, and conflict states present?

## Verification

Use the narrowest useful check:

- `cd frontend && npm run governance:ui:changed`
- `cd frontend && npm run governance:ui:changed:strict`
- `cd frontend && npm run typecheck`
- `cd frontend && npm test -- --runInBand`
- Playwright screenshot/E2E checks for screen-level changes
