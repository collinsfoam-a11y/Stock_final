/**
 * Modern Design System - Claude Design v5.0
 * Warm Terracotta & Parchment — inspired by Anthropic / Claude UI
 *
 * Features:
 * - Warm terracotta primary with cream/parchment backgrounds
 * - Refined typography scale for better readability
 * - Optimized spacing system for modern mobile layouts
 * - Subtle glassmorphism and depth effects
 * - High-contrast accessibility support
 * - Consolidated Aurora Theme tokens
 */

import { Platform, StyleSheet } from "react-native";

// ==========================================
// CLAUDE COLOR PALETTE - WARM TERRACOTTA
// ==========================================

export const auroraColors = {
  primary: {
    50: "#FFF3EE",
    100: "#FFE4D6",
    200: "#FFC7A8",
    300: "#FFA47B",
    400: "#E8906E",
    500: "#CC785C",
    600: "#B06148",
    700: "#924D36",
    800: "#743A26",
    900: "#562A18",
  },
  secondary: {
    50: "#F5F3F0",
    100: "#EAE7E2",
    200: "#D5CFC8",
    300: "#BDB4AA",
    400: "#A09590",
    500: "#78716C",
    600: "#57534E",
    700: "#44403C",
    800: "#2E2B28",
    900: "#1C1917",
  },
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
};

