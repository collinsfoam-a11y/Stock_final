/**
 * Global Styles - legacy compatibility bridge for shared styles and tokens.
 * This file keeps the older export shape while sourcing values from the
 * unified theme system used by newer screens and components.
 */

import { Platform, StyleSheet } from "react-native";
import {
  colors as legacyColors,
  darkColors,
  duration,
  fontSize,
  fontWeight,
  gradients as legacyGradients,
  layout as legacyLayout,
  letterSpacing,
  lineHeight,
  radius,
  semanticColors,
  shadows as legacyShadows,
  spacing as legacySpacing,
  textStyles,
  touchTargets,
} from "@/theme/unified";

const hexToRgba = (hex: string, alpha: number): string => {
  const normalized = hex.replace("#", "").trim();
  const isValid = /^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(normalized);
  if (!isValid) return hex;

  const expanded =
    normalized.length === 3
      ? normalized
          .split("")
          .map((c) => c + c)
          .join("")
      : normalized;

  const r = parseInt(expanded.slice(0, 2), 16);
  const g = parseInt(expanded.slice(2, 4), 16);
  const b = parseInt(expanded.slice(4, 6), 16);
  const clampedAlpha = Math.max(0, Math.min(1, alpha));

  return `rgba(${r}, ${g}, ${b}, ${clampedAlpha})`;
};

// Color palette - legacy aliases mapped onto unified theme tokens
export const colors = {
  // Primary colors
  primary: legacyColors.primary[500],
  primaryDark: legacyColors.primary[600],
  primaryLight: legacyColors.primary[400],
  primaryHover: legacyColors.primary[600],
  primaryPressed: legacyColors.primary[700],

  // Secondary colors
  secondary: legacyColors.secondary[500],
  secondaryDark: legacyColors.secondary[600],
  secondaryLight: legacyColors.secondary[400],

  // Background colors
  backgroundDark: semanticColors.background.secondary,
  backgroundLight: semanticColors.background.secondary,
  surfaceDark: semanticColors.background.paper,
  surfaceLight: semanticColors.background.paper,
  surfaceElevated: semanticColors.background.elevated,

  // Text colors
  textPrimary: semanticColors.text.primary,
  textSecondary: semanticColors.text.secondary,
  textTertiary: semanticColors.text.tertiary,
  textDisabled: semanticColors.text.disabled,
  textInverse: semanticColors.text.inverse,

  // Border colors
  borderLight: semanticColors.border.default,
  borderMedium: semanticColors.border.default,
  borderDark: semanticColors.border.strong,
  borderFocus: semanticColors.border.focus,

  // Status colors with variants
  success: legacyColors.success[500],
  successLight: legacyColors.success[400],
  successDark: legacyColors.success[600],
  error: legacyColors.error[500],
  errorLight: legacyColors.error[400],
  errorDark: legacyColors.error[600],
  warning: legacyColors.warning[500],
  warningLight: legacyColors.warning[400],
  warningDark: legacyColors.warning[600],
  info: legacyColors.info[500],
  infoLight: legacyColors.info[400],
  infoDark: legacyColors.info[600],

  // Transparent overlays
  overlay: semanticColors.background.overlay,
  overlayLight: semanticColors.background.overlay,
  overlayDark: darkColors.background.overlay,
  overlayPrimary: hexToRgba(legacyColors.primary[500], 0.12),
} as const;

// Gradients
export const gradients = {
  primary: legacyGradients.primary,
  secondary: legacyGradients.secondary,
  accent: [legacyColors.secondary[500], legacyColors.primary[500]] as const,
  dark: [darkColors.background.elevated, darkColors.background.default] as const,
  surface: [semanticColors.background.paper, semanticColors.background.secondary] as const,
} as const;

// Glass helper for older components that still expect this export
export const glassStyle = {
  backgroundColor: hexToRgba(legacyColors.white, 0.72),
  borderColor: semanticColors.border.default,
  borderWidth: 1,
} as const;

// Spacing - legacy step names sourced from unified spacing tokens
export const spacing = {
  xs: legacySpacing.xs,
  sm: legacySpacing.sm,
  md: legacySpacing.lg,
  lg: legacySpacing["2xl"],
  xl: legacySpacing["3xl"],
  xxl: legacySpacing["5xl"],
  xxxl: legacySpacing["6xl"],
  sectionGap: legacyLayout.sectionGap,
  actionGap: legacySpacing.md,
  screenPadding: legacyLayout.screenPadding,
  cardPadding: legacyLayout.cardPadding,
  inputPadding: legacySpacing.md,
} as const;

// Typography - legacy names mapped to unified text styles
export const typography = {
  hero: {
    ...textStyles.display,
    fontSize: 36,
    lineHeight: 44,
    letterSpacing: letterSpacing.tight,
  },
  h1: textStyles.h1,
  h2: textStyles.h2,
  h3: textStyles.h3,
  h4: textStyles.h4,
  h5: textStyles.h5,
  body: {
    ...textStyles.body,
    fontSize: fontSize.md,
  },
  bodyMedium: {
    fontSize: 15,
    fontWeight: fontWeight.regular,
    lineHeight: 15 * lineHeight.relaxed,
    letterSpacing: letterSpacing.wide,
  },
  bodySmall: textStyles.bodySmall,
  caption: textStyles.caption,
  overline: textStyles.overline,
  button: textStyles.button,
  buttonLarge: {
    ...textStyles.button,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    lineHeight: fontSize.xl * lineHeight.normal,
  },
} as const;

