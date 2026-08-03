# Design System Audit & Token Governance Plan

This document evaluates the design system maturity, token compliance, visual consistency, and component architecture across the frontend codebase.

---

## 1. Design System Maturity Assessment

The application currently operates under a **hybrid/transitional design system state**:

1. **Modern Token Foundation**: The codebase possesses a well-crafted design token definition in `frontend/src/theme/themeTokens.ts` and `frontend/src/hooks/useUiTokens.ts`, featuring HSL-tailored colors, surface elevation rules, theme mode toggling (light/dark), and spacing primitives.
2. **Feature Compliance Gap**: Over 500 lines across 30+ feature screens still use ad-hoc inline styles, raw pixel numbers (`padding: 16`, `borderRadius: 14`, `gap: 8`), and direct hex strings (`#1E293B`, `#FFFFFF`).
3. **Primitive Component Fragmentation**: Multiple component primitives exist for identical visual patterns (e.g. `ModernButton` vs `AppTouchable` vs native `Pressable`).

---

## 2. Token Compliance Audit Findings

### A. Color Token Violations
- **Finding**: 18 feature files contain direct hexadecimal color definitions in `StyleSheet.create`.
- **Evidence**: `frontend/app/notifications.tsx` line 470 (`backgroundColor: "#F3F4F6"`), `frontend/app/login.tsx` line 512 (`backgroundColor: "#10B981"`).
- **Impact**: Dark mode theme switching fails or produces illegible high-contrast text on hardcoded backgrounds.

### B. Spacing & Radius Scale Violations
- **Finding**: 512+ violations of tokenized spacing and radius scales reported by `npm run governance:ui`.
- **Evidence**: `paddingHorizontal: 24`, `borderRadius: 14`, `paddingVertical: 3`, `marginHorizontal: 16`.
- **Impact**: Inconsistent visual rhythm, uneven whitespace, and layout misalignment across devices.

### C. Motion & Animation Token Violations
- **Finding**: Reanimated transition durations are specified inline in milliseconds (`entering={FadeInDown.duration(600).springify()}`) without referencing centralized motion tokens or checking reduced-motion accessibility settings.
- **Evidence**: `frontend/app/login.tsx` lines 158, 192, 278, 384.

---

## 3. Proposed Canonical Design Token Structure

```ts
// @/theme/tokens.ts
export const tokens = {
  colors: {
    background: {
      primary: "hsl(220, 15%, 98%)",
      secondary: "hsl(220, 15%, 95%)",
      darkPrimary: "hsl(222, 47%, 11%)",
      darkSecondary: "hsl(217, 33%, 17%)",
    },
    surface: {
      card: "hsl(0, 0%, 100%)",
      cardDark: "hsl(217, 33%, 17%)",
      elevated: "hsl(0, 0%, 100%)",
      overlay: "rgba(15, 23, 42, 0.6)",
    },
    text: {
      primary: "hsl(222, 47%, 11%)",
      secondary: "hsl(215, 16%, 47%)",
      muted: "hsl(215, 16%, 65%)",
      inverse: "hsl(0, 0%, 100%)",
    },
    border: {
      subtle: "hsl(214, 32%, 91%)",
      default: "hsl(214, 32%, 85%)",
      focus: "hsl(221, 83%, 53%)",
    },
    status: {
      success: "hsl(142, 76%, 36%)",
      warning: "hsl(38, 92%, 50%)",
      danger: "hsl(346, 84%, 61%)",
      info: "hsl(199, 89%, 48%)",
    },
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    "2xl": 32,
    "3xl": 48,
  },
  typography: {
    display: { fontSize: 32, lineHeight: 40, fontWeight: "700" as const },
    heading: { fontSize: 24, lineHeight: 32, fontWeight: "600" as const },
    title: { fontSize: 18, lineHeight: 24, fontWeight: "600" as const },
    body: { fontSize: 15, lineHeight: 22, fontWeight: "400" as const },
    label: { fontSize: 13, lineHeight: 18, fontWeight: "500" as const },
    caption: { fontSize: 11, lineHeight: 14, fontWeight: "400" as const },
  },
  radius: {
    sm: 6,
    md: 10,
    lg: 16,
    full: 9999,
  },
  elevation: {
    none: { shadowColor: "transparent", elevation: 0 },
    sm: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
    md: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
    lg: { shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 6 },
  },
  motion: {
    fast: 150,
    normal: 250,
    slow: 400,
    easing: "cubic-bezier(0.4, 0, 0.2, 1)",
  },
};
```

---

## 4. Component Consolidation Plan

To eliminate duplicated UI controls and enforce accessibility compliance, the following component consolidation table must be enacted:

| Existing Components | Duplicate Purpose | Recommended Canonical Component | Migration Action |
|---|---|---|---|
| `TouchableOpacity`, `Pressable`, `ModernButton` | Touch feedback & action buttons | `@/components/ui/AppTouchable` & `@/components/ui/ModernButton` | Deprecate direct `TouchableOpacity` imports. Enforce `AppTouchable` wrapper for touch targets and `ModernButton` for standard CTA buttons. |
| `ModernCard`, `<View style={styles.card}>` | Container cards with shadow & border | `@/components/ui/ModernCard` | Replace ad-hoc View card containers with `ModernCard` passing variant props (`surface`, `elevated`, `outlined`). |
| `ModernHeader`, Custom header views | Screen top title bar and back navigation | `@/components/ui/ModernHeader` | Standardize screen headers across all `app/` screens with `ModernHeader`. |
| `StandardizedErrorCard`, Custom inline error text | Error notification display | `@/components/ui/StandardizedErrorCard` | Replace inline red text views with `StandardizedErrorCard`. |
| `OfflineStatusIndicator`, Inline network banners | Network connectivity banner | `@/components/ui/OfflineStatusIndicator` | Use single global `OfflineStatusIndicator` mounted in top-level `_layout.tsx`. |

---

## 5. Design System Remediation & Governance Strategy

1. **Codemod Execution**: Run `npm run codemod:premium-primitives` to automatically migrate legacy `TouchableOpacity` and `Pressable` calls to `AppTouchable`.
2. **ESLint Rule Enforcement**: Enable strict ESLint rule `no-restricted-imports` blocking direct imports of `TouchableOpacity` from `react-native`.
3. **CI Governance Gate**: Enable `npm run governance:ui:strict` in `package.json` `ci` script to block pull requests introducing raw layout values or hardcoded hex colors.
