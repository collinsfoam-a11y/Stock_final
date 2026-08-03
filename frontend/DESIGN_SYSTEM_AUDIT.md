# Design System Audit

**Target:** `Stock_final/frontend` v2.1.0 · **Date:** 2026-08-02

---

## 1. Verdict: is this a genuine design system?

**Yes — a genuine design system, at roughly 61% adoption, with four competing colour palettes attached to it.**

This is not a codebase of loosely shared styles. It has:

- A structured token layer (`src/theme/unified/`) split into `colors`, `spacing`, `radius`, `typography`, `shadows`, `animations`, with exported TypeScript types.
- A runtime theming layer (`ThemeContext` → `createThemeTokens` → `useUiTokens`) consumed by **122 files** — the dominant pattern.
- **CI enforcement**: `scripts/check-ui-governance.cjs` scans 241 files against a rule catalogue (UI002 hardcoded colour, UI007 generic error copy, UI015 arbitrary spacing/radius, UI016 inline motion timing, raw shadow props, legacy-family imports, touchable accessibility).
- **Trend gates**: `check-ui-governance-health.cjs` tracks token-adoption %, accessibility coverage %, reduced-motion coverage % and virtualisation coverage % against committed floors in `reports/ui-governance-health-baseline.json`.
- **Lint-level bans**: `.eslintrc.js:52-67` already forbids importing `theme/modernDesign`, `theme/legacyCompat`, `theme/themeLegacy`.

That infrastructure is better than most production React Native codebases. The problems are **regressions against it**, not its absence.

### Maturity score: 5.5 / 10

| Sub-dimension | Score | Rationale |
|---|---:|---|
| Token structure and typing | 8/10 | Well organised, typed, single import surface |
| Governance and enforcement | 8/10 | CI scanners + trend gates + lint bans — genuinely mature |
| Colour coherence | **2/10** | Four competing primaries; light and dark palettes co-resident |
| Adoption | **4/10** | 61% vs a 65% floor; 547 arbitrary spacing/radius findings |
| Theming correctness | 4/10 | Static and runtime layers unsynchronised; components bypass the theme |
| Accessibility of tokens | **2/10** | 5 token pairs fail WCAG AA; high-contrast theme unreachable |
| Motion tokens | 4/10 | Tokens exist; 64 inline timings and 9% reduced-motion coverage |
| Component variants and states | 6/10 | Good primitive set; disabled/focus states under-specified |

---

## 2. Current token architecture

Seven parallel sources of styling truth exist today:

| # | Module | Kind | Consumers | Status |
|---|---|---|---|---|
| 1 | `src/theme/unified/*` (`colors`, `spacing`, `radius`, `typography`, `shadows`, `animations`) | Static tokens | 87 files | **Canonical static layer** |
| 2 | `src/theme/themes.ts` (765 L) → `ThemeContext` → `createThemeTokens` → `useUiTokens` | Runtime theme | **122 files** | **Canonical runtime layer** |
| 3 | `src/theme/unified/colors.ts` `legacyColors` / `legacyTheme` | Dark compat palette | 14 files (aliased `modernColors`) | **Deprecate** |
| 4 | `src/theme/designTokens.ts` | Independent static set | 13 files | **Merge into (1)** |
| 5 | `src/theme/operationalTheme.ts` + `operationalStyleBridge.ts` | Operational overlay | 1 + 4 files | Evaluate — likely fold into (2) |
| 6 | `src/styles/globalStyles.ts` (9.7 KB) | Flattened aliases | 4 files | **Delete after migration** |
| 7 | `tailwind.config.js` | Tailwind/DaisyUI palette | **0** (orphaned) | **Delete** — FE-P1-002 |

Layers 1 and 2 are both legitimate and both needed (static tokens for constants, runtime tokens for theme switching) — but **they are not synchronised**. `unified/colors.ts` exports its own `darkColors`, while dark mode actually comes from `themes.ts`. A component reading `darkColors` and a sibling reading `useUiTokens()` in dark mode can render different colours.

### Evidence of the split

