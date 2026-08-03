/**
 * Unified Typography System
 * Consistent text styling with custom font support
 *
 * Inspired by WorkSans patterns from Aashu-Dubey repo
 * but using system fonts until custom fonts are configured
 */

import { Platform, TextStyle } from "react-native";

// ==========================================
// FONT FAMILIES
// ==========================================
export const fontFamily = {
  // Primary font (use custom font when available)
  regular: Platform.select({
    ios: "System",
    android: "Roboto",
    default: "System",
  }),
  medium: Platform.select({
    ios: "System",
    android: "Roboto-Medium",
    default: "System",
  }),
  semiBold: Platform.select({
    ios: "System",
    android: "Roboto-Medium",
    default: "System",
  }),
  bold: Platform.select({
    ios: "System",
    android: "Roboto-Bold",
    default: "System",
  }),
  // Monospace for codes, numbers
  mono: Platform.select({
    ios: "Menlo",
    android: "monospace",
    default: "monospace",
  }),
} as const;

// ==========================================
// FONT SIZES
// ==========================================
export const fontSize = {
  /** 10px - Tiny captions */
  xs: 10,
  /** 12px - Small text, captions */
  sm: 12,
  /** 14px - Body small */
  md: 14,
  /** 16px - Body default */
  lg: 16,
  /** 18px - Body large, subtitles */
  xl: 18,
  /** 20px - Heading 4 */
  "2xl": 20,
  /** 24px - Heading 3 */
  "3xl": 24,
  /** 28px - Heading 2 */
  "4xl": 28,
  /** 32px - Heading 1 */
  "5xl": 32,
  /** 40px - Display */
  "6xl": 40,
  /** 48px - Large display */
  "7xl": 48,
} as const;

// ==========================================
// FONT WEIGHTS (as strings for RN compatibility)
// ==========================================
export const fontWeight = {
  regular: "400" as const,
  medium: "500" as const,
  semiBold: "600" as const,
  bold: "700" as const,
} as const;

// ==========================================
// LINE HEIGHTS (multipliers)
// ==========================================
export const lineHeight = {
  tight: 1.2,
  normal: 1.4,
  relaxed: 1.6,
  loose: 1.8,
} as const;

// ==========================================
// LETTER SPACING
// ==========================================
export const letterSpacing = {
  tighter: -0.5,
  tight: -0.25,
  normal: 0,
  wide: 0.25,
  wider: 0.5,
  widest: 1,
} as const;

// ==========================================
// TYPOGRAPHY PRESETS
// ==========================================
export const textStyles = {
  // Display styles
  display: {
    fontSize: fontSize["6xl"],
    fontWeight: fontWeight.bold,
    lineHeight: fontSize["6xl"] * lineHeight.tight,
    letterSpacing: letterSpacing.tight,
  } as TextStyle,

  // Heading styles
  h1: {
    fontSize: fontSize["5xl"],
    fontWeight: fontWeight.bold,
    lineHeight: fontSize["5xl"] * lineHeight.tight,
    letterSpacing: letterSpacing.tight,
  } as TextStyle,

  h2: {
    fontSize: fontSize["4xl"],
    fontWeight: fontWeight.bold,
    lineHeight: fontSize["4xl"] * lineHeight.tight,
  } as TextStyle,

  h3: {
    fontSize: fontSize["3xl"],
    fontWeight: fontWeight.semiBold,
    lineHeight: fontSize["3xl"] * lineHeight.normal,
  } as TextStyle,

  h4: {
    fontSize: fontSize["2xl"],
    fontWeight: fontWeight.semiBold,
    lineHeight: fontSize["2xl"] * lineHeight.normal,
  } as TextStyle,

  h5: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semiBold,
    lineHeight: fontSize.xl * lineHeight.normal,
  } as TextStyle,

  h6: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semiBold,
    lineHeight: fontSize.lg * lineHeight.normal,
  } as TextStyle,

  // Subtitle styles
  subtitle1: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.medium,
    lineHeight: fontSize.lg * lineHeight.relaxed,
  } as TextStyle,

  subtitle2: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    lineHeight: fontSize.md * lineHeight.relaxed,
  } as TextStyle,

  // Body styles
  body1: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.regular,
    lineHeight: fontSize.lg * lineHeight.relaxed,
  } as TextStyle,

  body2: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.regular,
    lineHeight: fontSize.md * lineHeight.relaxed,
  } as TextStyle,

  bodyLarge: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.regular,
    lineHeight: fontSize.xl * lineHeight.relaxed,
  } as TextStyle,

  body: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.regular,
    lineHeight: fontSize.lg * lineHeight.relaxed,
  } as TextStyle,

  bodySmall: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.regular,
    lineHeight: fontSize.md * lineHeight.relaxed,
  } as TextStyle,

  // Caption styles
  caption: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.regular,
    lineHeight: fontSize.sm * lineHeight.normal,
  } as TextStyle,

  captionSmall: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.regular,
    lineHeight: fontSize.xs * lineHeight.normal,
  } as TextStyle,

  // Label styles
  label: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    lineHeight: fontSize.md * lineHeight.normal,
    letterSpacing: letterSpacing.wide,
  } as TextStyle,

  // Button text
  button: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semiBold,
    lineHeight: fontSize.lg * lineHeight.normal,
    letterSpacing: letterSpacing.wide,
  } as TextStyle,

  // Overline (small uppercase labels)
  overline: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semiBold,
    lineHeight: fontSize.xs * lineHeight.normal,
    letterSpacing: letterSpacing.widest,
    textTransform: "uppercase",
  } as TextStyle,
} as const;

