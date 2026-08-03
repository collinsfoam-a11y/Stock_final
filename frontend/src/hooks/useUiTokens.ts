import { useMemo } from "react";
import { colors, gradients, radius, semanticColors, shadows } from "@/theme/unified";
import { useThemeContextSafe } from "../context/ThemeContext";
import { createThemeTokens, type ThemeTokens } from "../theme/themeTokens";
import { flags } from "../constants/flags";

const fallbackTokens: ThemeTokens = {
  mode: "light",
  colors: {
    background: colors.white,
    surface: colors.white,
    surfaceElevated: colors.white,
    border: colors.neutral[200],
    textPrimary: colors.neutral[900],
    textSecondary: colors.neutral[600],
    textMuted: colors.neutral[400],
    accent: colors.primary[500],
    accentStrong: colors.primary[700],
    success: colors.success[500],
    warning: colors.warning[500],
    error: colors.error[500],
    info: colors.info[500],
    overlay: semanticColors.background.overlay,
  },
  spacing: {
    none: 0,
    xxs: 2,
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    "2xl": 24,
    "3xl": 32,
    xxl: 48,
  },
  radius: {
    sm: radius.sm,
    md: radius.md,
    lg: radius.lg,
    xl: radius.xl,
    full: radius.full,
  },
  typography: {
    fontFamily: {
      regular: "System",
      medium: "System",
      semiBold: "System",
      bold: "System",
      mono: "System",
    },
    fontSize: {
      xs: 10,
      sm: 12,
      md: 14,
      base: 16,
      lg: 16,
      xl: 18,
      "2xl": 20,
      "3xl": 24,
      "4xl": 28,
      "5xl": 32,
    },
    fontWeight: {
      regular: "400",
      medium: "500",
      semiBold: "600",
      semibold: "600",
      bold: "700",
    },
    lineHeight: {
      none: 1,
      tight: 1.25,
      snug: 1.375,
      normal: 1.5,
      relaxed: 1.625,
      loose: 2,
    },
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
