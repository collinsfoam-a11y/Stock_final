import { useMemo } from "react";
import { colors, gradients, radius, semanticColors, shadows } from "../theme/legacyCompat";
import { useThemeContextSafe } from "../context/ThemeContext";
import { createThemeTokens, type ThemeTokens } from "../theme/themeTokens";
import { flags } from "../constants/flags";

const fallbackTokens: ThemeTokens = {
  mode: "light",
  colors: {
    background: semanticColors.background.primary,
    surface: semanticColors.background.secondary,
    surfaceElevated: semanticColors.background.elevated,
    border: semanticColors.border.default,
    textPrimary: semanticColors.text.primary,
    textSecondary: semanticColors.text.secondary,
    textMuted: semanticColors.text.muted,
    accent: colors.primary[500],
    accentStrong: colors.primary[700],
    success: colors.success[500],
    warning: colors.warning[500],
    error: colors.error[500],
    info: colors.info[500],
    overlay: semanticColors.background.overlay,
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },
  radius: {
    sm: radius.sm,
    md: radius.md,
    lg: radius.lg,
    xl: radius.xl,
    full: radius.full,
  },
  shadows: {
    none: shadows.none,
    sm: shadows.sm,
    md: shadows.md,
    lg: shadows.lg,
    xl: shadows.xl,
  },
  motion: {
    enabled: flags.enableAnimations,
    fast: 150,
    normal: 250,
    slow: 350,
  },
  gradients: {
    primary: gradients.primary,
    surface: gradients.glass,
    accent: gradients.secondary,
  },
};

export const useUiTokens = (): ThemeTokens => {
  const themeContext = useThemeContextSafe();

  return useMemo(() => {
    if (!flags.uiThemeTokensV2 || !themeContext?.theme) {
      return {
        ...fallbackTokens,
        motion: {
          ...fallbackTokens.motion,
          enabled: flags.enableAnimations && flags.uiVisualSystemV2,
        },
      };
    }

    return createThemeTokens(
      themeContext.theme,
      themeContext.isDark ? "dark" : "light",
      flags.enableAnimations && flags.uiVisualSystemV2,
    );
  }, [themeContext]);
};
