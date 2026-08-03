/**
 * Unified Shadow System
 * Consistent elevation and depth across components
 *
 * Uses both React Native shadows and Android elevation
 */

import { Platform, ViewStyle } from "react-native";
import { colors } from "./colors";

// ==========================================
// SHADOW DEFINITIONS
// ==========================================
export const shadows = {
  /** No shadow */
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
  } as ViewStyle,

  /** Subtle shadow - borders, dividers */
  xs: {
    ...Platform.select({
      web: { boxShadow: "0px 1px 2px rgba(15, 23, 42, 0.05)" },
      default: {
        shadowColor: colors.neutral[900],
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
      },
    }),
  } as ViewStyle,

  /** Small shadow - cards, buttons */
  sm: {
    ...Platform.select({
      web: { boxShadow: "0px 2px 4px rgba(15, 23, 42, 0.08)" },
      default: {
        shadowColor: colors.neutral[900],
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
        elevation: 2,
      },
    }),
  } as ViewStyle,

  /** Medium shadow - floating elements */
  md: {
    ...Platform.select({
      web: { boxShadow: "0px 4px 8px rgba(15, 23, 42, 0.1)" },
      default: {
        shadowColor: colors.neutral[900],
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
      },
    }),
  } as ViewStyle,

  /** Large shadow - modals, dropdowns */
  lg: {
    ...Platform.select({
      web: { boxShadow: "0px 8px 16px rgba(15, 23, 42, 0.12)" },
      default: {
        shadowColor: colors.neutral[900],
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
        elevation: 8,
      },
    }),
  } as ViewStyle,

  /** Extra large shadow - popovers, tooltips */
  xl: {
    ...Platform.select({
      web: { boxShadow: "0px 12px 24px rgba(15, 23, 42, 0.15)" },
      default: {
        shadowColor: colors.neutral[900],
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.15,
        shadowRadius: 24,
        elevation: 12,
      },
    }),
  } as ViewStyle,

  /** Maximum shadow - full-screen overlays */
  "2xl": {
    ...Platform.select({
      web: { boxShadow: "0px 16px 32px rgba(15, 23, 42, 0.2)" },
      default: {
        shadowColor: colors.neutral[900],
        shadowOffset: { width: 0, height: 16 },
        shadowOpacity: 0.2,
        shadowRadius: 32,
        elevation: 16,
      },
    }),
  } as ViewStyle,
} as const;

// ==========================================
// COLORED SHADOWS (for accent elements)
// ==========================================
export const coloredShadows = {
  primary: {
    ...Platform.select({
      web: { boxShadow: "0px 4px 8px rgba(59, 130, 246, 0.3)" },
      default: {
        shadowColor: colors.primary[500],
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
      },
    }),
  } as ViewStyle,

  success: {
    ...Platform.select({
      web: { boxShadow: "0px 4px 8px rgba(34, 197, 94, 0.3)" },
      default: {
        shadowColor: colors.success[500],
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
      },
    }),
  } as ViewStyle,

  error: {
    ...Platform.select({
      web: { boxShadow: "0px 4px 8px rgba(239, 68, 68, 0.3)" },
      default: {
        shadowColor: colors.error[500],
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
      },
    }),
  } as ViewStyle,
} as const;

// ==========================================
// GLASSMORPHISM STYLES
// ==========================================
export const glass = {
  /** Light glass effect */
  light: {
    backgroundColor: "rgba(255, 255, 255, 0.7)",
    ...Platform.select({
      ios: {
        // Use BlurView for actual blur on iOS
      },
      android: {
        // Android doesn't support blur well, use solid fallback
        backgroundColor: "rgba(255, 255, 255, 0.9)",
      },
    }),
  } as ViewStyle,

  /** Dark glass effect */
  dark: {
    backgroundColor: "rgba(15, 23, 42, 0.7)",
    ...Platform.select({
      ios: {},
      android: {
        backgroundColor: "rgba(15, 23, 42, 0.9)",
      },
    }),
  } as ViewStyle,
} as const;

// ==========================================
// BLUR INTENSITY PRESETS
// ==========================================
export const blurIntensity = {
  light: 20,
  medium: 50,
  heavy: 80,
} as const;

// Type exports
export type ShadowKey = keyof typeof shadows;
export type Shadows = typeof shadows;

// ==========================================
// LEGACY MODERN SHADOWS
// Wider named scale (incl. brand/aurora glows) consumed by screens still
// using the `modernShadows.X`-style API instead of `shadows`/`coloredShadows`.
// ==========================================
export const legacyShadows = {
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
  } as ViewStyle,

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
  } as ViewStyle,

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
  } as ViewStyle,

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
  } as ViewStyle,

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
  } as ViewStyle,

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
  } as ViewStyle,

  primary: {
    ...Platform.select({
      web: { boxShadow: "0px 4px 8px rgba(59, 130, 246, 0.3)" },
      default: {
        shadowColor: "#3B82F6",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
      },
    }),
  } as ViewStyle,

  success: {
    ...Platform.select({
      web: { boxShadow: "0px 4px 8px rgba(16, 185, 129, 0.3)" },
      default: {
        shadowColor: "#22C55E",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
      },
    }),
  } as ViewStyle,

  aurora: {
    ...Platform.select({
      web: { boxShadow: "0px 8px 16px rgba(6, 182, 212, 0.35)" },
      default: {
        shadowColor: "#06B6D4",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
        elevation: 8,
      },
    }),
  } as ViewStyle,

  glow: {
    ...Platform.select({
      web: { boxShadow: "0px 0px 20px rgba(21, 96, 189, 0.6)" },
      default: {
        shadowColor: "#1560BD",
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.6,
        shadowRadius: 20,
        elevation: 10,
      },
    }),
  } as ViewStyle,
};

// ==========================================
// LEGACY GLASSMORPHISM STYLES
// ==========================================
export const legacyGlass = {
  light: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderColor: "rgba(255, 255, 255, 0.15)",
    borderWidth: 1,
  } as ViewStyle,

  medium: {
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    borderColor: "rgba(255, 255, 255, 0.2)",
    borderWidth: 1,
  } as ViewStyle,

  strong: {
    backgroundColor: "rgba(255, 255, 255, 0.18)",
    borderColor: "rgba(255, 255, 255, 0.25)",
    borderWidth: 1.5,
  } as ViewStyle,

  dark: {
    backgroundColor: "rgba(2, 6, 23, 0.4)",
    borderColor: "rgba(255, 255, 255, 0.08)",
    borderWidth: 1,
  } as ViewStyle,

  modal: {
    backgroundColor: "rgba(11, 17, 33, 0.85)",
    borderColor: "rgba(255, 255, 255, 0.15)",
    borderWidth: 1,
  } as ViewStyle,
};