// Border radius
export const borderRadius = {
  sm: radius.sm,
  md: radius.lg,
  lg: radius["2xl"],
  xl: radius["3xl"],
  round: radius.full,
} as const;

// Shadows
export const shadows = {
  small: legacyShadows.sm,
  medium: legacyShadows.md,
  large: legacyShadows.lg,
} as const;

// Common component styles
export const commonStyles = StyleSheet.create({
  // Container styles
  container: {
    flex: 1,
    backgroundColor: colors.backgroundDark,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.backgroundDark,
  },
  scrollContent: {
    flexGrow: 1,
    padding: spacing.screenPadding,
  },

  // Card styles
  card: {
    backgroundColor: colors.surfaceDark,
    borderRadius: borderRadius.md,
    padding: spacing.cardPadding,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  cardElevated: {
    backgroundColor: colors.surfaceDark,
    borderRadius: borderRadius.md,
    padding: spacing.cardPadding,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.medium,
  },

  // Input styles
  input: {
    height: 56,
    backgroundColor: colors.backgroundLight,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    color: colors.textPrimary,
    fontSize: typography.body.fontSize,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.backgroundLight,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },

  // Button styles
  button: {
    height: 56,
    minHeight: touchTargets.minimum,
    borderRadius: borderRadius.md,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
  },
  buttonPrimary: {
    backgroundColor: colors.primary,
  },
  buttonSecondary: {
    backgroundColor: colors.surfaceDark,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  buttonText: {
    ...typography.button,
    color: colors.textInverse,
  },
  buttonTextSecondary: {
    ...typography.button,
    color: colors.primary,
  },

  // Text styles
  textPrimary: {
    color: colors.textPrimary,
  },
  textSecondary: {
    color: colors.textSecondary,
  },
  textTertiary: {
    color: colors.textTertiary,
  },

  // Icon styles
  icon: {
    marginRight: spacing.sm,
  },

  // Spacing helpers
  mt8: { marginTop: legacySpacing.sm },
  mt16: { marginTop: legacySpacing.lg },
  mt24: { marginTop: legacySpacing["2xl"] },
  mb8: { marginBottom: legacySpacing.sm },
  mb16: { marginBottom: legacySpacing.lg },
  mb24: { marginBottom: legacySpacing["2xl"] },
  mx16: { marginHorizontal: legacySpacing.lg },
  my16: { marginVertical: legacySpacing.lg },
  p16: { padding: legacySpacing.lg },
  p24: { padding: legacySpacing["2xl"] },
});

// Animation durations
export const animations = {
  fast: duration.fast,
  normal: duration.slow,
  slow: duration.slower,
} as const;

// Breakpoints (for responsive design)
export const breakpoints = {
  mobile: 375,
  tablet: 768,
  desktop: 1024,
  wide: 1440,
} as const;

// Elevation levels (for depth/shadow)
export const elevation = {
  none: 0,
  low: 2,
  medium: 4,
  high: 8,
  highest: 16,
} as const;

// Layout tokens
export const layout = {
  safeAreaTop: Platform.OS === "ios" ? 44 : 24,
  safeAreaBottom: Platform.OS === "ios" ? 34 : 0,
  tabBarHeight: legacyLayout.tabBarHeight,
  sidebarWidth: 280,
  sidebarCollapsedWidth: 64,
  headerHeight: legacyLayout.headerHeight,
  containerMaxWidth: {
    mobile: "100%",
    tablet: 768,
    desktop: 1200,
  },
  sectionGap: legacyLayout.sectionGap,
  screenPadding: legacyLayout.screenPadding,
} as const;

// Accessibility tokens
export const accessibility = {
  focusRingWidth: 2,
  focusRingOffset: 2,
  minTouchTarget: touchTargets.minimum,
  minTextSize: fontSize.md,
  maxTextSize: fontSize["3xl"],
} as const;

// Scanner tokens
export const scanner = {
  frameColor: colors.primary,
  frameWidth: 2,
  cornerSize: 20,
  overlayOpacity: 0.7,
  feedbackDuration: 2000,
  scanDebounceMs: 500,
} as const;

// Offline/Queue tokens
export const offline = {
  queueBarHeight: 48,
  drawerMaxHeight: "60%",
  statusColors: {
    pending: colors.warning,
    syncing: colors.info,
    success: colors.success,
    failed: colors.error,
  },
} as const;

// Onboarding tokens
export const onboarding = {
  overlayOpacity: 0.9,
  spotlightRadius: radius.sm,
  tooltipMaxWidth: 280,
  animationDuration: duration.slow,
} as const;
