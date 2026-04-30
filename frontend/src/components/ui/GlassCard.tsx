import React from "react";
import { StyleProp, ViewStyle } from "react-native";
import { OperationalCard } from "./OperationalSurface";

export type GlassVariant = "light" | "medium" | "strong" | "dark" | "modal";
export type GlassElevation = "none" | "xs" | "sm" | "md" | "lg" | "xl";

interface GlassCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  variant?: GlassVariant;
  intensity?: number;
  tint?: "light" | "dark" | "default";
  borderRadius?: number;
  padding?: number;
  withGradientBorder?: boolean;
  elevation?: GlassElevation;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

/**
 * Compatibility surface for old GlassCard call sites.
 *
 * The public API is retained while rendering a plain utility card that matches
 * the operational UI direction: solid surface, subtle border, restrained shadow.
 */
export const GlassCard = ({
  children,
  style,
  variant = "medium",
  borderRadius,
  padding,
  elevation = "sm",
  accessibilityLabel,
  accessibilityHint,
}: GlassCardProps) => {
  return (
    <OperationalCard
      variant={variant}
      borderRadius={borderRadius}
      padding={padding}
      elevation={elevation}
      style={style}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
    >
      {children}
    </OperationalCard>
  );
};
