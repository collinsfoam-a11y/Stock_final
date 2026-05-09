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
      body: undefined,
      heading: undefined,
      label: undefined,
    },
    fontSize: {
      xs: 12,
      sm: 14,
      md: 16,
      base: 16,
      lg: 18,
      xl: 20,
      "2xl": 24,
      "3xl": 28,
    },
  },
});