export const modernColors = {
  // Primary Brand Colors — Claude Terracotta
  primary: {
    50: "#FFF3EE",
    100: "#FFE4D6",
    200: "#FFC7A8",
    300: "#FFA47B",
    400: "#E8906E",
    500: "#CC785C", // Main primary — Claude Terracotta
    600: "#B06148",
    700: "#924D36",
    800: "#743A26",
    900: "#562A18",
  },

  // Secondary — Sage Green (organic, calm)
  secondary: {
    50: "#F0FDF4",
    100: "#DCFCE7",
    200: "#BBF7D0",
    300: "#86EFAC",
    400: "#4ADE80",
    500: "#22C55E", // Main secondary — Fresh Green
    600: "#16A34A",
    700: "#15803D",
    800: "#166534",
    900: "#14532D",
  },

  // Accent — Warm Amber/Gold
  accent: {
    50: "#FFFBF0",
    100: "#FEF3D6",
    200: "#FDE5A8",
    300: "#FBD070",
    400: "#F5B942",
    500: "#E8A020", // Main accent — Warm Amber
    600: "#C4830F",
    700: "#9E6508",
    800: "#794B07",
    900: "#553405",
  },

  // Neutral Grays — Warm Stone (not cold slate)
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

  // Semantic Colors
  success: {
    light: "#DCFCE7",
    main: "#22C55E",
    dark: "#16A34A",
    contrast: "#FFFFFF",
    50: "#F0FDF4",
    100: "#DCFCE7",
    200: "#BBF7D0",
    300: "#86EFAC",
    400: "#4ADE80",
    500: "#22C55E",
    600: "#16A34A",
    700: "#15803D",
    800: "#166534",
    900: "#14532D",
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
    light: "#FEF3C7",
    main: "#F59E0B",
    dark: "#D97706",
    contrast: "#1C1917",
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

  // Info keeps sky blue — universally understood as informational, distinct from brand terracotta
  info: {
    light: "#E0F2FE",
    main: "#0EA5E9",
    dark: "#0284C7",
    contrast: "#FFFFFF",
  },

  // Background Colors — Warm Parchment / Charcoal
  background: {
    default: "#1C1917", // Warm charcoal (dark mode base)
    paper: "#242220",   // Slightly lighter warm charcoal
    elevated: "#2E2B28",
    overlay: "rgba(12, 10, 9, 0.9)",
    glass: "rgba(36, 34, 32, 0.80)",
    // Alias for legacy Aurora support
    primary: "#242220",
    secondary: "#2E2B28",
    tertiary: "#3D3A37",
    elevatedLegacy: "#4A4744",
    blur: "rgba(44, 41, 38, 0.5)",
  },

  // Surface Colors for legacy Aurora support
  surface: {
    base: "#242220",
    primary: "#242220",
    secondary: "#2E2B28",
    tertiary: "#3D3A37",
    elevated: "#4A4744",
    card: "#2E2B28",
    overlay: "rgba(28, 25, 23, 0.95)",
    glass: "rgba(44, 41, 38, 0.7)",
  },

  // Text Colors — Warm Tones
  text: {
    primary: "#F5F0E8",  // Warm cream
    secondary: "#B5AFA9", // Warm stone
    tertiary: "#78746F",  // Muted warm
    muted: "#B5AFA9",
    disabled: "#58534E",
    inverse: "#1C1917",
    link: "#E8906E",      // Terracotta link
    linkHover: "#CC785C",
  },

  // Border Colors — Warm & Subtle
  border: {
    light: "#3D3A37",
    medium: "#4A4744",
    strong: "#58534E",
    dark: "#58534E",
    focus: "#CC785C",     // Terracotta focus ring
    error: "#EF4444",
    subtle: "#3D3A37",
    success: "#22C55E",
  },

  // Semantic Colors Shorthand
  semantic: {
    success: "#22C55E",
    error: "#EF4444",
    warning: "#F59E0B",
    info: "#0EA5E9",
  },

  // Status Colors
  status: {
    active: "#22C55E",
    pending: "#F59E0B",
    error: "#EF4444",
    inactive: "#78746F",
    verified: "#E8906E",
    warning: "#FBBF24",
  },

  // Gradient Definitions — Warm Claude Palette
  gradients: {
    primary: ["#E8906E", "#CC785C", "#B06148"] as const,   // Terracotta spectrum
    secondary: ["#4ADE80", "#22C55E", "#16A34A"] as const, // Green spectrum
    accent: ["#F5B942", "#E8A020", "#C4830F"] as const,    // Amber spectrum
    dark: ["#242220", "#1C1917", "#0C0A09"] as const,      // Warm dark
    surface: ["#2E2B28", "#242220", "#1C1917"] as const,   // Warm surfaces
    aurora: ["#E8906E", "#CC785C", "#E8A020"] as const,    // Terracotta to Amber

    // Aurora Legacy Gradients (warm-mapped)
    auroraPrimary: ["#CC785C", "#E8906E", "#E8A020"] as const,
    auroraSecondary: ["#E8906E", "#CC785C", "#B06148"] as const,
    auroraSuccess: ["#22C55E", "#16A34A", "#15803D"] as const,
    auroraWarm: ["#F59E0B", "#E8A020", "#CC785C"] as const,
    auroraDark: ["#242220", "#2E2B28", "#3D3A37"] as const,

    // Specific UI Gradients
    button: ["#E8906E", "#CC785C"] as const,
    card: ["rgba(44, 41, 38, 0.7)", "rgba(28, 25, 23, 0.8)"] as const,
    input: ["rgba(28, 25, 23, 0.6)", "rgba(12, 10, 9, 0.7)"] as const,

    success: ["#22C55E", "#16A34A"] as const,
    warning: ["#F59E0B", "#D97706"] as const,
    error: ["#EF4444", "#DC2626"] as const,
    glass: ["rgba(255, 255, 255, 0.06)", "rgba(255, 255, 255, 0.02)"] as const,
    shimmer: [
      "rgba(204, 120, 92, 0.08)",
      "rgba(232, 144, 110, 0.14)",
      "rgba(204, 120, 92, 0.08)",
    ] as const,
  },

  // Shimmer effect colors
  shimmer: ["#2E2B28", "#3D3A37", "#2E2B28"] as const,
};

export const modernGradients = modernColors.gradients;

// ==========================================
// ENHANCED TYPOGRAPHY
// ==========================================

export const modernTypography = {
  // Typography System - Inter
  fontFamily: {
    display: "Inter_700Bold",
    heading: "Inter_600SemiBold",
    body: "Inter_400Regular",
    label: "Inter_500Medium",
    mono: Platform.OS === "ios" ? "Menlo" : "monospace",
  },

  // Display Styles (Hero, Large Headings)
  display: {
    large: {
      fontSize: 57,
      fontWeight: "700" as const,
      lineHeight: 64,
      letterSpacing: -0.5,
    },
    medium: {
      fontSize: 45,
      fontWeight: "700" as const,
      lineHeight: 52,
      letterSpacing: -0.5,
    },
    small: {
      fontSize: 36,
      fontWeight: "700" as const,
      lineHeight: 44,
      letterSpacing: -0.5,
    },
  },

  // Headings
  h1: {
    fontSize: 32,
    fontWeight: "700" as const,
    lineHeight: 40,
    letterSpacing: -0.5,
  },
  h2: {
    fontSize: 28,
    fontWeight: "600" as const,
    lineHeight: 36,
    letterSpacing: 0,
  },
  h3: {
    fontSize: 24,
    fontWeight: "600" as const,
    lineHeight: 32,
    letterSpacing: 0,
  },
  h4: {
    fontSize: 20,
    fontWeight: "600" as const,
    lineHeight: 28,
    letterSpacing: 0.15,
  },
  h5: {
    fontSize: 18,
    fontWeight: "600" as const,
    lineHeight: 24,
    letterSpacing: 0.15,
  },
  h6: {
    fontSize: 16,
    fontWeight: "600" as const,
    lineHeight: 24,
    letterSpacing: 0.15,
  },

  // Body Text
  body: {
    large: {
      fontSize: 18,
      fontWeight: "400" as const,
      lineHeight: 28,
      letterSpacing: 0.15,
    },
    medium: {
      fontSize: 16,
      fontWeight: "400" as const,
      lineHeight: 24,
      letterSpacing: 0.15,
    },
    small: {
      fontSize: 14,
      fontWeight: "400" as const,
      lineHeight: 20,
      letterSpacing: 0.25,
    },
  },

  // Labels & Captions
  label: {
    large: {
      fontSize: 14,
      fontWeight: "500" as const,
      lineHeight: 20,
      letterSpacing: 0.1,
    },
    medium: {
      fontSize: 12,
      fontWeight: "500" as const,
      lineHeight: 16,
      letterSpacing: 0.5,
    },
    small: {
      fontSize: 11,
      fontWeight: "500" as const,
      lineHeight: 16,
      letterSpacing: 0.5,
    },
  },

  // Button Text
  button: {
    large: {
      fontSize: 16,
      fontWeight: "600" as const,
      lineHeight: 24,
      letterSpacing: 0.5,
    },
    medium: {
      fontSize: 14,
      fontWeight: "600" as const,
      lineHeight: 20,
      letterSpacing: 0.5,
    },
    small: {
      fontSize: 12,
      fontWeight: "600" as const,
      lineHeight: 16,
      letterSpacing: 0.5,
    },
  },

  // Overline (Uppercase Labels)
  overline: {
    fontSize: 10,
    fontWeight: "600" as const,
    lineHeight: 16,
    letterSpacing: 1.5,
    textTransform: "uppercase" as const,
  },

  // Font Sizes Legacy map
  fontSize: {
    xs: 12,
    sm: 14,
    base: 16,
    md: 18,
    lg: 20,
    xl: 24,
    "2xl": 30,
    "3xl": 36,
    "4xl": 48,
    "5xl": 60,
    "6xl": 72,
    "7xl": 96,
  },

  // Font Weights Legacy map
  fontWeight: {
    light: "300" as const,
    normal: "400" as const,
    medium: "500" as const,
    semibold: "600" as const,
    bold: "700" as const,
    extrabold: "800" as const,
  },

  // Line Heights Legacy map
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
    loose: 2,
  },

  // Letter Spacing Legacy
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
// ENHANCED SPACING SYSTEM
// ==========================================

export const modernSpacing = {
  // Base spacing scale (4px base)
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
  "4xl": 80,

  // Component-specific spacing
  screenPadding: 24, // Increased from 20
  cardPadding: 20, // Increased from 18
  inputPadding: 16, // Increased from 14
  buttonPadding: 16, // Increased from 14
  sectionGap: 40, // More breathing room (was 32)
  elementGap: 16, // More breathing room (was 12)
  groupGap: 10, // Was 8
};

// ==========================================
// BORDER RADIUS SYSTEM
// ==========================================

export const modernBorderRadius = {
  none: 0,
  xs: 6,
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  "2xl": 32,
  "3xl": 40,
  full: 9999,

  // Component-specific
  button: 12,
  card: 16,
  input: 12,
  modal: 24,
  badge: 9999,
};

// ==========================================
// SHADOW SYSTEM (Enhanced)
// ==========================================

export const modernShadows = {
  none: {
    ...Platform.select({
      web: { boxShadow: "0px 0px 0px transparent" },
      default: {
        shadowColor: "transparent",
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0,
        shadowRadius: 0,
        elevation: 0,
      },
    }),
  },

  xs: {
    ...Platform.select({
      web: { boxShadow: "0px 1px 2px rgba(0, 0, 0, 0.05)" },
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
      },
    }),
  },

  sm: {
    ...Platform.select({
      web: { boxShadow: "0px 2px 4px rgba(0, 0, 0, 0.1)" },
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
      },
    }),
  },

  md: {
    ...Platform.select({
      web: { boxShadow: "0px 4px 8px rgba(0, 0, 0, 0.15)" },
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
        elevation: 4,
      },
    }),
  },

  lg: {
    ...Platform.select({
      web: { boxShadow: "0px 8px 16px rgba(0, 0, 0, 0.2)" },
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 16,
        elevation: 8,
      },
    }),
  },

  xl: {
    ...Platform.select({
      web: { boxShadow: "0px 12px 24px rgba(0, 0, 0, 0.25)" },
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.25,
        shadowRadius: 24,
        elevation: 12,
      },
    }),
  },

  // Colored shadows for brand elements — Claude Terracotta
  primary: {
    ...Platform.select({
      web: { boxShadow: `0px 4px 8px rgba(204, 120, 92, 0.35)` },
      default: {
        shadowColor: modernColors.primary[500],
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
        elevation: 4,
      },
    }),
  },

  success: {
    ...Platform.select({
      web: { boxShadow: `0px 4px 8px rgba(34, 197, 94, 0.3)` },
      default: {
        shadowColor: modernColors.success.main,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
      },
    }),
  },

  // Warm Glow
  aurora: {
    ...Platform.select({
      web: { boxShadow: "0px 8px 16px rgba(232, 144, 110, 0.35)" },
      default: {
        shadowColor: "#E8906E",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
        elevation: 8,
      },
    }),
  },

  glow: {
    ...Platform.select({
      web: { boxShadow: "0px 0px 20px rgba(204, 120, 92, 0.55)" },
      default: {
        shadowColor: "#CC785C",
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.55,
        shadowRadius: 20,
        elevation: 10,
      },
    }),
  },
};