```ts
// src/hooks/useTheme.ts:69-71 — static dark source
const textColors       = isDark ? darkColors.text       : semanticColors.text;
const backgroundColors = isDark ? darkColors.background : semanticColors.background;

// src/context/ThemeContext.tsx:236-263 — runtime dark source (themes.ts)
const isDark = effectiveThemeKey === "dark";
surfaceDark: theme.colors.background.elevated,
```

Two different dark palettes, two different code paths, no reconciliation.

---

## 3. Findings

### 3.1 Colour — four competing primaries (FE-P1-008) — **P1**

| Source | `primary[500]` | Used by |
|---|---|---|
| `src/theme/unified/colors.ts:25` | `#0655A5` — "Lavanya eMart Blue" | 87 files via `colors`/`semanticColors` |
| `src/theme/unified/colors.ts:260` | `#3B82F6` — generic blue | 14 files via `legacyColors`/`modernColors` |
| `app.json:9` `primaryColor` | `#3B82F6` | Splash / OS chrome |
| `tailwind.config.js:16` | `#3b82f6` | Nothing (orphaned) |

The declared brand colour appears in **one** of four places. Splash screen and system chrome do not match the in-app primary.

### 3.2 Colour — a dark palette and a light palette in the same module — **P1**

`legacyColors` (`unified/colors.ts:253-454`) is a **dark** palette:

```ts
background: { default: "#020617", paper: "#0F172A", elevated: "#1E293B" }
surface:    { base: "#0F172A", card: "#1E293B" }
text:       { primary: "#F8FAFC", secondary: "#94A3B8" }
```

`semanticColors` (`:122-194`) is a **light** palette (`background.primary` = `#FFFFFF`, `text.primary` = `#0F172A`).

**14 files import both.** Full list in `FRONTEND_FINDINGS_REGISTER.md` FE-P1-008. The risk is light-on-light or dark-on-dark text wherever a `legacyColors` value lands on a `semanticColors` surface.

Naming makes this worse: `src/styles/globalStyles.ts:9` does `import { colors as legacyColors }` — aliasing the **new** palette to the name of the **legacy** one. Any reader grepping for `legacyColors` gets both meanings.

### 3.3 Colour — WCAG AA contrast failures in shipped tokens (FE-P1-006) — **P1**

Computed from the token source (WCAG 2.1 relative luminance):

| Token pair | Ratio | Verdict |
|---|---:|---|
| `text.muted` / `text.disabled` / `input.placeholder` (`neutral[400]`) on white | **2.56** | ❌ AA fail |
| `button.disabledText` (`neutral[400]`) on `button.disabled` (`neutral[200]`) | **2.08** | ❌ AA fail |
| White on `status.success` (`success[500]` `#22C55E`) | **2.28** | ❌ AA fail |
| White on `status.warning` (`warning[500]` `#F59E0B`) | **2.15** | ❌ AA fail |
| White on `secondary[500]` (`#06B6D4`) | **2.43** | ❌ AA fail |
| White on `status.error` (`error[500]`) | 3.76 | ⚠️ large text only |
| White on `status.info` (`info[500]`) | 3.68 | ⚠️ large text only |
| Dark-mode `text.disabled` (`neutral[600]` on `neutral[900]`) | **2.36** | ❌ AA fail |
| `text.secondary` (`neutral[600]`) on white | 7.58 | ✅ |
| `text.tertiary` (`neutral[500]`) on white | 4.76 | ✅ |
| White on `primary[500]` (`#0655A5`) | 7.37 | ✅ |

The brand primary is well chosen (7.37:1). The failures are concentrated in **muted/disabled text** and **status chips** — the two places an operational app can least afford them.

### 3.4 Spacing and radius — 547 arbitrary values — **P2**

`governance:ui` reports **547 UI015 findings** ("Arbitrary spacing/radius value"). Worst concentrations:

