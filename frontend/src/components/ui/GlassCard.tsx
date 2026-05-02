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
  const themeContext = useThemeContextSafe();
  const theme = themeContext?.theme;

  // Defaults using theme tokens or fallback to unifiedSystem
  const activeBorderRadius = borderRadius ?? (theme?.borderRadius?.md || 12);
  const activePadding = padding ?? (theme?.spacing?.md || 16);

  const glassStyle = theme?.glass[variant] || theme?.glass.medium || {};
  const shadowStyle =
    elevation !== "none" ? (theme?.shadows[elevation] as ViewStyle) : {};
  const useBlur = Platform.OS !== "web";

  // Resolve tint based on theme if default
  const activeTint =
    tint === "default"
      ? theme?.colors.background.default === "#000000"
        ? "dark"
        : "light"
      : tint;

  const fallbackBackground =
    theme?.colors.background.paper || "rgba(15, 23, 42, 0.85)";
  const gradientBorderColors = [
    `${theme?.colors.accent || "#0EA5E9"}66`,
    "rgba(255, 255, 255, 0.10)",
  ] as const;

  if (withGradientBorder) {
    return (
      <View
        style={[
          styles.container,
          shadowStyle,
          { borderRadius: activeBorderRadius },
          style,
        ]}
        accessible={true}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
      >
        <LinearGradient
          colors={gradientBorderColors}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.gradientBorder,
            {
              borderRadius: activeBorderRadius,
              padding: (glassStyle as any).borderWidth || 1,
            },
          ]}
        >
          {useBlur ? (
            <BlurView
              intensity={intensity}
              tint={activeTint}
              style={[
                styles.blur,
                {
                  borderRadius:
                    activeBorderRadius - ((glassStyle as any).borderWidth || 1),
                  backgroundColor: "transparent", // BlurView handles background
                },
              ]}
            >
              <View
                style={[
                  glassStyle,
                  styles.content,
                  { padding: activePadding, borderWidth: 0, borderRadius: 0 },
                ]}
              >
                {children}
              </View>
            </BlurView>
          ) : (
            <View
              style={[
                styles.webFallbackSurface,
                {
                  borderRadius:
                    activeBorderRadius - ((glassStyle as any).borderWidth || 1),
                  backgroundColor: fallbackBackground,
                },
              ]}
            >
              <View style={[styles.content, { padding: activePadding }]}>
                {children}
              </View>
            </View>
          )}
        </LinearGradient>
      </View>
    );
  }

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