// ==========================================
// ANIMATION SYSTEM
// ==========================================

export const modernAnimations = {
  // Durations (ms)
  duration: {
    instant: 0,
    fast: 150,
    normal: 300,
    slow: 500,
    slower: 700,
  },

  // Easing functions
  easing: {
    linear: "linear",
    easeIn: "ease-in",
    easeOut: "ease-out",
    easeInOut: "ease-in-out",
    // React Native Reanimated easings
    spring: {
      damping: 15,
      stiffness: 300,
      mass: 1,
    },
  },

  // Common animation values
  scale: {
    pressed: 0.95,
    hover: 1.02,
    focus: 1.05,
    active: 1.05,
  },

  opacity: {
    disabled: 0.5,
    hover: 0.9,
    pressed: 0.8,
  },

  // Aurora spring config
  spring: {
    damping: 15,
    stiffness: 300,
    mass: 1,
  },
};

// ==========================================
// GLASSMORPHISM STYLES — Warm Claude
// ==========================================

export const glassmorphism = {
  light: {
    backgroundColor: "rgba(255, 250, 245, 0.08)",
    borderColor: "rgba(255, 245, 235, 0.18)",
    borderWidth: 1,
    backdropFilter: "blur(12px)",
  },

  medium: {
    backgroundColor: "rgba(255, 250, 245, 0.12)",
    borderColor: "rgba(255, 245, 235, 0.22)",
    borderWidth: 1,
    backdropFilter: "blur(16px)",
  },

  strong: {
    backgroundColor: "rgba(255, 250, 245, 0.18)",
    borderColor: "rgba(255, 245, 235, 0.28)",
    borderWidth: 1.5,
    backdropFilter: "blur(24px)",
  },

  dark: {
    backgroundColor: "rgba(28, 25, 23, 0.45)",
    borderColor: "rgba(255, 245, 235, 0.08)",
    borderWidth: 1,
    backdropFilter: "blur(20px)",
  },

  modal: {
    backgroundColor: "rgba(28, 25, 23, 0.88)",
    borderColor: "rgba(255, 245, 235, 0.14)",
    borderWidth: 1,
    backdropFilter: "blur(30px)",
  },
};