// Type exports
export type FontSize = keyof typeof fontSize;
export type FontWeight = keyof typeof fontWeight;
export type TextStyleKey = keyof typeof textStyles;

// ==========================================
// LEGACY TYPOGRAPHY OBJECT
// Full nested typography scale consumed by screens still using the
// `typography.h1.fontSize`-style API instead of the flat tokens above.
// ==========================================
export const legacyTypography = {
  fontFamily: {
    display: "Inter_700Bold",
    heading: "Inter_600SemiBold",
    body: "Inter_400Regular",
    label: "Inter_500Medium",
    mono: Platform.OS === "ios" ? "Menlo" : "monospace",
  },

  display: {
    large: { fontSize: 57, fontWeight: "700" as const, lineHeight: 64, letterSpacing: -0.5 },
    medium: { fontSize: 45, fontWeight: "700" as const, lineHeight: 52, letterSpacing: -0.5 },
    small: { fontSize: 36, fontWeight: "700" as const, lineHeight: 44, letterSpacing: -0.5 },
  },

  h1: { fontSize: 32, fontWeight: "700" as const, lineHeight: 40, letterSpacing: -0.5 },
  h2: { fontSize: 28, fontWeight: "600" as const, lineHeight: 36, letterSpacing: 0 },
  h3: { fontSize: 24, fontWeight: "600" as const, lineHeight: 32, letterSpacing: 0 },
  h4: { fontSize: 20, fontWeight: "600" as const, lineHeight: 28, letterSpacing: 0.15 },
  h5: { fontSize: 18, fontWeight: "600" as const, lineHeight: 24, letterSpacing: 0.15 },
  h6: { fontSize: 16, fontWeight: "600" as const, lineHeight: 24, letterSpacing: 0.15 },

  body: {
    large: { fontSize: 18, fontWeight: "400" as const, lineHeight: 28, letterSpacing: 0.15 },
    medium: { fontSize: 16, fontWeight: "400" as const, lineHeight: 24, letterSpacing: 0.15 },
    small: { fontSize: 14, fontWeight: "400" as const, lineHeight: 20, letterSpacing: 0.25 },
  },

  label: {
    large: { fontSize: 14, fontWeight: "500" as const, lineHeight: 20, letterSpacing: 0.1 },
    medium: { fontSize: 12, fontWeight: "500" as const, lineHeight: 16, letterSpacing: 0.5 },
    small: { fontSize: 11, fontWeight: "500" as const, lineHeight: 16, letterSpacing: 0.5 },
  },

  button: {
    large: { fontSize: 16, fontWeight: "600" as const, lineHeight: 24, letterSpacing: 0.5 },
    medium: { fontSize: 14, fontWeight: "600" as const, lineHeight: 20, letterSpacing: 0.5 },
    small: { fontSize: 12, fontWeight: "600" as const, lineHeight: 16, letterSpacing: 0.5 },
  },

  overline: {
    fontSize: 10,
    fontWeight: "600" as const,
    lineHeight: 16,
    letterSpacing: 1.5,
    textTransform: "uppercase" as const,
  },

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

  fontWeight: {
    light: "300" as const,
    normal: "400" as const,
    medium: "500" as const,
    semibold: "600" as const,
    bold: "700" as const,
    extrabold: "800" as const,
  },

  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
    loose: 2,
  },

  letterSpacing: {
    tighter: -0.5,
    tight: -0.25,
    normal: 0,
    wide: 0.25,
    wider: 0.5,
    widest: 1,
  },
};
