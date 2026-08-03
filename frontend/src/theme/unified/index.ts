/**
 * Unified Theme System - Main Export
 * Single import for all design tokens and utilities
 *
 * Usage:
 * import { colors, spacing, radius, textStyles, shadows, duration } from '@/theme/unified';
 */

// Internal imports for unified theme object
import {
  colors as c,
  semanticColors as sc,
  gradients as g,
  legacyColors,
  legacyGradients,
} from "./colors";
import {
  spacing as sp,
  layout as l,
  touchTargets as tt,
  hitSlop as hs,
  legacySpacing,
  legacyLayout,
  legacyComponentSizes,
} from "./spacing";
import {
  radius as r,
  componentRadius as cr,
  legacyBorderRadius,
} from "./radius";
import {
  fontSize as fs,
  fontWeight as fw,
  fontFamily as ff,
  lineHeight as lh,
  letterSpacing as ls,
  textStyles as ts,
  legacyTypography,
} from "./typography";
import {
  shadows as sh,
  coloredShadows as csh,
  blurIntensity as bi,
  legacyShadows,
  legacyGlass,
} from "./shadows";
import {
  duration as d,
  easing as e,
  animationPresets as ap,
  springConfigs as spc,
  opacity as o,
  zIndex as z,
  legacyAnimations,
} from "./animations";

// Core design tokens - export everything from each module
export {
  colors,
  semanticColors,
  darkColors,
  gradients,
  legacyColors,
  legacyGradients,
  type ColorPalette,
  type SemanticColors,
  type ColorShade,
} from "./colors";

export {
  spacing,
  layout,
  touchTargets,
  hitSlop,
  legacySpacing,
  legacyLayout,
  legacyComponentSizes,
  type Spacing,
  type SpacingKey,
} from "./spacing";

export {
  radius,
  componentRadius,
  legacyBorderRadius,
  type Radius,
  type RadiusKey,
} from "./radius";

export {
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  letterSpacing,
  textStyles,
  legacyTypography,
  type FontSize,
  type FontWeight,
  type TextStyleKey,
} from "./typography";

export {
  shadows,
  coloredShadows,
  glass,
  blurIntensity,
  legacyShadows,
  legacyGlass,
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
  legacyAnimations,
  type Duration,
  type EasingKey,
  type SpringConfig,
} from "./animations";

// Legacy compatibility aliases used by screens that have not fully
// normalized onto the lower-level token exports yet.
export const typography = legacyTypography;
export const borderRadius = legacyBorderRadius;

// Combined legacy theme object for screens that previously imported a
// single static `theme` from the old modernDesignSystem bridge.
export const legacyTheme = {
  colors: legacyColors,
  gradients: legacyGradients,
  typography: legacyTypography,
  spacing: legacySpacing,
  borderRadius: legacyBorderRadius,
  shadows: legacyShadows,
  animations: legacyAnimations,
  glass: legacyGlass,
  layout: legacyLayout,
  componentSizes: legacyComponentSizes,
};

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
} as const;

export type UnifiedTheme = typeof unifiedTheme;