// ==========================================
// LAYOUT TOKENS
// ==========================================

export const modernLayout = {
  // Safe areas
  safeArea: {
    top: Platform.OS === "ios" ? 44 : 24,
    bottom: Platform.OS === "ios" ? 34 : 0,
  },

  // Component heights
  headerHeight: 64,
  tabBarHeight: 72,
  inputHeight: 56,
  buttonHeight: {
    small: 36,
    medium: 44,
    large: 56,
  },

  // Sidebar
  sidebarWidth: 280,
  sidebarCollapsedWidth: 80,

  // Container widths
  containerMaxWidth: {
    mobile: "100%",
    tablet: 768,
    desktop: 1200,
    wide: 1440,
  },

  // Z-index scale
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

  // Component Sizes (Merged from Aurora)
  componentSizes: {
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
  },
};

// ==========================================
// ACCESSIBILITY TOKENS
// ==========================================

export const accessibility = {
  minTouchTarget: 44,
  minTextSize: 14,
  maxTextSize: 24,
  focusRingWidth: 2,
  focusRingOffset: 2,
  focusRingColor: modernColors.primary[500], // Claude Terracotta
  highContrast: {
    text: "#FFFFFF",
    background: "#000000",
  },
};

// ==========================================
// BREAKPOINTS (Responsive Design)
// ==========================================