- `app/admin/security.tsx` — five distinct raw radii in one file: `24` (`:550`), `4` (`:590`), `8` (`:632`), `22` (`:702`), `3` (`:731`).
- `app/admin/settings.tsx` — eight raw spacing values including `paddingVertical: 9` (`:465`) and `paddingHorizontal: 14` (`:464`), which fit no 4- or 8-point grid.
- `app/+not-found.tsx:24,34` — `padding: 20`, `paddingVertical: 15`.
- `app/help.tsx:298-303` — `padding: 16`, `gap: 16`, `borderRadius: 12`.

Note that values like `16` and `12` **do** correspond to scale steps; the finding is that they are written as literals rather than referenced from the scale, so the scale cannot be changed centrally.

### 3.5 Motion — tokens exist, 64 inline timings bypass them — **P2**

`src/theme/unified/animations.ts` exports `duration`, `easing`, `animationPresets`, `springConfigs`. Governance reports **64 UI016 findings** where components inline timings instead, e.g.:

```tsx
// app/forgot-password.tsx:193
entering={FadeInDown.duration(600).springify()}
```

600 ms decorative entrances on a password-recovery flow directly contradict the project's own stated principle that operational UI should prioritise clarity and speed over motion.

Compounding factors: **two animation stacks** (Reanimated in 62 files, RN core `Animated` in 62 files), **25 infinite `withRepeat`** animations, and **reduced-motion coverage of 9%** against an 11% floor.

### 3.6 Theming — components bypass the runtime theme — **P2**

`src/components/ui/ModernButton.tsx:86-94`:

```ts
const primaryBackground   = theme?.isDark ? colors.primary[500] : semanticColors.button.primary; // STATIC
const primaryBorder       = theme?.isDark ? colors.primary[600] : semanticColors.button.primary; // STATIC
const secondaryBackground = themedColors?.surfaceElevated ?? semanticColors.button.secondary;    // RUNTIME
const bodyText            = themedColors?.textPrimary     ?? semanticColors.text.primary;        // RUNTIME
```

The primary variant is hard-bound to static tokens while every other variant follows the active theme. Under a non-default theme the primary button will not re-theme with its surroundings.

### 3.7 Themes — 3 dead, 1 built-but-unreachable — **P3 / accessibility-relevant**

`src/theme/themes.ts` defines six themes: `light` (`:212`), `dark` (`:304`), `premium` (`:396`), `ocean` (`:488`), `sunset` (`:580`), `highContrast` (`:672`).

`src/context/ThemeContext.tsx:170-173` exposes only two:

```ts
const THEME_METADATA = [
  { key: "light", name: "Light",    preview: [...] },
  { key: "dark",  name: "Midnight", preview: [...] },
];
```

- `premium`, `ocean`, `sunset` — **dead** (~300 LOC), referenced only by the `ThemeKey` union at `ThemeContext.tsx:50-55`.
- `highContrast` — **fully defined and completely unreachable.** A high-contrast accessibility theme was built and never exposed in the picker. Given FE-P1-006, exposing it is the single cheapest accessibility improvement available.

### 3.8 Component states — under-specified — **P2**

Semantic tokens exist for `interactive.default/hover/active/disabled` and `button.disabled/disabledText`, but there are **no tokens** for:

- **focus** rings on web (only `border.focus` exists — no ring width/offset)
- **pressed** states (handled ad hoc per component)
- **selected** states (list rows, filter chips)
- **loading** states (each component invents its own)

`accessibilityState` appears in only 41 files, so disabled/selected states are frequently conveyed by colour alone — a WCAG 1.4.1 (Use of Colour) concern, compounded by the 2.08:1 disabled-text contrast.

---

## 4. Canonical component list

### Keep — canonical

