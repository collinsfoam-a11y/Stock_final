/**
 * UnifiedText Component
 * Canonical text primitive.
 *
 * Features:
 * - Typography from the unified token scale on Android/web, and the iOS system
 *   text-style ramp (17pt body, 11pt floor) on iOS
 * - Theme-reactive colors (follows light/dark at runtime)
 * - Dynamic Type aware: `density` caps how far text scales before dense
 *   layouts break, instead of leaving it uncapped
 * - Accessibility props
 */

import React, { useMemo } from "react";
import { Text, TextStyle, StyleProp, StyleSheet, TextProps } from "react-native";
import {
  textStyles,
  fontFamily,
  fontSize,
  fontWeight as fw,
  lineHeight,
} from "@/theme/legacyCompat";
import {
  appleTextStyleFor,
  enforceMinFontSize,
  maxFontSizeMultiplierFor,
  type TextDensity,
} from "@/theme/appleTypography";
import { useUiTokens } from "@/hooks/useUiTokens";

// ==========================================
// TYPES
// ==========================================
export type TextVariant =
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "h5"
  | "h6"
  | "subtitle1"
  | "subtitle2"
  | "body1"
  | "body2"
  | "caption"
  | "overline"
  | "button"
  | "mono";

export type TextColor =
  | "primary"
  | "secondary"
  | "tertiary"
  | "muted"
  | "disabled"
  | "inverse"
  | "success"
  | "warning"
  | "error"
  | "info"
  | "link";

export interface UnifiedTextProps extends TextProps {
  /** Typography variant */
  variant?: TextVariant;
  /** Text color from semantic colors */
  color?: TextColor;
  /** Override font weight */
  weight?: "regular" | "medium" | "semiBold" | "bold";
  /** Center text */
  center?: boolean;
  /** Right align text */
  right?: boolean;
  /**
   * How much room the surrounding layout has for Dynamic Type growth.
   * `flowing` is uncapped; `dense` (badges, table cells, stat tiles) caps at 1.2x.
   */
  density?: TextDensity;
  /** Additional styles */
  style?: StyleProp<TextStyle>;
  /** Children text content */
  children: React.ReactNode;
}

// ==========================================
// VARIANT MAPPING
// ==========================================
const variantMap: Record<TextVariant, TextStyle> = {
  h1: textStyles.h1,
  h2: textStyles.h2,
  h3: textStyles.h3,
  h4: textStyles.h4,
  h5: textStyles.h5,
  h6: textStyles.h6,
  subtitle1: textStyles.subtitle1,
  subtitle2: textStyles.subtitle2,
  body1: textStyles.body1,
  body2: textStyles.body2,
  caption: textStyles.caption,
  overline: textStyles.overline,
  button: textStyles.button,
  mono: {
    fontFamily: fontFamily.mono,
    fontSize: fontSize.sm,
    lineHeight: lineHeight.normal,
  },
};

/** Variants whose default density is tighter than `standard`. */
const variantDensity: Partial<Record<TextVariant, TextDensity>> = {
  button: "compact",
  overline: "dense",
  caption: "compact",
};

// ==========================================
// COMPONENT
// ==========================================
export const UnifiedText: React.FC<UnifiedTextProps> = ({
  variant = "body1",
  color = "primary",
  weight,
  center,
  right,
  density,
  style,
  children,
  accessibilityRole = "text",
  maxFontSizeMultiplier,
  ...props
}) => {
  const tokens = useUiTokens();

  const colorMap: Record<TextColor, string> = useMemo(
    () => ({
      primary: tokens.colors.textPrimary,
      secondary: tokens.colors.textSecondary,
      tertiary: tokens.colors.textMuted,
      muted: tokens.colors.textMuted,
      disabled: tokens.colors.textMuted,
      inverse: tokens.colors.background,
      success: tokens.colors.success,
      warning: tokens.colors.warning,
      error: tokens.colors.error,
      info: tokens.colors.info,
      link: tokens.colors.accent,
    }),
    [tokens],
  );

  const variantStyle = useMemo(
    () => enforceMinFontSize(appleTextStyleFor(variant) ?? variantMap[variant]),
    [variant],
  );

  const resolvedDensity = density ?? variantDensity[variant] ?? "standard";
  const textColor = colorMap[color];

  const combinedStyle: StyleProp<TextStyle> = [
    variantStyle,
    { color: textColor },
    weight && { fontWeight: fw[weight] as TextStyle["fontWeight"] },
    center && styles.center,
    right && styles.right,
    style,
  ];

  return (
    <Text
      style={combinedStyle}
      accessibilityRole={accessibilityRole}
      maxFontSizeMultiplier={maxFontSizeMultiplier ?? maxFontSizeMultiplierFor(resolvedDensity)}
      {...props}
    >
      {children}
    </Text>
  );
};

// ==========================================
// STYLES
// ==========================================
const styles = StyleSheet.create({
  center: {
    textAlign: "center",
  },
  right: {
    textAlign: "right",
  },
});

export default UnifiedText;
