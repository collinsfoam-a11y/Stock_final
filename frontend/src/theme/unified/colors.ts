/**
 * Unified Color System
 * Single source of truth for all colors in the app
 *
 * Migration: Replace hardcoded colors with these tokens
 * Example: '#0EA5E9' → colors.primary[400]
 */

// ==========================================
// COLOR PALETTE - Semantic Colors with Shades
// ==========================================
export const colors = {
  // Base colors
  white: "#FFFFFF",
  black: "#000000",
  transparent: "transparent",

  // Primary Brand - Lavanya Corporate Blue
  primary: {
    50: "#EBF4FF",
    100: "#D6E8FF",
    200: "#AFD1FF",
    300: "#82B5FF",
    400: "#5C94FF", // Light accent
    500: "#0655A5", // Main brand color (Lavanya eMart Blue)
    600: "#054992", // Hover state
    700: "#043C7A", // Active state
    800: "#032B59",
    900: "#011732",
  },

  // Secondary - Teal/Cyan (supporting actions)
  secondary: {
    50: "#ECFEFF",
    100: "#CFFAFE",
    200: "#A5F3FC",
    300: "#67E8F9",
    400: "#22D3EE", // Accent
    500: "#06B6D4", // Main
    600: "#0891B2",
    700: "#0E7490",
    800: "#155E75",
    900: "#164E63",
  },

  // Success - Green (positive states, completion, verified)
  success: {
    50: "#F0FDF4",
    100: "#DCFCE7",
    200: "#BBF7D0",
    300: "#86EFAC",
    400: "#4ADE80",
    500: "#22C55E", // Main
    600: "#16A34A",
    700: "#15803D",
    800: "#166534",
    900: "#14532D",
  },

  // Warning - Amber (caution, attention needed)
  warning: {
    50: "#FFFBEB",
    100: "#FEF3C7",
    200: "#FDE68A",
    300: "#FCD34D",
    400: "#FBBF24",
    500: "#F59E0B", // Main
    600: "#D97706",
    700: "#B45309",
    800: "#92400E",
    900: "#78350F",
  },

  // Error - Red (errors, destructive actions, alerts)
  error: {
    50: "#FEF2F2",
    100: "#FEE2E2",
    200: "#FECACA",
    300: "#FCA5A5",
    400: "#F87171",
    500: "#EF4444", // Main
    600: "#DC2626",
    700: "#B91C1C",
    800: "#991B1B",
    900: "#7F1D1D",
  },

  // Info - Blue (informational, hints, tips)
  info: {
    50: "#EFF6FF",
    100: "#DBEAFE",
    200: "#BFDBFE",
    300: "#93C5FD",
    400: "#60A5FA",
    500: "#3B82F6", // Main
    600: "#2563EB",
    700: "#1D4ED8",
    800: "#1E40AF",
    900: "#1E3A8A",
  },

  // Neutral - Slate (text, backgrounds, borders)
  neutral: {
    0: "#FFFFFF",
    50: "#F8FAFC",
    100: "#F1F5F9",
    200: "#E2E8F0",
    300: "#CBD5E1",
    400: "#94A3B8",
    500: "#64748B",
    600: "#475569",
    700: "#334155",
    800: "#1E293B",
    900: "#0F172A",
    950: "#020617",
  },
} as const;

// ==========================================
// SEMANTIC COLOR ALIASES
// ==========================================
export const semanticColors = {
  // Text colors
  text: {
    primary: colors.neutral[900], // Main text
    secondary: colors.neutral[600], // Subtle text
    tertiary: colors.neutral[500], // Placeholder, hint
    muted: colors.neutral[400], // Muted text (alias for tertiary)
    disabled: colors.neutral[400], // Disabled state
    inverse: colors.neutral[0], // Text on dark backgrounds
    link: colors.primary[600], // Clickable text
  },

  // Background colors
  background: {
    default: colors.neutral[0], // Alias for primary
    primary: colors.neutral[0], // Main background
    secondary: colors.neutral[50], // Cards, sections
    tertiary: colors.neutral[100], // Nested sections
    elevated: colors.neutral[0], // Elevated surfaces
    paper: colors.neutral[0], // Paper/sheet background
    card: colors.neutral[0], // Card background
    overlay: "rgba(15, 23, 42, 0.5)", // Modal overlays
  },

  // Border colors
  border: {
    default: colors.neutral[200], // Default borders
    subtle: colors.neutral[100], // Subtle dividers
    strong: colors.neutral[300], // Emphasized borders
    focus: colors.primary[500], // Focus rings
  },

  // Interactive states
  interactive: {
    default: colors.primary[500],
    hover: colors.primary[600],
    active: colors.primary[700],
    disabled: colors.neutral[300],
  },

  // Status indicators
  status: {
    success: colors.success[500],
    warning: colors.warning[500],
    error: colors.error[500],
    info: colors.info[500],
  },

  // Component-specific semantic colors
  button: {
    primary: colors.primary[500],
    primaryText: colors.white,
    secondary: colors.neutral[100],
    secondaryText: colors.neutral[900],
    outline: colors.neutral[200],
    disabled: colors.neutral[200],
    disabledText: colors.neutral[400],
  },

  card: {
    background: colors.white,
    border: colors.neutral[200],
    shadow: "rgba(15, 23, 42, 0.08)",
  },

  input: {
    background: colors.white,
    border: colors.neutral[300],
    focus: colors.primary[500],
    placeholder: colors.neutral[400],
    text: colors.neutral[900],
  },
} as const;

