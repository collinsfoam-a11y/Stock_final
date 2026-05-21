/**
 * Unified Color System — Claude Design v5.0
 * Warm Terracotta & Parchment palette
 *
 * Migration: Replace hardcoded colors with these tokens
 * Example: '#CC785C' → colors.primary[500]
 */

// ==========================================
// COLOR PALETTE — Claude Warm Design
// ==========================================
export const colors = {
  // Base colors
  white: "#FFFFFF",
  black: "#000000",
  transparent: "transparent",

  // Primary Brand — Claude Terracotta
  primary: {
    50: "#FFF3EE",
    100: "#FFE4D6",
    200: "#FFC7A8",
    300: "#FFA47B",
    400: "#E8906E", // Light accent
    500: "#CC785C", // Main — Claude Terracotta
    600: "#B06148", // Hover state
    700: "#924D36", // Active state
    800: "#743A26",
    900: "#562A18",
  },

  // Secondary — Warm Stone (supporting / neutral)
  secondary: {
    50: "#FAFAF9",
    100: "#F5F5F4",
    200: "#E7E5E4",
    300: "#D7D4D1",
    400: "#A9A5A2",
    500: "#78746F", // Main
    600: "#58534E",
    700: "#44403C",
    800: "#2E2B28",
    900: "#1C1917",
  },

  // Success — Fresh Green
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

  // Warning — Warm Amber
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

  // Error — Warm Red
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

  // Info — Sky Blue
  info: {
    50: "#F0F9FF",
    100: "#E0F2FE",
    200: "#BAE6FD",
    300: "#7DD3FC",
    400: "#38BDF8",
    500: "#0EA5E9", // Main
    600: "#0284C7",
    700: "#0369A1",
    800: "#075985",
    900: "#0C4A6E",
  },

  // Neutral — Warm Stone (not cold slate)
  neutral: {
    0: "#FFFFFF",
    50: "#FAFAF9",
    100: "#F5F5F4",
    200: "#E7E5E4",
    300: "#D7D4D1",
    400: "#A9A5A2",
    500: "#78746F",
    600: "#58534E",
    700: "#44403C",
    800: "#2E2B28",
    900: "#1C1917",
    950: "#0C0A09",
  },
} as const;

// ==========================================
// SEMANTIC COLOR ALIASES
// ==========================================
export const semanticColors = {
  // Text colors
  text: {
    primary: colors.neutral[900],    // Warm near-black
    secondary: colors.neutral[600],  // Warm gray
    tertiary: colors.neutral[500],   // Muted warm
    muted: colors.neutral[400],
    disabled: colors.neutral[400],
    inverse: colors.neutral[0],
    link: colors.primary[500],       // Terracotta links
  },

  // Background colors
  background: {
    default: "#FAF8F5",              // Warm parchment
    primary: "#FAF8F5",
    secondary: colors.neutral[50],
    tertiary: colors.neutral[100],
    elevated: colors.neutral[0],
    paper: colors.neutral[0],
    card: colors.neutral[0],
    overlay: "rgba(28, 25, 23, 0.5)",
  },

  // Border colors
  border: {
    default: "#EDE9E4",              // Warm subtle border
    subtle: "#F5F2EE",
    strong: colors.neutral[300],
    focus: colors.primary[500],      // Terracotta focus ring
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
    primary: colors.primary[500],       // Terracotta
    primaryText: colors.white,
    secondary: colors.neutral[100],
    secondaryText: colors.neutral[900],
    outline: "#EDE9E4",
    disabled: colors.neutral[200],
    disabledText: colors.neutral[400],
  },

  card: {
    background: colors.white,
    border: "#EDE9E4",
    shadow: "rgba(28, 25, 23, 0.08)",
  },

  input: {
    background: colors.white,
    border: "#D7D4D1",
    focus: colors.primary[500],
    placeholder: colors.neutral[400],
    text: colors.neutral[900],
  },
} as const;

// ==========================================
// DARK MODE COLORS
// ==========================================
export const darkColors = {
  text: {
    primary: "#F5F0E8",              // Warm cream
    secondary: "#B5AFA9",            // Warm stone
    tertiary: "#78746F",
    muted: "#78746F",
    disabled: "#58534E",
    inverse: colors.neutral[900],
    link: colors.primary[400],       // Bright terracotta
  },

  background: {
    default: "#1C1917",              // Warm charcoal
    primary: "#1C1917",
    secondary: "#242220",
    tertiary: "#2E2B28",
    elevated: "#242220",
    paper: "#242220",
    card: "#242220",
    overlay: "rgba(12, 10, 9, 0.75)",
  },

  border: {
    default: "#3D3A37",              // Warm dark border
    subtle: "#2E2B28",
    strong: "#4A4744",
    focus: colors.primary[400],
  },
} as const;

// ==========================================
// GRADIENT PRESETS
// ==========================================
export const gradients = {
  primary: [colors.primary[500], colors.primary[600]],   // Terracotta
  secondary: [colors.secondary[500], colors.secondary[600]],
  success: [colors.success[500], colors.success[600]],
  sunset: ["#E8906E", "#F59E0B"],                        // Terracotta to Amber
  aurora: ["#CC785C", "#E8A020", "#22C55E"] as const,    // Warm aurora
  auroraLight: [colors.primary[400], "#F5B942", colors.success[400]],
  glass: ["rgba(255, 250, 245, 0.15)", "rgba(255, 250, 245, 0.06)"],
} as const;

// Type exports
export type ColorPalette = typeof colors;
export type SemanticColors = typeof semanticColors;
export type ColorShade = keyof typeof colors.primary;