| Component | Consumers | Role |
|---|---:|---|
| `src/components/ui/AppTouchable.tsx` | enforced by lint | **The** touchable. `.eslintrc.js:36-41` bans raw `TouchableOpacity` |
| `src/components/ui/ModernButton.tsx` | — | Button (fix §3.6 theme bypass) |
| `src/components/ui/ModernCard.tsx` | — | Card |
| `src/components/ui/ModernInput.tsx` | — | Text input |
| `src/components/ui/ModernHeader.tsx` | 19 | Screen header |
| `src/components/ui/Modal.tsx` + `ConfirmModal.tsx` + `BottomSheet.tsx` | — | Overlays |
| `src/components/ui/EmptyState.tsx` | 4 | Empty state |
| `src/components/ui/Skeleton.tsx` + `SkeletonList.tsx` | 2 + 4 | Loading placeholders |
| `src/components/ui/LoadingSpinner.tsx` | 6 | Busy indicator |
| `src/components/ui/StandardizedErrorCard.tsx` | 10 | Error state (fix restricted `TouchableOpacity` at `:2`) |
| `src/components/feedback/Toast.tsx` + `ToastProvider.tsx` | 21 via `toastService` | Transient feedback |
| `src/components/ui/AnimatedPressable.tsx` | — | Press feedback |

### Deprecate — delete

| Component | Consumers | Reason |
|---|---:|---|
| `src/components/ui/ModernHeaderWithLogout.tsx` | **0** | Dead; carries a blocking P1 governance finding (`:130` `#f0f0f0`); calls the `useUniversalLogout` hook via a non-hook alias (`:28`), defeating rules-of-hooks lint |
| `src/components/ui/ScreenHeader.tsx` | 2 | Duplicate of `ModernHeader` |
| `src/components/LoadingSkeleton.tsx` | 1 | Duplicate of `Skeleton` |
| The 8 `improved-*` / `dashboard-web` routes | **0** | FE-P1-005 — 4,384 LOC |

### Fix in place

| Component | Issue |
|---|---|
| `src/components/ui/EnhancedScanInput.tsx:7` | Restricted `TouchableOpacity` import (lint error) |
| `src/components/ui/OfflineStatusIndicator.tsx:2` | Restricted `TouchableOpacity` import (lint error); also needs `accessibilityLiveRegion` per FE-P1-010 |
| `src/components/ui/StandardizedErrorCard.tsx:2` | Restricted `TouchableOpacity` import (lint error) |
| `src/components/auth/UniversalLogout.tsx` | FE-P0-001 broken import; `:130` generic error copy; duplicate export `UniversalLogout` = `useUniversalLogout` |

---

## 5. Proposed canonical token structure

Target: **one static token module, one runtime theme, no compatibility layers.**

```text
src/theme/
├── tokens/                       # static primitives — no React, no theme awareness
│   ├── colors.ts                 # palette scales only (primary, neutral, success, …)
│   ├── spacing.ts
│   ├── radius.ts
│   ├── typography.ts
│   ├── shadows.ts
│   ├── motion.ts
│   └── zIndex.ts
├── semantic/                     # meaning, per mode — the ONLY colour surface components see
│   ├── light.ts
│   ├── dark.ts
│   └── highContrast.ts
├── themes.ts                     # composes tokens + semantic into AppTheme
└── index.ts                      # single public export
```

```text
colors                            # semantic layer — components never read raw scales
  background   { canvas, surface, surfaceElevated, overlay }
  text         { primary, secondary, tertiary, disabled, inverse, link }
  border       { subtle, default, strong, focus }
  primary      { base, hover, active, subtle, onPrimary }
  secondary    { base, hover, active, subtle, onSecondary }
  success      { base, subtle, onSubtle, onBase }     ← onSubtle/onBase encode the AA-safe pairing
  warning      { base, subtle, onSubtle, onBase }
  danger       { base, subtle, onSubtle, onBase }
  information  { base, subtle, onSubtle, onBase }

spacing        xs 4 · sm 8 · md 12 · lg 16 · xl 24 · 2xl 32 · 3xl 48

typography     display · heading · title · body · label · caption
               (each: fontSize, lineHeight, fontWeight, letterSpacing)

radius         sm 4 · md 8 · lg 12 · xl 16 · pill 999

elevation      none · sm · md · lg          (platform-resolved: shadow* on iOS, elevation on Android)

motion         fast 120ms · normal 200ms · slow 320ms
               easing.standard · easing.decelerate · easing.accelerate
               reducedMotion: honoured centrally

touchTarget    min 44          (iOS HIG / WCAG 2.5.5 minimum)

zIndex         base · dropdown · sticky · overlay · modal · toast
```

