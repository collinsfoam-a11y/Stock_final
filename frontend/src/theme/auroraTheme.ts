/**
 * Aurora Theme - Enhanced Design System v2.0
 *
 * Features:
 * - Aurora gradient backgrounds (Blue-Cyan blend)
 * - Glassmorphism effects with backdrop blur
 * - Modern color palette from Kombai API
 * - Professional typography (Manrope + Source Sans 3)
 * - Comprehensive design tokens
 *
 * @deprecated Migrate feature code to useUiTokens/themeTokens. auroraTheme is a
 * legacy visual-system bridge and must not be used for new operational UI.
 */

import { ViewStyle } from "react-native";
import { createShadow } from "./shadowUtils";

// ==========================================
// AURORA COLOR PALETTE
// ==========================================

export const auroraColors = {
  // Primary — Claude Terracotta
  primary: {
    50: "#FFF3EE",
    100: "#FFE4D6",
    200: "#FFC7A8",
    300: "#FFA47B",
    400: "#E8906E",
    500: "#CC785C", // Main — Claude Terracotta
    600: "#B06148",
    700: "#924D36",
    800: "#743A26",
    900: "#562A18",
  },

  // Secondary — Warm Stone
  secondary: {
    50: "#FAFAF9",
    100: "#F5F5F4",
    200: "#E7E5E4",
    300: "#D7D4D1",
    400: "#A9A5A2",
    500: "#78746F", // Main — Warm Stone
    600: "#58534E",
    700: "#44403C",
    800: "#2E2B28",
    900: "#1C1917",
  },

  // Accent — Warm Amber
  accent: {
    50: "#FFFBF0",
    100: "#FEF3D6",
    200: "#FDE5A8",
    300: "#FBD070",
    400: "#F5B942",
    500: "#E8A020",
    600: "#C4830F",
    700: "#9E6508",
    800: "#794B07",
    900: "#553405",
  },

  // Success - Emerald
  success: {
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

  // Warning - Amber
  warning: {
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

  // Error - Red
  error: {
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

  // Neutral — Warm Stone
  neutral: {
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

  // Aurora Gradients — Warm Claude Palette
  aurora: {
    // Primary warm blend (Terracotta to Amber)
    primary: ["#CC785C", "#E8906E", "#E8A020"] as const,
    // Secondary warm blend
    secondary: ["#E8906E", "#CC785C", "#B06148"] as const,
    // Success aurora blend
    success: ["#22C55E", "#16A34A", "#15803D"] as const,
    // Warm aurora blend (Amber to Terracotta)
    warm: ["#F59E0B", "#E8A020", "#CC785C"] as const,
    // Dark aurora blend (Warm Charcoal)
    dark: ["#1C1917", "#2E2B28", "#3D3A37"] as const,
    // Glass overlay — warm tint
    glass: ["rgba(255, 250, 245, 0.10)", "rgba(255, 250, 245, 0.04)"] as const,
  },

  // Background Colors — Warm Charcoal
  background: {
    primary: "#1C1917",
    secondary: "#2E2B28",
    tertiary: "#3D3A37",
    elevated: "#4A4744",
    overlay: "rgba(12, 10, 9, 0.95)",
    glass: "rgba(44, 41, 38, 0.70)",
    blur: "rgba(44, 41, 38, 0.50)",
  },

  // Surface Colors (alias for background)
  surface: {
    base: "#1C1917",
    primary: "#1C1917",
    secondary: "#2E2B28",
    tertiary: "#3D3A37",
    elevated: "#4A4744",
    card: "#2E2B28",
    overlay: "rgba(12, 10, 9, 0.95)",
    glass: "rgba(44, 41, 38, 0.70)",
  },

  // Text Colors — Warm Cream
  text: {
    primary: "#F5F0E8",
    secondary: "#D7D4D1",
    tertiary: "#B5AFA9",
    muted: "#B5AFA9",
    disabled: "#78746F",
    inverse: "#1C1917",
    link: "#E8906E",
    linkHover: "#F5A882",
  },

  // Border Colors
  border: {
    light: "rgba(255, 255, 255, 0.1)",
    subtle: "rgba(255, 255, 255, 0.1)", // alias for light
    medium: "rgba(255, 255, 255, 0.2)",
    strong: "rgba(255, 255, 255, 0.3)",
    focus: "#CC785C", // Claude Terracotta focus ring
    error: "#EF4444",
    success: "#10B981",
  },

  // Status Colors
  status: {
    active: "#10B981",
    pending: "#F59E0B",
    error: "#EF4444",
    inactive: "#78746F",
    verified: "#06B6D4",
    warning: "#FBBF24",
  },
  shimmer: ["#2E2B28", "#3D3A37", "#2E2B28"] as const, // warm charcoal shimmer
};

// ==========================================
// TYPOGRAPHY SYSTEM
// ==========================================

export const auroraTypography = {
  // Font Families (Manrope + Source Sans 3)
  fontFamily: {
    display: "Manrope-Bold",
    heading: "Manrope-SemiBold",
    body: "SourceSans3-Regular",
    label: "SourceSans3-SemiBold",
    mono: "Courier New",
  },

  // Font Sizes
  fontSize: {
    xs: 11,
    sm: 12,
    base: 14,
    md: 16,
    lg: 18,
    xl: 20,
    "2xl": 24,
    "3xl": 28,
    "4xl": 32,
    "5xl": 36,
    "6xl": 48,
    "7xl": 60,
  },

  // Font Weights
  fontWeight: {
    light: "300" as const,
    normal: "400" as const,
    medium: "500" as const,
    semibold: "600" as const,
    bold: "700" as const,
    extrabold: "800" as const,
  },

  // Line Heights
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
    loose: 2,
  },

  // Letter Spacing
  letterSpacing: {
    tighter: -0.5,
    tight: -0.25,
    normal: 0,
    wide: 0.25,
    wider: 0.5,
    widest: 1,
  },
};

// ==========================================
// SPACING SYSTEM
// ==========================================

export const auroraSpacing = {
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

  // Semantic spacing
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  "2xl": 48,
  "3xl": 64,
};

// ==========================================
// BORDER RADIUS
// ==========================================

export const auroraBorderRadius = {
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  "2xl": 24,
  "3xl": 32,
  full: 9999,

  // Component-specific
  button: 12,
  card: 16,
  input: 12,
  modal: 24,
  badge: 9999,
};

// ==========================================
// SHADOWS
// ==========================================

export const auroraShadows = {
  none: createShadow({ color: "transparent" }),
  sm: createShadow({ color: "#000", offsetY: 2, opacity: 0.1, radius: 4, elevation: 2 }),
  md: createShadow({ color: "#000", offsetY: 4, opacity: 0.15, radius: 8, elevation: 4 }),
  lg: createShadow({ color: "#000", offsetY: 8, opacity: 0.2, radius: 16, elevation: 8 }),
  xl: createShadow({ color: "#000", offsetY: 12, opacity: 0.25, radius: 24, elevation: 12 }),
  // Colored shadows for aurora effects
  aurora: createShadow({ color: "#06B6D4", offsetY: 8, opacity: 0.4, radius: 16, elevation: 8 }),
  glow: createShadow({ color: "#CC785C", opacity: 0.55, radius: 20, elevation: 10 }), // Claude Terracotta glow
};

// ==========================================
// GLASSMORPHISM STYLES
// ==========================================

export const auroraGlass = {
  light: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderColor: "rgba(255, 255, 255, 0.2)",
    borderWidth: 1,
  } as ViewStyle,

  medium: {
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    borderColor: "rgba(255, 255, 255, 0.25)",
    borderWidth: 1,
  } as ViewStyle,

  strong: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderColor: "rgba(255, 255, 255, 0.3)",
    borderWidth: 1.5,
  } as ViewStyle,

  dark: {
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    borderColor: "rgba(255, 255, 255, 0.1)",
    borderWidth: 1,
  } as ViewStyle,

  modal: {
    backgroundColor: "rgba(44, 41, 38, 0.8)",
    borderColor: "rgba(255, 255, 255, 0.2)",
    borderWidth: 1,
  } as ViewStyle,
};

// ==========================================
// ANIMATION TOKENS
// ==========================================

export const auroraAnimations = {
  duration: {
    instant: 0,
    fast: 150,
    normal: 300,
    slow: 500,
    slower: 700,
  },

  spring: {
    damping: 15,
    stiffness: 300,
    mass: 1,
  },

  scale: {
    pressed: 0.95,
    hover: 1.02,
    active: 1.05,
  },

  opacity: {
    disabled: 0.5,
    hover: 0.9,
    pressed: 0.8,
  },
};

// ==========================================
// COMPONENT SIZES
// ==========================================

export const auroraComponentSizes = {
  button: {
    small: 36,
    medium: 44,
    large: 56,
    xl: 72, // For floating scan button
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

// ==========================================
// EXPORT THEME
// ==========================================

export const auroraTheme = {
  colors: auroraColors,
  typography: auroraTypography,
  spacing: auroraSpacing,
  borderRadius: auroraBorderRadius,
  shadows: auroraShadows,
  glass: auroraGlass,
  animations: auroraAnimations,
  componentSizes: auroraComponentSizes,
};

export type AuroraTheme = typeof auroraTheme;

export default auroraTheme;
