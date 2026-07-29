/**
 * Unified Spacing System
 * 4px base unit for consistent spacing throughout the app
 *
 * Usage: spacing.md → 16
 * Usage in styles: { padding: spacing.md }
 */

// ==========================================
// SPACING SCALE (4px base unit)
// ==========================================
export const spacing = {
  /** 0px - No spacing */
  none: 0,
  /** 2px - Hairline spacing */
  xxs: 2,
  /** 4px - Tight spacing */
  xs: 4,
  /** 8px - Compact spacing */
  sm: 8,
  /** 12px - Medium-small spacing */
  md: 12,
  /** 16px - Default spacing */
  lg: 16,
  /** 20px - Comfortable spacing */
  xl: 20,
  /** 24px - Spacious */
  "2xl": 24,
  /** 32px - Section spacing */
  "3xl": 32,
  /** 40px - Large gaps */
  "4xl": 40,
  /** 48px - Extra large gaps */
  "5xl": 48,
  /** 64px - Maximum spacing */
  "6xl": 64,
} as const;

// ==========================================
// LAYOUT SPACING
// ==========================================
export const layout = {
  /** Screen horizontal padding */
  screenPadding: spacing.lg, // 16px
  /** Card internal padding */
  cardPadding: spacing.lg, // 16px
  /** Section gap */
  sectionGap: spacing["2xl"], // 24px
  /** Item gap in lists */
  itemGap: spacing.md, // 12px
  /** Inline element gap */
  inlineGap: spacing.sm, // 8px
  /** Form field gap */
  fieldGap: spacing.lg, // 16px
  /** Header height */
  headerHeight: 56,
  /** Tab bar height */
  tabBarHeight: 64,
  /** Bottom safe area */
  bottomSafeArea: spacing["3xl"], // 32px
} as const;

// ==========================================
// TOUCH TARGETS (Accessibility)
// ==========================================
export const touchTargets = {
  /** Minimum touch target (44x44 per Apple HIG) */
  minimum: 44,
  /** Comfortable touch target */
  comfortable: 48,
  /** Large touch target */
  large: 56,
} as const;

// ==========================================
// HIT SLOP (Extends touch area without visual change)
// ==========================================
export const hitSlop = {
  small: { top: 8, bottom: 8, left: 8, right: 8 },
  medium: { top: 12, bottom: 12, left: 12, right: 12 },
  large: { top: 16, bottom: 16, left: 16, right: 16 },
} as const;

// Type exports
export type Spacing = typeof spacing;
export type SpacingKey = keyof typeof spacing;

// ==========================================
// LEGACY MODERN SPACING
// Wider scale (incl. numeric and component-specific keys) consumed by
// screens still using the `modernSpacing.X`-style API.
// ==========================================
export const legacySpacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
  24: 96,

  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  "2xl": 48,
  "3xl": 64,
  "4xl": 80,

  screenPadding: 24,
  cardPadding: 20,
  inputPadding: 16,
  buttonPadding: 16,
  sectionGap: 40,
  elementGap: 16,
  groupGap: 10,
};

// ==========================================
// LEGACY MODERN LAYOUT TOKENS
// ==========================================
export const legacyComponentSizes = {
  button: {
    small: 36,
    medium: 44,
    large: 56,
    xl: 72,
  },

  input: {
    small: 40,
    medium: 48,
    large: 56,
  },

  icon: {
    xs: 16,
    sm: 20,
    md: 24,
    lg: 32,
    xl: 40,
    "2xl": 48,
  },

  avatar: {
    sm: 32,
    md: 40,
    lg: 48,
    xl: 64,
  },
};

export const legacyLayout = {
  headerHeight: 64,
  tabBarHeight: 72,
  inputHeight: 56,
  buttonHeight: {
    small: 36,
    medium: 44,
    large: 56,
  },

  sidebarWidth: 280,
  sidebarCollapsedWidth: 80,

  containerMaxWidth: {
    mobile: "100%",
    tablet: 768,
    desktop: 1200,
    wide: 1440,
  },

  zIndex: {
    dropdown: 1000,
    sticky: 1020,
    fixed: 1030,
    modalBackdrop: 1040,
    modal: 1050,
    popover: 1060,
    tooltip: 1070,
    toast: 1080,
  },

  componentSizes: legacyComponentSizes,
};