**The critical change is the `on*` pairing convention.** Every status colour ships with its own AA-verified foreground:

```ts
warning: {
  base:     "#B45309",  // warning[700] — white text passes AA (4.9:1)
  onBase:   "#FFFFFF",
  subtle:   "#FEF3C7",  // warning[100]
  onSubtle: "#78350F",  // warning[900] on warning[100] — 9.8:1
}
```

This makes the FE-P1-006 class of defect structurally impossible: a component cannot pick a foreground that fails contrast, because the foreground travels with the background.

---

## 6. Migration strategy

Sequenced so each step is independently shippable and independently verifiable.

### Step 1 — Fix contrast at the token level (Effort S, no call-site changes)

Change values in `src/theme/unified/colors.ts` only. The 87 files importing `@/theme/unified` inherit the fix automatically.

| Token | From | To | New ratio |
|---|---|---|---:|
| `text.muted`, `text.disabled` | `neutral[400]` | `neutral[500]` `#64748B` | 4.76 ✅ |
| `input.placeholder` | `neutral[400]` | `neutral[500]` | 4.76 ✅ |
| `button.disabledText` | `neutral[400]` | `neutral[600]` `#475569` | 4.71 ✅ |
| `darkColors.text.disabled` | `neutral[600]` | `neutral[500]` | 3.75 ⚠️ → use `neutral[400]` for 6.4 ✅ |
| Status chip pattern | white on `*[500]` | dark text on `*[100]`, or white on `*[700]` | ≥4.5 ✅ |

**Validate:** add a contrast assertion to `scripts/check-ui-governance.cjs` that fails CI on any semantic pair below 4.5:1.

### Step 2 — Expose the high-contrast theme (Effort XS)

Add `{ key: "highContrast", name: "High Contrast", preview: [...] }` to `THEME_METADATA` (`ThemeContext.tsx:170`). The theme already exists at `themes.ts:672`. Delete `premium`, `ocean`, `sunset` and trim the `ThemeKey` union.

### Step 3 — Eliminate the legacy dark palette (Effort L)

1. Delete `app/improved-*` and `app/admin/dashboard-web.tsx` — this removes **2 of the 14** mixing files at zero risk (FE-P1-005).
2. Migrate the remaining 12 off `legacyColors`/`modernColors` onto `useUiTokens()`, one component tree at a time (supervisor dashboard cluster is 6 of them — do it as one change).
3. Delete `legacyColors`, `legacyGradients`, `legacyTheme`, `legacySpacing`, `legacyBorderRadius`, `legacyTypography`, `legacyShadows`, `legacyGlass`, `legacyLayout`, `legacyComponentSizes`, `legacyAnimations` from `src/theme/unified/`.
4. Delete `src/styles/globalStyles.ts` (4 consumers) and `src/theme/designTokens.ts` (13 consumers) after folding their unique values into the canonical tokens.
5. Add to `.eslintrc.js` `no-restricted-imports` patterns — mirroring the existing `modernDesign`/`legacyCompat` bans:

```js
{ group: ["**/theme/unified/colors", "**/styles/globalStyles", "**/theme/designTokens"],
  message: "UI governance: import tokens from @/theme (semantic layer) or useUiTokens()." }
```

### Step 4 — Unify the brand primary (Effort XS)

Set `app.json` `primaryColor` to `#0655A5`. Delete `tailwind.config.js` (FE-P1-002).

### Step 5 — Reconcile static and runtime dark palettes (Effort M)

Make `themes.ts` the single source for both modes; have `unified/darkColors` re-export from it rather than defining its own values, then delete `src/hooks/useTheme.ts`'s independent light/dark branch (`:69-71`) in favour of `useUiTokens()`.

### Step 6 — Close the spacing/radius gap (Effort L, incremental)

Attack the 547 UI015 findings by file, highest-density first: `admin/security.tsx` (5 radii), `admin/settings.tsx` (8 values), `help.tsx`, `+not-found.tsx`. Track progress via the existing token-adoption trend gate; ratchet the floor from 65% upward as each batch lands.

