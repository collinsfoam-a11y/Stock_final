/**
 * Apple Typography Ramp (iOS Human Interface Guidelines)
 *
 * The rest of the theme (`theme/unified/typography.ts`, `theme/typography.ts`)
 * is built on a Material Design 3 scale where body text is 14px. On iOS the
 * system body style is 17pt, and the smallest system style is 11pt, so the
 * Material scale reads one step too small on iPhone.
 *
 * This module provides the iOS text styles and applies them on iOS only, so
 * Android and web keep their existing (Material) metrics and do not regress.
 *
 * Dynamic Type: React Native's `Text` already scales with the OS text-size
 * setting (`allowFontScaling` defaults to true). What the app was missing is a
 * *cap*: at the accessibility sizes (AX1-AX5, up to ~3.1x) dense operational UI
 * such as table rows, badges, and stat tiles clips or overflows. `fontScaleCaps`
 * below gives each density class a `maxFontSizeMultiplier` so text still grows,
 * but stops where the layout would break.
 *
 * Reference: Apple HIG - Typography, and the SF font metrics published in
 * https://developer.apple.com/design/resources/
 */

import { Platform, TextStyle } from "react-native";

// ==========================================
// iOS TEXT STYLES
// ==========================================

export type AppleTextStyleKey =
  | "largeTitle"
  | "title1"
  | "title2"
  | "title3"
  | "headline"
  | "body"
  | "callout"
  | "subhead"
  | "footnote"
  | "caption1"
  | "caption2";

/**
 * Sizes, weights, line heights and tracking for the iOS system text styles at
 * the default (Large) Dynamic Type setting.
 */
export const appleTextStyles: Record<AppleTextStyleKey, TextStyle> = {
  largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: "400", letterSpacing: 0.37 },
  title1: { fontSize: 28, lineHeight: 34, fontWeight: "400", letterSpacing: 0.36 },
  title2: { fontSize: 22, lineHeight: 28, fontWeight: "400", letterSpacing: 0.35 },
  title3: { fontSize: 20, lineHeight: 25, fontWeight: "400", letterSpacing: 0.38 },
  headline: { fontSize: 17, lineHeight: 22, fontWeight: "600", letterSpacing: -0.41 },
  body: { fontSize: 17, lineHeight: 22, fontWeight: "400", letterSpacing: -0.41 },
  callout: { fontSize: 16, lineHeight: 21, fontWeight: "400", letterSpacing: -0.32 },
  subhead: { fontSize: 15, lineHeight: 20, fontWeight: "400", letterSpacing: -0.24 },
  footnote: { fontSize: 13, lineHeight: 18, fontWeight: "400", letterSpacing: -0.08 },
  caption1: { fontSize: 12, lineHeight: 16, fontWeight: "400", letterSpacing: 0 },
  caption2: { fontSize: 11, lineHeight: 13, fontWeight: "400", letterSpacing: 0.07 },
};

/**
 * Smallest text size the app should ever render. Apple's smallest system style
 * is 11pt (caption2); the existing token scale bottoms out at 10px.
 */
export const MIN_LEGIBLE_FONT_SIZE = 11;

// ==========================================
// DYNAMIC TYPE CAPS
// ==========================================

/**
 * Density classes for `maxFontSizeMultiplier`.
 *
 * - `flowing`  - paragraphs, empty states, dialogs. No cap: let it grow.
 * - `standard` - screen titles, card bodies, form labels.
 * - `compact`  - buttons, list rows, headers with fixed chrome.
 * - `dense`    - badges, chips, stat tiles, table cells, scanner overlays.
 */
export type TextDensity = "flowing" | "standard" | "compact" | "dense";

export const fontScaleCaps: Record<TextDensity, number | undefined> = {
  flowing: undefined,
  standard: 1.6,
  compact: 1.4,
  dense: 1.2,
};

export const maxFontSizeMultiplierFor = (density: TextDensity = "standard") =>
  fontScaleCaps[density];

// ==========================================
// VARIANT MAPPING
// ==========================================

/**
 * Existing (Material-named) variants used across the app, mapped onto the iOS
 * ramp. Anything not listed keeps its current style.
 */
export const appleVariantMap = {
  display: "largeTitle",
  h1: "largeTitle",
  h2: "title1",
  h3: "title2",
  h4: "title3",
  h5: "headline",
  h6: "headline",
  heading: "title2",
  subheading: "title3",
  subtitle1: "headline",
  subtitle2: "subhead",
  body: "body",
  body1: "body",
  body2: "callout",
  bodyLarge: "body",
  bodySmall: "subhead",
  button: "headline",
  label: "subhead",
  labelLarge: "callout",
  labelSmall: "footnote",
  caption: "footnote",
  overline: "caption2",
} as const satisfies Record<string, AppleTextStyleKey>;

export type AppleMappedVariant = keyof typeof appleVariantMap;

const isMappedVariant = (variant: string): variant is AppleMappedVariant =>
  Object.prototype.hasOwnProperty.call(appleVariantMap, variant);

/**
 * Returns the iOS text style for a variant on iOS, and `null` elsewhere so the
 * caller keeps its existing platform styling.
 */
export const appleTextStyleFor = (variant: string): TextStyle | null => {
  if (Platform.OS !== "ios") return null;
  if (!isMappedVariant(variant)) return null;
  return appleTextStyles[appleVariantMap[variant]];
};

/**
 * Raises any style below the 11pt legibility floor. Applied on all platforms:
 * a 10px label is too small on Android and web as well.
 */
export const enforceMinFontSize = (style: TextStyle | undefined): TextStyle | undefined => {
  if (!style || typeof style.fontSize !== "number") return style;
  if (style.fontSize >= MIN_LEGIBLE_FONT_SIZE) return style;
  const ratio = MIN_LEGIBLE_FONT_SIZE / style.fontSize;
  return {
    ...style,
    fontSize: MIN_LEGIBLE_FONT_SIZE,
    lineHeight:
      typeof style.lineHeight === "number"
        ? Math.round(style.lineHeight * ratio)
        : style.lineHeight,
  };
};
