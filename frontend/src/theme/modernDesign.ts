import { Appearance } from "react-native";

/**
 * Modern Design System for Lavanya Mart Stock Verify App
 * Production-ready design tokens following modern UI/UX principles
 */

export const modernBranding = {
  name: "Lavanya Mart",
  tagline: "Stock Verification System",
  colors: {
    primary: "#CC785C",       // Claude Terracotta
    primaryDark: "#924D36",
    secondary: "#22C55E",     // Fresh Green
    accent: "#E8A020",        // Warm Amber
  },
} as const;

// Modern Color Palette — Claude Warm Design
const lightColors = {
  // Primary Brand Colors — Claude Terracotta
  primary: {
    50: "#FFF3EE",
    100: "#FFE4D6",
    200: "#FFC7A8",
    300: "#FFA47B",
    400: "#E8906E",
    500: "#CC785C",   // Claude Terracotta
    600: "#B06148",
    700: "#924D36",
    800: "#743A26",
    900: "#562A18",
  },

  // Neutral — Warm Stone
  gray: {
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
  },

  // Semantic Colors
  success: {
    50: "#F0FDF4",
    500: "#22C55E",
    600: "#16A34A",
  },

  warning: {
    50: "#FFFBEB",
    500: "#F59E0B",
    600: "#D97706",
  },

  error: {
    50: "#FEF2F2",
    500: "#EF4444",
    600: "#DC2626",
  },

  // Special UI Colors
  white: "#FFFFFF",
  black: "#000000",
  transparent: "transparent",

  // Overlay colors for modals/sheets
  overlay: "rgba(28, 25, 23, 0.6)",
  glassBg: "rgba(255, 250, 245, 0.12)",
} as const;

// Dark Theme Colors — Warm Charcoal
export const darkColors = {
  ...lightColors,
  gray: {
    50: "#2E2B28",
    100: "#3D3A37",
    200: "#4A4744",
    300: "#58534E",
    400: "#78746F",
    500: "#A9A5A2",
    600: "#D7D4D1",
    700: "#E7E5E4",
    800: "#F5F5F4",
    900: "#FAFAF9",
  },
  white: "#1C1917",
  black: "#F5F0E8",
} as const;

// Determine static colors based on OS preference at boot time
const isDark = Appearance.getColorScheme() === "dark";
export const colors = isDark ? darkColors : lightColors;

// Spacing System - 8px base grid
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  "2xl": 48,
  "3xl": 64,
  "4xl": 80,
  "5xl": 96,
} as const;

// Typography Scale
export const typography = {
  fontSize: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    "2xl": 24,
    "3xl": 30,
    "4xl": 36,
    "5xl": 48,
    "6xl": 60,
  },

  fontWeight: {
    light: "300" as const,
    normal: "400" as const,
    regular: "400" as const,
    medium: "500" as const,
    semibold: "600" as const,
    bold: "700" as const,
    black: "900" as const,
  },

  lineHeight: {
    xs: 16,
    sm: 20,
    base: 24,
    lg: 28,
    xl: 32,
    "2xl": 36,
    "3xl": 40,
    "4xl": 44,
    "5xl": 56,
    "6xl": 72,
  },
} as const;

// Border Radius - Modern rounded corners
export const borderRadius = {
  none: 0,
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  "2xl": 20,
  "3xl": 24,
  full: 999,
} as const;

// Modern Shadows - Subtle depth
export const shadows = {
  sm: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },

  md: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },

  lg: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 15,
    elevation: 5,
  },

  xl: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.25,
    shadowRadius: 25,
    elevation: 8,
  },
} as const;

// Animation Constants
export const animations = {
  duration: {
    fast: 150,
    normal: 250,
    slow: 350,
    slower: 500,
  },

  easing: {
    out: "ease-out",
    in: "ease-in",
    inOut: "ease-in-out",
    spring: "spring(1, 0.8, 0.2)",
  },
} as const;

// Component Sizes
export const componentSizes = {
  button: {
    sm: { height: 36, paddingHorizontal: 16 },
    md: { height: 44, paddingHorizontal: 20 },
    lg: { height: 52, paddingHorizontal: 24 },
  },

  input: {
    sm: { height: 36 },
    md: { height: 44 },
    lg: { height: 52 },
  },

  icon: {
    xs: 16,
    sm: 20,
    md: 24,
    lg: 28,
    xl: 32,
  },
} as const;

// Modern Gradients — Claude Warm Palette
export const gradients = {
  primary: ["#E8906E", "#CC785C"],     // Terracotta
  secondary: ["#4ADE80", "#22C55E"],   // Fresh Green
  accent: ["#F5B942", "#E8A020"],      // Warm Amber
  success: ["#22C55E", "#16A34A"],
  warning: ["#F59E0B", "#D97706"],
  error: ["#EF4444", "#DC2626"],
  glass: ["rgba(255, 250, 245, 0.12)", "rgba(255, 250, 245, 0.05)"],
  darkGlass: ["rgba(28, 25, 23, 0.12)", "rgba(28, 25, 23, 0.05)"],
} as const;

// Layout Constants
export const layout = {
  screen: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },

  container: {
    maxWidth: 600,
    paddingHorizontal: spacing.md,
  },

  card: {
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
  },

  button: {
    borderRadius: borderRadius.md,
    minHeight: componentSizes.button.md.height,
  },

  input: {
    borderRadius: borderRadius.md,
    height: componentSizes.input.md.height,
    paddingHorizontal: spacing.md,
  },
} as const;

export type ColorKey = keyof typeof colors;
export type SpacingKey = keyof typeof spacing;
export type TypographySize = keyof typeof typography.fontSize;
export type BorderRadiusKey = keyof typeof borderRadius;
export type ShadowKey = keyof typeof shadows;