### Step 7 — Consolidate motion (Effort L)

Standardise on Reanimated; migrate the 62 RN-core `Animated` files (leaving `app/_layout.tsx`'s boot overlay, which runs before the theme is available). Replace the 64 inline timings with `motion.fast/normal/slow`. Gate all 25 `withRepeat` loops behind a central `useReducedMotion()` hook.

### Step 8 — Add missing component states (Effort M)

Introduce `focus`, `pressed`, `selected`, `loading` tokens; require `accessibilityState` alongside every visual state change so state is never conveyed by colour alone.

---

## 7. Enforcement

Existing enforcement to keep:

- `scripts/check-ui-governance.cjs` — rule catalogue, `--strict` in `npm run ci`
- `scripts/check-ui-governance-health.cjs` — trend gates with committed floors
- `.eslintrc.js` `no-restricted-imports` — legacy theme families, raw `TouchableOpacity`
- `.eslintrc.js` `no-restricted-properties` / `no-restricted-syntax` — the authority-boundary guard

Enforcement to add:

| Gate | Rule | Fails when |
|---|---|---|
| Contrast | New check in `check-ui-governance.cjs` | Any semantic fg/bg pair < 4.5:1 (< 3:1 for large text and non-text indicators) |
| Legacy palette | `no-restricted-imports` | Any import of `legacyColors` / `legacyTheme` / `globalStyles` / `designTokens` after Step 3 |
| Token adoption | `check-ui-governance-health.cjs` | Ratchet the floor from 65% upward after each Step 6 batch; never allow it to fall |
| Reduced motion | `check-ui-governance-health.cjs` | Raise the floor from 11% to 100% of `withRepeat` sites after Step 7 |
| Route hygiene | `app/__tests__/route-hygiene.test.ts` | A route file exists with no inbound `router.push` / `<Link>` / `<Redirect>` reference |
| Theme bypass | New governance rule | A component imports both `@/theme/unified` colours and `useUiTokens()` |

---

## 8. Summary of design-system actions

| # | Action | Priority | Effort | Fixes |
|---|---|---|---|---|
| 1 | Fix 5 failing contrast pairs at token level | **P1** | S | FE-P1-006 |
| 2 | Add contrast assertion to CI | **P1** | S | Prevents FE-P1-006 recurrence |
| 3 | Expose `highContrast` in `THEME_METADATA` | **P1** | XS | FE-P1-010 (partial), FE-P3-006 |
| 4 | Delete 8 unlinked duplicate routes | **P1** | M | FE-P1-005, 2 of 14 palette-mixers, 1 of 3 blocking governance P1s |
| 5 | Set `app.json primaryColor` to `#0655A5`; delete `tailwind.config.js` | **P1** | XS | FE-P1-008, FE-P1-002 |
| 6 | Migrate 12 files off `legacyColors`; delete the legacy layer | **P1** | L | FE-P1-008 |
| 7 | Fix `ModernButton` primary-variant theme bypass | P2 | XS | §3.6 |
| 8 | Delete `ModernHeaderWithLogout`, `ScreenHeader`, `LoadingSkeleton` | P2 | S | §4, 1 blocking governance P1 |
| 9 | Migrate 3 restricted `TouchableOpacity` imports to `AppTouchable` | P2 | XS | FE-P2-015, 3 lint errors |
| 10 | Reduce 547 arbitrary spacing/radius values, highest-density files first | P2 | L | Token adoption 61% → 65%+ |
| 11 | Consolidate onto Reanimated; tokenise 64 inline timings | P2 | L | FE-P2-007 |
| 12 | Gate 25 `withRepeat` loops behind reduced-motion | P2 | M | FE-P2-008 |
| 13 | Delete `premium` / `ocean` / `sunset` themes (~300 LOC) | P3 | S | FE-P3-006 |
| 14 | Add `focus` / `pressed` / `selected` / `loading` state tokens | P3 | M | §3.8 |