// ==========================================
// DARK MODE COLORS (future-ready)
// ==========================================
export const darkColors = {
  text: {
    primary: colors.neutral[50],
    secondary: colors.neutral[300],
    tertiary: colors.neutral[400],
    muted: colors.neutral[500],
    disabled: colors.neutral[600],
    inverse: colors.neutral[900],
    link: colors.primary[400],
  },

  background: {
    default: colors.neutral[900],
    primary: colors.neutral[900],
    secondary: colors.neutral[800],
    tertiary: colors.neutral[700],
    elevated: colors.neutral[800],
    paper: colors.neutral[800],
    card: colors.neutral[800],
    overlay: "rgba(0, 0, 0, 0.7)",
  },

  border: {
    default: colors.neutral[700],
    subtle: colors.neutral[800],
    strong: colors.neutral[600],
    focus: colors.primary[400],
  },
} as const;

// ==========================================
// GRADIENT PRESETS
// ==========================================
export const gradients = {
  primary: [colors.primary[600], colors.primary[700]],
  secondary: [colors.secondary[500], colors.secondary[600]],
  success: [colors.success[500], colors.success[600]],
  sunset: [colors.warning[500], colors.error[500]],
  aurora: ["#0F766E", "#0891B2", "#2563EB"] as const, // Darker teal-cyan-blue gradient
  auroraLight: [colors.primary[400], colors.secondary[400], colors.success[400]],
  glass: ["rgba(255, 255, 255, 0.15)", "rgba(255, 255, 255, 0.08)"],
} as const;

// Type exports
export type ColorPalette = typeof colors;
export type SemanticColors = typeof semanticColors;
export type ColorShade = keyof typeof colors.primary;

