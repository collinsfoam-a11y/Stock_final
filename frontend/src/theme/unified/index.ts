/**
 * Unified Theme System - Main Export
 * Single import for all design tokens and utilities
 *
 * Usage:
 * import { colors, spacing, radius, textStyles, shadows, duration } from '@/theme/unified';
 */

// Internal imports for unified theme object
import { colors as c, semanticColors as sc, gradients as g } from "./colors";
import {
  spacing as sp,
  layout as l,
  touchTargets as tt,
  hitSlop as hs,
} from "./spacing";
import { radius as r, componentRadius as cr } from "./radius";
import {
  fontSize as fs,
  fontWeight as fw,
  fontFamily as ff,
  lineHeight as lh,
  letterSpacing as ls,
  textStyles as ts,
} from "./typography";
import {
  shadows as sh,
  coloredShadows as csh,
  blurIntensity as bi,
} from "./shadows";
import {
  duration as d,
  easing as e,
  animationPresets as ap,
  springConfigs as spc,
  opacity as o,
  zIndex as z,
} from "./animations";
import {
  modernBorderRadius as legacyBorderRadius,
  modernTypography as legacyTypography,
} from "../../styles/modernDesignSystem";

// ==========================================
// BRANDING — kept in unified so legacyCompat
// doesn't need to reach into modernDesign
// ==========================================
export const modernBranding = {
  name: "Lavanya Mart",
  tagline: "Stock Verification System",
  colors: {
    primary: "#0655A5",
    primaryDark: "#043C7A",
    secondary: "#0F766E",
    accent: "#0F766E",
  },
} as const;

// ==========================================
// COMPONENT SIZES — design-system primitives
// ==========================================
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

// Core design tokens - export everything from each module
export {
  colors,
  semanticColors,
  darkColors,
  gradients,
  gray,
  type ColorPalette,
  type SemanticColors,
  type ColorShade,
} from "./colors";

export {
  spacing,
  layout,
  touchTargets,
  hitSlop,
  spacingAliases,
  type Spacing,
  type SpacingKey,
} from "./spacing";

export { radius, componentRadius, type Radius, type RadiusKey } from "./radius";

export {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  letterSpacing,
  textStyles,
  type FontSize,
  type FontWeight,
  type TextStyleKey,
} from "./typography";

export {
  shadows,
  coloredShadows,
  glass,
  blurIntensity,
  type ShadowKey,
  type Shadows,
} from "./shadows";

export {
  duration,
  easing,
  animationPresets,
  springConfigs,
  opacity,
  zIndex,
  type Duration,
  type EasingKey,
  type SpringConfig,
} from "./animations";

// Legacy compatibility aliases used by screens that have not fully
// normalized onto the lower-level token exports yet.
export const typography = legacyTypography;
export const borderRadius = legacyBorderRadius;

/**
 * Combined animations object — matches the shape that modernDesign and legacyCompat
 * exposed as `animations`. Prefer individual `duration` / `easing` imports in new code.
 */
export const animations = {
  duration: d,
  easing: {
    out: "ease-out",
    in: "ease-in",
    inOut: "ease-in-out",
    spring: "spring(1, 0.8, 0.2)",
  },
} as const;

/**
 * Complete unified theme object
 * For passing to ThemeProvider or accessing all tokens at once
 */

export const unifiedTheme = {
  colors: c,
  semanticColors: sc,
  gradients: g,
  spacing: sp,
  layout: l,
  touchTargets: tt,
  hitSlop: hs,
  radius: r,
  borderRadius: legacyBorderRadius,
  componentRadius: cr,
  componentSizes,
  fontSize: fs,
  fontWeight: fw,
  fontFamily: ff,
  lineHeight: lh,
  letterSpacing: ls,
  typography: legacyTypography,
  textStyles: ts,
  shadows: sh,
  coloredShadows: csh,
  blurIntensity: bi,
  duration: d,
  easing: e,
  animationPresets: ap,
  springConfigs: spc,
  opacity: o,
  zIndex: z,
  modernBranding,
} as const;

export type UnifiedTheme = typeof unifiedTheme;

// ---------------------------------------------------------------------------
// Backward-compat re-exports from modernDesignSystem
// Files that previously imported from "@/theme/unified" or
// "../../styles/modernDesignSystem" can switch to "@/theme/unified" without
// any other code changes. Prefer the individual token exports in new code.
// ---------------------------------------------------------------------------
export {
  modernColors,
  modernSpacing,
  modernBorderRadius,
  modernShadows,
  modernAnimations,
  modernTypography,
  modernGradients,
  modernLayout,
  modernCommonStyles,
  glassmorphism,
  accessibility,
  breakpoints,
  theme,
  auroraColors,
} from "../../styles/modernDesignSystem";
