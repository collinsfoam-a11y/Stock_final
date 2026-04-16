/**
 * UI Standardization Constants
 *
 * Provides consistent styling values across all components.
 * Use these values to ensure visual consistency throughout the app.
 *
 * Based on Material Design 3 guidelines and iOS HIG for accessibility.
 */

import { Platform, ViewStyle } from "react-native";

// ==========================================
// SPACING (8px grid base)
// ==========================================
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

// ==========================================
// BORDER RADIUS
// ==========================================
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
};

// ==========================================
// COMPONENT SIZES
// ==========================================
export const sizes = {
  // Touch targets (44px minimum for accessibility)
  touchMin: 44,
  touchComfortable: 48,

  // Button heights
  button: {
    sm: 36,
    md: 44,
    lg: 52,
    xl: 60,
  },

  // Input heights
  input: {
    sm: 40,
    md: 48,
    lg: 56,
  },

  // Icon sizes
  icon: {
    xs: 16,
    sm: 20,
    md: 24,
    lg: 28,
    xl: 32,
  },

  // Card
  card: {
    minHeight: 80,
    borderRadius: radius.lg,
    padding: spacing.md,
  },

  // List item
  listItem: {
    small: 48,
    medium: 56,
    large: 72,
  },
};

// ==========================================
// COLORS
// ==========================================
export const colors = {
  // Primary - Electric Blue
  primary: "#3B82F6",
  primaryDark: "#2563EB",
  primaryLight: "#60A5FA",

  // Secondary - Emerald
  secondary: "#10B981",
  secondaryDark: "#059669",
  secondaryLight: "#34D399",

  // Status colors
  success: "#22C55E",
  warning: "#F59E0B",
  error: "#EF4444",
  info: "#3B82F6",

  // Text
  text: {
    primary: "#0F172A",
    secondary: "#64748B",
    tertiary: "#94A3B8",
    disabled: "#CBD5E1",
    inverse: "#FFFFFF",
  },

  // Background
  background: {
    default: "#FAFBFC",
    paper: "#FFFFFF",
    elevated: "#F8F9FB",
  },

  // Border
  border: {
    default: "#E2E8F0",
    strong: "#94A3B8",
  },
};

// ==========================================
// TYPOGRAPHY
// ==========================================
export const typography = {
  fontSize: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    xxl: 24,
    display: 32,
  },
  fontWeight: {
    normal: "400" as const,
    medium: "500" as const,
    semibold: "600" as const,
    bold: "700" as const,
  },
};

// ==========================================
// SHADOWS
// ==========================================
export const shadows = {
  sm: {
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
  } as ViewStyle,
  md: {
    ...Platform.select({
      web: { boxShadow: "0px 2px 4px rgba(0, 0, 0, 0.1)" },
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
      },
    }),
  } as ViewStyle,
  lg: {
    ...Platform.select({
      web: { boxShadow: "0px 4px 8px rgba(0, 0, 0, 0.15)" },
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
        elevation: 5,
      },
    }),
  } as ViewStyle,
};

// ==========================================
// ANIMATION
// ==========================================
export const animation = {
  fast: 150,
  normal: 250,
  slow: 350,
};

// ==========================================
// EXPORT ALL
// ==========================================
export const uiStandard = {
  spacing,
  radius,
  sizes,
  colors,
  typography,
  shadows,
  animation,
};

export default uiStandard;