// ==========================================
// LEGACY MODERN COLOR PALETTE
// Full nested palette (background/surface/text/border/semantic/status/
// gradients) consumed by screens still using the `modernColors.X.Y`-style
// API instead of the flat `colors`/`semanticColors` tokens above.
// ==========================================
export const legacyColors = {
  primary: {
    50: "#EFF6FF",
    100: "#DBEAFE",
    200: "#BFDBFE",
    300: "#93C5FD",
    400: "#60A5FA",
    500: "#3B82F6",
    600: "#2563EB",
    700: "#1D4ED8",
    800: "#1E40AF",
    900: "#1E3A8A",
  },

  secondary: {
    50: "#ECFDF5",
    100: "#D1FAE5",
    200: "#A7F3D0",
    300: "#6EE7B7",
    400: "#34D399",
    500: "#10B981",
    600: "#059669",
    700: "#047857",
    800: "#065F46",
    900: "#064E3B",
  },

  accent: {
    50: "#ECFEFF",
    100: "#CFFAFE",
    200: "#A5F3FC",
    300: "#67E8F9",
    400: "#22D3EE",
    500: "#06B6D4",
    600: "#0891B2",
    700: "#0E7490",
    800: "#155E75",
    900: "#164E63",
  },

  neutral: {
    50: "#F8FAFC",
    100: "#F1F5F9",
    200: "#E2E8F0",
    300: "#CBD5E1",
    400: "#94A3B8",
    500: "#64748B",
    600: "#475569",
    700: "#334155",
    800: "#1E293B",
    900: "#0F172A",
    950: "#020617",
  },

  success: {
    light: "#DCFCE7",
    main: "#22C55E",
    dark: "#16A34A",
    contrast: "#FFFFFF",
    50: "#ECFDF5",
    100: "#D1FAE5",
    200: "#A7F3D0",
    300: "#6EE7B7",
    400: "#34D399",
    500: "#10B981",
    600: "#059669",
    700: "#047857",
    800: "#065F46",
    900: "#064E3B",
  },

  error: {
    light: "#FEE2E2",
    main: "#EF4444",
    dark: "#DC2626",
    contrast: "#FFFFFF",
    50: "#FEF2F2",
    100: "#FEE2E2",
    200: "#FECACA",
    300: "#FCA5A5",
    400: "#F87171",
    500: "#EF4444",
    600: "#DC2626",
    700: "#B91C1C",
    800: "#991B1B",
    900: "#7F1D1D",
  },

  warning: {
    light: "#FEF9C3",
    main: "#EAB308",
    dark: "#CA8A04",
    contrast: "#18181B",
    50: "#FFFBEB",
    100: "#FEF3C7",
    200: "#FDE68A",
    300: "#FCD34D",
    400: "#FBBF24",
    500: "#F59E0B",
    600: "#D97706",
    700: "#B45309",
    800: "#92400E",
    900: "#78350F",
  },

  info: {
    light: "#E0F2FE",
    main: "#0EA5E9",
    dark: "#0284C7",
    contrast: "#FFFFFF",
  },

  background: {
    default: "#020617",
    paper: "#0F172A",
    elevated: "#1E293B",
    overlay: "rgba(2, 6, 23, 0.9)",
    glass: "rgba(15, 23, 42, 0.75)",
    primary: "#0F172A",
    secondary: "#1E293B",
    tertiary: "#334155",
    elevatedLegacy: "#475569",
    blur: "rgba(30, 41, 59, 0.5)",
  },

  surface: {
    base: "#0F172A",
    primary: "#0F172A",
    secondary: "#1E293B",
    tertiary: "#334155",
    elevated: "#475569",
    card: "#1E293B",
    overlay: "rgba(15, 23, 42, 0.95)",
    glass: "rgba(30, 41, 59, 0.7)",
  },

  text: {
    primary: "#F8FAFC",
    secondary: "#94A3B8",
    tertiary: "#64748B",
    muted: "#94A3B8",
    disabled: "#475569",
    inverse: "#020617",
    link: "#38BDF8",
    linkHover: "#7DD3FC",
  },

  border: {
    light: "#1E293B",
    medium: "#334155",
    strong: "#475569",
    dark: "#475569",
    focus: "#0EA5E9",
    error: "#EF4444",
    subtle: "#1E293B",
    success: "#10B981",
  },

  semantic: {
    success: "#10B981",
    error: "#EF4444",
    warning: "#F59E0B",
    info: "#0EA5E9",
  },

  status: {
    active: "#10B981",
    pending: "#F59E0B",
    error: "#EF4444",
    inactive: "#64748B",
    verified: "#06B6D4",
    warning: "#FBBF24",
  },

  gradients: {
    primary: ["#0EA5E9", "#0284C7", "#0369A1"] as const,
    secondary: ["#10B981", "#059669", "#047857"] as const,
    accent: ["#06B6D4", "#0891B2", "#0E7490"] as const,
    dark: ["#0F172A", "#020617", "#000000"] as const,
    surface: ["#1E293B", "#0F172A", "#020617"] as const,
    aurora: ["#0EA5E9", "#10B981", "#06B6D4"] as const,
    auroraPrimary: ["#1560BD", "#2D68C4", "#06B6D4"] as const,
    auroraSecondary: ["#2D68C4", "#0EA5E9", "#06B6D4"] as const,
    auroraSuccess: ["#10B981", "#14B8A6", "#06B6D4"] as const,
    auroraWarm: ["#F59E0B", "#F97316", "#06B6D4"] as const,
    auroraDark: ["#0F172A", "#1E293B", "#334155"] as const,
    button: ["#0EA5E9", "#0284C7"] as const,
    card: ["rgba(30, 41, 59, 0.7)", "rgba(15, 23, 42, 0.8)"] as const,
    input: ["rgba(15, 23, 42, 0.6)", "rgba(2, 6, 23, 0.7)"] as const,
    success: ["#10B981", "#059669"] as const,
    warning: ["#F59E0B", "#D97706"] as const,
    error: ["#EF4444", "#DC2626"] as const,
    glass: ["rgba(255, 255, 255, 0.08)", "rgba(255, 255, 255, 0.02)"] as const,
    shimmer: [
      "rgba(14, 165, 233, 0.1)",
      "rgba(16, 185, 129, 0.15)",
      "rgba(14, 165, 233, 0.1)",
    ] as const,
  },

  shimmer: ["#1E293B", "#334155", "#1E293B"] as const,
};

export const legacyGradients = legacyColors.gradients;
