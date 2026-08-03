import { colorWithAlpha, type ThemeTokens } from "./themeTokens";

export type OperationalStyleBridge = ReturnType<typeof createOperationalStyleBridge>;

export const createOperationalStyleBridge = (tokens: ThemeTokens) => ({
  borderRadius: tokens.radius,
  colors: {
    background: {
      blur: tokens.colors.surfaceElevated,
      glass: tokens.colors.surfaceElevated,
      primary: tokens.colors.background,
      secondary: tokens.colors.surface,
    },
    border: {
      light: tokens.colors.border,
      medium: tokens.colors.border,
    },
    error: {
      400: tokens.colors.error,
      500: tokens.colors.error,
      600: tokens.colors.error,
    },
    neutral: {
      300: tokens.colors.textMuted,
      400: tokens.colors.textMuted,
    },
    primary: {
      400: tokens.colors.accent,
      500: tokens.colors.accent,
      600: tokens.colors.accent,
      700: tokens.colors.accentStrong,
    },
    secondary: {
      500: tokens.colors.info,
    },
    success: {
      500: tokens.colors.success,
      600: tokens.colors.success,
    },
    surface: {
      base: tokens.colors.surface,
      elevated: tokens.colors.surfaceElevated,
    },
    text: {
      disabled: tokens.colors.textMuted,
      inverse: tokens.colors.surface,
      muted: tokens.colors.textMuted,
      primary: tokens.colors.textPrimary,
      secondary: tokens.colors.textSecondary,
      tertiary: tokens.colors.textMuted,
    },
    warning: {
      500: tokens.colors.warning,
      600: tokens.colors.warning,
    },
  },
  spacing: tokens.spacing,
  statusBackground: {
    error: colorWithAlpha(tokens.colors.error, 0.12),
    info: colorWithAlpha(tokens.colors.info, 0.12),
    success: colorWithAlpha(tokens.colors.success, 0.12),
    warning: colorWithAlpha(tokens.colors.warning, 0.12),
  },
  typography: {
    fontFamily: {
      body: "System",
      heading: "System",
      label: "System",
    },
    fontSize: {
      body: 14,
      caption: 12,
      heading: 20,
      subheading: 16,
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
      body: "400" as const,
      heading: "700" as const,
    },
  },
});