export const breakpoints = {
  xs: 0,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536,
};

// ==========================================
// COMMON STYLES
// ==========================================

export const modernCommonStyles = StyleSheet.create({
  // Containers
  container: {
    flex: 1,
    backgroundColor: modernColors.background.default,
  },

  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: modernColors.background.default,
  },

  scrollContent: {
    flexGrow: 1,
    padding: modernSpacing.screenPadding,
  },

  // Cards
  card: {
    backgroundColor: modernColors.background.paper,
    borderRadius: modernBorderRadius.card,
    padding: modernSpacing.cardPadding,
    borderWidth: 1,
    borderColor: modernColors.border.light,
    ...modernShadows.sm,
  },

  cardElevated: {
    backgroundColor: modernColors.background.paper,
    borderRadius: modernBorderRadius.card,
    padding: modernSpacing.cardPadding,
    ...modernShadows.md,
  },

  cardGlass: {
    backgroundColor: modernColors.background.glass,
    borderRadius: modernBorderRadius.card,
    padding: modernSpacing.cardPadding,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },

  // Buttons
  button: {
    borderRadius: modernBorderRadius.button,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: modernSpacing.sm,
    minHeight: modernLayout.buttonHeight.medium,
    paddingHorizontal: modernSpacing.buttonPadding,
  },

  buttonPrimary: {
    backgroundColor: modernColors.primary[500],
  },

  buttonSecondary: {
    backgroundColor: modernColors.secondary[500],
  },

  buttonOutline: {
    backgroundColor: "transparent",
    borderWidth: 2,
    borderColor: modernColors.primary[500],
  },

  buttonGhost: {
    backgroundColor: "transparent",
  },

  // Inputs
  input: {
    height: modernLayout.inputHeight,
    backgroundColor: modernColors.background.paper,
    borderRadius: modernBorderRadius.input,
    paddingHorizontal: modernSpacing.inputPadding,
    borderWidth: 1,
    borderColor: modernColors.border.light,
    color: modernColors.text.primary,
    fontSize: modernTypography.body.medium.fontSize,
  },

  inputFocused: {
    borderColor: modernColors.border.focus,
    borderWidth: 2,
  },

  inputError: {
    borderColor: modernColors.border.error,
  },

  // Text styles
  textPrimary: {
    color: modernColors.text.primary,
    ...modernTypography.body.medium,
  },

  textSecondary: {
    color: modernColors.text.secondary,
    ...modernTypography.body.small,
  },

  textTertiary: {
    color: modernColors.text.tertiary,
    ...modernTypography.body.small,
  },

  // Spacing helpers
  gapXs: { gap: modernSpacing.xs },
  gapSm: { gap: modernSpacing.sm },
  gapMd: { gap: modernSpacing.md },
  gapLg: { gap: modernSpacing.lg },
  gapXl: { gap: modernSpacing.xl },

  // Flex helpers
  row: { flexDirection: "row" },
  column: { flexDirection: "column" },
  center: { justifyContent: "center", alignItems: "center" },
  spaceBetween: { justifyContent: "space-between" },
  spaceAround: { justifyContent: "space-around" },
  flex1: { flex: 1 },
});

// Export all as named theme object
export const theme = {
  colors: modernColors,
  typography: modernTypography,
  spacing: modernSpacing,
  borderRadius: modernBorderRadius,
  shadows: modernShadows,
  animations: modernAnimations,
  glass: glassmorphism,
  glassmorphism,
  layout: modernLayout,
  componentSizes: modernLayout.componentSizes,
  accessibility,
  breakpoints,
  commonStyles: modernCommonStyles,
};

// Aliases for theme consistency
export const modernGlass = glassmorphism;
export const modernComponentSizes = modernLayout.componentSizes;

export default theme;
