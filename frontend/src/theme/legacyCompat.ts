/**
 * Legacy Theme Compatibility Layer
 *
 * Central bridge for old `theme/unified` and `theme/modernDesign` imports.
 * New code should prefer `useUiTokens` or `themeTokens`, but this keeps the
 * remaining UI wired consistently while migration is in progress.
 */

import {
  colors as unifiedColors,
  semanticColors as unifiedSemanticColors,
  darkColors as unifiedDarkColors,
  gradients as unifiedGradients,
  spacing as unifiedSpacing,
  radius as unifiedRadius,
  componentRadius,
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  letterSpacing,
  textStyles,
  duration,
  easing,
  animationPresets,
  springConfigs,
  opacity,
  layout as unifiedLayout,
  hitSlop,
  touchTargets,
  coloredShadows,
  glass,
  blurIntensity,
  shadows as unifiedShadows,
} from "./unified";

import {
  modernBranding,
  colors as modernColors,
  darkColors as modernDarkColors,
  spacing as modernSpacing,
  typography as modernTypography,
  borderRadius as modernBorderRadius,
  shadows as modernShadows,
  animations as modernAnimations,
  componentSizes,
  gradients as modernGradients,
  layout as modernLayout,
} from "./modernDesign";

type GenericMap = Record<string, any>;

const mergedColors = {
  ...((unifiedColors as unknown as GenericMap) || {}),
  ...((modernColors as unknown as GenericMap) || {}),
} as GenericMap;

if (!mergedColors.gray && mergedColors.neutral) {
  mergedColors.gray = mergedColors.neutral;
}

if (!mergedColors.neutral && mergedColors.gray) {
  mergedColors.neutral = mergedColors.gray;
}

const mergedDarkColors = {
  ...((unifiedDarkColors as unknown as GenericMap) || {}),
  ...((modernDarkColors as unknown as GenericMap) || {}),
} as GenericMap;

if (!mergedDarkColors.gray && mergedDarkColors.neutral) {
  mergedDarkColors.gray = mergedDarkColors.neutral;
}

if (!mergedDarkColors.neutral && mergedDarkColors.gray) {
  mergedDarkColors.neutral = mergedDarkColors.gray;
}

const mergedSpacing = {
  ...((modernSpacing as unknown as GenericMap) || {}),
  ...((unifiedSpacing as unknown as GenericMap) || {}),
} as GenericMap;

if (mergedSpacing.xxl === undefined && mergedSpacing["2xl"] !== undefined) {
  mergedSpacing.xxl = mergedSpacing["2xl"];
}

if (mergedSpacing["2xl"] === undefined && mergedSpacing.xxl !== undefined) {
  mergedSpacing["2xl"] = mergedSpacing.xxl;
}

if (mergedSpacing["3xl"] === undefined) mergedSpacing["3xl"] = 64;
if (mergedSpacing["4xl"] === undefined) mergedSpacing["4xl"] = 80;
if (mergedSpacing["5xl"] === undefined) mergedSpacing["5xl"] = 96;

const mergedRadius = {
  ...((modernBorderRadius as unknown as GenericMap) || {}),
  ...((unifiedRadius as unknown as GenericMap) || {}),
} as GenericMap;

if (mergedRadius.none === undefined) mergedRadius.none = 0;
if (mergedRadius.xs === undefined) mergedRadius.xs = 4;
if (mergedRadius["2xl"] === undefined) mergedRadius["2xl"] = 20;
if (mergedRadius["3xl"] === undefined) mergedRadius["3xl"] = 24;

export const colors = mergedColors;
export const darkColors = mergedDarkColors;
export const semanticColors = unifiedSemanticColors;
export const gradients = {
  ...((modernGradients as unknown as GenericMap) || {}),
  ...((unifiedGradients as unknown as GenericMap) || {}),
};

export const spacing = mergedSpacing;
export type SpacingKey = keyof typeof spacing;
export type Spacing = typeof spacing;

export const radius = mergedRadius;
export const borderRadius = mergedRadius;
export type RadiusKey = keyof typeof radius;
export type Radius = typeof radius;
export { componentRadius };

export const typography = modernTypography;
export { fontFamily, fontSize, fontWeight, lineHeight, letterSpacing, textStyles };

export const shadows = {
  ...((modernShadows as unknown as GenericMap) || {}),
  ...((unifiedShadows as unknown as GenericMap) || {}),
};
export type ShadowKey = keyof typeof shadows;

export const animations = modernAnimations;
export { duration, easing, animationPresets, springConfigs, opacity };

export const layout = {
  ...((modernLayout as unknown as GenericMap) || {}),
  ...((unifiedLayout as unknown as GenericMap) || {}),
};

export { componentSizes, hitSlop, touchTargets, coloredShadows, glass, blurIntensity };

export { modernBranding };
